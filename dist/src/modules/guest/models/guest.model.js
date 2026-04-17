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
exports.Guest = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/**
 * Mongoose schema for Guest collection
 * Stores guest information for calendar events including email, name, avatar, and permissions
 *
 * Indexes:
 * - Compound index (eventId, email) for duplicate prevention
 * - Index on userId for efficient user queries
 * - Index on eventId for efficient event queries
 */
const guestSchema = new mongoose_1.Schema({
    eventId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Task",
        required: true,
        index: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            "Please provide a valid email address",
        ],
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
    googleContactId: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "declined"],
        default: "pending",
    },
}, { timestamps: true });
/**
 * Compound index for duplicate prevention
 * Ensures that the same email cannot be added twice to the same event
 */
guestSchema.index({ eventId: 1, email: 1 }, { unique: true });
/**
 * Composite index for efficient queries by userId and eventId
 */
guestSchema.index({ userId: 1, eventId: 1 });
exports.Guest = mongoose_1.default.models.Guest ||
    mongoose_1.default.model("Guest", guestSchema);
