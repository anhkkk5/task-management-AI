import { Types } from "mongoose";
import { taskRepository } from "../task/task.repository";
import { AISchedule } from "../ai-schedule/ai-schedule.model";
import { aiProvider } from "./ai.provider";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SubtaskChatInput {
  userId: string;
  taskId: string;
  subtaskIndex: number;
  messages: ChatMessage[]; // lịch sử hội thoại từ FE
}

export interface SubtaskChatResult {
  reply: string;
  systemContext: {
    taskTitle: string;
    subtaskTitle: string;
    scheduledDate?: string;
    scheduledTime?: string;
    totalSlots: number;
    subtaskPosition: number;
  };
}

export const subtaskChatService = {
  chat: async (input: SubtaskChatInput): Promise<SubtaskChatResult> => {
    const { userId, taskId, subtaskIndex, messages } = input;

    if (!Types.ObjectId.isValid(userId)) throw new Error("USER_ID_INVALID");
    if (!Types.ObjectId.isValid(taskId)) throw new Error("TASK_ID_INVALID");

    // 1. Lấy task và subtask
    const task = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });
    if (!task) throw new Error("TASK_FORBIDDEN");

    // Nếu task này là subtask (có parentTaskId) và không có aiBreakdown,
    // tìm task cha để lấy aiBreakdown
    let targetTask = task;
    if (task.aiBreakdown.length === 0 && task.parentTaskId) {
      const parentTask = await taskRepository.findByIdForUser({
        taskId: String(task.parentTaskId),
        userId: new Types.ObjectId(userId),
      });
      if (parentTask && parentTask.aiBreakdown.length > 0) {
        targetTask = parentTask;
      }
    }

    const subtask = targetTask.aiBreakdown?.[subtaskIndex];
    if (!subtask) throw new Error("SUBTASK_NOT_FOUND");

    const resolvedTaskId = String(targetTask._id);

    // 2. Lấy lịch đã sắp xếp cho task này
    const activeSchedules = await AISchedule.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
      $or: [{ sourceTasks: resolvedTaskId }, { sourceTasks: taskId }],
    }).lean();

    // Thu thập tất cả slots
    type Slot = {
      date: string;
      day: string;
      time: string;
      durationMinutes: number;
    };
    const slots: Slot[] = [];
    for (const schedule of activeSchedules) {
      for (const day of schedule.schedule) {
        for (const session of day.tasks) {
          if (session.taskId === resolvedTaskId || session.taskId === taskId) {
            let durationMinutes = 60;
            const m = session.suggestedTime.match(
              /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
            );
            if (m) {
              durationMinutes =
                parseInt(m[3]) * 60 +
                parseInt(m[4]) -
                (parseInt(m[1]) * 60 + parseInt(m[2]));
            }
            slots.push({
              date: day.date,
              day: day.day,
              time: session.suggestedTime,
              durationMinutes,
            });
          }
        }
      }
    }
    slots.sort((a, b) => a.date.localeCompare(b.date));

    // 3. Tính tiến độ: bao nhiêu subtask đã hoàn thành
    const completedCount = targetTask.aiBreakdown.filter(
      (s) => s.status === "completed",
    ).length;
    const totalSubtasks = targetTask.aiBreakdown.length;

    // 4. Xây dựng lịch học chi tiết để đưa vào context
    const scheduleContext =
      slots.length > 0
        ? `\nLịch học đã sắp xếp (${slots.length} buổi):\n` +
          targetTask.aiBreakdown
            .map((s, idx) => {
              const slot = subtask.scheduledDate
                ? s.scheduledDate
                  ? `${s.scheduledDate} · ${s.scheduledTime ?? ""}`
                  : "Chưa có lịch"
                : slots[idx]
                  ? `${slots[idx].date} · ${slots[idx].time}`
                  : "Chưa có lịch";
              const statusIcon =
                s.status === "completed"
                  ? "✅"
                  : s.status === "in_progress"
                    ? "🔄"
                    : "⬜";
              return `  ${statusIcon} Buổi ${idx + 1}: ${s.title} — ${slot}`;
            })
            .join("\n")
        : "";

    // 5. Build system prompt với đầy đủ context
    const systemPrompt = buildSystemPrompt({
      taskTitle: targetTask.title,
      taskDescription: targetTask.description,
      taskEstimatedDuration: targetTask.estimatedDuration,
      taskDeadline: targetTask.deadline,
      subtask,
      subtaskIndex,
      totalSubtasks,
      completedCount,
      scheduleContext,
      slots,
    });

    // 6. Gọi AI với full context
    const result = await aiProvider.chat({
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.7,
      maxTokens: 1500,
    });

    return {
      reply: result.content || "Xin lỗi, tôi không thể trả lời lúc này.",
      systemContext: {
        taskTitle: targetTask.title,
        subtaskTitle: subtask.title,
        scheduledDate: subtask.scheduledDate,
        scheduledTime: subtask.scheduledTime,
        totalSlots: slots.length,
        subtaskPosition: subtaskIndex + 1,
      },
    };
  },
};

