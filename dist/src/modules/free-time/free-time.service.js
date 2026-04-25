"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freeTimeService = void 0;
const mongoose_1 = require("mongoose");
const free_time_repository_1 = require("./free-time.repository");
const WEEK_DAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];
const DEFAULT_SLOTS = [
    { start: "08:00", end: "11:30" },
    { start: "14:00", end: "17:30" },
    { start: "19:00", end: "23:00" },
];
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
    return h * 60 + m;
}
function isValidTimezone(timezone) {
    try {
        Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
    }
    catch {
        return false;
    }
}
function normalizeSlots(input) {
    const arr = Array.isArray(input) ? input : [];
    const normalized = arr
        .map((x) => ({
        start: String(x?.start ?? "").trim(),
        end: String(x?.end ?? "").trim(),
    }))
        .filter((x) => x.start && x.end);
    for (const slot of normalized) {
        if (!HHMM_REGEX.test(slot.start) || !HHMM_REGEX.test(slot.end)) {
            throw new Error("INVALID_TIME_FORMAT");
        }
        if (toMinutes(slot.start) >= toMinutes(slot.end)) {
            throw new Error("INVALID_TIME_RANGE");
        }
    }
    const sorted = normalized.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    for (let i = 0; i < sorted.length - 1; i++) {
        if (toMinutes(sorted[i].end) > toMinutes(sorted[i + 1].start)) {
            throw new Error("SLOTS_OVERLAP");
        }
    }
    return sorted;
}
function emptyPattern() {
    return {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
    };
}
function normalizeWeeklyPattern(input) {
    const base = emptyPattern();
    for (const day of WEEK_DAYS) {
        base[day] = normalizeSlots(input?.[day]);
    }
    return base;
}
function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function getWeekday(date) {
    const map = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ];
    return map[date.getDay()];
}
function toPublic(doc) {
    return {
        id: String(doc._id),
        userId: String(doc.userId),
        weeklyPattern: doc.weeklyPattern,
        customDates: doc.customDates,
        timezone: doc.timezone,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}
exports.freeTimeService = {
    getMyAvailability: async (userId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId))
            throw new Error("INVALID_ID");
        const doc = await free_time_repository_1.freeTimeRepository.findByUserId(userId);
        return doc ? toPublic(doc) : null;
    },
    updateWeeklyPattern: async (userId, weeklyPatternInput, timezone) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId))
            throw new Error("INVALID_ID");
        if (timezone && !isValidTimezone(timezone))
            throw new Error("INVALID_TIMEZONE");
        const weeklyPattern = normalizeWeeklyPattern(weeklyPatternInput);
        const doc = await free_time_repository_1.freeTimeRepository.upsertWeeklyPattern(userId, weeklyPattern, timezone);
        if (!doc)
            throw new Error("UPDATE_FAILED");
        return toPublic(doc);
    },
    setCustomDate: async (userId, date, slotsInput) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId))
            throw new Error("INVALID_ID");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
            throw new Error("INVALID_DATE");
        const slots = normalizeSlots(slotsInput);
        const doc = await free_time_repository_1.freeTimeRepository.upsertCustomDate(userId, date, slots);
        if (!doc)
            throw new Error("UPDATE_FAILED");
        return toPublic(doc);
    },
    deleteCustomDate: async (userId, date) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId))
            throw new Error("INVALID_ID");
        const doc = await free_time_repository_1.freeTimeRepository.deleteCustomDate(userId, date);
        if (!doc)
            throw new Error("NOT_FOUND");
        return toPublic(doc);
    },
    getAvailableSlotsForDate: async (userId, date) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            return DEFAULT_SLOTS;
        }
        const doc = await free_time_repository_1.freeTimeRepository.findByUserId(userId);
        if (!doc)
            return DEFAULT_SLOTS;
        const dateKey = toDateKey(date);
        const custom = (doc.customDates || []).find((x) => x.date === dateKey);
        if (custom) {
            return normalizeSlots(custom.slots);
        }
        const day = getWeekday(date);
        const slots = normalizeSlots(doc.weeklyPattern?.[day]);
        return slots.length > 0 ? slots : DEFAULT_SLOTS;
    },
};
