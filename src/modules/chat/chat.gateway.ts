import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { chatService } from "./chat.service";
import { presenceService } from "./presence.service";
import { getRedis } from "../../services/redis.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
}

const getAllowedSocketOrigins = (): string[] => {
  const fromEnv = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
    .filter((v): v is string => !!v)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);

  return Array.from(
    new Set([...fromEnv, "http://localhost:5173", "http://localhost:3000"]),
  );
};

const extractTokenFromCookieHeader = (
  cookieHeader?: string,
): string | undefined => {
  if (!cookieHeader) return undefined;
  const tokenPair = cookieHeader
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("token="));
  if (!tokenPair) return undefined;

  const raw = tokenPair.slice("token=".length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export class ChatGateway {
  private io: SocketIOServer;
  private userSocketMap: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HttpServer) {
    const allowedOrigins = getAllowedSocketOrigins();
    this.io = new SocketIOServer(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error(`CORS_ORIGIN_NOT_ALLOWED: ${origin}`));
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Setup Redis pub/sub adapter for multi-server scaling
    this.setupRedisAdapter();

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupRedisAdapter(): void {
    try {
      const redis = getRedis();
      const pubClient = redis.duplicate();
      const subClient = redis.duplicate();

      this.io.adapter(createAdapter(pubClient, subClient));
      console.log("Redis pub/sub adapter enabled for Socket.IO scaling");
    } catch (err) {
      console.warn(
        "Failed to setup Redis adapter, running in single-server mode:",
        err,
      );
    }
  }

  private setupMiddleware(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      try {
        const tokenFromAuth = socket.handshake.auth?.token;
        const tokenFromHeader = socket.handshake.headers.authorization?.replace(
          "Bearer ",
          "",
        );
        const tokenFromCookie = extractTokenFromCookieHeader(
          socket.handshake.headers.cookie,
        );
        const token = tokenFromAuth || tokenFromHeader || tokenFromCookie;

        if (!token) {
          return next(new Error("AUTH_TOKEN_MISSING"));
        }

        const jwtSecret =
          process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
        if (!jwtSecret) {
          return next(new Error("JWT_SECRET_MISSING"));
        }

        const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
        socket.userId = decoded.userId;
        next();
      } catch (err) {
        next(new Error("AUTH_TOKEN_INVALID"));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      const userId = socket.userId!;
      console.log(`User connected: ${userId}, socket: ${socket.id}`);

      // Store mapping
      this.userSocketMap.set(userId, socket.id);

      // Join personal room for targeted events (conversation updates, calls, notifications)
      socket.join(`user:${userId}`);

      // Set user online
      presenceService.setUserOnline(userId, socket.id);

      // Broadcast online status to others
      socket.broadcast.emit("user:online", { userId });

      // Send current online users to this user on connect
      presenceService
        .getOnlineUsers()
        .then((online) => {
          socket.emit("presence:snapshot", { online });
        })
        .catch(() => {});

      // Heartbeat to refresh TTL
      socket.on("presence:ping", async () => {
        await presenceService.refreshUserOnline(userId);
      });

      // Join conversation
      socket.on(
        "conversation:join",
        async (data: { conversationId: string }) => {
          try {
            // Verify user is member
            await chatService.getConversation(data.conversationId, userId);

            socket.join(`conversation:${data.conversationId}`);
            socket.emit("conversation:joined", {
              conversationId: data.conversationId,
            });

            // Mark all messages as seen
            await chatService.markAllAsSeen(data.conversationId, userId);
          } catch (err) {
            socket.emit("error", { message: "Failed to join conversation" });
          }
        },
      );

      // Leave conversation
      socket.on("conversation:leave", (data: { conversationId: string }) => {
        socket.leave(`conversation:${data.conversationId}`);
        socket.emit("conversation:left", {
          conversationId: data.conversationId,
        });
      });

      // Send message
      socket.on(
        "message:send",
        async (data: {
          conversationId: string;
          content?: string;
          type?: string;
          attachments?: any[];
          replyTo?: string;
          clientTempId?: string;
        }) => {
          try {
            const message = await chatService.sendMessage(
              data.conversationId,
              userId,
              {
                content: data.content,
                type: data.type,
                attachments: data.attachments,
                replyTo: data.replyTo,
              },
            );

            // Emit to all members in conversation
            this.io
              .to(`conversation:${data.conversationId}`)
              .emit("message:new", { message });

            // Emit conversation update to each member's personal room so sidebar preview refreshes
            const conv = await chatService.getConversation(
              data.conversationId,
              userId,
            );
            for (const m of conv.members) {
              this.io.to(`user:${m.id}`).emit("conversation:updated", {
                conversationId: data.conversationId,
                lastMessage: {
                  content: message.content || "",
                  senderId: message.senderId?.id,
                  createdAt: message.createdAt,
                  type: message.type,
                },
              });
            }

            socket.emit("message:sent", {
              message,
              clientTempId: data.clientTempId,
            });
          } catch (err: any) {
            socket.emit("error", {
              event: "message:send",
              message: err?.message || "Failed to send message",
              clientTempId: data.clientTempId,
            });
          }
        },
      );

      // Message reaction
      socket.on(
        "message:react",
        async (data: {
          messageId: string;
          conversationId: string;
          emoji: string;
          action: "add" | "remove";
        }) => {
          try {
            const message = await chatService.toggleReaction(
              data.messageId,
              userId,
              data.emoji,
              data.action,
            );
            this.io
              .to(`conversation:${data.conversationId}`)
              .emit("message:reacted", { message });
          } catch (err: any) {
            socket.emit("error", {
              event: "message:react",
              message: err?.message || "Failed to react",
            });
          }
        },
      );

      // Edit message
      socket.on(
        "message:edit",
        async (data: {
          messageId: string;
          conversationId: string;
          content: string;
        }) => {
          try {
            const message = await chatService.editMessage(
              data.messageId,
              userId,
              data.content,
            );
            this.io
              .to(`conversation:${data.conversationId}`)
              .emit("message:updated", { message });
          } catch (err: any) {
            socket.emit("error", {
              event: "message:edit",
              message: err?.message || "Failed to edit message",
            });
          }
        },
      );

      // Delete message
      socket.on(
        "message:delete",
        async (data: { messageId: string; conversationId: string }) => {
          try {
            const message = await chatService.deleteMessage(
              data.messageId,
              userId,
            );
            this.io
              .to(`conversation:${data.conversationId}`)
              .emit("message:updated", { message });
          } catch (err: any) {
            socket.emit("error", {
              event: "message:delete",
              message: err?.message || "Failed to delete message",
            });
          }
        },
      );

      // Typing indicator
      socket.on("typing:start", async (data: { conversationId: string }) => {
        await presenceService.setUserTyping(data.conversationId, userId);
        socket.to(`conversation:${data.conversationId}`).emit("typing:update", {
          conversationId: data.conversationId,
          userId,
          typing: true,
        });
      });

      socket.on("typing:stop", async (data: { conversationId: string }) => {
        await presenceService.clearUserTyping(data.conversationId, userId);
        socket.to(`conversation:${data.conversationId}`).emit("typing:update", {
          conversationId: data.conversationId,
          userId,
          typing: false,
        });
      });

      // Mark message as seen
      socket.on(
        "message:seen",
        async (data: { messageId: string; conversationId: string }) => {
          try {
            await chatService.markAsSeen(data.messageId, userId);
            this.io
              .to(`conversation:${data.conversationId}`)
              .emit("message:seen", { messageId: data.messageId, userId });
          } catch (err) {
            // Silent fail
          }
        },
      );

      // Disconnect
      socket.on("disconnect", async () => {
        console.log(`User disconnected: ${userId}`);

        this.userSocketMap.delete(userId);
        await presenceService.setUserOffline(userId);

        // Broadcast offline status
        socket.broadcast.emit("user:offline", { userId });
      });
    });
  }

  // Public method to emit events from outside (e.g., from REST API)
  emitToUser(userId: string, event: string, data: any): void {
    const socketId = this.userSocketMap.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  emitToConversation(conversationId: string, event: string, data: any): void {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }

  getIO(): SocketIOServer {
    return this.io;
  }
}

let chatGatewayInstance: ChatGateway | null = null;

export const initChatGateway = (server: HttpServer): ChatGateway => {
  if (!chatGatewayInstance) {
    chatGatewayInstance = new ChatGateway(server);
  }
  return chatGatewayInstance;
};

export const getChatGateway = (): ChatGateway | null => {
  return chatGatewayInstance;
};
