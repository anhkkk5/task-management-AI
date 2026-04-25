"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationModel = exports.NotificationPriority = exports.NotificationType = void 0;
const mongoose_1 = __importStar(require("mongoose"));
var NotificationType;
(function (NotificationType) {
    NotificationType["TASK_REMINDER"] = "task_reminder";
    NotificationType["DEADLINE_ALERT"] = "deadline_alert";
    NotificationType["SCHEDULED_TASK_ALERT"] = "scheduled_task_alert";
    NotificationType["CHAT_MESSAGE"] = "chat_message";
    NotificationType["AI_SUGGESTION"] = "ai_suggestion";
    NotificationType["TEAM_TASK_ASSIGNED"] = "team_task_assigned";
    NotificationType["TEAM_TASK_STATUS_CHANGED"] = "team_task_status_changed";
    NotificationType["TEAM_TASK_REASSIGNED"] = "team_task_reassigned";
    NotificationType["TEAM_TASK_UPDATED"] = "team_task_updated";
    NotificationType["TEAM_TASK_COMMENT"] = "team_task_comment";
    NotificationType["TEAM_TASK_MENTION"] = "team_task_mention";
    NotificationType["SYSTEM"] = "system";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
var NotificationPriority;
(function (NotificationPriority) {
    NotificationPriority["CRITICAL"] = "critical";
    NotificationPriority["HIGH"] = "high";
    NotificationPriority["NORMAL"] = "normal";
    NotificationPriority["LOW"] = "low";
})(NotificationPriority || (exports.NotificationPriority = NotificationPriority = {}));
const notificationSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: Object.values(NotificationType),
        required: true,
    },
    priority: {
        type: String,
        enum: Object.values(NotificationPriority),
        default: NotificationPriority.NORMAL,
        index: true,
    },
    snoozedUntil: {
        type: Date,
        default: null,
        index: true,
    },
    isGroup: {
        type: Boolean,
        default: false,
    },
    groupCount: {
        type: Number,
        default: 0,
    },
    groupedIds: {
        type: [mongoose_1.Schema.Types.ObjectId],
        default: [],
    },
    hiddenByGroupId: {
        type: mongoose_1.Schema.Types.ObjectId,
        default: null,
        index: true,
    },
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    data: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true,
    },
    channels: {
        inApp: {
            type: Boolean,
            default: true,
        },
        email: {
            type: Boolean,
            default: false,
        },
        push: {
            type: Boolean,
            default: false,
        },
    },
    emailSent: {
        type: Boolean,
        default: false,
    },
    emailSentAt: {
        type: Date,
    },
    readAt: {
        type: Date,
    },
}, {
    timestamps: true,
    collection: "notifications",
});
// Indexes for query optimization
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ "data.taskId": 1 });
notificationSchema.index({ "data.conversationId": 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ emailSent: 1, "channels.email": 1 });
notificationSchema.index({ userId: 1, type: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ snoozedUntil: 1 });
exports.NotificationModel = mongoose_1.default.model("Notification", notificationSchema);
