import { Types } from "mongoose";
import { aiProvider } from "../ai/ai.provider";
import { taskRepository } from "../task/task.repository";
import { userHabitRepository } from "../user/user-habit.repository";
import { aiScheduleRepository } from "../ai-schedule/ai-schedule.repository";
import { extractJson } from "../ai/ai-utils";
import {
  intervalScheduler,
  slotFinder,
  productivityScorer,
  TimeInterval,
} from "../scheduler";

/**
 * HYBRID AI + Algorithm Schedule Service
 * AI chỉ phân tích high-level, backend algorithm chọn giờ cụ thể
 */
export const hybridScheduleService = {
  /**
   * Main: Tạo schedule kết hợp AI + Algorithms
   * - AI: Phân tích difficulty, priority, suggested order
   * - Algorithms: Chọn giờ cụ thể, detect conflict, optimize
   */
  schedulePlan: async (
    userId: string,
    input: { taskIds: string[]; startDate: Date },
  ): Promise<{
    schedule: {
      day: string;
      date: string;
      tasks: {
        sessionId: string;
        taskId: string;
        title: string;
        priority: string;
        suggestedTime: string;
        reason: string;
        createSubtask: boolean;
        algorithmUsed: string;
        productivityScore?: number;
      }[];
    }[];
    totalTasks: number;
    suggestedOrder: string[];
    personalizationNote: string;
    stats: {
      aiConflictsDetected: number;
      autoRescheduled: number;
      productivityOptimized: number;
    };
    warnings?: {
      taskId: string;
      title: string;
      feasible: boolean;
      daysLeft: number;
      maxPossibleHours: number;
      requiredHours: number;
      shortfallHours: number;
      message: string;
    }[];
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);

    // 1. Fetch tasks
    const tasks: any[] = [];
    for (const taskId of input.taskIds) {
      if (!Types.ObjectId.isValid(taskId)) continue;
      const task = await taskRepository.findByIdForUser({
        taskId,
        userId: userObjectId,
      });
      if (task) tasks.push(task);
    }

    if (tasks.length === 0) {
      throw new Error("NO_VALID_TASKS");
    }

    // ✅ DEADLINE VALIDATION: Kiểm tra tính khả thi trước khi schedule
    const today = new Date();
    const todayStr = toLocalDateStr(today);
    const warnings: {
      taskId: string;
      title: string;
      feasible: boolean;
      daysLeft: number;
      maxPossibleHours: number;
      requiredHours: number;
      shortfallHours: number;
      message: string;
    }[] = [];

    for (const task of tasks) {
      if (!task.deadline) continue;

      const deadlineStr = toLocalDateStr(new Date(task.deadline));

      // Đếm số ngày từ hôm nay đến deadline (inclusive)
      const daysLeft =
        Math.ceil(
          (new Date(deadlineStr).getTime() - new Date(todayStr).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;

      // Tính thời gian tối đa có thể xếp (daysLeft × dailyTargetMax)
      const dailyTargetMax = task.dailyTargetDuration ?? 120; // Mặc định 2h/ngày
      const maxPossibleMinutes = daysLeft * dailyTargetMax;
      const requiredMinutes = task.estimatedDuration ?? 0;

      if (requiredMinutes > maxPossibleMinutes) {
        const shortfallMinutes = requiredMinutes - maxPossibleMinutes;
        const shortfallHours = parseFloat((shortfallMinutes / 60).toFixed(1));
        const maxHours = parseFloat((maxPossibleMinutes / 60).toFixed(1));
        const requiredHours = parseFloat((requiredMinutes / 60).toFixed(1));

        console.warn(
          `[Schedule Warning] Task "${task.title}": ` +
            `Cần ${requiredHours}h nhưng chỉ có thể xếp tối đa ${maxHours}h ` +
            `trong ${daysLeft} ngày còn lại. Thiếu ${shortfallHours}h.`,
        );

        warnings.push({
          taskId: String(task._id),
          title: task.title,
          feasible: false,
          daysLeft,
          maxPossibleHours: maxHours,
          requiredHours: requiredHours,
          shortfallHours: shortfallHours,
          message: `Không đủ thời gian: cần ${requiredHours}h nhưng chỉ còn ${daysLeft} ngày × ${dailyTargetMax / 60}h/ngày = ${maxHours}h. Thiếu ${shortfallHours}h.`,
        });
      }
    }

    // 2. Lấy dữ liệu productivity từ lịch sử
    const productivityAnalysis =
      await userHabitRepository.analyzeProductivity(userId);

    // Build productivity scores từ history
    const completedTasksHistory: {
      hour: number;
      completed: boolean;
      duration: number;
    }[] = [];

    // Lấy tasks đã hoàn thành để tính productivity
    const allUserTasks = await taskRepository.listByUser({
      userId: userObjectId,
      page: 1,
      limit: 1000,
    });
    allUserTasks.items.forEach((task: any) => {
      if (task.scheduledTime?.start && task.scheduledTime?.end) {
        const start = new Date(task.scheduledTime.start);
        const hour = start.getHours();
        const duration = task.estimatedDuration || 60;
        completedTasksHistory.push({
          hour,
          completed: task.status === "completed" || task.status === "done",
          duration,
        });
      }
    });

    const productivityScores = productivityScorer.calculateHourlyScores(
      completedTasksHistory,
      30,
    );

    const findOptimalSlotWithFallback = (
      params: Omit<
        Parameters<typeof slotFinder.findOptimalSlot>[0],
        "taskDuration"
      > & {
        preferredDuration: number;
        minDuration: number;
        stepMinutes: number;
      },
    ) => {
      const step = Math.max(1, Math.floor(params.stepMinutes));
      const min = Math.max(1, Math.floor(params.minDuration));
      let duration = Math.floor(params.preferredDuration);

      while (duration >= min) {
        const slot = slotFinder.findOptimalSlot({
          taskDuration: duration,
          preferredTimeOfDay: params.preferredTimeOfDay,
          productivityScores: params.productivityScores,
          busySlots: params.busySlots,
          date: params.date,
          workHours: params.workHours,
          currentTime: params.currentTime,
        });
        if (slot) {
          return { slot, duration };
        }
        duration -= step;
      }

      return { slot: null as any, duration: 0 };
    };

    const priorityWeight = (p: any): number => {
      switch (String(p || "").toLowerCase()) {
        case "urgent":
          return 4;
        case "high":
        case "cao":
          return 3;
        case "medium":
        case "trung bình":
          return 2;
        case "low":
        case "thấp":
          return 1;
        default:
          return 2;
      }
    };

    const dateOnlyStr = (d?: Date): string | null =>
      d ? toLocalDateStr(new Date(d)) : null;

    // 3. AI chỉ phân tích HIGH-LEVEL (ngắn gọn)
    const taskDataForAI = tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description || "",
      priority: t.priority,
      deadline: t.deadline ? t.deadline.toISOString().split("T")[0] : null,
      estimatedDuration: t.estimatedDuration || 120,
    }));

    const aiPrompt = `Phân tích các công việc sau và trả về JSON:

Tasks:
${JSON.stringify(taskDataForAI, null, 2)}

Yêu cầu:
1. suggestedOrder: Sắp xếp taskId theo thứ tự ưu tiên (deadline gần, priority cao trước)
2. difficultyAnalysis: Mỗi task đánh giá easy/medium/hard
3. personalizationNote: Lời khuyên ngắn gọn cho user

Format JSON:
{
  "suggestedOrder": ["taskId1", "taskId2"],
  "difficultyAnalysis": {
    "taskId1": "hard",
    "taskId2": "medium"
  },
  "personalizationNote": "string"
}`;

    // Gọi AI (ngắn gọn, chỉ high-level)
    const aiResult = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content:
            "You are a task analysis assistant. Reply in Vietnamese. Output valid JSON only.",
        },
        { role: "user", content: aiPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2000, // Giảm từ 8000 xuống 2000
    });

    let aiAnalysis: any;
    try {
      aiAnalysis = JSON.parse(extractJson(aiResult.content || "{}"));
    } catch {
      // Fallback nếu AI lỗi
      aiAnalysis = {
        suggestedOrder: taskDataForAI.map((t) => t.id),
        difficultyAnalysis: {},
        personalizationNote: "Lịch trình được tạo tự động",
      };
    }

    // 4. ALGORITHM SCHEDULING (backend xử lý)
    const startDate = new Date(input.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // default 1 tuần

    // Extend endDate to the latest deadline (if any) so scheduling doesn't miss days
    // ✅ BUT: Strictly respect deadline - don't allow overflow
    for (const t of tasks) {
      if (t.deadline) {
        const d = new Date(t.deadline);
        if (d > endDate) {
          endDate.setTime(d.getTime());
        }
      }
    }

    // ✅ REMOVED: Overflow mode that allowed scheduling beyond deadline
    // Now we strictly respect the deadline
    const hardEndDate = new Date(endDate);

    // ⭐ NEW: Get scheduled tasks to avoid conflicts
    // Exclude tasks that are being scheduled in this request
    const excludeTaskIds = input.taskIds.filter((id) =>
      Types.ObjectId.isValid(id),
    );

    const scheduledTasks = await taskRepository.getScheduledTasks({
      userId: userObjectId,
      startDate,
      endDate: hardEndDate,
      excludeTaskIds, // Don't include tasks being scheduled
    });

    console.log(
      `[Conflict Detection] Found ${scheduledTasks.length} scheduled tasks (excluding ${excludeTaskIds.length} tasks being scheduled)`,
    );

    // Debug: Log scheduled tasks details
    if (scheduledTasks.length > 0) {
      console.log("[Conflict Detection] Scheduled tasks:");
      scheduledTasks.forEach((t: any) => {
        console.log(
          `  - ${t.title}: ${t.scheduledTime?.start} to ${t.scheduledTime?.end} (status: ${t.status})`,
        );
      });
    } else {
      console.log("[Conflict Detection] No scheduled tasks found in database");
      // Debug: Check if there are ANY scheduled tasks for this user
      const allScheduledTasks = await taskRepository.listByUser({
        userId: userObjectId,
        status: "scheduled" as any,
        page: 1,
        limit: 100,
      });
      console.log(
        `[Conflict Detection] Total scheduled tasks in DB: ${allScheduledTasks.total}`,
      );
      if (allScheduledTasks.total > 0) {
        console.log("[Conflict Detection] All scheduled tasks:");
        allScheduledTasks.items.forEach((t: any) => {
          console.log(
            `  - ${t.title}: ${t.scheduledTime?.start} to ${t.scheduledTime?.end}`,
          );
        });
      }
    }

    // Convert scheduled tasks to busy slots by date
    const existingBusySlotsByDate = new Map<string, TimeInterval[]>();
    for (const scheduledTask of scheduledTasks) {
      if (
        scheduledTask.scheduledTime?.start &&
        scheduledTask.scheduledTime?.end
      ) {
        const taskDate = toLocalDateStr(
          new Date(scheduledTask.scheduledTime.start),
        );
        const busySlot: TimeInterval = {
          start: new Date(scheduledTask.scheduledTime.start),
          end: new Date(scheduledTask.scheduledTime.end),
          taskId: String(scheduledTask._id),
        };

        if (!existingBusySlotsByDate.has(taskDate)) {
          existingBusySlotsByDate.set(taskDate, []);
        }
        existingBusySlotsByDate.get(taskDate)!.push(busySlot);
      }
    }

    const excludeSet = new Set(
      excludeTaskIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => String(new Types.ObjectId(id))),
    );

    const activeSchedules =
      await aiScheduleRepository.findAllActiveByUserId(userId);

    for (const s of activeSchedules) {
      const days: any[] = Array.isArray((s as any).schedule)
        ? (s as any).schedule
        : [];
      for (const day of days) {
        const dayDate = String(day?.date ?? "").trim();
        if (!dayDate) continue;

        const tasksArr: any[] = Array.isArray(day?.tasks) ? day.tasks : [];
        for (const session of tasksArr) {
          const taskId = String(session?.taskId ?? "").trim();
          if (!taskId) continue;
          if (excludeSet.has(taskId)) continue;

          if (String(session?.status ?? "") === "skipped") continue;

          const suggestedTime = String(session?.suggestedTime ?? "");
          const timeMatch = suggestedTime.match(
            /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
          );
          if (!timeMatch) continue;

          const [, sh, sm, eh, em] = timeMatch;
          const sessionDate = new Date(`${dayDate}T00:00:00`);
          if (Number.isNaN(sessionDate.getTime())) continue;

          const start = new Date(sessionDate);
          start.setHours(parseInt(sh, 10), parseInt(sm, 10), 0, 0);

          const end = new Date(sessionDate);
          end.setHours(parseInt(eh, 10), parseInt(em, 10), 0, 0);

          if (end.getTime() <= start.getTime()) continue;

          const existing = existingBusySlotsByDate.get(dayDate) || [];
          existing.push({ start, end, taskId });
          existingBusySlotsByDate.set(dayDate, existing);
        }
      }
    }

    const schedule: any[] = [];
    const stats = {
      aiConflictsDetected: 0,
      autoRescheduled: 0,
      productivityOptimized: 0,
    };

    let currentDate = new Date(startDate);
    let sessionCounter = 0;

    // ✅ Get current time once to pass to slot finder
    const now = new Date();

    // Track busy slots và daily scheduled time theo ngày
    const busySlotsByDate = new Map<string, TimeInterval[]>();
    const dailyScheduledMinutesByTask = new Map<string, Map<string, number>>();

    // Initialize busySlotsByDate with existing scheduled tasks
    for (const [dateStr, slots] of existingBusySlotsByDate.entries()) {
      busySlotsByDate.set(dateStr, [...slots]);
    }

    // Track remaining duration per task (minutes)
    const remainingMinutesByTaskId = new Map<string, number>();
    tasks.forEach((t: any) => {
      remainingMinutesByTaskId.set(
        String(t._id),
        Math.max(0, Number(t.estimatedDuration ?? 0)),
      );
    });

    // Lấy các task đã scheduled trước đó (preserve existing)
    const existingScheduledTasks = allUserTasks.items.filter(
      (task: any) => task.scheduledTime?.start && task.scheduledTime?.end,
    );

    // Khởi tạo daily scheduled time từ existing tasks
    existingScheduledTasks.forEach((task: any) => {
      const dateStr = toLocalDateStr(new Date(task.scheduledTime.start));
      const duration = task.estimatedDuration || 60;
      const taskId = String(task._id);
      const perTask = dailyScheduledMinutesByTask.get(dateStr) || new Map();
      perTask.set(taskId, (perTask.get(taskId) || 0) + duration);
      dailyScheduledMinutesByTask.set(dateStr, perTask);

      // ⭐ FIX: Only reduce remaining minutes if this task is NOT being scheduled in this request
      const isBeingScheduled = input.taskIds.some(
        (id) =>
          Types.ObjectId.isValid(id) &&
          String(new Types.ObjectId(id)) === taskId,
      );

      if (!isBeingScheduled && remainingMinutesByTaskId.has(taskId)) {
        remainingMinutesByTaskId.set(
          taskId,
          Math.max(0, (remainingMinutesByTaskId.get(taskId) || 0) - duration),
        );
      }

      // Add vào busy slots (always add to avoid conflicts)
      const existingBusy = busySlotsByDate.get(dateStr) || [];
      existingBusy.push({
        start: new Date(task.scheduledTime.start),
        end: new Date(task.scheduledTime.end),
        taskId: String(task._id),
      });
      busySlotsByDate.set(dateStr, existingBusy);
    });

    while (currentDate <= hardEndDate) {
      const dateStr = toLocalDateStr(currentDate);
      const daySchedule: any = {
        day: getDayOfWeek(dateStr),
        date: dateStr,
        tasks: [],
      };

      // Lấy busy slots của ngày này (từ các ngày trước đã schedule)
      const existingBusySlots = busySlotsByDate.get(dateStr) || [];

      // Sort tasks: deadline gần hơn trước, sau đó priority cao hơn
      const baseOrder = (
        Array.isArray(aiAnalysis.suggestedOrder)
          ? aiAnalysis.suggestedOrder
          : []
      ) as string[];
      const fallbackOrder = tasks.map((t) => String(t._id));
      const merged = [...baseOrder, ...fallbackOrder].filter(
        (id, idx, arr) => arr.indexOf(id) === idx,
      );
      const sortedTaskIds = merged.sort((a, b) => {
        const ta: any = tasks.find((t) => String(t._id) === a);
        const tb: any = tasks.find((t) => String(t._id) === b);

        const da = dateOnlyStr(ta?.deadline);
        const db = dateOnlyStr(tb?.deadline);
        if (da && db && da !== db) return da < db ? -1 : 1;
        if (da && !db) return -1;
        if (!da && db) return 1;

        const pa = priorityWeight(ta?.priority);
        const pb = priorityWeight(tb?.priority);
        if (pa !== pb) return pb - pa;
        return 0;
      });

      const scheduleTaskChunksForDay = async (
        task: any,
        mode: "reachMin" | "fillMax",
      ): Promise<void> => {
        const remainingForTask =
          remainingMinutesByTaskId.get(String(task._id)) || 0;
        if (remainingForTask <= 0) return;

        // ✅ STRICT DEADLINE CHECK: Skip nếu đã qua deadline (không có allowAfterDeadline)
        if (
          task.deadline &&
          dateStr > toLocalDateStr(new Date(task.deadline))
        ) {
          return;
        }

        const dailyTargetMax = task.dailyTargetDuration ?? 180; // Mặc định 3h/ngày
        const dailyTargetMin = task.dailyTargetMin ?? 60; // Mặc định 1h/ngày

        const difficulty =
          aiAnalysis.difficultyAnalysis?.[String(task._id)] ||
          aiAnalysis.difficultyAnalysis?.[String(task.id)] ||
          "medium";
        const requiresFocus = difficulty === "hard";

        const preferredTimeOfDay = requiresFocus ? "morning" : undefined;
        const stepMinutes = 15;
        const minChunkMinutes = 15;

        while (true) {
          const remainingForTaskNow =
            remainingMinutesByTaskId.get(String(task._id)) || 0;
          if (remainingForTaskNow <= 0) break;

          const mapForDay =
            dailyScheduledMinutesByTask.get(dateStr) ||
            new Map<string, number>();
          const scheduledToday = mapForDay.get(String(task._id)) || 0;

          if (mode === "reachMin" && scheduledToday >= dailyTargetMin) {
            break;
          }
          if (mode === "fillMax" && scheduledToday >= dailyTargetMax) {
            break;
          }

          const remainingToMaxToday = Math.max(
            0,
            dailyTargetMax - scheduledToday,
          );
          if (remainingToMaxToday <= 0) break;

          const remainingToMinToday = Math.max(
            0,
            dailyTargetMin - scheduledToday,
          );

          let preferredDuration =
            mode === "reachMin"
              ? Math.min(remainingToMinToday, remainingToMaxToday)
              : remainingToMaxToday;

          preferredDuration = Math.min(preferredDuration, remainingForTaskNow);
          if (preferredDuration <= 0) break;

          const { slot: optimalSlot, duration: actualDuration } =
            findOptimalSlotWithFallback({
              preferredDuration,
              minDuration: Math.min(minChunkMinutes, preferredDuration),
              stepMinutes,
              preferredTimeOfDay,
              productivityScores,
              busySlots: existingBusySlots,
              date: new Date(currentDate),
              workHours: {
                start: 8,
                end: 23, // Tối đa 23h
                breaks: [
                  { start: 11.5, end: 14 }, // 11:30-14:00 nghỉ trưa
                  { start: 17.5, end: 19 }, // ✅ 17:30-19:00 nghỉ tối (sửa từ 19.5 → 19)
                ],
              },
              bufferMinutes: 15, // 15 phút nghỉ giữa các task
              currentTime: now, // ✅ Pass current time to skip past slots
            });

          if (!optimalSlot || actualDuration <= 0) {
            break;
          }

          const intendedEnd = new Date(
            optimalSlot.start.getTime() + actualDuration * 60 * 1000,
          );

          const newTaskInterval: TimeInterval = {
            start: optimalSlot.start,
            end: intendedEnd,
            taskId: String(task._id),
          };

          const conflict = intervalScheduler.checkConflict(
            newTaskInterval,
            existingBusySlots,
          );

          let finalSlot = optimalSlot;
          let rescheduled = false;
          if (conflict.hasConflict && conflict.suggestedNewSlot) {
            finalSlot = {
              start: conflict.suggestedNewSlot.start,
              end: new Date(
                conflict.suggestedNewSlot.start.getTime() +
                  actualDuration * 60 * 1000,
              ),
              duration: actualDuration,
              productivityScore: 0.5,
            };
            stats.aiConflictsDetected++;
            stats.autoRescheduled++;
            rescheduled = true;
          } else {
            finalSlot = {
              ...optimalSlot,
              end: intendedEnd,
              duration: actualDuration,
            };
            stats.productivityOptimized++;
          }

          const hour = finalSlot.start.getHours();
          const prodScore = productivityScores.get(hour)?.score || 0.5;

          const sessionId = `session_${++sessionCounter}_${String(
            task._id,
          )}_${dateStr}`;
          daySchedule.tasks.push({
            sessionId,
            taskId: String(task._id),
            title: task.title,
            priority: task.priority || "medium",
            suggestedTime: formatTimeRange(finalSlot.start, finalSlot.end),
            reason: rescheduled
              ? "Tự động dời do trùng lịch"
              : `Giờ làm việc hiệu quả (${(prodScore * 100).toFixed(0)}%)`,
            createSubtask: true,
            algorithmUsed: rescheduled
              ? "interval-scheduler"
              : "productivity-optimized",
            productivityScore: prodScore,
          });

          existingBusySlots.push({
            start: finalSlot.start,
            end: finalSlot.end,
            taskId: String(task._id),
          });
          busySlotsByDate.set(dateStr, existingBusySlots);

          const scheduledMinutes =
            (finalSlot.end.getTime() - finalSlot.start.getTime()) / (1000 * 60);
          mapForDay.set(String(task._id), scheduledToday + scheduledMinutes);
          dailyScheduledMinutesByTask.set(dateStr, mapForDay);

          remainingMinutesByTaskId.set(
            String(task._id),
            Math.max(0, remainingForTaskNow - scheduledMinutes),
          );
        }
      };

      // Phase 1: reach min for each task (in priority order)
      for (const taskId of sortedTaskIds) {
        const task = tasks.find((t) => String(t._id) === taskId);
        if (!task) continue;
        await scheduleTaskChunksForDay(task, "reachMin");
      }

      // Phase 2: fill toward max if still have time available
      for (const taskId of sortedTaskIds) {
        const task = tasks.find((t) => String(t._id) === taskId);
        if (!task) continue;
        await scheduleTaskChunksForDay(task, "fillMax");
      }

      // Always push the day to avoid missing days in UI
      schedule.push(daySchedule);

      // Stop early if all tasks are fully scheduled
      const stillRemaining = Array.from(remainingMinutesByTaskId.values()).some(
        (v) => v > 0,
      );
      if (!stillRemaining) {
        break;
      }

      // Next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const remainingSummary = tasks
      .map((t: any) => {
        const remaining = remainingMinutesByTaskId.get(String(t._id)) || 0;
        return { id: String(t._id), title: String(t.title || ""), remaining };
      })
      .filter((x) => x.remaining > 0)
      .map((x) => `${x.title}: còn thiếu ${x.remaining} phút`)
      .join(", ");

    // VALIDATION: Kiểm tra tổng thời gian và dailyTargetMax
    tasks.forEach((task: any) => {
      const taskId = String(task._id);
      const expected = task.estimatedDuration || 0;
      const scheduled =
        (task.estimatedDuration || 0) -
        (remainingMinutesByTaskId.get(taskId) || 0);
      const diff = Math.abs(expected - scheduled);

      if (diff > 5 && expected > 0) {
        console.warn(
          `[Hybrid Schedule] Task "${task.title}": Expected ${expected}min, scheduled ${scheduled}min (remaining: ${remainingMinutesByTaskId.get(taskId) || 0}min)`,
        );
      }

      // Kiểm tra dailyTargetMax
      const dailyMax = task.dailyTargetDuration || 180;
      schedule.forEach((day: any) => {
        day.tasks.forEach((t: any) => {
          if (String(t.taskId) === taskId) {
            const timeMatch = String(t.suggestedTime).match(
              /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
            );
            if (timeMatch) {
              const startHour = parseInt(timeMatch[1], 10);
              const startMinute = parseInt(timeMatch[2], 10);
              const endHour = parseInt(timeMatch[3], 10);
              const endMinute = parseInt(timeMatch[4], 10);
              const sessionDuration =
                endHour * 60 + endMinute - (startHour * 60 + startMinute);

              if (sessionDuration > dailyMax + 5) {
                // +5 phút tolerance
                console.warn(
                  `[Hybrid Schedule] Task "${task.title}" on ${day.date}: Session ${sessionDuration}min exceeds dailyTargetMax ${dailyMax}min`,
                );
              }
            }
          }
        });
      });
    });

    // ✅ FIX 1: Lọc bỏ ngày rỗng VÀ ngày vượt deadline của tất cả tasks
    const latestDeadline = tasks.reduce((max: string | null, t: any) => {
      if (!t.deadline) return max;
      const d = toLocalDateStr(new Date(t.deadline));
      return !max || d > max ? d : max;
    }, null);

    const filteredSchedule = schedule.filter((day: any) => {
      // Giữ ngày có task
      if (day.tasks.length > 0) return true;
      // Bỏ ngày rỗng sau deadline
      if (latestDeadline && day.date > latestDeadline) return false;
      return true;
    });

    return {
      schedule: filteredSchedule,
      totalTasks: tasks.length,
      suggestedOrder:
        aiAnalysis.suggestedOrder || tasks.map((t) => String(t._id)),
      personalizationNote:
        (aiAnalysis.personalizationNote ||
          `Lịch trình được tối ưu với ${stats.productivityOptimized} tasks theo thói quen của bạn`) +
        (remainingSummary
          ? ` | ⚠️ Không đủ thời gian trước deadline: ${remainingSummary}. Bạn nên tăng mục tiêu/ngày hoặc gia hạn deadline.`
          : ""),
      stats,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },

  /**
   * Reschedule task bị miss - dùng algorithm không cần AI
   */
  smartReschedule: async (
    userId: string,
    taskId: string,
    fromTime: Date,
    reason: "missed" | "overlapping" | "manual" = "missed",
  ): Promise<{
    newSlot: { start: Date; end: Date } | null;
    alternativeSlots: { start: Date; end: Date; score: number }[];
    advice: string;
  }> => {
    // 1. Lấy task info
    const task = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });

    if (!task) throw new Error("TASK_NOT_FOUND");

    // 2. Lấy busy slots từ bây giờ đến deadline
    const now = new Date();
    const deadline =
      task.deadline || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 3. Find free slots
    const freeSlots: any[] = [];
    let currentDate = new Date(now);

    while (currentDate <= deadline && freeSlots.length < 5) {
      // TODO: Get actual busy slots from repository
      const busySlots: TimeInterval[] = []; // Placeholder

      const slots = slotFinder.findFreeSlots({
        busySlots,
        date: new Date(currentDate),
        minDuration: task.estimatedDuration || 60,
        workHours: { start: 8, end: 22 },
      });

      freeSlots.push(...slots);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 4. Score và rank slots
    const scoredSlots = freeSlots
      .map((slot) => ({
        start: slot.start,
        end: slot.end,
        score: slot.productivityScore,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // 5. Check conflict cho slot đầu tiên
    const bestSlot = scoredSlots[0];
    if (!bestSlot) {
      return {
        newSlot: null,
        alternativeSlots: [],
        advice: "Không tìm thấy slot trống phù hợp",
      };
    }

    return {
      newSlot: {
        start: bestSlot.start,
        end: bestSlot.end,
      },
      alternativeSlots: scoredSlots.slice(1),
      advice:
        reason === "missed"
          ? "Bạn bỏ lỡ task này. Đã tìm slot mới phù hợp với thói quen của bạn."
          : "Đã tìm slot mới không trùng lịch.",
    };
  },
};

// Helper functions
function getDayOfWeek(dateStr: string): string {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const date = new Date(`${dateStr}T00:00:00`);
  return days[date.getDay()];
}

function formatTimeRange(start: Date, end: Date): string {
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
