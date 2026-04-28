import {
  aiCalendarContextService,
  FreeBusyDay,
} from "./ai-calendar-context.service";
import {
  toLocalDateStr,
  createDateWithTime,
} from "../scheduler/scheduler.utils";

export type ScheduleProposal = {
  date: string;
  start: string;
  end: string;
  reason: string;
  score: number;
};

type ProposeScheduleResult = {
  proposals: ScheduleProposal[];
  days: FreeBusyDay[];
  unmetSessions?: number;
  note?: string;
};

export type ScheduleInput = {
  activityName: string;
  durationMin: number;
  sessionsPerWeek: number;
  windowStart?: string;
  windowEnd?: string;
  daysAllowed?: string[];
  minGapDays?: number;
  blockedSlots?: { date: string; start: string; end: string }[];
  fromISO: string;
  toISO: string;
};

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const parseHHMM = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
};

const minutesToHHMM = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

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

const isDayAllowed = (date: Date, allowed?: string[]): boolean => {
  if (!allowed || allowed.length === 0) return true;
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

const intersectIntervals = (
  free: { start: number; end: number },
  windowStartMin: number,
  windowEndMin: number,
): { start: number; end: number }[] => {
  const s = Math.max(free.start, windowStartMin);
  const e = Math.min(free.end, windowEndMin);
  if (e <= s) return [];
  return [{ start: s, end: e }];
};

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

const scoreCandidate = (
  candidate: { start: number; end: number },
  windowStartMin: number,
  windowEndMin: number,
  previousStartMin?: number,
): number => {
  let score = 0;

  const mid = (windowStartMin + windowEndMin) / 2;
  const candMid = (candidate.start + candidate.end) / 2;
  const distFromMid = Math.abs(candMid - mid);
  const windowSpan = windowEndMin - windowStartMin;
  const centerScore = 1 - distFromMid / windowSpan;
  score += centerScore * 40;

  if (previousStartMin !== undefined) {
    const diff = Math.abs(candidate.start - previousStartMin);
    if (diff <= 30) score += 30;
    else if (diff <= 60) score += 20;
    else if (diff <= 120) score += 10;
  }

  const duration = candidate.end - candidate.start;
  score += Math.min(20, duration / 10);

  return score;
};

export const activitySchedulerService = {
  proposeSchedule: async (
    userId: string,
    input: ScheduleInput,
  ): Promise<ProposeScheduleResult> => {
    const {
      activityName,
      durationMin,
      sessionsPerWeek,
      windowStart = "00:00",
      windowEnd = "23:59",
      daysAllowed,
      minGapDays = 0,
      blockedSlots,
      fromISO,
      toISO,
    } = input;

    if (durationMin <= 0) throw new Error("DURATION_MUST_BE_POSITIVE");
    if (sessionsPerWeek <= 0)
      throw new Error("SESSIONS_PER_WEEK_MUST_BE_POSITIVE");

    const from = new Date(fromISO);
    const to = new Date(toISO);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("INVALID_DATE_RANGE");
    }

    const windowStartMin = parseHHMM(windowStart);
    const windowEndMin = parseHHMM(windowEnd);
    if (
      windowStartMin < 0 ||
      windowEndMin < 0 ||
      windowEndMin <= windowStartMin
    ) {
      throw new Error("INVALID_WINDOW");
    }

    const snapshot = await aiCalendarContextService.getCalendarSnapshot(
      userId,
      fromISO,
      toISO,
    );

    const days = snapshot.days;
    const now = new Date();
    const allCandidates: {
      date: string;
      start: number;
      end: number;
      score: number;
      reason: string;
    }[] = [];

    const dates = eachDay(from, to);

    for (const day of dates) {
      const dateStr = toLocalDateStr(day);
      const dayData = days.find((d) => d.date === dateStr);
      if (!dayData) continue;

      if (!isDayAllowed(day, daysAllowed)) continue;

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

        const windowed = intersectIntervals(
          freeMin,
          windowStartMin,
          windowEndMin,
        );
        const remaining = windowed.flatMap((w) =>
          subtractBusyFromFree(w, occupiedMin),
        );

        for (const r of remaining) {
          if (r.end - r.start >= durationMin) {
            const start = r.start;
            const end = start + durationMin;
            const candidateStart = createDateWithTime(
              dateStr,
              Math.floor(start / 60),
              start % 60,
            );
            if (candidateStart.getTime() <= now.getTime()) {
              continue;
            }
            allCandidates.push({
              date: dateStr,
              start,
              end,
              score: scoreCandidate(
                { start, end },
                windowStartMin,
                windowEndMin,
              ),
              reason: `Free ${minutesToHHMM(start)}-${minutesToHHMM(end)}, no conflicts`,
            });
          }
        }
      }
    }

    // Prefer higher score first, then earlier date/time for deterministic picks.
    allCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start - b.start;
    });

    const selected: ScheduleProposal[] = [];
    const selectedDates: string[] = [];
    const selectedDateSet = new Set<string>();

    for (const cand of allCandidates) {
      if (selected.length >= sessionsPerWeek) break;

      // Calendar weekly scheduling should not place multiple sessions on the
      // same day unless explicitly designed otherwise.
      if (selectedDateSet.has(cand.date)) continue;

      if (minGapDays > 0 && selectedDates.length > 0) {
        const candDate = new Date(cand.date);
        let tooClose = false;
        for (const selDate of selectedDates) {
          const sel = new Date(selDate);
          const diffDays = Math.abs(
            (candDate.getTime() - sel.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (diffDays < minGapDays) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
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
    const note =
      unmetSessions > 0
        ? `Không đủ slot trống để xếp đủ ${sessionsPerWeek} buổi trong khung giờ ${windowStart}-${windowEnd}. Thiếu ${unmetSessions} buổi.`
        : undefined;

    return { proposals: selected, days, unmetSessions, note };
  },

  breakdownActivity: async (input: {
    activityName: string;
    totalSessions: number;
    durationMinPerSession: number;
  }): Promise<{
    sessions: { index: number; focus: string; drills: string[] }[];
  }> => {
    const { activityName, totalSessions, durationMinPerSession } = input;

    if (totalSessions <= 0) throw new Error("TOTAL_SESSIONS_MUST_BE_POSITIVE");
    if (durationMinPerSession <= 0)
      throw new Error("DURATION_MUST_BE_POSITIVE");

    const sessions: { index: number; focus: string; drills: string[] }[] = [];

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
