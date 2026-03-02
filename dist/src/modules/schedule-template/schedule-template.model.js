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
exports.ScheduleTemplate = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const scheduleTemplateSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
        ref: "User",
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    pattern: {
        days: [
            {
                dayOfWeek: {
                    type: Number,
                    required: true,
                    min: 0,
                    max: 6,
                },
                timeBlocks: [
                    {
                        startTime: { type: String, required: true }, // "HH:MM"
                        endTime: { type: String, required: true }, // "HH:MM"
                        label: { type: String, required: true },
                        breakDuration: { type: Number, default: 15 }, // Phút
                    },
                ],
            },
        ],
        aiConfig: {
            preferredWorkPattern: {
                type: String,
                enum: ["morning", "afternoon", "evening", "mixed"],
            },
            maxTasksPerDay: { type: Number, default: 5 },
            minBreakBetweenTasks: { type: Number, default: 15 },
        },
    },
    isDefault: {
        type: Boolean,
        default: false,
    },
    tags: {
        type: [String],
        default: [],
    },
    usageCount: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
// Indexes
scheduleTemplateSchema.index({ userId: 1, isDefault: 1 });
scheduleTemplateSchema.index({ userId: 1, tags: 1 });
scheduleTemplateSchema.index({ userId: 1, usageCount: -1 });
exports.ScheduleTemplate = mongoose_1.default.models
    .ScheduleTemplate ||
    mongoose_1.default.model("ScheduleTemplate", scheduleTemplateSchema);
