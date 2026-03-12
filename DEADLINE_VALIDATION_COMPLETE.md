# Deadline Validation & Critical Bug Fixes - COMPLETE ✅

## Ngày: 11/03/2026

## Tổng quan

Đã hoàn thành việc implement deadline validation system và fix 4 critical bugs liên quan đến scheduling.

---

## ✅ PHASE 1: Deadline Validation System

### 1. Pre-Schedule Validation

**File**: `hybrid-schedule.service.ts`

Thêm validation TRƯỚC khi chạy algorithm:

```typescript
// Tính số ngày còn lại đến deadline
const daysLeft =
  Math.ceil(
    (new Date(deadlineStr).getTime() - new Date(todayStr).getTime()) /
      (1000 * 60 * 60 * 24),
  ) + 1;

// Tính thời gian tối đa có thể xếp
const maxPossibleMinutes = daysLeft * dailyTargetMax;
const requiredMinutes = task.estimatedDuration ?? 0;

// Nếu không khả thi → thêm warning
if (requiredMinutes > maxPossibleMinutes) {
  warnings.push({
    taskId: String(task._id),
    title: task.title,
    feasible: false,
    daysLeft,
    maxPossibleHours,
    requiredHours,
    shortfallHours,
    message: "Không đủ thời gian: cần Xh nhưng chỉ còn Y ngày...",
  });
}
```

### 2. Strict Deadline Enforcement

**Thay đổi**:

- ❌ REMOVED: Overflow mode (14 ngày extra)
- ✅ ADDED: Strict deadline check - không schedule vượt deadline
- ✅ ADDED: Filter empty days beyond deadline

```typescript
// Loại bỏ overflow mode
const hardEndDate = new Date(endDate); // Không còn +14 ngày

// Strict check trong scheduleTaskChunksForDay
if (task.deadline && dateStr > toLocalDateStr(new Date(task.deadline))) {
  return; // Skip ngay, không có allowAfterDeadline
}
```

### 3. Filter Empty Days

```typescript
// Lọc bỏ ngày rỗng sau deadline
const latestDeadline = tasks.reduce((max, t) => {
  if (!t.deadline) return max;
  const d = toLocalDateStr(new Date(t.deadline));
  return !max || d > max ? d : max;
}, null);

const filteredSchedule = schedule.filter((day) => {
  if (day.tasks.length > 0) return true; // Giữ ngày có task
  if (latestDeadline && day.date > latestDeadline) return false; // Bỏ ngày rỗng sau deadline
  return true;
});
```

### 4. Improved Warning Messages

```typescript
personalizationNote: (aiAnalysis.personalizationNote || `...`) +
  (remainingSummary
    ? ` | ⚠️ Không đủ thời gian trước deadline: ${remainingSummary}. 
        Bạn nên tăng mục tiêu/ngày hoặc gia hạn deadline.`
    : "");
```

### 5. Response Type Update

```typescript
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
```

---

## ✅ PHASE 2: Critical Bug Fixes

### Bug #1: Timezone Issue in Slot Finder ⚠️ CRITICAL

**File**: `slot-finder.service.ts`

**Problem**:

- Dùng `toISOString()` để so sánh ngày → sai timezone
- User ở Vietnam (UTC+7) lúc 00:30 ngày 12/3 → `toISOString()` vẫn ra "2026-03-11"

**Fix**:

```typescript
// ❌ BEFORE
const dateStr = date.toISOString().split("T")[0];
const currentDateStr = currentTime.toISOString().split("T")[0];

// ✅ AFTER
const dateStr = toLocalDateStr(date);
const currentDateStr = toLocalDateStr(currentTime);
```

### Bug #2: Missing currentTime Parameter ⚠️ ROOT CAUSE

**File**: `hybrid-schedule.service.ts`

**Problem**:

- `findOptimalSlotWithFallback` không pass `currentTime` vào `slotFinder`
- Logic block giờ quá khứ không hoạt động → lịch hôm nay bị rỗng

**Fix**:

```typescript
// Tạo currentTime một lần
const now = new Date();

// Pass vào findOptimalSlotWithFallback
const { slot: optimalSlot, duration: actualDuration } =
  findOptimalSlotWithFallback({
    // ... other params
    currentTime: now, // ✅ Thêm dòng này
  });
```

### Bug #3: Work Hours Validation Incorrect

**File**: `scheduler.service.ts`

**Problem**:

- Dùng `endHour` để check → không bắt được task kết thúc 23:01 (endHour vẫn là 23)

**Fix**:

