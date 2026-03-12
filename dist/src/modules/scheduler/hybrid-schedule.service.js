"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hybridScheduleService = void 0;
const mongoose_1 = require("mongoose");
const ai_provider_1 = require("../ai/ai.provider");
const task_repository_1 = require("../task/task.repository");
const user_habit_repository_1 = require("../user/user-habit.repository");
const ai_utils_1 = require("../ai/ai-utils");
const scheduler_1 = require("../scheduler");
/**
 * HYBRID AI + Algorithm Schedule Service
 * AI chỉ phân tích high-level, backend algorithm chọn giờ cụ thể
 */
exports.hybridScheduleService = {
    /**
     * Main: Tạo schedule kết hợp AI + Algorithms
     * - AI: Phân tích difficulty, priority, suggested order
     * - Algorithms: Chọn giờ cụ thể, detect conflict, optimize
     */
    schedulePlan: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        // 1. Fetch tasks
        const tasks = [];
        for (const taskId of input.taskIds) {
            if (!mongoose_1.Types.ObjectId.isValid(taskId))
                continue;
            const task = await task_repository_1.taskRepository.findByIdForUser({
                taskId,
                userId: userObjectId,
            });
            if (task)
                tasks.push(task);
        }
        if (tasks.length === 0) {
            throw new Error("NO_VALID_TASKS");
        }
        // 2. Lấy dữ liệu productivity từ lịch sử
        const productivityAnalysis = await user_habit_repository_1.userHabitRepository.analyzeProductivity(userId);
        // Build productivity scores từ history
        const completedTasksHistory = [];
        // Lấy tasks đã hoàn thành để tính productivity
        const allUserTasks = await task_repository_1.taskRepository.listByUser({
            userId: userObjectId,
            page: 1,
            limit: 1000,
        });
        allUserTasks.items.forEach((task) => {
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
        const productivityScores = scheduler_1.productivityScorer.calculateHourlyScores(completedTasksHistory, 30);
        const findOptimalSlotWithFallback = (params) => {
            const step = Math.max(1, Math.floor(params.stepMinutes));
            const min = Math.max(1, Math.floor(params.minDuration));
            let duration = Math.floor(params.preferredDuration);
            while (duration >= min) {
                const slot = scheduler_1.slotFinder.findOptimalSlot({
                    taskDuration: duration,
                    preferredTimeOfDay: params.preferredTimeOfDay,
                    productivityScores: params.productivityScores,
                    busySlots: params.busySlots,
                    date: params.date,
                    workHours: params.workHours,
                });
                if (slot) {
                    return { slot, duration };
                }
                duration -= step;
            }
            return { slot: null, duration: 0 };
        };
        const priorityWeight = (p) => {
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
        const dateOnlyStr = (d) => d ? toLocalDateStr(new Date(d)) : null;
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
        const aiResult = await ai_provider_1.aiProvider.chat({
            messages: [
                {
                    role: "system",
                    content: "You are a task analysis assistant. Reply in Vietnamese. Output valid JSON only.",
                },
                { role: "user", content: aiPrompt },
            ],
            temperature: 0.3,
            maxTokens: 2000, // Giảm từ 8000 xuống 2000
        });
        let aiAnalysis;
        try {
            aiAnalysis = JSON.parse((0, ai_utils_1.extractJson)(aiResult.content || "{}"));
        }
        catch {
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
        for (const t of tasks) {
            if (t.deadline) {
                const d = new Date(t.deadline);
                if (d > endDate) {
                    endDate.setTime(d.getTime());
                }
            }
        }
        // Mode B: allow extending beyond deadline/endDate to try to fully schedule
        const normalEndDate = new Date(endDate);
        const overflowExtraDays = 14;
        const hardEndDate = new Date(normalEndDate);
        hardEndDate.setDate(hardEndDate.getDate() + overflowExtraDays);
        // ⭐ NEW: Get scheduled tasks to avoid conflicts
        const scheduledTasks = await task_repository_1.taskRepository.getScheduledTasks({
            userId: userObjectId,
            startDate,
            endDate: hardEndDate,
        });
        console.log(`[Conflict Detection] Found ${scheduledTasks.length} scheduled tasks`);
        // Convert scheduled tasks to busy slots by date
        const existingBusySlotsByDate = new Map();
        for (const scheduledTask of scheduledTasks) {
            if (scheduledTask.scheduledTime?.start &&
                scheduledTask.scheduledTime?.end) {
                const taskDate = toLocalDateStr(new Date(scheduledTask.scheduledTime.start));
                const busySlot = {
                    start: new Date(scheduledTask.scheduledTime.start),
                    end: new Date(scheduledTask.scheduledTime.end),
                    taskId: String(scheduledTask._id),
                };
                if (!existingBusySlotsByDate.has(taskDate)) {
                    existingBusySlotsByDate.set(taskDate, []);
                }
                existingBusySlotsByDate.get(taskDate).push(busySlot);
            }
        }
        const schedule = [];
        const stats = {
            aiConflictsDetected: 0,
            autoRescheduled: 0,
            productivityOptimized: 0,
        };
        let currentDate = new Date(startDate);
        let sessionCounter = 0;
        // Track busy slots và daily scheduled time theo ngày
        const busySlotsByDate = new Map();
        const dailyScheduledMinutesByTask = new Map();
        // Initialize busySlotsByDate with existing scheduled tasks
        for (const [dateStr, slots] of existingBusySlotsByDate.entries()) {
            busySlotsByDate.set(dateStr, [...slots]);
        }
        // Track remaining duration per task (minutes)
        const remainingMinutesByTaskId = new Map();
        tasks.forEach((t) => {
            remainingMinutesByTaskId.set(String(t._id), Math.max(0, Number(t.estimatedDuration ?? 0)));
        });
        // Lấy các task đã scheduled trước đó (preserve existing)
        const existingScheduledTasks = allUserTasks.items.filter((task) => task.scheduledTime?.start && task.scheduledTime?.end);
        // Khởi tạo daily scheduled time từ existing tasks
        existingScheduledTasks.forEach((task) => {
            const dateStr = toLocalDateStr(new Date(task.scheduledTime.start));
            const duration = task.estimatedDuration || 60;
            const taskId = String(task._id);
            const perTask = dailyScheduledMinutesByTask.get(dateStr) || new Map();
            perTask.set(taskId, (perTask.get(taskId) || 0) + duration);
            dailyScheduledMinutesByTask.set(dateStr, perTask);
            // Reduce remaining minutes if this task is already scheduled
            if (remainingMinutesByTaskId.has(taskId)) {
                remainingMinutesByTaskId.set(taskId, Math.max(0, (remainingMinutesByTaskId.get(taskId) || 0) - duration));
            }
            // Add vào busy slots
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
            const isOverflowDay = currentDate.getTime() > normalEndDate.getTime();
            const daySchedule = {
                day: getDayOfWeek(dateStr),
                date: dateStr,
                tasks: [],
            };
            // Lấy busy slots của ngày này (từ các ngày trước đã schedule)
            const existingBusySlots = busySlotsByDate.get(dateStr) || [];
            // Sort tasks: deadline gần hơn trước, sau đó priority cao hơn
            const baseOrder = (Array.isArray(aiAnalysis.suggestedOrder)
                ? aiAnalysis.suggestedOrder
                : []);
            const fallbackOrder = tasks.map((t) => String(t._id));
            const merged = [...baseOrder, ...fallbackOrder].filter((id, idx, arr) => arr.indexOf(id) === idx);
            const sortedTaskIds = merged.sort((a, b) => {
                const ta = tasks.find((t) => String(t._id) === a);
                const tb = tasks.find((t) => String(t._id) === b);
                const da = dateOnlyStr(ta?.deadline);
                const db = dateOnlyStr(tb?.deadline);
                if (da && db && da !== db)
                    return da < db ? -1 : 1;
                if (da && !db)
                    return -1;
                if (!da && db)
                    return 1;
                const pa = priorityWeight(ta?.priority);
                const pb = priorityWeight(tb?.priority);
                if (pa !== pb)
                    return pb - pa;
                return 0;
            });
            const scheduleTaskChunksForDay = async (task, mode, opts) => {
                const remainingForTask = remainingMinutesByTaskId.get(String(task._id)) || 0;
                if (remainingForTask <= 0)
                    return;
                // Skip nếu đã qua deadline
                if (task.deadline &&
                    dateStr > toLocalDateStr(new Date(task.deadline))) {
                    if (!opts?.allowAfterDeadline) {
                        return;
                    }
                }
                const dailyTargetMax = opts?.dailyTargetMaxOverride ?? task.dailyTargetDuration ?? 180; // Mặc định 3h/ngày thay vì remainingForTask
                const dailyTargetMin = opts?.dailyTargetMinOverride ?? task.dailyTargetMin ?? 60; // Mặc định 1h/ngày thay vì 80% của max
                const difficulty = aiAnalysis.difficultyAnalysis?.[String(task._id)] ||
                    aiAnalysis.difficultyAnalysis?.[String(task.id)] ||
                    "medium";
                const requiresFocus = difficulty === "hard";
                const preferredTimeOfDay = requiresFocus ? "morning" : undefined;
                const stepMinutes = 15;
                const minChunkMinutes = 15;
                while (true) {
                    const remainingForTaskNow = remainingMinutesByTaskId.get(String(task._id)) || 0;
                    if (remainingForTaskNow <= 0)
                        break;
                    const mapForDay = dailyScheduledMinutesByTask.get(dateStr) ||
                        new Map();
                    const scheduledToday = mapForDay.get(String(task._id)) || 0;
                    if (mode === "reachMin" && scheduledToday >= dailyTargetMin) {
                        break;
                    }
                    if (mode === "fillMax" && scheduledToday >= dailyTargetMax) {
                        break;
                    }
                    const remainingToMaxToday = Math.max(0, dailyTargetMax - scheduledToday);
                    if (remainingToMaxToday <= 0)
                        break;
                    const remainingToMinToday = Math.max(0, dailyTargetMin - scheduledToday);
                    let preferredDuration = mode === "reachMin"
                        ? Math.min(remainingToMinToday, remainingToMaxToday)
                        : remainingToMaxToday;
                    preferredDuration = Math.min(preferredDuration, remainingForTaskNow);
                    if (preferredDuration <= 0)
                        break;
                    const { slot: optimalSlot, duration: actualDuration } = findOptimalSlotWithFallback({
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
                                { start: 17.5, end: 19.5 }, // 17:30-19:30 nghỉ tối
                            ],
                        },
                        bufferMinutes: 15, // 15 phút nghỉ giữa các task
                    });
                    if (!optimalSlot || actualDuration <= 0) {
                        break;
                    }
                    const intendedEnd = new Date(optimalSlot.start.getTime() + actualDuration * 60 * 1000);
                    const newTaskInterval = {
                        start: optimalSlot.start,
                        end: intendedEnd,
                        taskId: String(task._id),
                    };
                    const conflict = scheduler_1.intervalScheduler.checkConflict(newTaskInterval, existingBusySlots);
                    let finalSlot = optimalSlot;
                    let rescheduled = false;
                    if (conflict.hasConflict && conflict.suggestedNewSlot) {
                        finalSlot = {
                            start: conflict.suggestedNewSlot.start,
                            end: new Date(conflict.suggestedNewSlot.start.getTime() +
                                actualDuration * 60 * 1000),
                            duration: actualDuration,
                            productivityScore: 0.5,
                        };
                        stats.aiConflictsDetected++;
                        stats.autoRescheduled++;
                        rescheduled = true;
                    }
                    else {
                        finalSlot = {
                            ...optimalSlot,
                            end: intendedEnd,
                            duration: actualDuration,
                        };
                        stats.productivityOptimized++;
                    }
                    const hour = finalSlot.start.getHours();
                    const prodScore = productivityScores.get(hour)?.score || 0.5;
                    const sessionId = `session_${++sessionCounter}_${String(task._id)}_${dateStr}`;
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
                    const scheduledMinutes = (finalSlot.end.getTime() - finalSlot.start.getTime()) / (1000 * 60);
                    mapForDay.set(String(task._id), scheduledToday + scheduledMinutes);
                    dailyScheduledMinutesByTask.set(dateStr, mapForDay);
                    remainingMinutesByTaskId.set(String(task._id), Math.max(0, remainingForTaskNow - scheduledMinutes));
                }
            };
            if (!isOverflowDay) {
                // Phase 1: reach min for each task (in priority order)
                for (const taskId of sortedTaskIds) {
                    const task = tasks.find((t) => String(t._id) === taskId);
                    if (!task)
                        continue;
                    await scheduleTaskChunksForDay(task, "reachMin");
                }
                // Phase 2: fill toward max if still have time available
                for (const taskId of sortedTaskIds) {
                    const task = tasks.find((t) => String(t._id) === taskId);
                    if (!task)
                        continue;
                    await scheduleTaskChunksForDay(task, "fillMax");
                }
            }
            else {
                // Overflow days (Mode B): ignore deadline and allow exceeding dailyTargetMax
                // Use a very large daily max so the scheduler can continue allocating until remaining = 0.
                const overflowDailyMax = 24 * 60;
                for (const taskId of sortedTaskIds) {
                    const task = tasks.find((t) => String(t._id) === taskId);
                    if (!task)
                        continue;
                    await scheduleTaskChunksForDay(task, "fillMax", {
                        allowAfterDeadline: true,
                        dailyTargetMaxOverride: overflowDailyMax,
                        dailyTargetMinOverride: 0,
                    });
                }
            }
            // Always push the day to avoid missing days in UI
            schedule.push(daySchedule);
            // Stop early if all tasks are fully scheduled
            const stillRemaining = Array.from(remainingMinutesByTaskId.values()).some((v) => v > 0);
            if (!stillRemaining) {
                break;
            }
            // Next day
            currentDate.setDate(currentDate.getDate() + 1);
        }
        const remainingSummary = tasks
            .map((t) => {
            const remaining = remainingMinutesByTaskId.get(String(t._id)) || 0;
            return { id: String(t._id), title: String(t.title || ""), remaining };
        })
            .filter((x) => x.remaining > 0)
            .map((x) => `${x.title}: còn thiếu ${x.remaining} phút`)
            .join(", ");
        // VALIDATION: Kiểm tra tổng thời gian và dailyTargetMax
        tasks.forEach((task) => {
            const taskId = String(task._id);
            const expected = task.estimatedDuration || 0;
            const scheduled = (task.estimatedDuration || 0) -
                (remainingMinutesByTaskId.get(taskId) || 0);
            const diff = Math.abs(expected - scheduled);
            if (diff > 5 && expected > 0) {
                console.warn(`[Hybrid Schedule] Task "${task.title}": Expected ${expected}min, scheduled ${scheduled}min (remaining: ${remainingMinutesByTaskId.get(taskId) || 0}min)`);
            }
            // Kiểm tra dailyTargetMax
            const dailyMax = task.dailyTargetDuration || 180;
            schedule.forEach((day) => {
                day.tasks.forEach((t) => {
                    if (String(t.taskId) === taskId) {
                        const timeMatch = String(t.suggestedTime).match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
                        if (timeMatch) {
                            const startHour = parseInt(timeMatch[1], 10);
                            const startMinute = parseInt(timeMatch[2], 10);
                            const endHour = parseInt(timeMatch[3], 10);
                            const endMinute = parseInt(timeMatch[4], 10);
                            const sessionDuration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
                            if (sessionDuration > dailyMax + 5) {
                                // +5 phút tolerance
                                console.warn(`[Hybrid Schedule] Task "${task.title}" on ${day.date}: Session ${sessionDuration}min exceeds dailyTargetMax ${dailyMax}min`);
                            }
                        }
                    }
                });
            });
        });
        return {
            schedule,
            totalTasks: tasks.length,
            suggestedOrder: aiAnalysis.suggestedOrder || tasks.map((t) => String(t._id)),
            personalizationNote: (aiAnalysis.personalizationNote ||
                `Lịch trình được tối ưu với ${stats.productivityOptimized} tasks theo thói quen của bạn`) +
                (remainingSummary
                    ? ` | Chưa xếp đủ do giới hạn slot/khung giờ/deadline: ${remainingSummary}`
                    : ""),
            stats,
        };
    },
    /**
     * Reschedule task bị miss - dùng algorithm không cần AI
     */
    smartReschedule: async (userId, taskId, fromTime, reason = "missed") => {
        // 1. Lấy task info
        const task = await task_repository_1.taskRepository.findByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!task)
            throw new Error("TASK_NOT_FOUND");
        // 2. Lấy busy slots từ bây giờ đến deadline
        const now = new Date();
        const deadline = task.deadline || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        // 3. Find free slots
        const freeSlots = [];
        let currentDate = new Date(now);
        while (currentDate <= deadline && freeSlots.length < 5) {
            // TODO: Get actual busy slots from repository
            const busySlots = []; // Placeholder
            const slots = scheduler_1.slotFinder.findFreeSlots({
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
            advice: reason === "missed"
                ? "Bạn bỏ lỡ task này. Đã tìm slot mới phù hợp với thói quen của bạn."
                : "Đã tìm slot mới không trùng lịch.",
        };
    },
};
// Helper functions
function getDayOfWeek(dateStr) {
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
function formatTimeRange(start, end) {
    const formatTime = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${formatTime(start)} - ${formatTime(end)}`;
}
function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
