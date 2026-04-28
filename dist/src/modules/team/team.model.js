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
exports.Team = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const teamMemberSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatar: { type: String },
    role: {
        type: String,
        enum: [
            "owner",
            "admin",
            "student_leader",
            "lecturer_leader",
            "member",
            "viewer",
        ],
        default: "member",
    },
    position: { type: String, trim: true },
    level: { type: String, trim: true },
    joinedAt: { type: Date, default: Date.now },
}, { _id: false });
const teamSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100,
    },
    description: { type: String, trim: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
    members: { type: [teamMemberSchema], default: [] },
    isArchived: { type: Boolean, default: false, index: true },
    teamType: {
        type: String,
        enum: ["student", "company"],
        default: "company",
        index: true,
    },
    industry: { type: String, trim: true },
}, { timestamps: true });
teamSchema.index({ "members.userId": 1 });
// Active teams for a member (filter out archived) — covers the dashboard list.
teamSchema.index({ "members.userId": 1, isArchived: 1, updatedAt: -1 });
exports.Team = mongoose_1.default.models.Team ||
    mongoose_1.default.model("Team", teamSchema);
