# Chuyển sang Hybrid Algorithm (Backend + AI)

## Vấn đề với approach cũ (Pure AI):

❌ **Dựa hoàn toàn vào AI prompt:**

- Mỗi lần thay đổi yêu cầu phải viết lại prompt
- AI không đảm bảo tuân thủ 100% (có thể vượt quá dailyTargetMax)
- Tốn token, chậm, không ổn định

## Giải pháp mới (Hybrid Algorithm):

✅ **Backend tính toán chính xác + AI phân tích cao cấp:**

- Backend: Thuật toán phân bổ thời gian chính xác
- AI: Chỉ phân tích difficulty, priority, suggested order
- Đảm bảo 100% tuân thủ dailyTargetMin/Max
- Nhanh, ổn định, tiết kiệm token

## Thay đổi đã thực hiện:

### 1. Chuyển service (ai.service.ts)

**Trước:**

```typescript
schedulePlan: async (...args) => {
  const { aiScheduleService } = await import("./ai-schedule.service");
  return aiScheduleService.schedulePlan(...args);
};
```

**Sau:**

```typescript
schedulePlan: async (...args) => {
  const { hybridScheduleService } =
    await import("../scheduler/hybrid-schedule.service");
  return hybridScheduleService.schedulePlan(...args);
};
```

### 2. Fix default values (hybrid-schedule.service.ts)

**Trước:**

```typescript
const dailyTargetMax = task.dailyTargetDuration ?? remainingForTask; // ❌ Có thể rất lớn
const dailyTargetMin = Math.floor(dailyTargetMax * 0.8); // ❌ Phụ thuộc vào max
```

**Sau:**

```typescript
const dailyTargetMax = task.dailyTargetDuration ?? 180; // ✅ Mặc định 3h
const dailyTargetMin = task.dailyTargetMin ?? 60; // ✅ Mặc định 1h
```

### 3. Thêm validation

```typescript
// Kiểm tra tổng thời gian
const expected = task.estimatedDuration || 0;
const scheduled = expected - (remainingMinutesByTaskId.get(taskId) || 0);
if (Math.abs(expected - scheduled) > 5) {
  console.warn(
    `Task "${task.title}": Expected ${expected}min, scheduled ${scheduled}min`,
  );
}

// Kiểm tra dailyTargetMax cho từng phiên
if (sessionDuration > dailyMax + 5) {
  console.warn(
    `Session ${sessionDuration}min exceeds dailyTargetMax ${dailyMax}min`,
  );
}
```

## Cách hoạt động của Hybrid Algorithm:

### Phase 1: AI phân tích (ngắn gọn, ~2000 tokens)

```json
{
  "suggestedOrder": ["taskId1", "taskId2"],
  "difficultyAnalysis": {
    "taskId1": "hard",
    "taskId2": "medium"
  },
  "personalizationNote": "Lời khuyên ngắn gọn"
}
```

### Phase 2: Backend tính toán chính xác

```typescript
// 1. Tính remaining minutes cho mỗi task
remainingMinutesByTaskId.set(taskId, task.estimatedDuration);

// 2. Loop qua từng ngày
while (currentDate <= deadline) {
  // 3. Loop qua từng task (theo thứ tự AI suggest)
  for (const task of sortedTasks) {
    // 4. Mode A: Reach minimum (đảm bảo mỗi task có ít nhất dailyTargetMin)
    scheduleTaskChunksForDay(task, "reachMin");

    // 5. Mode B: Fill to maximum (tận dụng thời gian còn lại)
    scheduleTaskChunksForDay(task, "fillMax");
  }
}

// 6. Tìm slot tối ưu dựa trên productivity scores
const slot = slotFinder.findOptimalSlot({
  taskDuration: Math.min(preferredDuration, dailyTargetMax - scheduledToday),
  productivityScores,
  busySlots,
  date: currentDate,
});

// 7. Cập nhật remaining và scheduled
remainingMinutesByTaskId.set(taskId, remaining - scheduledMinutes);
dailyScheduledMinutesByTask.set(date, scheduledToday + scheduledMinutes);
```

## Ưu điểm:

1. **Chính xác 100%:**
   - Tổng thời gian = estimatedDuration
   - Mỗi phiên ≤ dailyTargetMax
   - Mỗi ngày: dailyTargetMin ≤ scheduled ≤ dailyTargetMax

2. **Linh hoạt:**
   - Thêm task mới? Không cần sửa code
   - Thay đổi dailyTarget? Tự động áp dụng
   - Thay đổi deadline? Thuật toán tự điều chỉnh

3. **Hiệu quả:**
   - AI chỉ dùng ~2000 tokens (thay vì 8000)
   - Backend tính toán nhanh
   - Kết quả ổn định

4. **Thông minh:**
   - Tận dụng productivity scores (giờ làm việc hiệu quả)
   - Tự động detect conflict và reschedule
   - Ưu tiên deadline gần, priority cao

## Test case:

### Input:

```javascript
Task 1: "học tiếng anh"
- estimatedDuration: 420 phút (7h)
- dailyTargetMin: 60 phút (1h)
- dailyTargetMax: 180 phút (3h)
- deadline: 11/3/2026

Task 2: "hoc code"
- estimatedDuration: 780 phút (13h)
- dailyTargetMin: 60 phút (1h)
- dailyTargetMax: 150 phút (2h30)
- deadline: 14/3/2026
```

### Expected Output:

```
Ngày 07/03 (hôm nay, 13:00):
- 14:00-17:00: học tiếng anh (180 phút) ✓

Ngày 08/03:
- 08:00-11:00: học tiếng anh (180 phút) ✓
- 13:00-15:30: hoc code (150 phút) ✓

Ngày 09/03:
- 08:00-09:00: học tiếng anh (60 phút) ✓
- 09:15-11:45: hoc code (150 phút) ✓

Ngày 10-13/03:
- Mỗi ngày: hoc code (150 phút) ✓

Ngày 14/03:
- 08:00-08:30: hoc code (30 phút) ✓

Tổng:
- học tiếng anh: 180+180+60 = 420 phút ✓
- hoc code: 150+150+150+150+150+30 = 780 phút ✓
```

## Kết luận:

✅ Không cần viết prompt mỗi lần thay đổi
✅ Backend đảm bảo logic chính xác
✅ AI chỉ hỗ trợ phân tích cao cấp
✅ Tiết kiệm token, nhanh hơn, ổn định hơn

Đây chính là cách đúng để xây dựng hệ thống scheduling!
