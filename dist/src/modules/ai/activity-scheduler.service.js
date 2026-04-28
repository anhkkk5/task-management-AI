"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activitySchedulerService = void 0;
const ai_calendar_context_service_1 = require("./ai-calendar-context.service");
const scheduler_utils_1 = require("../scheduler/scheduler.utils");
const WEEKDAY_MAP = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};
const parseHHMM = (hhmm) => {
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m))
        return -1;
    return h * 60 + m;
};
const minutesToHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
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
const isDayAllowed = (date, allowed) => {
    if (!allowed || allowed.length === 0)
        return true;
    const weekday = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ][date.getDay()];
    return allowed.includes(weekday);
};
const intersectIntervals = (free, windowStartMin, windowEndMin) => {
    const s = Math.max(free.start, windowStartMin);
    const e = Math.min(free.end, windowEndMin);
    if (e <= s)
        return [];
    return [{ start: s, end: e }];
};
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
const scoreCandidate = (candidate, windowStartMin, windowEndMin, previousStartMin) => {
    let score = 0;
    const mid = (windowStartMin + windowEndMin) / 2;
    const candMid = (candidate.start + candidate.end) / 2;
    const distFromMid = Math.abs(candMid - mid);
    const windowSpan = windowEndMin - windowStartMin;
    const centerScore = 1 - distFromMid / windowSpan;
    score += centerScore * 40;
    if (previousStartMin !== undefined) {
        const diff = Math.abs(candidate.start - previousStartMin);
        if (diff <= 30)
            score += 30;
        else if (diff <= 60)
            score += 20;
        else if (diff <= 120)
            score += 10;
    }
    const duration = candidate.end - candidate.start;
    score += Math.min(20, duration / 10);
    return score;
};
exports.activitySchedulerService = {
    proposeSchedule: async (userId, input) => {
        const { activityName, durationMin, sessionsPerWeek, windowStart = "00:00", windowEnd = "23:59", daysAllowed, minGapDays = 0, blockedSlots, fromISO, toISO, } = input;
        if (durationMin <= 0)
            throw new Error("DURATION_MUST_BE_POSITIVE");
        if (sessionsPerWeek <= 0)
            throw new Error("SESSIONS_PER_WEEK_MUST_BE_POSITIVE");
        const from = new Date(fromISO);
        const to = new Date(toISO);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new Error("INVALID_DATE_RANGE");
        }
        const windowStartMin = parseHHMM(windowStart);
        const windowEndMin = parseHHMM(windowEnd);
        if (windowStartMin < 0 ||
            windowEndMin < 0 ||
            windowEndMin <= windowStartMin) {
            throw new Error("INVALID_WINDOW");
        }
        const snapshot = await ai_calendar_context_service_1.aiCalendarContextService.getCalendarSnapshot(userId, fromISO, toISO);
        const days = snapshot.days;
        const now = new Date();
        const allCandidates = [];
        const dates = eachDay(from, to);
        for (const day of dates) {
            const dateStr = (0, scheduler_utils_1.toLocalDateStr)(day);
            const dayData = days.find((d) => d.date === dateStr);
            if (!dayData)
                continue;
            if (!isDayAllowed(day, daysAllowed))
                continue;
            const busyMin = dayData.busySlots.map((b) => ({
                start: parseHHMM(b.start),
                end: parseHHMM(b.end),
            }));
            const blockedMin = (blockedSlots || [])
                .filter((b) => b.date === dateStr)
                .map((b) => ({ start: parseHHMM(b.start), end: parseHHMM(b.end) }))
                .filter((b) => b.start >= 0 && b.end > b.start);
            const occupiedMin = [...busyMin, ...blockedMin];
            for (const free of dayData.freeSlots) {
                const freeMin = {
                    start: parseHHMM(free.start),
                    end: parseHHMM(free.end),
                };
                const windowed = intersectIntervals(freeMin, windowStartMin, windowEndMin);
                const remaining = windowed.flatMap((w) => subtractBusyFromFree(w, occupiedMin));
                for (const r of remaining) {
                    if (r.end - r.start >= durationMin) {
                        const start = r.start;
                        const end = start + durationMin;
                        const candidateStart = (0, scheduler_utils_1.createDateWithTime)(dateStr, Math.floor(start / 60), start % 60);
                        if (candidateStart.getTime() <= now.getTime()) {
                            continue;
                        }
                        allCandidates.push({
                            date: dateStr,
                            start,
                            end,
                            score: scoreCandidate({ start, end }, windowStartMin, windowEndMin),
                            reason: `Free ${minutesToHHMM(start)}-${minutesToHHMM(end)}, no conflicts`,
                        });
                    }
                }
            }
        }
        // Prefer higher score first, then earlier date/time for deterministic picks.
        allCandidates.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            if (a.date !== b.date)
                return a.date.localeCompare(b.date);
            return a.start - b.start;
        });
        const selected = [];
        const selectedDates = [];
        const selectedDateSet = new Set();
        for (const cand of allCandidates) {
            if (selected.length >= sessionsPerWeek)
                break;
            // Calendar weekly scheduling should not place multiple sessions on the
            // same day unless explicitly designed otherwise.
            if (selectedDateSet.has(cand.date))
                continue;
            if (minGapDays > 0 && selectedDates.length > 0) {
                const candDate = new Date(cand.date);
                let tooClose = false;
                for (const selDate of selectedDates) {
                    const sel = new Date(selDate);
                    const diffDays = Math.abs((candDate.getTime() - sel.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < minGapDays) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose)
                    continue;
            }
            selected.push({
                date: cand.date,
                start: minutesToHHMM(cand.start),
                end: minutesToHHMM(cand.end),
                reason: cand.reason,
                score: cand.score,
            });
            selectedDates.push(cand.date);
            selectedDateSet.add(cand.date);
        }
        const unmetSessions = Math.max(0, sessionsPerWeek - selected.length);
        const note = unmetSessions > 0
            ? `Không đủ slot trống để xếp đủ ${sessionsPerWeek} buổi trong khung giờ ${windowStart}-${windowEnd}. Thiếu ${unmetSessions} buổi.`
            : undefined;
        return { proposals: selected, days, unmetSessions, note };
    },
    breakdownActivity: async (input) => {
        const { activityName, totalSessions, durationMinPerSession } = input;
        if (totalSessions <= 0)
            throw new Error("TOTAL_SESSIONS_MUST_BE_POSITIVE");
        if (durationMinPerSession <= 0)
            throw new Error("DURATION_MUST_BE_POSITIVE");
        const sessions = [];
        for (let i = 0; i < totalSessions; i++) {
            sessions.push({
                index: i + 1,
                focus: `Buổi ${i + 1} - ${activityName}`,
                drills: [
                    `Khởi động 5 phút`,
                    `Thực hiện ${activityName} chính ${durationMinPerSession - 10} phút`,
                    `Kết thúc 5 phút`,
                ],
            });
        }
        return { sessions };
    },
};
