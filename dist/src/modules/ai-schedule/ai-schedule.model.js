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
exports.AISchedule = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const scheduleSessionSchema = new mongoose_1.Schema({
    sessionId: { type: String, required: true },
    taskId: { type: String, required: true },
    title: { type: String, required: true },
    priority: { type: String, default: "medium" },
    suggestedTime: { type: String, required: true },
    reason: { type: String, default: "" },
    status: {
        type: String,
        enum: ["pending", "in_progress", "completed", "skipped"],
        default: "pending",
    },
    createSubtask: { type: Boolean, default: false },
}, { _id: false });
const scheduleDaySchema = new mongoose_1.Schema({
    day: { type: String, required: true },
    date: { type: String, required: true },
    tasks: { type: [scheduleSessionSchema], default: [] },
    note: { type: String },
}, { _id: false });
const aiScheduleSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String },
    description: { type: String },
    schedule: { type: [scheduleDaySchema], default: [] },
    suggestedOrder: { type: [String], default: [] },
    personalizationNote: { type: String },
    totalEstimatedTime: { type: String },
    splitStrategy: { type: String },
    confidenceScore: { type: Number, min: 0, max: 1 },
    sourceTasks: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    appliedAt: { type: Date },
}, { timestamps: true });
aiScheduleSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
exports.AISchedule = mongoose_1.default.models.AISchedule ||
    mongoose_1.default.model("AISchedule", aiScheduleSchema);