```typescript
// ❌ BEFORE
const endHour = slot.end.getHours();
if (startHour < workHours.start || endHour > workHours.end) { ... }

// ✅ AFTER
const startMinutes = slot.start.getHours() * 60 + slot.start.getMinutes();
const endMinutes = slot.end.getHours() * 60 + slot.end.getMinutes();
const workStartMinutes = workHours.start * 60;
const workEndMinutes = workHours.end * 60;

if (startMinutes < workStartMinutes || endMinutes > workEndMinutes) { ... }
```

### Bug #4: Remaining Minutes Calculation ✅ ALREADY FIXED

**File**: `hybrid-schedule.service.ts`

**Status**: Đã được fix trước đó

```typescript
const isBeingScheduled = input.taskIds.some(
  (id) =>
    Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === taskId,
);

if (!isBeingScheduled && remainingMinutesByTaskId.has(taskId)) {
  remainingMinutesByTaskId.set(
    taskId,
    Math.max(0, (remainingMinutesByTaskId.get(taskId) || 0) - duration),
  );
}
```

---

## 📦 Cache Version Update

**File**: `cache-version.ts`

```typescript
SCHEDULER: "v5"; // Tăng từ v4 → v5
```

**Changelog**:

- Thêm deadline validation trước khi schedule
- Tính toán feasibility: daysLeft × dailyTargetMax vs estimatedDuration
- Trả về warnings array với thông tin chi tiết
- Loại bỏ overflow mode - không cho phép schedule vượt deadline
- Lọc bỏ ngày rỗng sau deadline trong response
- Cải thiện personalizationNote với gợi ý hành động cụ thể
- Fix timezone issue (toISOString → toLocalDateStr)
- Fix missing currentTime parameter
- Fix work hours validation (hour → minutes)

---

## 🧪 Test Case

### Scenario: Task không khả thi

**Input**:

- Task: "Học TypeScript"
- Estimated Duration: 15h (900 phút)
- Daily Target Max: 2h/ngày (120 phút)
- Deadline: 17/03/2026 (00:00)
- Hôm nay: 11/03/2026

**Calculation**:

- Số ngày còn lại: 6 ngày (11, 12, 13, 14, 15, 16/03)
- Max có thể xếp: 6 × 2h = 12h
- Cần: 15h
- Thiếu: 3h

**Expected Output**:

```json
{
  "schedule": [...], // Chỉ schedule tối đa 12h, không vượt 17/03
  "warnings": [
    {
      "taskId": "...",
      "title": "Học TypeScript",
      "feasible": false,
      "daysLeft": 6,
      "maxPossibleHours": 12,
      "requiredHours": 15,
      "shortfallHours": 3,
      "message": "Không đủ thời gian: cần 15h nhưng chỉ còn 6 ngày × 2h/ngày = 12h. Thiếu 3h."
    }
  ],
  "personalizationNote": "... | ⚠️ Không đủ thời gian trước deadline: Học TypeScript: còn thiếu 180 phút. Bạn nên tăng mục tiêu/ngày hoặc gia hạn deadline."
}
```

---

## 📋 Files Changed

1. ✅ `src/modules/scheduler/hybrid-schedule.service.ts`
   - Thêm deadline validation
   - Loại bỏ overflow mode
   - Filter empty days
   - Pass currentTime parameter
   - Improve warning messages

2. ✅ `src/modules/scheduler/slot-finder.service.ts`
   - Fix timezone issue (toISOString → toLocalDateStr)
   - Add toLocalDateStr helper function

3. ✅ `src/modules/scheduler/scheduler.service.ts`
   - Fix work hours validation (hour → minutes)

4. ✅ `src/config/cache-version.ts`
   - Increment SCHEDULER version: v4 → v5
   - Update changelog

---

## 🎯 Next Steps (Frontend)

### UI Warning Dialog

Khi nhận được `warnings` array, hiển thị dialog:

```
⚠️ Không đủ thời gian hoàn thành trước deadline

Task: Học TypeScript
Cần: 15h | Có thể xếp: 12h | Thiếu: 3h

Bạn muốn:
[ ] Tăng mục tiêu/ngày lên 2.5h (15h ÷ 6 ngày)
[ ] Gia hạn deadline thêm 2 ngày
[ ] Hủy - Không áp dụng lịch
```

### API Integration

```typescript
const response = await scheduleAPI.schedulePlan({
  taskIds: [...],
  startDate: new Date()
});

if (response.warnings && response.warnings.length > 0) {
  // Show warning dialog
  showWarningDialog(response.warnings);
} else {
  // Apply schedule normally
  applySchedule(response.schedule);
}
```

---

## ✅ Status: COMPLETE

Tất cả 4 bugs đã được fix và deadline validation system đã hoàn thành.
Cache version đã được tăng lên v5 để invalidate old cache.

**Ready for testing!** 🚀
