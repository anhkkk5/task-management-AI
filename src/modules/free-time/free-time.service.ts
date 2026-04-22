import { Types } from "mongoose";
import {
  AvailableTimeSlot,
  FreeTimeDoc,
  WeeklyPattern,
} from "./free-time.model";
import { freeTimeRepository } from "./free-time.repository";

const WEEK_DAYS: Array<keyof WeeklyPattern> = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_SLOTS: AvailableTimeSlot[] = [
  { start: "08:00", end: "11:30" },
  { start: "14:00", end: "17:30" },
  { start: "19:00", end: "23:00" },
];

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function normalizeSlots(input: any): AvailableTimeSlot[] {
  const arr = Array.isArray(input) ? input : [];
  const normalized = arr
    .map((x: any) => ({
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

  const sorted = normalized.sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start),
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    if (toMinutes(sorted[i].end) > toMinutes(sorted[i + 1].start)) {
      throw new Error("SLOTS_OVERLAP");
    }
  }

  return sorted;
}

function emptyPattern(): WeeklyPattern {
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

function normalizeWeeklyPattern(input: any): WeeklyPattern {
  const base = emptyPattern();
  for (const day of WEEK_DAYS) {
    base[day] = normalizeSlots(input?.[day]);
  }
  return base;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekday(date: Date): keyof WeeklyPattern {
  const map: Array<keyof WeeklyPattern> = [
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

function toPublic(doc: FreeTimeDoc) {
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

export const freeTimeService = {
  getMyAvailability: async (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("INVALID_ID");
    const doc = await freeTimeRepository.findByUserId(userId);
    return doc ? toPublic(doc) : null;
  },

  updateWeeklyPattern: async (
    userId: string,
    weeklyPatternInput: any,
    timezone?: string,
  ) => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("INVALID_ID");
    if (timezone && !isValidTimezone(timezone))
      throw new Error("INVALID_TIMEZONE");

    const weeklyPattern = normalizeWeeklyPattern(weeklyPatternInput);
    const doc = await freeTimeRepository.upsertWeeklyPattern(
      userId,
      weeklyPattern,
      timezone,
    );
    if (!doc) throw new Error("UPDATE_FAILED");
    return toPublic(doc);
  },

  setCustomDate: async (userId: string, date: string, slotsInput: any) => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("INVALID_ID");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_DATE");

    const slots = normalizeSlots(slotsInput);
    const doc = await freeTimeRepository.upsertCustomDate(userId, date, slots);
    if (!doc) throw new Error("UPDATE_FAILED");
    return toPublic(doc);
  },

  deleteCustomDate: async (userId: string, date: string) => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("INVALID_ID");
    const doc = await freeTimeRepository.deleteCustomDate(userId, date);
    if (!doc) throw new Error("NOT_FOUND");
    return toPublic(doc);
  },

  getAvailableSlotsForDate: async (
    userId: string,
    date: Date,
  ): Promise<AvailableTimeSlot[]> => {
    if (!Types.ObjectId.isValid(userId)) {
      return DEFAULT_SLOTS;
    }
    const doc = await freeTimeRepository.findByUserId(userId);
    if (!doc) return DEFAULT_SLOTS;

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
