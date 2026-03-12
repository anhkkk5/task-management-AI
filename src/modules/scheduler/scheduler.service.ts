import {
  TimeInterval,
  ConflictResult,
  FreeSlot,
  ProductivityScore,
} from "./types";

export class IntervalScheduler {
  /**
   * Kiểm tra xem newTask có conflict với existing tasks không
   * O(n log n) - sort rồi binary search
   */
  checkConflict(
    newTask: TimeInterval,
    existingTasks: TimeInterval[],
  ): ConflictResult {
    // Sort existing tasks by start time
    const sorted = [...existingTasks].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    const conflictingTasks: string[] = [];
    let hasConflict = false;

    // Tìm các task có thể overlap
    for (const task of sorted) {
      // Check overlap: new.start < existing.end && new.end > existing.start
      if (newTask.start < task.end && newTask.end > task.start) {
        hasConflict = true;
        if (task.taskId) {
          conflictingTasks.push(task.taskId);
        }
      }
    }

    // Nếu conflict, suggest slot mới (đơn giản: sau task cuối cùng conflict)
    let suggestedNewSlot: TimeInterval | undefined;
    if (hasConflict && sorted.length > 0) {
      const lastConflict = sorted
        .filter((t) => t.taskId && conflictingTasks.includes(t.taskId))
        .sort((a, b) => b.end.getTime() - a.end.getTime())[0];

      if (lastConflict) {
        const duration = newTask.end.getTime() - newTask.start.getTime();
        suggestedNewSlot = {
          start: lastConflict.end,
          end: new Date(lastConflict.end.getTime() + duration),
          taskId: newTask.taskId,
        };
      }
    }

    return {
      hasConflict,
      conflictingTasks,
      suggestedNewSlot,
    };
  }

  /**
   * Schedule nhiều tasks theo thứ tự ưu tiên (Earliest Deadline First)
   * O(n log n)
   */
  scheduleTasks(
    tasks: TimeInterval[],
    busySlots: TimeInterval[],
    startDate: Date,
    endDate: Date,
  ): TimeInterval[] {
    // Sort tasks: có deadline (end) gần nhất trước
    const sortedTasks = [...tasks].sort(
      (a, b) => a.end.getTime() - b.end.getTime(),
    );

    const scheduled: TimeInterval[] = [];
    const occupied = [...busySlots]; // Copy để không mutate input

    for (const task of sortedTasks) {
      // Thử slot gốc của task
      let conflict = this.checkConflict(task, occupied);

      if (!conflict.hasConflict) {
        // Không conflict → schedule ngay
        scheduled.push(task);
        occupied.push(task);
      } else if (conflict.suggestedNewSlot) {
        // Có conflict → dùng suggested slot
        const newSlot = conflict.suggestedNewSlot;

        // Kiểm tra suggested slot có trong range cho phép không
        if (newSlot.end <= endDate && newSlot.start >= startDate) {
          scheduled.push(newSlot);
          occupied.push(newSlot);
        }
        // Nếu không fit trong range → skip task này (hoặc throw error)
      }
    }

    return scheduled;
  }

  /**
   * Tìm slot tốt nhất cho 1 task, kết hợp productivity score
   */
  findBestSlot(
    task: TimeInterval,
    busySlots: TimeInterval[],
    productivityScores: Map<number, ProductivityScore>,
    workHours: { start: number; end: number } = { start: 8, end: 18 },
  ): TimeInterval | null {
    const duration = task.end.getTime() - task.start.getTime();

    // Thử từng giờ trong work hours
    const candidates: { slot: TimeInterval; score: number }[] = [];

    for (let hour = workHours.start; hour <= workHours.end; hour++) {
      // Tạo candidate slot
      const candidateStart = new Date(task.start);
      candidateStart.setHours(hour, 0, 0, 0);

      const candidateEnd = new Date(candidateStart.getTime() + duration);

      const candidate: TimeInterval = {
        start: candidateStart,
        end: candidateEnd,
        taskId: task.taskId,
      };

      // Check conflict
      const conflict = this.checkConflict(candidate, busySlots);

      if (!conflict.hasConflict) {
        // Tính score cho slot này
        const productivityScore = productivityScores.get(hour)?.score || 0.5;
        candidates.push({ slot: candidate, score: productivityScore });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return slot có score cao nhất
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].slot;
  }

  /**
   * Merge các overlapping intervals thành 1 interval duy nhất
   * Dùng để chuẩn hóa busy slots trước khi tìm free slots
   */
  mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (intervals.length === 0) return [];

    // Sort by start time
    const sorted = [...intervals].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    const merged: TimeInterval[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const lastMerged = merged[merged.length - 1];

      // Check overlap hoặc adjacent (touching)
      if (current.start <= lastMerged.end) {
        // Merge: extend end nếu current kết thúc sau
        if (current.end > lastMerged.end) {
          lastMerged.end = current.end;
        }
      } else {
        // Không overlap → add mới
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Kiểm tra 1 slot có valid không (trong work hours, không quá dài/ngắn)
   */
  validateSlot(
    slot: TimeInterval,
    workHours: { start: number; end: number },
    minDuration: number = 15, // minutes
    maxDuration: number = 240, // 4 hours
  ): { valid: boolean; reason?: string } {
    const duration = (slot.end.getTime() - slot.start.getTime()) / (1000 * 60); // minutes

    if (duration < minDuration) {
      return {
        valid: false,
        reason: `Slot quá ngắn (${duration} phút, tối thiểu ${minDuration})`,
      };
    }

    if (duration > maxDuration) {
      return {
        valid: false,
        reason: `Slot quá dài (${duration} phút, tối đa ${maxDuration})`,
      };
    }

    const startHour = slot.start.getHours();
    const startMinutes = slot.start.getHours() * 60 + slot.start.getMinutes();
    const endMinutes = slot.end.getHours() * 60 + slot.end.getMinutes();
    const workStartMinutes = workHours.start * 60;
    const workEndMinutes = workHours.end * 60;

    if (startMinutes < workStartMinutes || endMinutes > workEndMinutes) {
      return {
        valid: false,
        reason: `Ngoài giờ làm việc (${workHours.start}h-${workHours.end}h)`,
      };
    }

    return { valid: true };
  }
}

export const intervalScheduler = new IntervalScheduler();
