"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationGateway = void 0;
const chat_gateway_1 = require("../chat/chat.gateway");
exports.notificationGateway = {
    // Emit notification to specific user via Socket.IO
    emitToUser: (userId, notification) => {
        const chatGateway = (0, chat_gateway_1.getChatGateway)();
        if (chatGateway) {
            chatGateway.emitToUser(userId, "notification:new", { notification });
        }
    },
    // Emit notification read status update to user
    emitReadUpdate: (userId, data) => {
        const chatGateway = (0, chat_gateway_1.getChatGateway)();
        if (chatGateway) {
            chatGateway.emitToUser(userId, "notification:read", data);
        }
    },
    // Emit a delete/hide signal for a notification (used by snooze + grouping)
    emitDelete: (userId, notificationId) => {
        const chatGateway = (0, chat_gateway_1.getChatGateway)();
        if (chatGateway) {
            chatGateway.emitToUser(userId, "notification:delete", {
                notificationId,
            });
        }
    },
    // Broadcast to all connected users (for system notifications)
    broadcastToAll: (notification) => {
        const chatGateway = (0, chat_gateway_1.getChatGateway)();
        if (chatGateway) {
            const io = chatGateway.getIO();
            io.emit("notification:new", { notification });
        }
    },
    // Get IO instance for advanced operations
    getIO: () => {
        const chatGateway = (0, chat_gateway_1.getChatGateway)();
        return chatGateway ? chatGateway.getIO() : null;
    },
};
