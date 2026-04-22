import { Types } from "mongoose";
import { createHash } from "crypto";
import { aiProvider } from "../ai/ai.provider";
import { taskRepository } from "../task/task.repository";
import { userHabitRepository } from "../user/user-habit.repository";
import { aiScheduleRepository } from "../ai-schedule/ai-schedule.repository";
import { freeTimeService } from "../free-time/free-time.service";
import { extractJson } from "../ai/ai-utils";
import { getRedis } from "../../services/redis.service";
import {
  intervalScheduler,
  slotFinder,
  productivityScorer,
  TimeInterval,
} from "../scheduler";

// ───── Types for estimation metadata ─────
type EstimationMethod = "user" | "ai" | "heuristic" | "hybrid" | "default";

interface TaskEstimationMeta {
  taskId: string;
  method: EstimationMethod;
  confidence: number; // 0-1
  estimatedFields: string[]; // which fields were auto-filled
  heuristicDuration?: number;
  aiDifficulty?: "easy" | "medium" | "hard";
  aiMultiplier?: number;
  finalDuration: number;
  finalDailyTarget: number;
  finalDailyMin: number;
}

function parseHHMMToMinutes(time: string): number {
  const [h, m] = String(time)
    .split(":")
    .map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

function buildOutsideAvailabilityBusySlots(
  date: Date,
  availableSlots: Array<{ start: string; end: string }>,
): TimeInterval[] {
  const normalized = (Array.isArray(availableSlots) ? availableSlots : [])
    .map((slot) => ({
      start: parseHHMMToMinutes(slot.start),
      end: parseHHMMToMinutes(slot.end),
    }))
    .filter((slot) => slot.start >= 0 && slot.end > slot.start)
    .sort((a, b) => a.start - b.start);

  // Nếu không có slot rảnh => block toàn bộ ngày
  if (normalized.length === 0) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(24, 0, 0, 0);
    return [{ start: dayStart, end: dayEnd, taskId: "UNAVAILABLE" }];
  }

  const blocked: TimeInterval[] = [];
  let cursor = 0;

  const toDateAtMinute = (baseDate: Date, minute: number): Date => {
    const d = new Date(baseDate);
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    d.setHours(h, m, 0, 0);
    return d;
  };

  for (const slot of normalized) {
    if (slot.start > cursor) {
      blocked.push({
        start: toDateAtMinute(date, cursor),
        end: toDateAtMinute(date, slot.start),
        taskId: "UNAVAILABLE",
      });
    }
    cursor = Math.max(cursor, slot.end);
  }

  if (cursor < 24 * 60) {
    blocked.push({
      start: toDateAtMinute(date, cursor),
      end: toDateAtMinute(date, 24 * 60),
      taskId: "UNAVAILABLE",
    });
  }

  return blocked;
}

/**
 * HYBRID AI + Algorithm Schedule Service
 * AI chỉ phân tích high-level, backend algorithm chọn giờ cụ thể
 */
