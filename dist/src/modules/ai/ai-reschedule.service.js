"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRescheduleService = void 0;
const mongoose_1 = require("mongoose");
const task_repository_1 = require("../task/task.repository");
const free_time_service_1 = require("../free-time/free-time.service");
const scheduler_1 = require("../scheduler");
// ───── Helpers ─────
function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function formatHHMM(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function parseHHMMToMinutes(time) {
    const [h, m] = String(time)
        .split(":")
        .map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m))
        return -1;
    return h * 60 + m;
}
function buildOutsideAvailabilityBusySlots(date, availableSlots) {
    const normalized = (Array.isArray(availableSlots) ? availableSlots : [])
        .map((slot) => ({
        start: parseHHMMToMinutes(slot.start),
        end: parseHHMMToMinutes(slot.end),
    }))
        .filter((slot) => slot.start >= 0 && slot.end > slot.start)
        .sort((a, b) => a.start - b.start);
    if (normalized.length === 0) {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(24, 0, 0, 0);
        return [{ start: dayStart, end: dayEnd, taskId: "UNAVAILABLE" }];
    }
    const blocked = [];
    let cursor = 0;
    const toDateAtMinute = (baseDate, minute) => {
        const d = new Date(baseDate);
        d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
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
/** Determine confidence based on productivity score and slot quality */
function determineConfidence(score, hasBusyConflicts) {
    if (score >= 0.75 && !hasBusyConflicts)
        return "high";
    if (score >= 0.5)
        return "medium";
    return "low";
}
/** Build a human-readable reason for a slot */
function buildSlotReason(score, hour, isToday) {
    const pct = Math.round(score * 100);
    const timeLabel = hour < 12 ? "buổi sáng" : hour < 18 ? "buổi chiều" : "buổi tối";
    const dayLabel = isToday ? "hôm nay" : "";
    return `Khung ${timeLabel}${dayLabel ? ` ${dayLabel}` : ""} có năng suất ${pct}%`;
}
// ───── Reason-to-advice mapping ─────
const ADVICE_MAP = {
    missed: "Hãy đặt nhắc nhở trước 10 phút và bắt đầu đúng giờ để tạo thói quen tốt.",
    overlapping: "Khi lên lịch, hãy để buffer 15 phút giữa các task để tránh trùng lịch.",
    too_short: "Hãy ước lượng thời gian thực tế hơn khi tạo task — thêm 20% buffer cho bất ngờ.",
    manual: "Nếu thường xuyên hoãn task này, hãy chia nhỏ thành các bước dễ bắt đầu hơn.",
};
// ───── Main service ─────
exports.aiRescheduleService = {
    /**
     * Algorithm-based smart reschedule (no AI LLM call).
     * Uses slotFinder + productivityScorer to find optimal slots deterministically.
     * Returns same response shape as the old AI-based version for FE compatibility.
     */
    smartReschedule: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const { missedTask, reason = "missed" } = input;
        // ── Determine task duration ──
        let duration = missedTask.estimatedDuration || 60;
        if (reason === "too_short" && missedTask.originalScheduledTime) {
            const origDuration = Math.round((new Date(missedTask.originalScheduledTime.end).getTime() -
                new Date(missedTask.originalScheduledTime.start).getTime()) /
                (1000 * 60));
            // Increase duration by 50% if it was too short
            duration = Math.max(duration, Math.round(origDuration * 1.5));
        }
        // ── Build productivity scores from user history ──
        const allUserTasks = await task_repository_1.taskRepository.listByUser({
            userId: userObjectId,
            page: 1,
            limit: 500,
        });
        const completedTasksHistory = [];
        allUserTasks.items.forEach((task) => {
            if (task.scheduledTime?.start) {
                const start = new Date(task.scheduledTime.start);
                completedTasksHistory.push({
                    hour: start.getHours(),
                    completed: task.status === "completed" || task.status === "done",
                    duration: task.estimatedDuration || 60,
                });
            }
        });
        const productivityScores = scheduler_1.productivityScorer.calculateHourlyScores(completedTasksHistory, 30);
        // ── Scan up to 7 days (or until deadline) for free slots ──
        const now = new Date();
        const deadline = missedTask.deadline
            ? new Date(missedTask.deadline)
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const searchEnd = new Date(Math.min(deadline.getTime(), now.getTime() + 7 * 24 * 60 * 60 * 1000));
        // Collect existing busy slots from scheduled tasks
        const scheduledTasks = await task_repository_1.taskRepository.getScheduledTasks({
            userId: userObjectId,
            startDate: now,
            endDate: searchEnd,
            excludeTaskIds: [missedTask.id].filter((id) => mongoose_1.Types.ObjectId.isValid(id)),
        });
        const scoredSlots = [];
        const todayStr = toLocalDateStr(now);
        let currentDate = new Date(now);
        while (currentDate <= searchEnd && scoredSlots.length < 10) {
            const dateStr = toLocalDateStr(currentDate);
            // Build busy slots for this day
            const dayBusy = scheduledTasks
                .filter((t) => {
                if (!t.scheduledTime?.start)
                    return false;
                return toLocalDateStr(new Date(t.scheduledTime.start)) === dateStr;
            })
                .map((t) => ({
                start: new Date(t.scheduledTime.start),
                end: new Date(t.scheduledTime.end),
                taskId: String(t._id),
            }));
            // Add user availability constraints
            const availableSlots = await free_time_service_1.freeTimeService.getAvailableSlotsForDate(userId, new Date(currentDate));
            const outsideBusy = buildOutsideAvailabilityBusySlots(new Date(currentDate), availableSlots);
            const allBusy = [...dayBusy, ...outsideBusy];
            // Find optimal slot using productivity scores
            const optimalSlot = scheduler_1.slotFinder.findOptimalSlot({
                taskDuration: duration,
                productivityScores,
                busySlots: allBusy,
                date: new Date(currentDate),
                workHours: { start: 0, end: 24 },
                currentTime: now,
            });
            if (optimalSlot) {
                const slotEnd = new Date(optimalSlot.start.getTime() + duration * 60 * 1000);
                // Verify no conflict
                const conflict = scheduler_1.intervalScheduler.checkConflict({ start: optimalSlot.start, end: slotEnd, taskId: missedTask.id }, allBusy);
                if (!conflict.hasConflict) {
                    scoredSlots.push({
                        start: optimalSlot.start,
                        end: slotEnd,
                        date: dateStr,
                        score: optimalSlot.productivityScore,
                        isToday: dateStr === todayStr,
                    });
                }
            }
            // Also find additional free slots for alternatives
            const freeSlots = scheduler_1.slotFinder.findFreeSlots({
                busySlots: allBusy,
                date: new Date(currentDate),
                minDuration: duration,
                workHours: { start: 0, end: 24 },
                currentTime: now,
            });
            for (const free of freeSlots) {
                const slotEnd = new Date(free.start.getTime() + duration * 60 * 1000);
                // Skip if already added as optimal
                const isDuplicate = scoredSlots.some((s) => s.start.getTime() === free.start.getTime() && s.date === dateStr);
                if (!isDuplicate && scoredSlots.length < 10) {
                    const prodScore = productivityScores.get(free.start.getHours())?.score ?? 0.5;
                    scoredSlots.push({
                        start: free.start,
                        end: slotEnd,
                        date: dateStr,
                        score: prodScore,
                        isToday: dateStr === todayStr,
                    });
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        // ── Rank slots ──
        // Priority: today first (if deadline is near), then by productivity score
        const deadlineUrgent = missedTask.deadline &&
            new Date(missedTask.deadline).getTime() - now.getTime() <
                2 * 24 * 60 * 60 * 1000;
        scoredSlots.sort((a, b) => {
            // Prefer today if urgent
            if (deadlineUrgent) {
                if (a.isToday && !b.isToday)
                    return -1;
                if (!a.isToday && b.isToday)
                    return 1;
            }
            // Then by score
            return b.score - a.score;
        });
        // ── Build response ──
        if (scoredSlots.length === 0) {
            return {
                suggestion: {
                    newStartTime: "09:00",
                    newEndTime: formatHHMM(new Date(new Date(`${todayStr}T09:00:00`).getTime() + duration * 60 * 1000)),
                    newDate: todayStr,
                    reason: "Không tìm thấy slot trống phù hợp, đề xuất mặc định",
                    confidence: "low",
                },
                advice: ADVICE_MAP[reason] ||
                    "Hãy cố gắng bắt đầu task đúng giờ để tạo thói quen tốt.",
            };
        }
        const best = scoredSlots[0];
        const alternatives = scoredSlots.slice(1, 4);
        return {
            suggestion: {
                newStartTime: formatHHMM(best.start),
                newEndTime: formatHHMM(best.end),
                newDate: best.date,
                reason: buildSlotReason(best.score, best.start.getHours(), best.isToday),
                confidence: determineConfidence(best.score, false),
            },
            alternativeSlots: alternatives.length > 0
                ? alternatives.map((slot) => ({
                    date: slot.date,
                    startTime: formatHHMM(slot.start),
                    endTime: formatHHMM(slot.end),
                    reason: buildSlotReason(slot.score, slot.start.getHours(), slot.isToday),
                }))
                : undefined,
            advice: ADVICE_MAP[reason] ||
                "Hãy cố gắng bắt đầu task đúng giờ để tạo thói quen tốt.",
        };
    },
};
