import { TimeInterval, FreeSlot, ProductivityScore } from "./types";
import { intervalScheduler } from "./scheduler.service";
import { slotCache, cacheKeys } from "./cache.service";
import { CACHE_VERSION, versionedKey } from "../../config/cache-version";
import { AdaptiveBufferCalculator } from "./adaptive-buffer";

// Helper function for local date string
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface SlotFinderInput {
  busySlots: TimeInterval[];
  date: Date;
  minDuration: number; // minutes
  workHours: {
    start: number;
    end: number;
    breaks?: { start: number; end: number }[]; // Giờ nghỉ
  };
  bufferMinutes?: number; // Thời gian nghỉ giữa các task (mặc định 15 phút)
  currentTime?: Date; // ⭐ NEW: Giờ hiện tại để skip past slots
}

export interface OptimalSlotInput {
  taskDuration: number; // minutes
  preferredTimeOfDay?: "morning" | "afternoon" | "evening";
  productivityScores?: Map<number, ProductivityScore>;
  busySlots: TimeInterval[];
  date: Date;
  workHours?: {
    start: number;
    end: number;
    breaks?: { start: number; end: number }[];
  };
  bufferMinutes?: number;
  currentTime?: Date;
  /** Deadline date for urgency scoring — earlier slots get bonus when deadline is near */
  deadline?: Date;
  /** Task priority for urgency weighting */
  priority?: "urgent" | "high" | "medium" | "low";
}