export const hybridScheduleService = {
  estimateTaskPlanningInputs: async (
    userId: string,
    task: any,
    plannerStartDate: Date = new Date(),
  ): Promise<TaskEstimationMeta | null> => {
    if (!task) return null;
    return ensureTaskPlanningInputsWithMeta(task, plannerStartDate, userId);
  },

  /**
   * Main: Tạo schedule kết hợp AI + Algorithms
   * - AI: Phân tích difficulty, priority, suggested order
   * - Algorithms: Chọn giờ cụ thể, detect conflict, optimize
   */
  schedulePlan: async (
    userId: string,
    input: {
      taskIds: string[];
      startDate: Date;
      schedulingStrategy?: "sequential" | "parallel" | "balanced";
      distributionPattern?: "front-load" | "even" | "adaptive";
    },
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
    estimationMetadata?: TaskEstimationMeta[];
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

    // 1.5 Preprocess planning inputs cho team tasks thiếu dữ liệu
    const estimationMetaMap = new Map<string, TaskEstimationMeta>();
    for (const task of tasks) {
      const meta = await ensureTaskPlanningInputsWithMeta(
        task,
        input.startDate,
        userId,
      );
      if (meta) {
        estimationMetaMap.set(meta.taskId, meta);
      }
    }

    // ✅ DEADLINE VALIDATION: Kiểm tra tính khả thi trước khi schedule
    const plannerStartDateOnly = new Date(
      `${toLocalDateStr(new Date(input.startDate))}T00:00:00`,
    );
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

      const deadlineDateOnly = new Date(
        `${toLocalDateStr(new Date(task.deadline))}T00:00:00`,
      );
      const taskStartStr = getTaskStartDateStr(task);
      const taskStartDateOnly = taskStartStr
        ? new Date(`${taskStartStr}T00:00:00`)
        : plannerStartDateOnly;
      const schedulableStartDateOnly =
        taskStartDateOnly > plannerStartDateOnly
          ? taskStartDateOnly
          : plannerStartDateOnly;

      // Đếm số ngày có thể schedule thực tế (inclusive)
      const daysLeft = Math.max(
        1,
        Math.ceil(
          (deadlineDateOnly.getTime() - schedulableStartDateOnly.getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1,
      );

      const requiredMinutes = task.estimatedDuration ?? 0;

      // Với team task: nếu target/ngày đang thấp hơn mức tối thiểu cần thiết,
      // auto-raise để tránh warning giả khi chính hệ thống là người estimate.
      if (task.teamAssignment && requiredMinutes > 0) {
        const requiredPerDay = Math.ceil(requiredMinutes / daysLeft);
        const enforcedDailyTarget = clamp(
          roundToNearest5(requiredPerDay),
          60,
          480,
        );
        const currentDailyTarget = Number(task.dailyTargetDuration ?? 0);
        if (
          currentDailyTarget <= 0 ||
          currentDailyTarget < enforcedDailyTarget
        ) {
          task.dailyTargetDuration = enforcedDailyTarget;
          task.dailyTargetMin = Math.max(
            30,
            roundToNearest5(enforcedDailyTarget * 0.7),
          );

          const taskId = String(task._id);
          const meta = estimationMetaMap.get(taskId);
          if (meta) {
            if (!meta.estimatedFields.includes("dailyTargetDuration")) {
              meta.estimatedFields.push("dailyTargetDuration");
            }
            if (!meta.estimatedFields.includes("dailyTargetMin")) {
              meta.estimatedFields.push("dailyTargetMin");
            }
            meta.finalDailyTarget = task.dailyTargetDuration;
            meta.finalDailyMin = task.dailyTargetMin;
            meta.method = meta.method === "user" ? "default" : meta.method;
            meta.confidence = Math.max(0.65, meta.confidence);
            estimationMetaMap.set(taskId, meta);
          }
        }
      }

      // Tính thời gian tối đa có thể xếp theo năng lực thực tế/ngày
      // (không chỉ bám dailyTarget hiện tại để tránh warning giả)
      const dailyTargetMax = task.dailyTargetDuration ?? 120;
      const potentialDailyMax = Math.max(
        dailyTargetMax,
        task.teamAssignment ? 480 : 360,
      );
      const maxPossibleMinutes = daysLeft * potentialDailyMax;

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

    // ── Strategy & distribution config ──
    const strategy = input.schedulingStrategy || "balanced";
    const distribution = input.distributionPattern || "adaptive";

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
      // + block toàn bộ thời gian ngoài availability của user trong ngày
      const baseBusySlots = busySlotsByDate.get(dateStr) || [];
      const availableSlots = await freeTimeService.getAvailableSlotsForDate(
        userId,
        new Date(currentDate),
      );
      const outsideAvailabilityBusySlots = buildOutsideAvailabilityBusySlots(
        new Date(currentDate),
        availableSlots,
      );
      const existingBusySlots = [
        ...baseBusySlots,
        ...outsideAvailabilityBusySlots,
      ];
      busySlotsByDate.set(dateStr, existingBusySlots);

      const dynamicWorkHours = {
        start: 0,
        end: 24,
      };

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

      // ── Helper: tính adaptive daily target cho 1 task vào ngày dateStr ──
      const computeAdaptiveDailyTarget = (
        task: any,
      ): { max: number; min: number } => {
        const baseMax = task.dailyTargetDuration ?? 180;
        const baseMin = task.dailyTargetMin ?? 60;
        const remaining = remainingMinutesByTaskId.get(String(task._id)) || 0;

        if (remaining <= 0) return { max: 0, min: 0 };

        // Tính số ngày còn lại đến deadline
        const deadlineStr = task.deadline
          ? toLocalDateStr(new Date(task.deadline))
          : null;
        const remainingDaysToDeadline = deadlineStr
          ? Math.max(
              1,
              Math.ceil(
                (new Date(deadlineStr).getTime() -
                  new Date(dateStr).getTime()) /
                  (1000 * 60 * 60 * 24),
              ) + 1,
            )
          : 7;

        const isTeamTask = !!task.teamAssignment;
        const absoluteMax = isTeamTask ? 480 : 360; // team: 8h, cá nhân: 6h
        const teamMinDaily = isTeamTask ? 120 : 0; // team task: tối thiểu 2h/ngày

        if (distribution === "adaptive") {
          // Adaptive: base demand từ remaining / remainingDays
          const demandPerDay = remaining / remainingDaysToDeadline;
          const pressureRatio = demandPerDay / Math.max(1, baseMax);

          // Nếu đang bị trễ tiến độ (pressure > 1), tăng mạnh target để catch up
          const catchUpBoost = pressureRatio > 1 ? pressureRatio : 1;

          // Mục tiêu max hôm nay = demand + buffer + pressure boost
          const adaptiveTarget = demandPerDay * 1.25 * catchUpBoost;
          const adaptiveMax = clamp(
            roundToNearest5(Math.max(adaptiveTarget, baseMax, teamMinDaily)),
            Math.max(30, Math.min(baseMin, teamMinDaily || baseMin)),
            absoluteMax,
          );
          const adaptiveMin = clamp(
            roundToNearest5(
              Math.max(
                demandPerDay * (isTeamTask ? 0.75 : 0.65),
                isTeamTask ? 60 : 30,
              ),
            ),
            isTeamTask ? 60 : 30,
            adaptiveMax,
          );
          return { max: adaptiveMax, min: adaptiveMin };
        } else if (distribution === "front-load") {
          // Front-load: ngày đầu 1.5x, giảm dần
          const dayIndex = Math.ceil(
            (new Date(dateStr).getTime() -
              new Date(toLocalDateStr(startDate)).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          const totalDays = remainingDaysToDeadline + dayIndex;
          const progressRatio = totalDays > 0 ? dayIndex / totalDays : 0;
          const frontLoadMultiplier = 1.5 - progressRatio; // 1.5x đầu → 0.5x cuối
          const adjustedMax = clamp(
            roundToNearest5(
              Math.max(baseMax * frontLoadMultiplier, teamMinDaily, baseMax),
            ),
            isTeamTask ? 60 : 30,
            absoluteMax,
          );
          const adjustedMin = clamp(
            roundToNearest5(Math.max(baseMin, isTeamTask ? 60 : 30)),
            isTeamTask ? 60 : 30,
            adjustedMax,
          );
          return { max: adjustedMax, min: adjustedMin };
        }
        // "even" - giữ nguyên nhưng vẫn ép minimum cho team task
        const evenMax = clamp(
          roundToNearest5(Math.max(baseMax, teamMinDaily)),
          isTeamTask ? 60 : 30,
          absoluteMax,
        );
        const evenMin = clamp(
          roundToNearest5(Math.max(baseMin, isTeamTask ? 60 : 30)),
          isTeamTask ? 60 : 30,
          evenMax,
        );
        return { max: evenMax, min: evenMin };
      };

      const scheduleTaskChunksForDay = async (
        task: any,
        mode: "reachMin" | "fillMax" | "fillAvailable",
      ): Promise<void> => {
        const remainingForTask =
          remainingMinutesByTaskId.get(String(task._id)) || 0;
        if (remainingForTask <= 0) return;

        // Respect task-level startAt (bao gồm teamAssignment.startAt)
        const taskStartDateStr = getTaskStartDateStr(task);
        if (taskStartDateStr && dateStr < taskStartDateStr) {
          return;
        }

        // ✅ STRICT DEADLINE CHECK: Skip nếu đã qua deadline (không có allowAfterDeadline)
        if (
          task.deadline &&
          dateStr > toLocalDateStr(new Date(task.deadline))
        ) {
          return;
        }

        // ── Adaptive daily target thay vì cố định ──
        const { max: dailyTargetMax, min: dailyTargetMin } =
          computeAdaptiveDailyTarget(task);

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

          const hardDailyCap = Math.max(
            dailyTargetMax,
            task.teamAssignment ? 480 : 360,
          );
          const effectiveDailyMax =
            mode === "fillAvailable" ? hardDailyCap : dailyTargetMax;

          if (mode === "reachMin" && scheduledToday >= dailyTargetMin) {
            break;
          }
          if (
            (mode === "fillMax" || mode === "fillAvailable") &&
            scheduledToday >= effectiveDailyMax
          ) {
            break;
          }

          const remainingToMaxToday = Math.max(
            0,
            effectiveDailyMax - scheduledToday,
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
              workHours: dynamicWorkHours,
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

      if (strategy === "sequential") {
        // Sequential: hoàn thành 1 task trước rồi mới đến task kế tiếp
        // Chỉ schedule task đầu tiên chưa hoàn thành (theo priority order)
        for (const taskId of sortedTaskIds) {
          const remaining = remainingMinutesByTaskId.get(taskId) || 0;
          if (remaining <= 0) continue;
          const task = tasks.find((t) => String(t._id) === taskId);
          if (!task) continue;
          // Dồn hết thời gian cho task này trong ngày
          await scheduleTaskChunksForDay(task, "fillMax");
          break; // Chỉ 1 task/ngày trong sequential mode
        }
      } else {
        // Parallel / Balanced: làm nhiều task trong ngày
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

        // Phase 3: nếu trong ngày vẫn còn khoảng trống, dồn thêm task để lấp ngày
        // trước khi chuyển sang ngày tiếp theo (không vượt hard cap/ngày của task)
        for (const taskId of sortedTaskIds) {
          const task = tasks.find((t) => String(t._id) === taskId);
          if (!task) continue;
          await scheduleTaskChunksForDay(task, "fillAvailable");
        }
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
        (estimationMetaMap.size > 0
          ? ` | Đã tự động ước tính thời lượng cho ${estimationMetaMap.size} task thiếu dữ liệu.`
          : "") +
        (remainingSummary
          ? ` | ⚠️ Không đủ thời gian trước deadline: ${remainingSummary}. Bạn nên tăng mục tiêu/ngày hoặc gia hạn deadline.`
          : ""),
      stats,
      warnings: warnings.length > 0 ? warnings : undefined,
      estimationMetadata:
        estimationMetaMap.size > 0
          ? Array.from(estimationMetaMap.values())
          : undefined,
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
      const availableSlots = await freeTimeService.getAvailableSlotsForDate(
        userId,
        new Date(currentDate),
      );
      const outsideAvailabilityBusySlots = buildOutsideAvailabilityBusySlots(
        new Date(currentDate),
        availableSlots,
      );
      const constrainedBusySlots = [
        ...busySlots,
        ...outsideAvailabilityBusySlots,
      ];

      const slots = slotFinder.findFreeSlots({
        busySlots: constrainedBusySlots,
        date: new Date(currentDate),
        minDuration: task.estimatedDuration || 60,
        workHours: { start: 0, end: 24 },
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

function isValidDateValue(value: unknown): value is Date | string | number {
  if (value === undefined || value === null) return false;
  const date = new Date(value as any);
  return !Number.isNaN(date.getTime());
}

function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTaskStartDateStr(task: any): string | null {
  const rawStartAt = task?.startAt ?? task?.teamAssignment?.startAt;
  if (!isValidDateValue(rawStartAt)) return null;
  return toLocalDateStr(new Date(rawStartAt));
}

// ───── Estimation cache helpers ─────
function estimationCacheKey(
  userId: string,
  taskTitle: string,
  deadline: string | null,
  description: string,
): string {
  const raw = `${userId}|${taskTitle}|${deadline ?? ""}|${description}`;
  return `est:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

async function getCachedEstimation(
  key: string,
): Promise<{ difficulty: string; multiplier: number } | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedEstimation(
  key: string,
  data: { difficulty: string; multiplier: number },
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(data), "EX", 86400); // 24h TTL
  } catch {
    // silently fail
  }
}

// ───── AI difficulty estimator ─────
async function aiEstimateDifficulty(
  task: any,
  userId: string,
): Promise<{
  difficulty: "easy" | "medium" | "hard";
  multiplier: number;
} | null> {
  const title = String(task.title ?? "");
  const description = String(task.description ?? "");
  if (!title && !description) return null;

  const deadlineStr = task.deadline
    ? new Date(task.deadline).toISOString().split("T")[0]
    : null;
  const cacheKey = estimationCacheKey(userId, title, deadlineStr, description);

  // Check cache first
  const cached = await getCachedEstimation(cacheKey);
  if (cached) {
    return cached as {
      difficulty: "easy" | "medium" | "hard";
      multiplier: number;
    };
  }

  try {
    const prompt = `Phân tích độ phức tạp công việc này và trả về JSON duy nhất:

Tiêu đề: ${title}
${description ? `Mô tả: ${description}` : ""}
${task.priority ? `Ưu tiên: ${task.priority}` : ""}
${deadlineStr ? `Deadline: ${deadlineStr}` : ""}

Trả về JSON (KHÔNG kèm text khác):
{"difficulty":"easy|medium|hard","multiplier":0.7|1.0|1.5,"reasoning":"lý do ngắn"}`;

    const result = await Promise.race([
      aiProvider.chat({
        messages: [
          {
            role: "system",
            content:
              "You are a task complexity analyzer. Output valid JSON only. No markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 200,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), 5000),
      ),
    ]);

    const parsed = JSON.parse(extractJson(result.content || "{}"));
    const difficulty = (
      ["easy", "medium", "hard"].includes(parsed.difficulty)
        ? parsed.difficulty
        : "medium"
    ) as "easy" | "medium" | "hard";
    const multiplierMap: Record<string, number> = {
      easy: 0.7,
      medium: 1.0,
      hard: 1.5,
    };
    const multiplier = multiplierMap[difficulty] ?? 1.0;

    const estimation = { difficulty, multiplier };
    await setCachedEstimation(cacheKey, estimation);
    return estimation;
  } catch (err: any) {
    console.warn(
      `[Estimation] AI difficulty analysis failed for "${title}": ${err.message}`,
    );
    return null;
  }
}

// ───── Main estimation function (heuristic + AI hybrid) ─────
async function ensureTaskPlanningInputsWithMeta(
  task: any,
  plannerStartDate: Date,
  userId: string,
): Promise<TaskEstimationMeta | null> {
  const taskId = String(task._id);
  const estimatedFields: string[] = [];
  let method: EstimationMethod = "user";
  let confidence = 1.0;
  let heuristicDuration: number | undefined;
  let aiDifficulty: "easy" | "medium" | "hard" | undefined;
  let aiMultiplier: number | undefined;

  // All fields already provided by user → no estimation needed
  if (
    task.estimatedDuration != null &&
    task.dailyTargetDuration != null &&
    task.dailyTargetMin != null
  ) {
    return null;
  }

  // ── Compute context ──
  const startSource =
    task?.startAt ?? task?.teamAssignment?.startAt ?? plannerStartDate;
  const startAt = isValidDateValue(startSource)
    ? new Date(startSource)
    : new Date(plannerStartDate);

  const deadlineSource = task?.deadline;
  const fallbackDeadline = new Date(startAt);
  fallbackDeadline.setDate(fallbackDeadline.getDate() + 7);
  const deadline = isValidDateValue(deadlineSource)
    ? new Date(deadlineSource)
    : fallbackDeadline;

  const startDateOnly = new Date(`${toLocalDateStr(startAt)}T00:00:00`);
  const deadlineDateOnly = new Date(`${toLocalDateStr(deadline)}T00:00:00`);
  const daysUntilDeadline = Math.max(
    1,
    Math.floor(
      (deadlineDateOnly.getTime() - startDateOnly.getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1,
  );

  // ── estimatedDuration ──
  if (task.estimatedDuration == null) {
    // Step 1: Heuristic base
    let baseEstimate: number;
    if (daysUntilDeadline <= 1) baseEstimate = 60;
    else if (daysUntilDeadline <= 3) baseEstimate = 120;
    else if (daysUntilDeadline <= 7) baseEstimate = 300;
    else if (daysUntilDeadline <= 14) baseEstimate = 600;
    else baseEstimate = 900;

    const priority = String(task.priority ?? "medium").toLowerCase();
    const priorityMultiplier =
      priority === "urgent" ? 1.3 : priority === "high" ? 1.2 : 1;

    const text =
      `${String(task.title ?? "")} ${String(task.description ?? "")}`.toLowerCase();
    const complexKeywords =
      /design|implement|refactor|research|architecture|optimize|integration|migrate|deploy|testing|security|analysis/;
    const simpleKeywords =
      /fix|update|change|rename|remove|delete|add|config|setup/;
    let keywordMultiplier = 1.0;
    if (complexKeywords.test(text)) keywordMultiplier = 1.3;
    else if (simpleKeywords.test(text)) keywordMultiplier = 0.8;

    heuristicDuration = clamp(
      roundToNearest5(baseEstimate * priorityMultiplier * keywordMultiplier),
      60,
      1440,
    );

    // Step 2: Try AI estimation
    const aiResult = await aiEstimateDifficulty(task, userId);
    if (aiResult) {
      aiDifficulty = aiResult.difficulty;
      aiMultiplier = aiResult.multiplier;
      // Hybrid: 60% AI-adjusted + 40% pure heuristic
      const aiAdjusted = heuristicDuration * aiResult.multiplier;
      const hybridDuration = aiAdjusted * 0.6 + heuristicDuration * 0.4;
      task.estimatedDuration = clamp(roundToNearest5(hybridDuration), 60, 1440);
      method = "hybrid";
      confidence = aiResult.difficulty === "medium" ? 0.7 : 0.8;
    } else {
      // Pure heuristic fallback
      task.estimatedDuration = heuristicDuration;
      method = "heuristic";
      confidence = 0.5;
    }

    estimatedFields.push("estimatedDuration");
    console.log(
      `[Estimation] Task "${task.title}": ${method} → ${task.estimatedDuration}min` +
        (aiDifficulty ? ` (AI: ${aiDifficulty}, ×${aiMultiplier})` : "") +
        ` | days=${daysUntilDeadline}, base=${heuristicDuration}min`,
    );
  }

  // ── dailyTargetDuration ──
  if (task.dailyTargetDuration == null) {
    const estDuration = Math.max(30, Number(task.estimatedDuration ?? 120));
    const isTeamTask = !!task.teamAssignment;
    const hasHardDeadline = isValidDateValue(deadlineSource);

    if (isTeamTask && hasHardDeadline) {
      // Team task với deadline cứng → PHẢI hoàn thành trước deadline
      // Dùng safety factor 80%: plan xong trong 80% số ngày, 20% buffer
      const effectiveDays = Math.max(1, Math.floor(daysUntilDeadline * 0.8));
      const rawTarget = estDuration / effectiveDays;
      // Team tasks cho phép lên tới 480 phút/ngày (8h) vì phải hoàn thành bằng mọi giá
      task.dailyTargetDuration = clamp(roundToNearest5(rawTarget), 60, 480);
    } else {
      // Task cá nhân hoặc không có hard deadline → chia đều bình thường
      task.dailyTargetDuration = clamp(
        roundToNearest5(estDuration / daysUntilDeadline),
        30,
        240,
      );
    }
    estimatedFields.push("dailyTargetDuration");
  }

  // ── dailyTargetMin ──
  if (task.dailyTargetMin == null) {
    const isTeamTask = !!task.teamAssignment;
    const minRatio = isTeamTask ? 0.7 : 0.5; // Team tasks: min = 70% of max
    task.dailyTargetMin = Math.max(
      15,
      roundToNearest5(Number(task.dailyTargetDuration ?? 60) * minRatio),
    );
    estimatedFields.push("dailyTargetMin");
  }

  // ── Edge cases ──
  // Nếu deadline đã quá hạn, đánh dấu confidence rất thấp
  const now = new Date();
  if (deadline < now) {
    confidence = Math.min(confidence, 0.3);
  }
  // Nếu không có deadline gốc (dùng fallback 7 ngày), giảm confidence
  if (!isValidDateValue(deadlineSource)) {
    confidence = Math.min(confidence, 0.4);
  }

  return {
    taskId,
    method,
    confidence: parseFloat(confidence.toFixed(2)),
    estimatedFields,
    heuristicDuration,
    aiDifficulty,
    aiMultiplier,
    finalDuration: task.estimatedDuration,
    finalDailyTarget: task.dailyTargetDuration,
    finalDailyMin: task.dailyTargetMin,
  };
}
