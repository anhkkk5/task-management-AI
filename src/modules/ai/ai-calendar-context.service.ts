import { Types } from "mongoose";
import { Task } from "../task/task.model";
import { DailyRoutine } from "../routine/routine.model";
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

  /**
   * Generates a comprehensive real-time context of the user's habits, scheduled
   * events, and backlog tasks to empower the AI Calendar & Habit Orchestrator.
   */
  getAIOrchestratorContext: async (userId: string): Promise<string> => {
    if (!Types.ObjectId.isValid(userId)) return "";
    const userObjectId = new Types.ObjectId(userId);

    // Current time in Vietnam (UTC+7)
    const now = new Date();
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const VI_WEEKDAYS = [
      "Chủ Nhật",
      "Thứ Hai",
      "Thứ Ba",
      "Thứ Tư",
      "Thứ Năm",
      "Thứ Sáu",
      "Thứ Bảy",
    ];
    const nowDayVi = VI_WEEKDAYS[vnNow.getUTCDay()];
    const nowStr = `${nowDayVi}, ngày ${pad2(vnNow.getUTCDate())}/${pad2(vnNow.getUTCMonth() + 1)}/${vnNow.getUTCFullYear()} ${pad2(vnNow.getUTCHours())}:${pad2(vnNow.getUTCMinutes())} (Giờ Việt Nam, GMT+7)`;

    // 7 days calendar overview (starting today)
    const daysList: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(vnNow.getTime() + i * 24 * 60 * 60 * 1000);
      const dayVi = VI_WEEKDAYS[d.getUTCDay()];
      const yyyy = d.getUTCFullYear();
      const mm = pad2(d.getUTCMonth() + 1);
      const dd = pad2(d.getUTCDate());
      const label = i === 0 ? "Hôm nay" : i === 1 ? "Ngày mai" : "";
      daysList.push(
        `  + ${label ? label + " - " : ""}${dayVi} (${dd}/${mm}/${yyyy}, ISO date: ${yyyy}-${mm}-${dd})`,
      );
    }

    // Load active Daily Routines
    const routines = await DailyRoutine.find({
      userId: userObjectId,
      isActive: true,
    })
      .sort({ startTime: 1 })
      .lean();

    const routineLines = routines.length
      ? routines.map((r) => {
          const daysStr =
            r.daysOfWeek?.length === 7
              ? "Mọi ngày"
              : r.daysOfWeek
                  ?.map((d) => (d === 7 ? "CN" : `T${d + 1}`))
                  .join(", ");
          const excluded = r.excludedDates?.length
            ? ` [Đã bỏ các ngày: ${r.excludedDates.join(", ")}]`
            : "";
          return `  - [RoutineID: ${r._id}] ${r.startTime} - ${r.endTime}: "${r.title}" (${daysStr})${excluded}`;
        })
      : ["  (Chưa có thói quen nào)"];

    // Load scheduled tasks in 7 days
    const from = new Date(now);
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const scheduledDocs = await Task.find({
      userId: userObjectId,
      isArchived: { $ne: true },
      status: { $nin: ["completed", "cancelled"] },
      "scheduledTime.start": { $gte: from, $lte: to },
    })
      .sort({ "scheduledTime.start": 1 })
      .lean();

    const scheduledLines = scheduledDocs.length
      ? scheduledDocs.map((t) => {
          const s = t.scheduledTime?.start
            ? new Date(t.scheduledTime.start)
            : null;
          const e = t.scheduledTime?.end
            ? new Date(t.scheduledTime.end)
            : null;
          const timeStr = s && e ? `${toHHmm(s)} - ${toHHmm(e)}` : "";
          const dateStr = s ? toDateKey(s) : "";
          return `  - [TaskID: ${t._id}] [${dateStr} ${timeStr}] "${t.title}" (Loại: ${t.type || "task"}, Ưu tiên: ${t.priority || "trung bình"})`;
        })
      : ["  (Chưa có sự kiện nào lên lịch trong 7 ngày tới)"];

    // Load pending/backlog tasks
    const pendingDocs = await Task.find({
      userId: userObjectId,
      isArchived: { $ne: true },
      status: { $in: ["pending", "in_progress"] },
      "scheduledTime.start": { $exists: false },
    })
      .limit(6)
      .lean();

    const pendingLines = pendingDocs.length
      ? pendingDocs.map(
          (t) =>
            `  - [BacklogTaskID: ${t._id}] "${t.title}" (Ưu tiên: ${t.priority || "trung bình"}, Ước lượng: ${t.estimatedDuration || 60}p)`,
        )
      : ["  (Không có task tồn đọng)"];

    return `
=====================
NGỮ CẢNH THỜI GIAN & LỊCH TRÌNH CỦA NGƯỜI DÙNG:
1. Thời gian hiện tại:
${nowStr}

2. Lịch các ngày trong tuần này:
${daysList.join("\n")}

3. Thói quen sinh hoạt hàng ngày cố định (Daily Routines):
${routineLines.join("\n")}

4. Sự kiện & Công việc đã lên lịch trên Calendar (7 ngày tới):
${scheduledLines.join("\n")}

5. Công việc còn tồn đọng / Chưa lên lịch (Backlog để nhặt vào khi rảnh):
${pendingLines.join("\n")}
=====================`;
  },
};
