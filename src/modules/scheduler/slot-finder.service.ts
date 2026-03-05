import { TimeInterval, FreeSlot, ProductivityScore } from './types';
import { intervalScheduler } from './scheduler.service';

export interface SlotFinderInput {
  busySlots: TimeInterval[];
  date: Date;
  minDuration: number; // minutes
  workHours: { start: number; end: number };
}

export interface OptimalSlotInput {
  taskDuration: number; // minutes
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  productivityScores?: Map<number, ProductivityScore>;
  busySlots: TimeInterval[];
  date: Date;
  workHours?: { start: number; end: number };
}

export class SlotFinder {
  /**
   * Tìm tất cả free slots trong ngày
   * O(n log n) vì cần merge intervals trước
   */
  findFreeSlots(input: SlotFinderInput): FreeSlot[] {
    const { busySlots, date, minDuration, workHours } = input;

    // Merge busy slots để có danh sách gọn gàng
    const mergedBusy = intervalScheduler.mergeIntervals(busySlots);

    const freeSlots: FreeSlot[] = [];

    // Tạo work day boundaries
    const dayStart = new Date(date);
    dayStart.setHours(workHours.start, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(workHours.end, 0, 0, 0);

    // Nếu không có busy slots → cả ngày đều rảnh
    if (mergedBusy.length === 0) {
      const duration = (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60);
      if (duration >= minDuration) {
        return [{
          start: dayStart,
          end: dayEnd,
          duration,
          productivityScore: 0.5 // default
        }];
      }
      return [];
    }

    // Tìm gap trước slot đầu tiên
    const firstBusy = mergedBusy[0];
    if (firstBusy.start > dayStart) {
      const gap = (firstBusy.start.getTime() - dayStart.getTime()) / (1000 * 60);
      if (gap >= minDuration) {
        freeSlots.push({
          start: dayStart,
          end: firstBusy.start,
          duration: gap,
          productivityScore: this.estimateProductivity(dayStart.getHours())
        });
      }
    }

    // Tìm gaps giữa các busy slots
    for (let i = 0; i < mergedBusy.length - 1; i++) {
      const currentEnd = mergedBusy[i].end;
      const nextStart = mergedBusy[i + 1].start;

      const gap = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);
      
      if (gap >= minDuration) {
        freeSlots.push({
          start: currentEnd,
          end: nextStart,
          duration: gap,
          productivityScore: this.estimateProductivity(currentEnd.getHours())
        });
      }
    }

    // Tìm gap sau slot cuối cùng
    const lastBusy = mergedBusy[mergedBusy.length - 1];
    if (lastBusy.end < dayEnd) {
      const gap = (dayEnd.getTime() - lastBusy.end.getTime()) / (1000 * 60);
      if (gap >= minDuration) {
        freeSlots.push({
          start: lastBusy.end,
          end: dayEnd,
          duration: gap,
          productivityScore: this.estimateProductivity(lastBusy.end.getHours())
        });
      }
    }

    // Sort by start time
    return freeSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Tìm slot tối ưu nhất cho task cụ thể
   * Kết hợp: duration match + productivity score + preferred time
   */
  findOptimalSlot(input: OptimalSlotInput): FreeSlot | null {
    const {
      taskDuration,
      preferredTimeOfDay,
      productivityScores,
      busySlots,
      date,
      workHours = { start: 8, end: 18 }
    } = input;

    // Tìm tất cả slots đủ dài
    const freeSlots = this.findFreeSlots({
      busySlots,
      date,
      minDuration: taskDuration,
      workHours
    });

    if (freeSlots.length === 0) {
      return null;
    }

    // Score mỗi slot
    const scoredSlots = freeSlots.map(slot => {
      let score = slot.productivityScore;

      // Bonus nếu slot vừa khít với task duration (không quá dư)
      const efficiency = taskDuration / slot.duration;
      if (efficiency >= 0.7 && efficiency <= 1) {
        score += 0.1;
      }

      // Bonus theo preferred time of day
      if (preferredTimeOfDay) {
        const hour = slot.start.getHours();
        const ranges = {
          morning: [6, 7, 8, 9, 10, 11],
          afternoon: [12, 13, 14, 15, 16, 17],
          evening: [18, 19, 20, 21]
        };
        
        if (ranges[preferredTimeOfDay]?.includes(hour)) {
          score += 0.2;
        }
      }

      // Override với productivity score nếu có
      if (productivityScores) {
        const hour = slot.start.getHours();
        const prodScore = productivityScores.get(hour)?.score;
        if (prodScore !== undefined) {
          score = prodScore * 0.8 + score * 0.2; // 80% từ real data
        }
      }

      return { ...slot, productivityScore: Math.min(score, 1) };
    });

    // Sort by score và trả về cao nhất
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
    workHours: { start: number; end: number } = { start: 8, end: 18 }
  ): boolean {
    const slots = this.findFreeSlots({
      busySlots,
      date,
      minDuration: duration,
      workHours
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
    workHours: { start: number; end: number } = { start: 8, end: 18 }
  ): Map<string, FreeSlot[]> {
    const result = new Map<string, FreeSlot[]>();
    
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      
      // Filter busy slots cho ngày này
      const dayBusy = busySlots.filter(slot => 
        slot.start.toDateString() === current.toDateString()
      );

      const slots = this.findFreeSlots({
        busySlots: dayBusy,
        date: new Date(current),
        minDuration,
        workHours
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
    workHours: { start: number; end: number } = { start: 8, end: 18 }
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
      const dayBusy = busySlots.filter(slot => 
        slot.start.toDateString() === current.toDateString() &&
        slot.end > searchStart
      );

      // Thêm "busy" từ đầu ngày đến searchStart
      if (searchStart.getHours() > workHours.start) {
        dayBusy.unshift({
          start: new Date(current.setHours(workHours.start, 0, 0, 0)),
          end: searchStart
        });
      }

      const slots = this.findFreeSlots({
        busySlots: dayBusy,
        date: new Date(current),
        minDuration: duration,
        workHours
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
   */
  private estimateProductivity(hour: number): number {
    // Giờ làm việc thông thường có score cao hơn
    if (hour >= 8 && hour <= 11) return 0.85; // Morning
    if (hour >= 13 && hour <= 16) return 0.75; // Afternoon
    if (hour >= 17 && hour <= 19) return 0.65; // Evening
    return 0.5; // Early morning / late evening
  }
}

export const slotFinder = new SlotFinder();
