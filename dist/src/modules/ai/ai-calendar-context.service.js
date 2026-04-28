"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiCalendarContextService = void 0;
const mongoose_1 = require("mongoose");
const task_model_1 = require("../task/task.model");
const free_time_service_1 = require("../free-time/free-time.service");
const WEEKDAY_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
const toDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toHHmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const eachDay = (from, to) => {
    const result = [];
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
const minutesOfDay = (hhmm) => {
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};
const minutesToHHmm = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${pad2(h)}:${pad2(m)}`;
};
/**
 * Subtract busy intervals from a free interval. Inputs in minutes-of-day.
 * Returns remaining free intervals.
 */
const subtractBusyFromFree = (free, busy) => {
    let pieces = [free];
    for (const b of busy) {
        const next = [];
        for (const p of pieces) {
            if (b.end <= p.start || b.start >= p.end) {
                next.push(p);
                continue;
            }
            if (b.start > p.start)
                next.push({ start: p.start, end: b.start });
            if (b.end < p.end)
                next.push({ start: b.end, end: p.end });
        }
        pieces = next.filter((p) => p.end - p.start >= 5);
    }
    return pieces;
};
exports.aiCalendarContextService = {
    /**
     * Build a calendar snapshot for the user covering [from, to].
     * - tasks: scheduled + deadline-bearing tasks overlapping the range
     * - days: per-day free vs busy slot decomposition (server local time)
     */
    getCalendarSnapshot: async (userId, fromISO, toISO) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId))
            throw new Error("USER_ID_INVALID");
        const from = new Date(fromISO);
        const to = new Date(toISO);
        if (Number.isNaN(from.getTime()) ||
            Number.isNaN(to.getTime()) ||
            to.getTime() <= from.getTime()) {
            throw new Error("RANGE_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        // Fetch tasks overlapping the range. Include scheduled + tasks with deadline in window.
        const docs = await task_model_1.Task.find({
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
            .select("title status priority type startAt deadline scheduledTime aiBreakdown")
            .exec();
        const tasks = [];
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
            }
            else if (t.deadline) {
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
        const availability = await free_time_service_1.freeTimeService.getMyAvailability(userId);
        const timezone = availability?.timezone || process.env.DEFAULT_TIMEZONE || "Asia/Ho_Chi_Minh";
        const days = [];
        for (const day of eachDay(from, to)) {
            const dateKey = toDateKey(day);
            const weekday = WEEKDAY_KEYS[day.getDay()];
            const freePattern = await free_time_service_1.freeTimeService
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
            const freeSlots = [];
            for (const slot of freePattern) {
                const startMin = minutesOfDay(slot.start);
                const endMin = minutesOfDay(slot.end);
                if (endMin <= startMin)
                    continue;
                const remaining = subtractBusyFromFree({ start: startMin, end: endMin }, busyForDay.map((b) => ({ start: b.startMin, end: b.endMin })));
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
    renderSnapshotForPrompt: (snapshot) => {
        const lines = [];
        lines.push("USER CALENDAR SNAPSHOT");
        lines.push(`Window: ${snapshot.range.from.slice(0, 16)} → ${snapshot.range.to.slice(0, 16)} (${snapshot.timezone})`);
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
            lines.push(`- ${day.date} (${day.weekday}) | busy: ${busyStr} | free: ${freeStr}`);
        }
        return lines.join("\n");
    },
};
