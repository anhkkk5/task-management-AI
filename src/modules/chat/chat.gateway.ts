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

export class ChatGateway {
  private io: SocketIOServer;
  private userSocketMap: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
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
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.replace("Bearer ", "");

        if (!token) {
          return next(new Error("AUTH_TOKEN_MISSING"));
        }

        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "secret",
        ) as JWTPayload;
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

      // Set user online
      presenceService.setUserOnline(userId, socket.id);

      // Broadcast online status to others
      socket.broadcast.emit("user:online", { userId });

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
          content: string;
          type?: "text" | "ai" | "system";
        }) => {
          try {
            const message = await chatService.sendMessage(
              data.conversationId,
              userId,
              data.content,
              data.type || "text",
            );

            // Emit to all members in conversation
            this.io
              .to(`conversation:${data.conversationId}`)
              .emit("message:new", { message });

            socket.emit("message:sent", { message });
          } catch (err) {
            socket.emit("error", { message: "Failed to send message" });
          }
        },
      );

      // Typing indicator
      socket.on("typing:start", async (data: { conversationId: string }) => {
        await presenceService.setUserTyping(data.conversationId, userId);
        socket
          .to(`conversation:${data.conversationId}`)
          .emit("typing:update", {
            conversationId: data.conversationId,
            userId,
            typing: true,
          });
      });

      socket.on("typing:stop", async (data: { conversationId: string }) => {
        await presenceService.clearUserTyping(data.conversationId, userId);
        socket
          .to(`conversation:${data.conversationId}`)
          .emit("typing:update", {
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
