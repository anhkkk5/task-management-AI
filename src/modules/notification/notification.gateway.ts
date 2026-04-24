import { Server as SocketIOServer } from "socket.io";
import { getChatGateway } from "../chat/chat.gateway";

export const notificationGateway = {
  // Emit notification to specific user via Socket.IO
  emitToUser: (userId: string, notification: any): void => {
    const chatGateway = getChatGateway();
    if (chatGateway) {
      chatGateway.emitToUser(userId, "notification:new", { notification });
    }
  },

  // Emit notification read status update to user
  emitReadUpdate: (
    userId: string,
    data: { notificationId: string; isRead: boolean },
  ): void => {
    const chatGateway = getChatGateway();
    if (chatGateway) {
      chatGateway.emitToUser(userId, "notification:read", data);
    }
  },

  // Emit a delete/hide signal for a notification (used by snooze + grouping)
  emitDelete: (userId: string, notificationId: string): void => {
    const chatGateway = getChatGateway();
    if (chatGateway) {
      chatGateway.emitToUser(userId, "notification:delete", {
        notificationId,
      });
    }
  },

  // Broadcast to all connected users (for system notifications)
  broadcastToAll: (notification: any): void => {
    const chatGateway = getChatGateway();
    if (chatGateway) {
      const io = chatGateway.getIO();
      io.emit("notification:new", { notification });
    }
  },

  // Get IO instance for advanced operations
  getIO: (): SocketIOServer | null => {
    const chatGateway = getChatGateway();
    return chatGateway ? chatGateway.getIO() : null;
  },
};
