import { IntervalScheduler } from "../../modules/scheduler/scheduler.service";
import type { TimeInterval } from "../../modules/scheduler/types";

describe("IntervalScheduler - Conflict Detection & Scheduling Algorithm Tests", () => {
  let scheduler: IntervalScheduler;

  beforeEach(() => {
    scheduler = new IntervalScheduler();
  });

  describe("checkConflict (Binary Search Conflict Detection - O(log n))", () => {
    it("should return no conflict when existing tasks list is empty", () => {
      const newTask: TimeInterval = {
        taskId: "task_new",
        start: new Date("2026-10-15T09:00:00Z"),
        end: new Date("2026-10-15T10:00:00Z"),
      };

      const result = scheduler.checkConflict(newTask, []);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingTasks).toHaveLength(0);
      expect(result.suggestedNewSlot).toBeUndefined();
    });

    it("should detect conflict when new task overlaps with an existing task", () => {
      // Existing: [08:00 - 09:30]
      const existingTasks: TimeInterval[] = [
        {
          taskId: "task_1",
          start: new Date("2026-10-15T08:00:00Z"),
          end: new Date("2026-10-15T09:30:00Z"),
        },
      ];

      // New task: [09:00 - 10:30] (chồng lấn 09:00 - 09:30)
      const newTask: TimeInterval = {
        taskId: "task_2",
        start: new Date("2026-10-15T09:00:00Z"),
        end: new Date("2026-10-15T10:30:00Z"),
      };

      const result = scheduler.checkConflict(newTask, existingTasks);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingTasks).toContain("task_1");
      expect(result.suggestedNewSlot).toBeDefined();
      // Slot gợi ý phải bắt đầu ngay sau task bị trùng (09:30)
      expect(result.suggestedNewSlot?.start).toEqual(new Date("2026-10-15T09:30:00Z"));
      expect(result.suggestedNewSlot?.end).toEqual(new Date("2026-10-15T11:00:00Z"));
    });

    it("should allow adjacent tasks without conflict (end time equals start time)", () => {
      // Existing: [08:00 - 09:00]
      const existingTasks: TimeInterval[] = [
        {
          taskId: "task_1",
          start: new Date("2026-10-15T08:00:00Z"),
          end: new Date("2026-10-15T09:00:00Z"),
        },
      ];

      // New task starts exactly at 09:00: [09:00 - 10:00]
      const newTask: TimeInterval = {
        taskId: "task_2",
        start: new Date("2026-10-15T09:00:00Z"),
        end: new Date("2026-10-15T10:00:00Z"),
      };

      const result = scheduler.checkConflict(newTask, existingTasks);

      expect(result.hasConflict).toBe(false);
      expect(result.conflictingTasks).toHaveLength(0);
    });

    it("should correctly identify conflict among multiple sorted tasks", () => {
      const existingTasks: TimeInterval[] = [
        { taskId: "task_A", start: new Date("2026-10-15T08:00:00Z"), end: new Date("2026-10-15T09:00:00Z") },
        { taskId: "task_B", start: new Date("2026-10-15T10:00:00Z"), end: new Date("2026-10-15T11:00:00Z") },
        { taskId: "task_C", start: new Date("2026-10-15T13:00:00Z"), end: new Date("2026-10-15T14:30:00Z") },
        { taskId: "task_D", start: new Date("2026-10-15T16:00:00Z"), end: new Date("2026-10-15T17:00:00Z") },
      ];

      // New task: [14:00 - 15:30] overlaps with task_C [13:00 - 14:30]
      const newTask: TimeInterval = {
        taskId: "task_new",
        start: new Date("2026-10-15T14:00:00Z"),
        end: new Date("2026-10-15T15:30:00Z"),
      };

      const result = scheduler.checkConflict(newTask, existingTasks);

      expect(result.hasConflict).toBe(true);
      expect(result.conflictingTasks).toEqual(["task_C"]);
      expect(result.suggestedNewSlot?.start).toEqual(new Date("2026-10-15T14:30:00Z"));
    });
  });

  describe("scheduleTasks (Earliest Deadline First)", () => {
    it("should schedule multiple tasks without overlap", () => {
      const busySlots: TimeInterval[] = [
        { start: new Date("2026-10-15T08:00:00Z"), end: new Date("2026-10-15T09:00:00Z") },
      ];

      const tasksToSchedule: TimeInterval[] = [
        { taskId: "t1", start: new Date("2026-10-15T09:00:00Z"), end: new Date("2026-10-15T10:00:00Z") },
        { taskId: "t2", start: new Date("2026-10-15T09:30:00Z"), end: new Date("2026-10-15T10:30:00Z") }, // Conflict với t1
      ];

      const startDate = new Date("2026-10-15T08:00:00Z");
      const endDate = new Date("2026-10-15T18:00:00Z");

      const result = scheduler.scheduleTasks(tasksToSchedule, busySlots, startDate, endDate);

      expect(result.length).toBe(2);
      // t1 được xếp đúng slot [09:00 - 10:00]
      expect(result[0].start).toEqual(new Date("2026-10-15T09:00:00Z"));
      // t2 bị trùng nên được dời sang sau t1 [10:00 - 11:00]
      expect(result[1].start.getTime()).toBeGreaterThanOrEqual(result[0].end.getTime());
    });
  });
});
