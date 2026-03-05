import { Types } from "mongoose";
import { aiProvider } from "../ai/ai.provider";
import { taskRepository } from "../task/task.repository";
import { userHabitRepository } from "../user/user-habit.repository";
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
    endDate.setDate(endDate.getDate() + 7); // 1 tuần

    const schedule: any[] = [];
    const stats = {
      aiConflictsDetected: 0,
      autoRescheduled: 0,
      productivityOptimized: 0,
    };

    let currentDate = new Date(startDate);
    let sessionCounter = 0;

    // Track busy slots theo ngày
    const busySlotsByDate = new Map<string, TimeInterval[]>();

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const daySchedule: any = {
        day: getDayOfWeek(dateStr),
        date: dateStr,
        tasks: [],
      };

      // Lấy busy slots của ngày này (từ các ngày trước đã schedule)
      const existingBusySlots = busySlotsByDate.get(dateStr) || [];

      // Sort tasks theo AI suggested order
      const sortedTaskIds =
        aiAnalysis.suggestedOrder || tasks.map((t) => String(t._id));

      for (const taskId of sortedTaskIds) {
        const task = tasks.find((t) => String(t._id) === taskId);
        if (!task) continue;

        // Skip nếu đã qua deadline
        if (
          task.deadline &&
          dateStr > task.deadline.toISOString().split("T")[0]
        ) {
          continue;
        }

        const duration = task.estimatedDuration || 120;
        const difficulty = aiAnalysis.difficultyAnalysis?.[taskId] || "medium";
        const requiresFocus = difficulty === "hard";

        // Tìm slot tối ưu bằng algorithm
        const optimalSlot = slotFinder.findOptimalSlot({
          taskDuration: duration,
          preferredTimeOfDay: requiresFocus ? "morning" : undefined,
          productivityScores,
          busySlots: existingBusySlots,
          date: new Date(currentDate),
          workHours: { start: 8, end: 17 },
        });

        if (!optimalSlot) {
          // Không có slot trong ngày này → thử ngày khác (đã ở trong vòng lặp)
          continue;
        }

        // Check conflict
        const newTaskInterval: TimeInterval = {
          start: optimalSlot.start,
          end: optimalSlot.end,
          taskId: String(task._id),
        };

        const conflict = intervalScheduler.checkConflict(
          newTaskInterval,
          existingBusySlots,
        );

        let finalSlot = optimalSlot;
        let rescheduled = false;

        if (conflict.hasConflict && conflict.suggestedNewSlot) {
          // Auto reschedule
          finalSlot = {
            start: conflict.suggestedNewSlot.start,
            end: conflict.suggestedNewSlot.end,
            duration:
              (conflict.suggestedNewSlot.end.getTime() -
                conflict.suggestedNewSlot.start.getTime()) /
              (1000 * 60),
            productivityScore: 0.5,
          };
          stats.aiConflictsDetected++;
          stats.autoRescheduled++;
          rescheduled = true;
        } else {
          stats.productivityOptimized++;
        }

        // Tính productivity score của slot này
        const hour = finalSlot.start.getHours();
        const prodScore = productivityScores.get(hour)?.score || 0.5;

        // Add vào schedule
        const sessionId = `session_${++sessionCounter}_${taskId}_${dateStr}`;
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

        // Update busy slots cho ngày này
        existingBusySlots.push({
          start: finalSlot.start,
          end: finalSlot.end,
          taskId: String(task._id),
        });

        busySlotsByDate.set(dateStr, existingBusySlots);

        // Chỉ schedule 1 phiên/task/ngày để tránh overload
        break; // Chuyển sang task tiếp theo
      }

      if (daySchedule.tasks.length > 0) {
        schedule.push(daySchedule);
      }

      // Next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      schedule,
      totalTasks: tasks.length,
      suggestedOrder:
        aiAnalysis.suggestedOrder || tasks.map((t) => String(t._id)),
      personalizationNote:
        aiAnalysis.personalizationNote ||
        `Lịch trình được tối ưu với ${stats.productivityOptimized} tasks theo thói quen của bạn`,
      stats,
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
        workHours: { start: 8, end: 17 },
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
  const date = new Date(dateStr);
  return days[date.getDay()];
}

function formatTimeRange(start: Date, end: Date): string {
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${formatTime(start)} - ${formatTime(end)}`;
}
