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
exports.UserMemory = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const userMemorySchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    scope: {
        type: String,
        enum: ["preference", "fact", "context"],
        required: true,
        index: true,
    },
    key: { type: String, required: true, trim: true, lowercase: true },
    value: { type: String, required: true, trim: true },
    domain: { type: String, trim: true, lowercase: true },
    confidence: { type: Number, min: 0, max: 1, default: 0.6 },
    occurrences: { type: Number, default: 1, min: 1 },
    lastSeenAt: { type: Date, default: () => new Date() },
}, { timestamps: true });
userMemorySchema.index({ userId: 1, key: 1, value: 1 }, { unique: true, partialFilterExpression: { scope: { $in: ["preference", "fact"] } } });
userMemorySchema.index({ userId: 1, scope: 1, lastSeenAt: -1 });
exports.UserMemory = mongoose_1.default.models.UserMemory ||
    mongoose_1.default.model("UserMemory", userMemorySchema, "user_memories");
