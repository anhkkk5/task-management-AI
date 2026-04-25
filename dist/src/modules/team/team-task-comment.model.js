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
exports.TeamTaskComment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const teamTaskCommentSchema = new mongoose_1.Schema({
    teamId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    taskId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    authorId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    mentionedUserIds: { type: [mongoose_1.Schema.Types.ObjectId], default: [] },
}, {
    timestamps: true,
    collection: "team_task_comments",
});
teamTaskCommentSchema.index({ teamId: 1, taskId: 1, createdAt: -1 });
teamTaskCommentSchema.index({ taskId: 1, createdAt: -1 });
teamTaskCommentSchema.index({ mentionedUserIds: 1, createdAt: -1 });
exports.TeamTaskComment = mongoose_1.default.models.TeamTaskComment ||
    mongoose_1.default.model("TeamTaskComment", teamTaskCommentSchema);