function buildSystemPrompt(ctx: {
  taskTitle: string;
  taskDescription?: string;
  taskEstimatedDuration?: number;
  taskDeadline?: Date;
  subtask: {
    title: string;
    difficulty?: string;
    description?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    status: string;
  };
  subtaskIndex: number;
  totalSubtasks: number;
  completedCount: number;
  scheduleContext: string;
  slots: { date: string; time: string; durationMinutes: number }[];
}): string {
  const {
    taskTitle,
    taskDescription,
    taskEstimatedDuration,
    taskDeadline,
    subtask,
    subtaskIndex,
    totalSubtasks,
    completedCount,
    scheduleContext,
    slots,
  } = ctx;

  const deadlineStr = taskDeadline
    ? `Hạn chót: ${taskDeadline.toLocaleDateString("vi-VN")}`
    : "";

  const durationStr = taskEstimatedDuration
    ? `Tổng thời gian dự kiến: ${Math.floor(taskEstimatedDuration / 60)}h${taskEstimatedDuration % 60 > 0 ? (taskEstimatedDuration % 60) + "m" : ""}`
    : "";

  const slotDuration =
    subtask.scheduledDate && slots.length > 0
      ? slots.find((s) => s.date === subtask.scheduledDate)?.durationMinutes
      : undefined;

  const progressStr = `Tiến độ: ${completedCount}/${totalSubtasks} buổi hoàn thành`;

  return `Bạn là AI tutor thông minh, dạy học dựa trên lịch học đã được thuật toán sắp xếp tối ưu.

=== THÔNG TIN TASK ===
Công việc: ${taskTitle}
${taskDescription ? `Mô tả: ${taskDescription}` : ""}
${durationStr}
${deadlineStr}
${progressStr}

=== BUỔI HỌC HIỆN TẠI ===
Buổi ${subtaskIndex + 1}/${totalSubtasks}: ${subtask.title}
${subtask.scheduledDate ? `Ngày học: ${subtask.scheduledDate} lúc ${subtask.scheduledTime ?? ""}` : ""}
${slotDuration ? `Thời lượng buổi học: ${slotDuration} phút` : ""}
Độ khó: ${subtask.difficulty === "easy" ? "Dễ" : subtask.difficulty === "medium" ? "Trung bình" : subtask.difficulty === "hard" ? "Khó" : "Chưa xác định"}
${subtask.description ? `Nội dung: ${subtask.description}` : ""}
${scheduleContext}

=== NGUYÊN TẮC DẠY HỌC ===
1. Dạy đúng nội dung của buổi học này (${subtask.title}), không dạy lan man
2. Điều chỉnh độ sâu theo thời lượng buổi học${slotDuration ? ` (${slotDuration} phút)` : ""}
3. Nếu user hỏi về buổi khác, nhắc nhở họ tập trung vào buổi hiện tại trước
4. Kết thúc mỗi câu trả lời bằng gợi ý bước tiếp theo phù hợp với lịch học
5. Trả lời bằng tiếng Việt, rõ ràng, có cấu trúc (dùng markdown)
6. Khi dạy lý thuyết: giải thích ngắn gọn → ví dụ cụ thể → bài tập nhỏ
7. Khi chữa bài: nhận xét → giải thích lỗi → đưa ra đáp án đúng`;
}
