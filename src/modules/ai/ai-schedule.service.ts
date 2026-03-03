import { Types } from "mongoose";
import { aiProvider } from "./ai.provider";
import { taskRepository } from "../task/task.repository";
import { userHabitRepository } from "../user/user-habit.repository";
import { extractJson, repairTruncatedJson } from "./ai-utils";

export const aiScheduleService = {
  schedulePlan: async (
    userId: string,
    input: { taskIds: string[]; startDate: Date },
  ): Promise<{
    schedule: {
      day: string;
      date: string;
      tasks: {
        sessionId?: string;
        taskId: string;
        title: string;
        priority: string;
        suggestedTime: string;
        reason: string;
        createSubtask?: boolean;
      }[];
    }[];
    totalTasks: number;
    suggestedOrder: string[];
    personalizationNote: string;
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);

    const tasks: any[] = [];
    for (const taskId of input.taskIds) {
      if (!Types.ObjectId.isValid(taskId)) {
        throw new Error("TASK_ID_INVALID");
      }
      const task = await taskRepository.findByIdForUser({
        taskId,
        userId: userObjectId,
      });
      if (!task) {
        throw new Error("TASK_NOT_FOUND");
      }
      tasks.push(task);
    }

    const taskData = tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description || "",
      priority: t.priority,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      status: t.status,
      estimatedDuration: t.estimatedDuration || null,
    }));

    const taskDeadlineById = new Map<string, string | null>();
    for (const t of taskData) {
      taskDeadlineById.set(
        String(t.id),
        t.deadline ? String(t.deadline).split("T")[0] : null,
      );
    }

    const startDateStr = input.startDate.toISOString().split("T")[0];

    const deadlines = tasks
      .filter((t) => t.deadline)
      .map((t) => new Date(t.deadline!).getTime());
    const furthestDeadline =
      deadlines.length > 0 ? Math.max(...deadlines) : null;
    const startTime = input.startDate.getTime();
    const daysNeeded = furthestDeadline
      ? Math.max(
          1,
          Math.ceil((furthestDeadline - startTime) / (1000 * 60 * 60 * 24)) + 1,
        )
      : 7;

    const totalDays = Math.min(Math.max(daysNeeded, 1), 365);
    const endDate = new Date(input.startDate);
    endDate.setDate(endDate.getDate() + totalDays - 1);
    const endDateStr = endDate.toISOString().split("T")[0];

    const now = new Date();
    const currentHour = now.getHours();
    const currentDateStr = now.toISOString().split("T")[0];
    const isStartDateToday = startDateStr === currentDateStr;

    const userHabits = await userHabitRepository.findByUserId(userId);
    const productivityAnalysis =
      await userHabitRepository.analyzeProductivity(userId);

    let userPreferencesText = "";
    if (userHabits) {
      userPreferencesText += `\n\nThói quen người dùng:\n`;
      if (userHabits.productiveHours?.length) {
        userPreferencesText += `- Giờ làm việc hiệu quả: ${userHabits.productiveHours.map((h) => `${h.start}h-${h.end}h`).join(", ")}\n`;
      }
      if (
        userHabits.preferredWorkPattern &&
        userHabits.preferredWorkPattern !== "mixed"
      ) {
        const patternMap: Record<string, string> = {
          morning: "buổi sáng",
          afternoon: "buổi chiều",
          evening: "buổi tối",
        };
        userPreferencesText += `- Thích làm việc vào ${patternMap[userHabits.preferredWorkPattern] || userHabits.preferredWorkPattern}\n`;
      }
      userPreferencesText += `- Thời gian nghỉ giữa task: ${userHabits.preferredBreakDuration || 15} phút\n`;
      userPreferencesText += `- Thời gian tập trung tối đa: ${userHabits.maxFocusDuration || 90} phút\n`;
    }

    if (productivityAnalysis) {
      userPreferencesText += `- Tỷ lệ hoàn thành task: ${(productivityAnalysis.completionRate * 100).toFixed(0)}%\n`;
      if (productivityAnalysis.mostProductiveHours.length > 0) {
        userPreferencesText += `- Giờ hiệu quả nhất: ${productivityAnalysis.mostProductiveHours.slice(0, 3).join("h, ")}h\n`;
      }
    }

    const timeConstraintText = isStartDateToday
      ? `
THÔNG TIN THỜI GIAN HIỆN TẠI:
- Hôm nay là ngày ${currentDateStr}, hiện tại là ${currentHour}:00
- BẮT BUỘC: Không được đề xuất thời gian bắt đầu trước ${currentHour + 1}:00 hôm nay (vì đã qua rồi)
`
      : "";

    const prompt = `Bạn là một AI chuyên gia lập kế hoạch và tối ưu lịch làm việc cá nhân. Hãy tạo lịch trình làm việc tối ưu và CÁ NHÂN HÓA.

============================
THÔNG TIN CỐ ĐỊNH:

Giờ làm việc mỗi ngày: 08:00 – 17:00
Nghỉ trưa: 12:00 – 13:00
Thời gian lập lịch: Từ ${startDateStr} đến ${endDateStr} (${totalDays} ngày)
${isStartDateToday ? `Thời gian hiện tại: ${currentHour}:00 (KHÔNG được đề xuất giờ trước ${Math.max(currentHour + 1, 8)}:00 hôm nay)` : ""}
${timeConstraintText}

============================
DANH SÁCH CÔNG VIỆC:
${JSON.stringify(taskData, null, 2)}

============================
THÓI QUEN NGƯỜI DÙNG:
${userPreferencesText}

============================
YÊU CẦU PHÂN TÍCH (thực hiện theo thứ tự):

BƯỚC 1 - Tính số phiên cho mỗi task:
- estimatedDuration (phút) ÷ 120 phút = số phiên cần thiết (làm tròn lên)
- Mỗi phiên tối đa 2 tiếng (120 phút), KHÔNG được vượt quá
- Ví dụ: 480 phút → 4 phiên × 120 phút. 240 phút → 2 phiên × 120 phút

BƯỚC 2 - Phân bổ phiên vào các ngày:
- Task PHẢI xuất hiện trong MỌI NGÀY từ startDate đến deadline
- Chia đều các phiên vào các ngày trong khoảng thời gian đó
- Mỗi ngày có thể có 1-2 phiên của cùng 1 task (tùy số ngày)
- Ví dụ: Task 480 phút, deadline 6 ngày → mỗi ngày 1 phiên 80 phút (KHÔNG phải 120 phút)

BƯỚC 3 - Xếp nhiều task cùng ngày:
- Mỗi ngày PHẢI có thể có NHIỀU task khác nhau
- Task deadline gần ưu tiên xếp trước (buổi sáng)
- Xen kẽ các task trong ngày, buffer 15 phút giữa các phiên
- Tổng thời gian mỗi ngày không vượt quá 8 tiếng làm việc

BƯỚC 4 - TẠO TIÊU ĐỀ PHIÊN:

QUY TẮC ĐƠN GIẢN:
- Tất cả task đều dùng title gốc từ input, KHÔNG thêm bất kỳ gì đằng sau
- Không có "Phiên X/Y", không có "Chủ đề gì", không có "..." gì cả
- Chỉ cần giữ nguyên title đã cho

VÍ DỤ:
- Task: "Code web 3 ngày" → title: "Code web 3 ngày"
- Task: "Học ngữ pháp tiếng anh" → title: "Học ngữ pháp tiếng anh"
- Task: "Làm báo cáo" → title: "Làm báo cáo"

LƯU Ý: createSubtask vẫn = true cho tất cả

============================
VÍ DỤ MINH HỌA (2 task):
Task A: Học tiếng Anh, 480 phút, từ 03/03 đến 08/03 (6 ngày)
Task B: Làm code, 240 phút, từ 03/03 đến 04/03 (2 ngày)

→ Task A cần 4 phiên, chia vào 6 ngày = mỗi ngày 1 phiên ~80 phút
→ Task B cần 2 phiên, chia vào 2 ngày = mỗi ngày 1 phiên 120 phút

Ngày 03/03:
- 08:00-10:00: Code web 3 ngày (120 phút, deadline gần ưu tiên)
- 10:15-11:35: Học ngữ pháp tiếng anh (80 phút)

Ngày 04/03:
- 08:00-10:00: Code web 3 ngày (120 phút, deadline hôm nay)
- 10:15-11:35: Học ngữ pháp tiếng anh (80 phút)

Ngày 05-08/03: Chỉ có Học ngữ pháp tiếng anh mỗi ngày 1 phiên 80 phút

============================
NGUYÊN TẮC TỐI ƯU (bắt buộc tuân theo):

1. Công việc khó/ưu tiên cao/deadline gần → ưu tiên buổi sáng (08:00-12:00)
2. Mỗi phiên tối đa 120 phút (2 tiếng), KHÔNG được vượt quá estimatedDuration còn lại
3. Thêm buffer 15 phút giữa các phiên
4. Không xếp 2 công việc nặng liên tiếp (xen kẽ nếu có nhiều task)
5. Sử dụng estimatedDuration để tính toán chính xác số phiên cần thiết
6. **QUAN TRỌNG NHẤT**: Mỗi task PHẢI xuất hiện trong schedule của MỌI NGÀY từ ngày bắt đầu cho đến ngày deadline của task đó
7. **QUAN TRỌNG**: Mỗi ngày PHẢI có thể có nhiều task khác nhau, không phải 1 task/ngày

============================
FORMAT JSON OUTPUT:

{
  "schedule": [
    {
      "day": "Thứ Ba",
      "date": "YYYY-MM-DD",
      "tasks": [
        {
          "sessionId": "string-unique",
          "taskId": "id",
          "title": "Giữ nguyên title gốc, không thêm gì",
          "priority": "high|medium|low",
          "suggestedTime": "08:00 - 10:00",
          "reason": "Lý do ngắn gọn (tối đa 15 từ)",
          "createSubtask": true
        }
      ]
    }
  ],
  "suggestedOrder": ["taskId1", "taskId2"],
  "personalizationNote": "Giải thích tổng quan tại sao lịch này phù hợp",
  "totalEstimatedTime": "Tổng thời gian ước tính",
  "splitStrategy": "Logic chia nhỏ công việc",
  "confidenceScore": 0.92
}

QUAN TRỌNG:
- Trả về DUY NHẤT JSON hợp lệ, không thêm text khác
- Mỗi task PHẢI có reason giải thích rõ ràng
- Không để trùng thời gian giữa các task trong cùng ngày
- Mỗi taskId ĐƯỢC PHÉP xuất hiện lặp lại qua nhiều ngày cho tới deadline
- Title giữ nguyên từ input, KHÔNG thêm "Phiên X/Y" hay gì cả
- Nếu 1 task kéo dài nhiều ngày: createSubtask=true cho mọi phiên
- Mỗi phiên PHẢI có sessionId duy nhất trong toàn bộ schedule
- **BẮT BUỘC KIỂM TRA**: Sau khi tạo schedule, hãy kiểm tra lại xem mỗi task có xuất hiện trong MỌI NGÀY từ startDate đến deadline của nó không. Nếu thiếu ngày nào, phải thêm vào ngay.
- Tuyệt đối không được xếp task sau deadline của chính task đó. Nếu task có deadline "YYYY-MM-DD" thì date phải <= deadline.
- PHẢI trả về đúng ${totalDays} ngày trong mảng schedule (từ ${startDateStr} đến ${endDateStr})
- Mỗi ngày phải có đầy đủ: day, date, tasks
${isStartDateToday ? `TUYỆT ĐỐI KHÔNG đề xuất giờ bắt đầu trước ${Math.max(currentHour + 1, 8)}:00 hôm nay` : "Tôn trọng khung giờ làm việc 08:00-17:00"}`;

    const result = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content:
            "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      maxTokens: 8000,
    });

    const raw = (result.content || "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      try {
        parsed = JSON.parse(repairTruncatedJson(raw));
        console.warn("[schedulePlan] JSON was truncated and repaired");
      } catch {
        throw new Error("AI_JSON_INVALID");
      }
    }

    if (
      !Array.isArray(parsed?.schedule) ||
      !Array.isArray(parsed?.suggestedOrder)
    ) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    const validateNow = new Date();
    const validateDateStr = validateNow.toISOString().split("T")[0];
    const validateHour = validateNow.getHours();
    const validateMinute = validateNow.getMinutes();

    const getDayOfWeek = (dateStr: string): string => {
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
    };

    // Tạo map từ taskId sang title gốc để ép title đúng
    const originalTitlesById = new Map<string, string>();
    for (const t of tasks) {
      if (t.id) {
        originalTitlesById.set(String(t.id), String(t.title || ""));
      }
    }

    const normalizedSchedule = parsed.schedule.map((day: any) => {
      const dayDate = String(day?.date ?? "");
      const isToday = dayDate === validateDateStr;

      const validTasks = Array.isArray(day?.tasks)
        ? day.tasks.filter((t: any) => {
            const suggestedTime = String(t?.suggestedTime ?? "");
            if (!isToday) return true;

            const timeMatch = suggestedTime.match(
              /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
            );
            if (!timeMatch) return true;

            const startHour = parseInt(timeMatch[1], 10);
            const startMinute = parseInt(timeMatch[2], 10);
            const startTimeMinutes = startHour * 60 + startMinute;
            const currentTimeMinutes = validateHour * 60 + validateMinute;

            return startTimeMinutes > currentTimeMinutes + 5;
          })
        : [];

      // Tính lại thứ trong tuần từ date thay vì tin tưởng AI
      const correctDay = dayDate
        ? getDayOfWeek(dayDate)
        : String(day?.day ?? "");

      return {
        day: correctDay,
        date: dayDate,
        tasks: validTasks.map((t: any) => {
          const taskId = String(t?.taskId ?? "");
          // Dùng title gốc từ input, không dùng title AI trả về
          const originalTitle = originalTitlesById.get(taskId);
          return {
            sessionId:
              t?.sessionId !== undefined && t?.sessionId !== null
                ? String(t.sessionId)
                : undefined,
            taskId: taskId,
            title: originalTitle || String(t?.title ?? ""),
            priority: String(t?.priority ?? "medium"),
            suggestedTime: String(t?.suggestedTime ?? ""),
            reason: String(t?.reason ?? ""),
            createSubtask:
              t?.createSubtask !== undefined
                ? Boolean(t.createSubtask)
                : undefined,
          };
        }),
      };
    });

    let sessionCounter = 0;
    const constrainedSchedule = normalizedSchedule
      .slice()
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
      .map((day: any) => {
        const filteredTasks = Array.isArray(day?.tasks)
          ? day.tasks.filter((t: any) => {
              const id = String(t?.taskId ?? "");
              if (!id) return false;

              const deadlineStr = taskDeadlineById.get(id) ?? null;
              if (deadlineStr && String(day.date) > deadlineStr) {
                return false;
              }

              return true;
            })
          : [];

        return {
          ...day,
          tasks: filteredTasks.map((t: any) => ({
            ...t,
            sessionId: `session_${++sessionCounter}_${String(t?.taskId ?? "")}_${String(day.date)}`,
          })),
        };
      });

    const finalSchedule = constrainedSchedule.map((day: any, index: number) => {
      if (
        day.date === validateDateStr &&
        day.tasks.length === 0 &&
        index === 0
      ) {
        return {
          ...day,
          tasks: [],
          note: "Hôm nay đã hết giờ làm việc, các công việc được chuyển sang ngày mai",
        };
      }
      return day;
    });

    return {
      schedule: finalSchedule,
      totalTasks: tasks.length,
      suggestedOrder: (() => {
        const uniq = new Set<string>();
        const result: string[] = [];
        for (const id of parsed.suggestedOrder || []) {
          const s = String(id);
          if (!s || uniq.has(s)) continue;
          uniq.add(s);
          result.push(s);
        }
        return result;
      })(),
      personalizationNote: String(parsed?.personalizationNote ?? ""),
    };
  },
};
