import { Types } from "mongoose";
import { Task } from "../task/task.model";
import { freeTimeService } from "../free-time/free-time.service";

export type CalendarTaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  type?: string;
  start: string; // ISO
  end: string; // ISO
  source: "scheduled" | "deadline";
  reason?: string;
};

export type FreeBusyDay = {
  date: string; // YYYY-MM-DD
  weekday: string; // mon..sun
  freeSlots: { start: string; end: string }[]; // HH:mm
  busySlots: {
    start: string; // HH:mm
    end: string;
    title: string;
    taskId: string;
  }[];
};

export type CalendarSnapshot = {
  range: { from: string; to: string }; // ISO
  timezone: string;
  now: string;
  tasks: CalendarTaskItem[];
  days: FreeBusyDay[];
};

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const toHHmm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const eachDay = (from: Date, to: Date): Date[] => {
  const result: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
};

const minutesOfDay = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const minutesToHHmm = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
};

/**
 * Subtract busy intervals from a free interval. Inputs in minutes-of-day.
 * Returns remaining free intervals.
 */
const subtractBusyFromFree = (
  free: { start: number; end: number },
  busy: { start: number; end: number }[],
): { start: number; end: number }[] => {
  let pieces: { start: number; end: number }[] = [free];
  for (const b of busy) {
    const next: typeof pieces = [];
    for (const p of pieces) {
      if (b.end <= p.start || b.start >= p.end) {
        next.push(p);
        continue;
      }
      if (b.start > p.start) next.push({ start: p.start, end: b.start });
      if (b.end < p.end) next.push({ start: b.end, end: p.end });
    }
    pieces = next.filter((p) => p.end - p.start >= 5);
  }
  return pieces;
};

export const aiCalendarContextService = {
  /**
   * Build a calendar snapshot for the user covering [from, to].
   * - tasks: scheduled + deadline-bearing tasks overlapping the range
   * - days: per-day free vs busy slot decomposition (server local time)
   */
  getCalendarSnapshot: async (
    userId: string,
    fromISO: string,
    toISO: string,
  ): Promise<CalendarSnapshot> => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("USER_ID_INVALID");
    const from = new Date(fromISO);
    const to = new Date(toISO);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to.getTime() <= from.getTime()
    ) {
      throw new Error("RANGE_INVALID");
    }

    const userObjectId = new Types.ObjectId(userId);

    // Fetch tasks overlapping the range. Include scheduled + tasks with deadline in window.
    const docs = await Task.find({
      userId: userObjectId,
      isArchived: { $ne: true },
      status: { $nin: ["completed", "cancelled"] },
      $or: [
        {
          "scheduledTime.start": { $lt: to },
          "scheduledTime.end": { $gt: from },
        },
        { startAt: { $gte: from, $lte: to } },
        { deadline: { $gte: from, $lte: to } },
      ],
    })
      .select(
        "title status priority type startAt deadline scheduledTime aiBreakdown",
      )
      .exec();

    const tasks: CalendarTaskItem[] = [];
    for (const t of docs) {
      if (t.scheduledTime?.start && t.scheduledTime?.end) {
        tasks.push({
          id: String(t._id),
          title: t.title,
          status: t.status,
          priority: t.priority,
          type: t.type,
          start: t.scheduledTime.start.toISOString(),
          end: t.scheduledTime.end.toISOString(),
          source: "scheduled",
          reason: t.scheduledTime.reason,
        });
      } else if (t.deadline) {
        // Treat deadline-only tasks as 30-minute markers ending at deadline
        const end = new Date(t.deadline);
        const start = new Date(end.getTime() - 30 * 60 * 1000);
        tasks.push({
          id: String(t._id),
          title: t.title,
          status: t.status,
          priority: t.priority,
          type: t.type,
          start: start.toISOString(),
          end: end.toISOString(),
          source: "deadline",
        });
      }
    }

    // Build per-day free/busy decomposition
    const availability = await freeTimeService.getMyAvailability(userId);
    const timezone =
      availability?.timezone || process.env.DEFAULT_TIMEZONE || "Asia/Ho_Chi_Minh";

    const days: FreeBusyDay[] = [];
    for (const day of eachDay(from, to)) {
      const dateKey = toDateKey(day);
      const weekday = WEEKDAY_KEYS[day.getDay()];

      const freePattern = await freeTimeService
        .getAvailableSlotsForDate(userId, day)
        .catch(() => []);

      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      // Busy intervals that intersect this day
      const busyForDay = tasks
        .filter((t) => {
          const s = new Date(t.start).getTime();
          const e = new Date(t.end).getTime();
          return e > dayStart.getTime() && s < dayEnd.getTime();
        })
        .map((t) => {
          const s = new Date(t.start);
          const e = new Date(t.end);
          const sClamped = s < dayStart ? dayStart : s;
          const eClamped = e > dayEnd ? dayEnd : e;
          return {
            start: toHHmm(sClamped),
            end: toHHmm(eClamped),
            title: t.title,
            taskId: t.id,
            startMin: minutesOfDay(toHHmm(sClamped)),
            endMin: minutesOfDay(toHHmm(eClamped)),
          };
        })
        .sort((a, b) => a.startMin - b.startMin);

      const freeSlots: { start: string; end: string }[] = [];
      for (const slot of freePattern) {
        const startMin = minutesOfDay(slot.start);
        const endMin = minutesOfDay(slot.end);
        if (endMin <= startMin) continue;
        const remaining = subtractBusyFromFree(
          { start: startMin, end: endMin },
          busyForDay.map((b) => ({ start: b.startMin, end: b.endMin })),
        );
        for (const r of remaining) {
          freeSlots.push({
            start: minutesToHHmm(r.start),
            end: minutesToHHmm(r.end),
          });
        }
      }

      days.push({
        date: dateKey,
        weekday,
        freeSlots,
        busySlots: busyForDay.map((b) => ({
          start: b.start,
          end: b.end,
          title: b.title,
          taskId: b.taskId,
        })),
      });
    }

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      timezone,
      now: new Date().toISOString(),
      tasks,
      days,
    };
  },

  /**
   * Render a calendar snapshot as a compact text block to inject into the
   * system prompt. Token-friendly: only days that have tasks or free slots.
   */
  renderSnapshotForPrompt: (snapshot: CalendarSnapshot): string => {
    const lines: string[] = [];
    lines.push("USER CALENDAR SNAPSHOT");
    lines.push(
      `Window: ${snapshot.range.from.slice(0, 16)} → ${snapshot.range.to.slice(
        0,
        16,
      )} (${snapshot.timezone})`,
    );
    lines.push(`Now: ${snapshot.now.slice(0, 16)}`);
    lines.push("");
    if (snapshot.days.length === 0) {
      lines.push("(empty)");
      return lines.join("\n");
    }
    for (const day of snapshot.days) {
      const busyStr = day.busySlots.length
        ? day.busySlots
            .map((b) => `${b.start}-${b.end} ${b.title}`)
            .join("; ")
        : "—";
      const freeStr = day.freeSlots.length
        ? day.freeSlots.map((f) => `${f.start}-${f.end}`).join(", ")
        : "—";
      lines.push(
        `- ${day.date} (${day.weekday}) | busy: ${busyStr} | free: ${freeStr}`,
      );
    }
    return lines.join("\n");
  },
};