export class SlotFinder {
  /**
   * Tìm free slots có caching
   */
  findFreeSlotsWithCache(userId: string, input: SlotFinderInput): FreeSlot[] {
    const dateStr = input.date.toISOString().split("T")[0];
    const cacheKey = versionedKey(
      CACHE_VERSION.SLOT_FINDER,
      cacheKeys.freeSlots(userId, dateStr),
    );

    const cached = slotCache.get<FreeSlot[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const slots = this.findFreeSlots(input);
    slotCache.set(cacheKey, slots, 5); // Cache 5 phút
    return slots;
  }
  /**
   * Tìm tất cả free slots trong ngày
   * O(n log n) vì cần merge intervals trước
   */
  findFreeSlots(input: SlotFinderInput): FreeSlot[] {
    const {
      busySlots,
      date,
      minDuration,
      workHours,
      bufferMinutes = 15,
      currentTime,
    } = input;

    // Thêm breaks vào busy slots
    const allBusySlots = [...busySlots];

    if (workHours.breaks) {
      workHours.breaks.forEach((breakTime) => {
        const breakStart = new Date(date);
        const startHour = Math.floor(breakTime.start);
        const startMinute = (breakTime.start % 1) * 60;
        breakStart.setHours(startHour, startMinute, 0, 0);

        const breakEnd = new Date(date);
        const endHour = Math.floor(breakTime.end);
        const endMinute = (breakTime.end % 1) * 60;
        breakEnd.setHours(endHour, endMinute, 0, 0);

        allBusySlots.push({
          start: breakStart,
          end: breakEnd,
          taskId: "BREAK",
        });
      });
    }

    // ⭐ NEW: Nếu là hôm nay, thêm busy slot cho thời gian đã qua
    if (currentTime) {
      const dateStr = toLocalDateStr(date);
      const currentDateStr = toLocalDateStr(currentTime);

      if (dateStr === currentDateStr) {
        // Thêm buffer 30 phút để tránh schedule quá gần
        const minStartTime = new Date(currentTime.getTime() + 30 * 60 * 1000);

        const dayStart = new Date(date);
        dayStart.setHours(workHours.start, 0, 0, 0);

        if (minStartTime > dayStart) {
          allBusySlots.push({
            start: dayStart,
            end: minStartTime,
            taskId: "PAST_TIME",
          });
        }
      }
    }

    // Merge busy slots để có danh sách gọn gàng
    const mergedBusy = intervalScheduler.mergeIntervals(allBusySlots);

    const freeSlots: FreeSlot[] = [];

    // Tạo work day boundaries
    const dayStart = new Date(date);
    dayStart.setHours(workHours.start, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(workHours.end, 0, 0, 0);

    // Nếu không có busy slots → cả ngày đều rảnh (trừ breaks)
    if (mergedBusy.length === 0) {
      const duration = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
      if (duration >= minDuration) {
        return [
          {
            start: dayStart,
            end: dayEnd,
            duration,
            productivityScore: 0.5, // default
          },
        ];
      }
      return [];
    }

    // Tìm gap trước slot đầu tiên
    const firstBusy = mergedBusy[0];
    if (firstBusy.start > dayStart) {
      const gap =
        (firstBusy.start.getTime() - dayStart.getTime()) / (1000 * 60);
      if (gap >= minDuration + bufferMinutes) {
        freeSlots.push({
          start: dayStart,
          end: new Date(firstBusy.start.getTime() - bufferMinutes * 60 * 1000), // Trừ buffer
          duration: gap - bufferMinutes,
          productivityScore: this.estimateProductivity(dayStart.getHours()),
        });
      }
    }

    // Tìm gaps giữa các busy slots (thêm buffer linh hoạt)
    for (let i = 0; i < mergedBusy.length - 1; i++) {
      // Tính duration của task vừa kết thúc
      const previousTaskDuration =
        (mergedBusy[i].end.getTime() - mergedBusy[i].start.getTime()) /
        (1000 * 60);

      // Tính buffer linh hoạt: < 40 phút → 10 phút, ≥ 40 phút → 15 phút
      const adaptiveBuffer = AdaptiveBufferCalculator.calculateBuffer(
        previousTaskDuration,
        bufferMinutes,
      );

      const currentEnd = new Date(
        mergedBusy[i].end.getTime() + adaptiveBuffer * 60 * 1000,
      ); // Thêm buffer linh hoạt
      const nextStart = mergedBusy[i + 1].start;

      const gap = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);

      if (gap >= minDuration) {
        freeSlots.push({
          start: currentEnd,
          end: nextStart,
          duration: gap,
          productivityScore: this.estimateProductivity(currentEnd.getHours()),
        });
      }
    }

    // Tìm gap sau slot cuối cùng (cũng dùng adaptive buffer)
    const lastBusy = mergedBusy[mergedBusy.length - 1];
    const lastTaskDuration =
      (lastBusy.end.getTime() - lastBusy.start.getTime()) / (1000 * 60);
    const lastBuffer = AdaptiveBufferCalculator.calculateBuffer(
      lastTaskDuration,
      bufferMinutes,
    );
    const lastEnd = new Date(lastBusy.end.getTime() + lastBuffer * 60 * 1000); // Thêm buffer linh hoạt
    if (lastEnd < dayEnd) {
      const gap = (dayEnd.getTime() - lastEnd.getTime()) / (1000 * 60);
      if (gap >= minDuration) {
        freeSlots.push({
          start: lastEnd,
          end: dayEnd,
          duration: gap,
          productivityScore: this.estimateProductivity(lastEnd.getHours()),
        });
      }
    }

    // Sort by start time
    return freeSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Tìm slot tối ưu nhất cho task cụ thể.
   *
   * Multi-factor scoring:
   *   productivity (40%) + slotFitness (20%) + preferredTime (15%)
   *   + urgency (15%) − fragmentationPenalty (10%)
   */
  findOptimalSlot(input: OptimalSlotInput): FreeSlot | null {
    const {
      taskDuration,
      preferredTimeOfDay,
      productivityScores,
      busySlots,
      date,
      workHours = {
        start: 8,
        end: 23,
        breaks: [
          { start: 11.5, end: 14 },
          { start: 17.5, end: 19 },
        ],
      },
      bufferMinutes = 15,
      currentTime,
      deadline,
      priority,
    } = input;

    const freeSlots = this.findFreeSlots({
      busySlots,
      date,
      minDuration: taskDuration,
      workHours,
      bufferMinutes,
      currentTime,
    });

    if (freeSlots.length === 0) {
      return null;
    }

    // ── Weights ──
    const W_PROD = 0.4;
    const W_FIT = 0.2;
    const W_PREF = 0.15;
    const W_URG = 0.15;
    const W_FRAG = 0.1;

    // ── Pre-compute urgency factor (shared across all slots) ──
    let urgencyBonus = 0;
    if (deadline) {
      const msLeft = deadline.getTime() - date.getTime();
      const daysLeft = msLeft / (1000 * 60 * 60 * 24);
      // Closer deadline → higher urgency (1.0 = overdue, 0.0 = 7+ days)
      urgencyBonus = Math.max(0, Math.min(1, 1 - daysLeft / 7));
    }
    // Priority boost stacks with deadline urgency
    const priorityMultiplier =
      priority === "urgent"
        ? 1.0
        : priority === "high"
          ? 0.7
          : priority === "low"
            ? 0.2
            : 0.4; // medium / default
    urgencyBonus *= priorityMultiplier;

    const scoredSlots = freeSlots.map((slot) => {
      const hour = slot.start.getHours();

      // 1. Productivity score (from history or fallback)
      let prodScore = slot.productivityScore;
      if (productivityScores) {
        const histScore = productivityScores.get(hour)?.score;
        if (histScore !== undefined) {
          const confidence = productivityScores.get(hour)?.confidence ?? 0;
          // Bayesian blend: high confidence → trust history, low → keep fallback
          prodScore = histScore * confidence + prodScore * (1 - confidence);
        }
      }

      // 2. Slot fitness — how well the slot fits the task duration
      const efficiency = taskDuration / slot.duration;
      // Perfect fit (70-100%) → 1.0, too much waste → lower
      const fitnessScore =
        efficiency >= 0.7 && efficiency <= 1.0
          ? 1.0
          : efficiency > 1.0
            ? 0.0 // shouldn't happen (slot too small) but safety
            : Math.max(0.3, efficiency / 0.7); // partial credit for larger slots

      // 3. Preferred time of day
      let prefScore = 0.5; // neutral default
      if (preferredTimeOfDay) {
        const ranges: Record<string, number[]> = {
          morning: [8, 9, 10, 11],
          afternoon: [14, 15, 16, 17],
          evening: [19, 20, 21, 22],
        };
        prefScore = ranges[preferredTimeOfDay]?.includes(hour) ? 1.0 : 0.3;
      }

      // 4. Urgency — earlier slot in the day is better when deadline is near
      let urgScore = urgencyBonus;
      if (urgencyBonus > 0.3) {
        // Strong urgency → bonus for earlier time slots
        const earlyBonus = Math.max(0, 1 - hour / 24);
        urgScore = urgencyBonus * 0.7 + earlyBonus * 0.3;
      }

      // 5. Fragmentation penalty — large leftover gaps are wasteful
      const leftover = slot.duration - taskDuration;
      // Penalize tiny leftovers (< 30 min) that can't fit another task
      const fragPenalty =
        leftover > 0 && leftover < 30
          ? 0.8 // high penalty for unusable fragments
          : leftover >= 30
            ? 0.0 // no penalty, leftover is usable
            : 0.0; // exact fit

      // ── Weighted combination ──
      const totalScore =
        prodScore * W_PROD +
        fitnessScore * W_FIT +
        prefScore * W_PREF +
        urgScore * W_URG -
        fragPenalty * W_FRAG;

      return {
        ...slot,
        productivityScore: Math.max(0, Math.min(1, totalScore)),
      };
    });

    scoredSlots.sort((a, b) => b.productivityScore - a.productivityScore);
    return scoredSlots[0];
  }

  /**
   * Kiểm tra có slot available không (boolean check nhanh)
   */
  hasAvailableSlot(
    busySlots: TimeInterval[],
    duration: number,
    date: Date,
    workHours: { start: number; end: number } = { start: 8, end: 18 },
  ): boolean {
    const slots = this.findFreeSlots({
      busySlots,
      date,
      minDuration: duration,
      workHours,
    });
    return slots.length > 0;
  }

  /**
   * Tìm tất cả slots trong khoảng thời gian (nhiều ngày)
   */
  findSlotsInRange(
    busySlots: TimeInterval[],
    startDate: Date,
    endDate: Date,
    minDuration: number,
    workHours: { start: number; end: number } = { start: 8, end: 18 },
  ): Map<string, FreeSlot[]> {
    const result = new Map<string, FreeSlot[]>();

    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];

      // Filter busy slots cho ngày này
      const dayBusy = busySlots.filter(
        (slot) => slot.start.toDateString() === current.toDateString(),
      );

      const slots = this.findFreeSlots({
        busySlots: dayBusy,
        date: new Date(current),
        minDuration,
        workHours,
      });

      result.set(dateStr, slots);
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  /**
   * Tìm slot sớm nhất có thể (cho urgent task)
   */
  findEarliestSlot(
    busySlots: TimeInterval[],
    duration: number,
    fromTime: Date,
    workHours: { start: number; end: number } = { start: 8, end: 18 },
  ): FreeSlot | null {
    // Bắt đầu từ fromTime, tìm trong 7 ngày tới
    const endSearch = new Date(fromTime);
    endSearch.setDate(endSearch.getDate() + 7);

    const current = new Date(fromTime);

    while (current <= endSearch) {
      // Nếu là ngày hiện tại và đã qua giờ bắt đầu, bắt đầu từ giờ tiếp theo
      let searchStart = new Date(current);
      if (current.toDateString() === fromTime.toDateString()) {
        const currentHour = fromTime.getHours();
        if (currentHour >= workHours.start) {
          searchStart.setHours(currentHour + 1, 0, 0, 0);
        }
      } else {
        searchStart.setHours(workHours.start, 0, 0, 0);
      }

      // Tạo busy slots cho ngày này từ searchStart
      const dayBusy = busySlots.filter(
        (slot) =>
          slot.start.toDateString() === current.toDateString() &&
          slot.end > searchStart,
      );

      // Thêm "busy" từ đầu ngày đến searchStart
      if (searchStart.getHours() > workHours.start) {
        dayBusy.unshift({
          start: new Date(current.setHours(workHours.start, 0, 0, 0)),
          end: searchStart,
        });
      }

      const slots = this.findFreeSlots({
        busySlots: dayBusy,
        date: new Date(current),
        minDuration: duration,
        workHours,
      });

      if (slots.length > 0) {
        return slots[0]; // Return slot đầu tiên của ngày
      }

      current.setDate(current.getDate() + 1);
    }

    return null;
  }

  /**
   * Helper: estimate productivity score dựa trên giờ (fallback)
   * Khung giờ: Sáng 8-11:30, Chiều 14-17:30, Tối 19:30-23
   */
  private estimateProductivity(hour: number): number {
    // Sáng (8-11:30): Năng suất cao nhất
    if (hour >= 8 && hour < 12) return 0.9;

    // Chiều (14-17:30): Năng suất trung bình cao
    if (hour >= 14 && hour < 18) return 0.8;

    // Tối (19:30-23): Năng suất trung bình
    if (hour >= 19 && hour < 23) return 0.7;

    // Ngoài giờ làm việc
    return 0.3;
  }
}

export const slotFinder = new SlotFinder();
