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
exports.Task = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const taskSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String },
    type: {
        type: String,
        enum: ["event", "todo", "appointment"],
        default: "todo",
        index: true,
    },
    allDay: { type: Boolean, default: false },
    guests: { type: [String], default: [] },
    /**
     * Detailed guest information with permissions and status
     * Stores guest summary data for quick access without separate queries
     * Each guest includes: guestId, email, name, avatar, permission, status
     * Maintains backward compatibility with legacy guests array
     */
    guestDetails: {
        type: [
            {
                guestId: {
                    type: mongoose_1.Schema.Types.ObjectId,
                    ref: "Guest",
                    required: true,
                },
                email: {
                    type: String,
                    required: true,
                    lowercase: true,
                    trim: true,
                },
                name: {
                    type: String,
                    required: true,
                    trim: true,
                },
                avatar: {
                    type: String,
                    default: null,
                },
                permission: {
                    type: String,
                    enum: ["edit_event", "view_guest_list", "invite_others"],
                    default: "view_guest_list",
                },
                status: {
                    type: String,
                    enum: ["pending", "accepted", "declined"],
                    default: "pending",
                },
            },
        ],
        default: [],
    },
    location: { type: String, trim: true },
    visibility: {
        type: String,
        enum: ["default", "public", "private"],
        default: "default",
        index: true,
    },
    reminderMinutes: { type: Number, min: 0 },
    recurrence: { type: String },
    meetingLink: { type: String },
    status: {
        type: String,
        enum: ["todo", "scheduled", "in_progress", "completed", "cancelled"],
        default: "todo",
        index: true,
    },
    priority: {
        type: String,
        enum: ["low", "medium", "high", "urgent"],
        default: "medium",
        index: true,
    },
    deadline: { type: Date, index: true },
    tags: { type: [String], default: [] },
    userId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    parentTaskId: { type: mongoose_1.Schema.Types.ObjectId, index: true },
    aiBreakdown: {
        type: [
            {
                title: { type: String, required: true },
                status: {
                    type: String,
                    enum: ["todo", "in_progress", "completed", "cancelled"],
                    default: "todo",
                },
                estimatedDuration: { type: Number, min: 0 }, // Phút
                difficulty: {
                    type: String,
                    enum: ["easy", "medium", "hard"],
                },
                description: { type: String },
            },
        ],
        default: [],
    },
    dailyTargetDuration: { type: Number, min: 0 }, // Mục tiêu phút/ngày (max)
    dailyTargetMin: { type: Number, min: 0 }, // Mục tiêu tối thiểu phút/ngày
    estimatedDuration: { type: Number, min: 0 }, // Phút dự kiến
    reminderAt: { type: Date },
    scheduledTime: {
        start: { type: Date },
        end: { type: Date },
        aiPlanned: { type: Boolean, default: false },
        reason: { type: String },
    },
    isArchived: { type: Boolean, default: false, index: true },
}, { timestamps: true });
taskSchema.index({ userId: 1, status: 1, deadline: 1, priority: 1 });
exports.Task = mongoose_1.default.models.Task ||
    mongoose_1.default.model("Task", taskSchema);
