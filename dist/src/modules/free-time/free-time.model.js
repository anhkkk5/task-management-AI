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
exports.FreeTime = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const slotSchema = new mongoose_1.Schema({
    start: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    end: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
}, { _id: false });
const weeklyPatternSchema = new mongoose_1.Schema({
    monday: { type: [slotSchema], default: [] },
    tuesday: { type: [slotSchema], default: [] },
    wednesday: { type: [slotSchema], default: [] },
    thursday: { type: [slotSchema], default: [] },
    friday: { type: [slotSchema], default: [] },
    saturday: { type: [slotSchema], default: [] },
    sunday: { type: [slotSchema], default: [] },
}, { _id: false });
const customDateSchema = new mongoose_1.Schema({
    date: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/,
    },
    slots: { type: [slotSchema], default: [] },
}, { _id: false });
const freeTimeSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true,
        ref: "User",
    },
    weeklyPattern: {
        type: weeklyPatternSchema,
        required: true,
        default: () => ({
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
        }),
    },
    customDates: { type: [customDateSchema], default: [] },
    timezone: {
        type: String,
        required: true,
        default: "Asia/Ho_Chi_Minh",
    },
}, { timestamps: true });
freeTimeSchema.index({ userId: 1 }, { unique: true });
freeTimeSchema.index({ "customDates.date": 1 });
exports.FreeTime = mongoose_1.default.models.FreeTime ||
    mongoose_1.default.model("FreeTime", freeTimeSchema);
