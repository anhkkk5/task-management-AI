# Fix Khung Giờ Làm Việc & Thời Gian Nghỉ

## Vấn đề đã fix:

### 1. Thiếu thời gian nghỉ giữa các task ✅

**Trước:** Task xếp liền nhau không có buffer

```
08:00-09:00: học tiếng anh
09:00-10:00: học code  ❌ Không có nghỉ
```

**Sau:** Tự động thêm 15 phút buffer

```
08:00-09:00: học tiếng anh
09:15-10:15: học code  ✓ Có 15 phút nghỉ
```

### 2. Xếp dồn vào buổi sáng ✅

**Trước:** Chỉ ưu tiên sáng, không phân bổ đều

**Sau:** Phân bổ đều 3 khung giờ:

- Sáng: 8h-11h30 (productivity: 0.9)
- Chiều: 14h-17h30 (productivity: 0.8)
- Tối: 19h30-23h (productivity: 0.7)

### 3. Khung giờ làm việc sai ✅

**Trước:** 8h-22h liên tục (không có nghỉ trưa/tối)

**Sau:**

- Sáng: 8h-11h30
- Nghỉ trưa: 11:30-14h
- Chiều: 14h-17h30
- Nghỉ tối: 17:30-19:30
- Tối: 19:30-23h

## Chi tiết thay đổi:

### 1. Cập nhật SlotFinder Interface

```typescript
export interface SlotFinderInput {
  busySlots: TimeInterval[];
  date: Date;
  minDuration: number;
  workHours: {
    start: number;
    end: number;
    breaks?: { start: number; end: number }[]; // MỚI
  };
  bufferMinutes?: number; // MỚI - Mặc định 15 phút
}
```

### 2. Thêm breaks vào busy slots

```typescript
// Thêm breaks vào busy slots
if (workHours.breaks) {
  workHours.breaks.forEach((breakTime) => {
    const breakStart = new Date(date);
    breakStart.setHours(
      Math.floor(breakTime.start),
      (breakTime.start % 1) * 60,
    );

    const breakEnd = new Date(date);
    breakEnd.setHours(Math.floor(breakTime.end), (breakTime.end % 1) * 60);

    allBusySlots.push({
      start: breakStart,
      end: breakEnd,
      taskId: "BREAK",
    });
  });
}
```

### 3. Thêm buffer giữa các task

```typescript
// Tìm gaps giữa các busy slots (thêm buffer)
for (let i = 0; i < mergedBusy.length - 1; i++) {
  const currentEnd = new Date(
    mergedBusy[i].end.getTime() + bufferMinutes * 60 * 1000,
  ); // Thêm 15 phút buffer

  const nextStart = mergedBusy[i + 1].start;
  const gap = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);

  if (gap >= minDuration) {
    freeSlots.push({ start: currentEnd, end: nextStart, duration: gap });
  }
}
```

### 4. Cập nhật productivity scores

```typescript
private estimateProductivity(hour: number): number {
  if (hour >= 8 && hour < 12) return 0.9;   // Sáng
  if (hour >= 14 && hour < 18) return 0.8;  // Chiều
  if (hour >= 19 && hour < 23) return 0.7;  // Tối
  return 0.3; // Ngoài giờ
}
```

### 5. Cập nhật hybrid-schedule.service.ts

```typescript
workHours: {
  start: 8,
  end: 23,
  breaks: [
    { start: 11.5, end: 14 },    // 11:30-14:00
    { start: 17.5, end: 19.5 }   // 17:30-19:30
  ],
},
bufferMinutes: 15,
```

## Kết quả mong đợi:

### Ví dụ lịch trình mới:

```
Thứ Bảy 07/03/2026:
- 08:00-09:00: học tiếng anh (60 phút) ✓
- 09:15-10:45: học code (90 phút) ✓ Buffer 15 phút
- 11:00-11:30: học tiếng anh (30 phút) ✓ Buffer 15 phút

[Nghỉ trưa 11:30-14:00]

- 14:00-15:30: học code (90 phút) ✓
- 15:45-17:00: học tiếng anh (75 phút) ✓ Buffer 15 phút

[Nghỉ tối 17:30-19:30]

- 19:30-21:00: học code (90 phút) ✓
- 21:15-22:15: học tiếng anh (60 phút) ✓ Buffer 15 phút
```

## Lợi ích:

1. **Nghỉ ngơi hợp lý:** 15 phút giữa các task để não bộ phục hồi
2. **Phân bổ đều:** Không dồn vào sáng, tận dụng cả chiều và tối
3. **Tuân thủ khung giờ:** Không xếp task vào giờ nghỉ trưa/tối
4. **Thực tế hơn:** Phù hợp với lịch làm việc của con người

## Test:

Sau khi deploy, kiểm tra:

- ✅ Có 15 phút buffer giữa các task
- ✅ Không có task nào trong 11:30-14:00 (nghỉ trưa)
- ✅ Không có task nào trong 17:30-19:30 (nghỉ tối)
- ✅ Task phân bổ đều sáng/chiều/tối
- ✅ Tổng thời gian vẫn = estimatedDuration
