"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScheduleService = void 0;
const mongoose_1 = require("mongoose");
const ai_provider_1 = require("./ai.provider");
const task_repository_1 = require("../task/task.repository");
const user_habit_repository_1 = require("../user/user-habit.repository");
const ai_utils_1 = require("./ai-utils");
exports.aiScheduleService = {
    schedulePlan: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const tasks = [];
        for (const taskId of input.taskIds) {
            if (!mongoose_1.Types.ObjectId.isValid(taskId)) {
                throw new Error("TASK_ID_INVALID");
            }
            const task = await task_repository_1.taskRepository.findByIdForUser({
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
        const taskDeadlineById = new Map();
        for (const t of taskData) {
            taskDeadlineById.set(String(t.id), t.deadline ? String(t.deadline).split("T")[0] : null);
        }
        const startDateStr = input.startDate.toISOString().split("T")[0];
        const deadlines = tasks
            .filter((t) => t.deadline)
            .map((t) => new Date(t.deadline).getTime());
        const furthestDeadline = deadlines.length > 0 ? Math.max(...deadlines) : null;
        const startTime = input.startDate.getTime();
        const daysNeeded = furthestDeadline
            ? Math.max(1, Math.ceil((furthestDeadline - startTime) / (1000 * 60 * 60 * 24)) + 1)
            : 7;
        const totalDays = Math.min(Math.max(daysNeeded, 1), 365);
        const endDate = new Date(input.startDate);
        endDate.setDate(endDate.getDate() + totalDays - 1);
        const endDateStr = endDate.toISOString().split("T")[0];
        const now = new Date();
        const currentHour = now.getHours();
        const currentDateStr = now.toISOString().split("T")[0];
        const isStartDateToday = startDateStr === currentDateStr;
        const userHabits = await user_habit_repository_1.userHabitRepository.findByUserId(userId);
        const productivityAnalysis = await user_habit_repository_1.userHabitRepository.analyzeProductivity(userId);
        let userPreferencesText = "";
        if (userHabits) {
            userPreferencesText += `\n\nThói quen người dùng:\n`;
            if (userHabits.productiveHours?.length) {
                userPreferencesText += `- Giờ làm việc hiệu quả: ${userHabits.productiveHours.map((h) => `${h.start}h-${h.end}h`).join(", ")}\n`;
            }
            if (userHabits.preferredWorkPattern &&
                userHabits.preferredWorkPattern !== "mixed") {
                const patternMap = {
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
        // Thêm thông tin dailyTarget vào taskData
        const taskDataWithTargets = tasks.map((t) => ({
            id: String(t._id),
            title: t.title,
            description: t.description || "",
            priority: t.priority,
            deadline: t.deadline ? t.deadline.toISOString().split("T")[0] : null,
            status: t.status,
            estimatedDuration: t.estimatedDuration || null,
            dailyTargetMin: t.dailyTargetMin || 60, // Mặc định 1h/ngày
            dailyTargetMax: t.dailyTargetDuration || 180, // Mặc định 3h/ngày
        }));
        const prompt = `Bạn là một AI chuyên gia lập kế hoạch và tối ưu lịch làm việc cá nhân. Hãy tạo lịch trình làm việc tối ưu và CÁ NHÂN HÓA.

============================
THÔNG TIN CỐ ĐỊNH:

Giờ làm việc mỗi ngày: 08:00 – 17:00
Nghỉ trưa: 12:00 – 13:00
Thời gian lập lịch: Từ ${startDateStr} đến ${endDateStr} (${totalDays} ngày)
${isStartDateToday ? `Thời gian hiện tại: ${currentHour}:00 (BẮT BUỘC: Chỉ được đề xuất giờ từ ${Math.max(currentHour + 1, 8)}:00 trở đi cho hôm nay ${currentDateStr})` : ""}
${timeConstraintText}

============================
DANH SÁCH CÔNG VIỆC:
${JSON.stringify(taskDataWithTargets, null, 2)}

============================
THÓI QUEN NGƯỜI DÙNG:
${userPreferencesText}

============================
YÊU CẦU PHÂN TÍCH (BẮT BUỘC TUÂN THỦ):

**QUAN TRỌNG NHẤT - QUY TẮC THỜI GIAN:**

1. **Mỗi task có 3 thông số:**
   - estimatedDuration: Tổng thời gian cần hoàn thành (VD: 420 phút = 7h)
   - dailyTargetMin: Thời gian tối thiểu mỗi ngày (VD: 60 phút = 1h)
   - dailyTargetMax: Thời gian tối đa mỗi ngày (VD: 180 phút = 3h)

2. **TÍNH SỐ NGÀY CẦN THIẾT:**
   - Số ngày tối thiểu = estimatedDuration ÷ dailyTargetMax (làm tròn lên)
   - VD: 420 phút ÷ 180 phút/ngày = 2.33 → 3 ngày
   - VD: 780 phút ÷ 150 phút/ngày = 5.2 → 6 ngày
   
3. **PHÂN BỔ THỜI GIAN MỖI NGÀY (QUAN TRỌNG):**
   - Task PHẢI xuất hiện LIÊN TỤC từ ngày bắt đầu cho đến khi đủ estimatedDuration
   - **MỖI PHIÊN TRONG NGÀY PHẢI NẰM TRONG KHOẢNG [dailyTargetMin, dailyTargetMax]**
   - **TUYỆT ĐỐI KHÔNG được vượt quá dailyTargetMax**
   - **TỔNG THỜI GIAN TẤT CẢ CÁC PHIÊN = estimatedDuration (SAI SỐ ±5 phút)**
   - Ưu tiên xếp gần dailyTargetMax để hoàn thành sớm hơn deadline
   
4. **VÍ DỤ CỤ THỂ 1:**
   Task: "học tiếng anh", estimatedDuration=420 phút, dailyMin=60, dailyMax=180, deadline=11/3/2026
   
   Cách tính:
   - Số ngày cần: 420 ÷ 180 = 2.33 → 3 ngày
   - Phân bổ: Ngày 1: 180 phút, Ngày 2: 180 phút, Ngày 3: 60 phút
   - Kiểm tra: Mỗi phiên ≤ 180 (dailyMax) ✓
   - Tổng: 180 + 180 + 60 = 420 phút ✓ ĐÚNG
   
   Lịch trình:
   - ${isStartDateToday ? currentDateStr : startDateStr}: 08:00-11:00 (180 phút) ✓
   - Ngày tiếp theo: 08:00-11:00 (180 phút) ✓
   - Ngày tiếp theo: 08:00-09:00 (60 phút) ✓

5. **VÍ DỤ CỤ THỂ 2:**
   Task: "hoc code", estimatedDuration=780 phút (13h), dailyMin=60, dailyMax=150, deadline=14/3/2026
   
   Cách tính:
   - Số ngày cần: 780 ÷ 150 = 5.2 → 6 ngày
   - Phân bổ: 5 ngày × 150 phút + 1 ngày × 30 phút = 780 phút
   - Kiểm tra: Mỗi phiên ≤ 150 (dailyMax) ✓
   - Tổng: 150+150+150+150+150+30 = 780 phút ✓ ĐÚNG
   
   Lịch trình:
   - Ngày 1: 13:00-15:30 (150 phút) ✓ KHÔNG được 180 phút
   - Ngày 2: 13:00-15:30 (150 phút) ✓
   - Ngày 3: 13:00-15:30 (150 phút) ✓
   - Ngày 4: 13:00-15:30 (150 phút) ✓
   - Ngày 5: 13:00-15:30 (150 phút) ✓
   - Ngày 6: 13:00-13:30 (30 phút) ✓

6. **VÍ DỤ SAI (KHÔNG LÀM NHƯ VẦY):**
   Task: "hoc code", estimatedDuration=780 phút, dailyMin=60, dailyMax=150
   
   ❌ SAI: Ngày 1: 180 phút (vượt quá dailyMax=150)
   ❌ SAI: Ngày 2: 200 phút (vượt quá dailyMax=150)
   ❌ SAI: Tổng = 900 phút (khác estimatedDuration=780)
   
   ✓ ĐÚNG: Mỗi ngày tối đa 150 phút, tổng = 780 phút
   
7. **QUY TẮC BẮT ĐẦU TỪ HÔM NAY:**
   ${isStartDateToday
            ? `- HÔM NAY là ${currentDateStr}, giờ hiện tại ${currentHour}:00
   - BẮT BUỘC: Task đầu tiên PHẢI bắt đầu từ HÔM NAY (${currentDateStr})
   - Giờ bắt đầu hôm nay PHẢI >= ${Math.max(currentHour + 1, 8)}:00
   - KHÔNG ĐƯỢC bỏ qua hôm nay và bắt đầu từ ngày mai`
            : `- Bắt đầu từ ${startDateStr}`}

8. **XẾP NHIỀU TASK CÙNG NGÀY:**
   - Mỗi ngày có thể có nhiều task khác nhau
   - Task deadline gần → ưu tiên buổi sáng
   - Buffer 15 phút giữa các task
   - Tổng thời gian/ngày không vượt 8h làm việc
   - **MỖI TASK PHẢI TUÂN THỦ dailyTargetMax của riêng nó**

9. **TITLE TASK:**
   - Giữ NGUYÊN title gốc, KHÔNG thêm "Phiên X/Y"
   - createSubtask = true cho tất cả

============================
VÍ DỤ MINH HỌA:

Task A: "học tiếng anh", estimatedDuration=420 phút (7h), dailyMin=60, dailyMax=180, deadline=11/3/2026
Task B: "hoc code", estimatedDuration=240 phút (4h), dailyMin=60, dailyMax=120, deadline=14/3/2026

Giả sử hôm nay là 07/03/2026, 13:00

**TÍNH TOÁN:**
- Task A: 420 ÷ 180 = 2.33 → 3 ngày (07/03, 08/03, 09/03)
  - 07/03: 180 phút (14:00-17:00, vì hiện tại 13:00)
  - 08/03: 180 phút (08:00-11:00)
  - 09/03: 60 phút (08:00-09:00)
  - Tổng: 420 phút ✓

- Task B: 240 ÷ 120 = 2 ngày (07/03, 08/03)
  - 07/03: 120 phút (không xếp được vì Task A đã chiếm 14:00-17:00)
  - 08/03: 120 phút (13:00-15:00)
  - 09/03: 120 phút (09:15-11:15)
  - Tổng: 240 phút ✓

**LỊCH TRÌNH:**
Ngày 07/03/2026 (HÔM NAY):
- 14:00-17:00: học tiếng anh (180 phút)

Ngày 08/03/2026:
- 08:00-11:00: học tiếng anh (180 phút)
- 13:00-15:00: hoc code (120 phút)

Ngày 09/03/2026:
- 08:00-09:00: học tiếng anh (60 phút)
- 09:15-11:15: hoc code (120 phút)

============================
NGUYÊN TẮC TỐI ƯU (bắt buộc tuân theo):

1. **THỜI GIAN CHÍNH XÁC**: Tổng thời gian các phiên của mỗi task PHẢI BẰNG estimatedDuration (sai số ±5 phút)
2. **BẮT ĐẦU TỪ HÔM NAY**: ${isStartDateToday ? `Task đầu tiên PHẢI bắt đầu từ ${currentDateStr} (hôm nay), giờ >= ${Math.max(currentHour + 1, 8)}:00` : `Bắt đầu từ ${startDateStr}`}
3. **PHÂN BỔ ĐỀU**: Mỗi ngày từ dailyTargetMin đến dailyTargetMax, ưu tiên gần dailyTargetMax
4. **ƯU TIÊN**: Deadline gần/priority cao → buổi sáng (08:00-12:00)
5. **BUFFER**: 15 phút giữa các task
6. **KHÔNG TRÙNG**: Không xếp 2 task cùng giờ
7. **TITLE GỐC**: Giữ nguyên title, không thêm "Phiên X/Y"
8. **LIÊN TỤC**: Task xuất hiện liên tục các ngày cho đến khi đủ estimatedDuration

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
- **KIỂM TRA TỔNG THỜI GIAN**: Sau khi tạo schedule, tính tổng thời gian các phiên của mỗi task, PHẢI BẰNG estimatedDuration của task đó
- ${isStartDateToday ? `**BẮT ĐẦU TỪ HÔM NAY**: Task đầu tiên PHẢI có date = "${currentDateStr}" và giờ >= ${Math.max(currentHour + 1, 8)}:00` : ""}
- Mỗi task PHẢI có reason giải thích rõ ràng
- Không để trùng thời gian giữa các task trong cùng ngày
- Mỗi taskId ĐƯỢC PHÉP xuất hiện lặp lại qua nhiều ngày liên tục
- Title giữ nguyên từ input, KHÔNG thêm "Phiên X/Y" hay gì cả
- Nếu 1 task kéo dài nhiều ngày: createSubtask=true cho mọi phiên
- Mỗi phiên PHẢI có sessionId duy nhất trong toàn bộ schedule
- Tuyệt đối không được xếp task sau deadline của chính task đó
- PHẢI trả về đúng ${totalDays} ngày trong mảng schedule (từ ${startDateStr} đến ${endDateStr})
- Mỗi ngày phải có đầy đủ: day, date, tasks
${isStartDateToday ? `- TUYỆT ĐỐI task đầu tiên phải bắt đầu từ HÔM NAY ${currentDateStr}, không được bỏ qua` : "Tôn trọng khung giờ làm việc 08:00-17:00"}`;
        const result = await ai_provider_1.aiProvider.chat({
            messages: [
                {
                    role: "system",
                    content: "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
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
        let parsed;
        try {
            parsed = JSON.parse((0, ai_utils_1.extractJson)(raw));
        }
        catch {
            try {
                parsed = JSON.parse((0, ai_utils_1.repairTruncatedJson)(raw));
                console.warn("[schedulePlan] JSON was truncated and repaired");
            }
            catch {
                throw new Error("AI_JSON_INVALID");
            }
        }
        if (!Array.isArray(parsed?.schedule) ||
            !Array.isArray(parsed?.suggestedOrder)) {
            throw new Error("AI_RESPONSE_INVALID");
        }
        const validateNow = new Date();
        const validateDateStr = validateNow.toISOString().split("T")[0];
        const validateHour = validateNow.getHours();
        const validateMinute = validateNow.getMinutes();
        const getDayOfWeek = (dateStr) => {
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
        const originalTitlesById = new Map();
        for (const t of tasks) {
            if (t.id) {
                originalTitlesById.set(String(t.id), String(t.title || ""));
            }
        }
        const normalizedSchedule = parsed.schedule.map((day) => {
            const dayDate = String(day?.date ?? "");
            const isToday = dayDate === validateDateStr;
            const validTasks = Array.isArray(day?.tasks)
                ? day.tasks.filter((t) => {
                    const suggestedTime = String(t?.suggestedTime ?? "");
                    if (!isToday)
                        return true;
                    const timeMatch = suggestedTime.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
                    if (!timeMatch)
                        return true;
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
                tasks: validTasks.map((t) => {
                    const taskId = String(t?.taskId ?? "");
                    // Dùng title gốc từ input, không dùng title AI trả về
                    const originalTitle = originalTitlesById.get(taskId);
                    return {
                        sessionId: t?.sessionId !== undefined && t?.sessionId !== null
                            ? String(t.sessionId)
                            : undefined,
                        taskId: taskId,
                        title: originalTitle || String(t?.title ?? ""),
                        priority: String(t?.priority ?? "medium"),
                        suggestedTime: String(t?.suggestedTime ?? ""),
                        reason: String(t?.reason ?? ""),
                        createSubtask: t?.createSubtask !== undefined
                            ? Boolean(t.createSubtask)
                            : undefined,
                    };
                }),
            };
        });
        let sessionCounter = 0;
        const constrainedSchedule = normalizedSchedule
            .slice()
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((day) => {
            const filteredTasks = Array.isArray(day?.tasks)
                ? day.tasks.filter((t) => {
                    const id = String(t?.taskId ?? "");
                    if (!id)
                        return false;
                    const deadlineStr = taskDeadlineById.get(id) ?? null;
                    if (deadlineStr && String(day.date) > deadlineStr) {
                        return false;
                    }
                    return true;
                })
                : [];
            return {
                ...day,
                tasks: filteredTasks.map((t) => ({
                    ...t,
                    sessionId: `session_${++sessionCounter}_${String(t?.taskId ?? "")}_${String(day.date)}`,
                })),
            };
        });
        // VALIDATION: Kiểm tra tổng thời gian của mỗi task
        const totalMinutesByTask = new Map();
        constrainedSchedule.forEach((day) => {
            day.tasks.forEach((t) => {
                const taskId = String(t.taskId);
                const timeMatch = String(t.suggestedTime).match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
                if (timeMatch) {
                    const startHour = parseInt(timeMatch[1], 10);
                    const startMinute = parseInt(timeMatch[2], 10);
                    const endHour = parseInt(timeMatch[3], 10);
                    const endMinute = parseInt(timeMatch[4], 10);
                    const durationMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
                    totalMinutesByTask.set(taskId, (totalMinutesByTask.get(taskId) || 0) + durationMinutes);
                }
            });
        });
        // Log warning nếu tổng thời gian không khớp hoặc vượt quá dailyTargetMax
        tasks.forEach((task) => {
            const taskId = String(task._id);
            const expected = task.estimatedDuration || 0;
            const actual = totalMinutesByTask.get(taskId) || 0;
            const diff = Math.abs(expected - actual);
            // Kiểm tra tổng thời gian
            if (diff > 5 && expected > 0) {
                console.warn(`[AI Schedule Warning] Task "${task.title}" (${taskId}): Expected ${expected} minutes, but scheduled ${actual} minutes (diff: ${diff})`);
            }
            // Kiểm tra dailyTargetMax cho từng phiên
            const dailyMax = task.dailyTargetDuration || 180;
            constrainedSchedule.forEach((day) => {
                day.tasks.forEach((t) => {
                    if (String(t.taskId) === taskId) {
                        const timeMatch = String(t.suggestedTime).match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
                        if (timeMatch) {
                            const startHour = parseInt(timeMatch[1], 10);
                            const startMinute = parseInt(timeMatch[2], 10);
                            const endHour = parseInt(timeMatch[3], 10);
                            const endMinute = parseInt(timeMatch[4], 10);
                            const sessionDuration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
                            if (sessionDuration > dailyMax) {
                                console.warn(`[AI Schedule Warning] Task "${task.title}" on ${day.date}: Session duration ${sessionDuration} minutes exceeds dailyTargetMax ${dailyMax} minutes`);
                            }
                        }
                    }
                });
            });
        });
        const finalSchedule = constrainedSchedule.map((day, index) => {
            // Kiểm tra nếu là ngày đầu tiên và là hôm nay
            if (index === 0 && day.date === validateDateStr) {
                // Nếu hôm nay không có task nào (do lọc giờ), thêm note
                if (day.tasks.length === 0) {
                    return {
                        ...day,
                        tasks: [],
                        note: "Hôm nay đã hết giờ làm việc, các công việc được chuyển sang ngày mai",
                    };
                }
            }
            return day;
        });
        // Kiểm tra xem có task nào bắt đầu từ hôm nay không (nếu startDate là hôm nay)
        if (isStartDateToday) {
            const hasTaskToday = finalSchedule.some((day) => day.date === currentDateStr && day.tasks.length > 0);
            if (!hasTaskToday && currentHour < 17) {
                console.warn(`[AI Schedule Warning] Start date is today (${currentDateStr}) but no tasks scheduled for today. Current hour: ${currentHour}`);
            }
        }
        return {
            schedule: finalSchedule,
            totalTasks: tasks.length,
            suggestedOrder: (() => {
                const uniq = new Set();
                const result = [];
                for (const id of parsed.suggestedOrder || []) {
                    const s = String(id);
                    if (!s || uniq.has(s))
                        continue;
                    uniq.add(s);
                    result.push(s);
                }
                return result;
            })(),
            personalizationNote: String(parsed?.personalizationNote ?? ""),
        };
    },
};
