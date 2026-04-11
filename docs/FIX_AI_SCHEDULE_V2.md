# Fix AI Schedule - Giải quyết 3 vấn đề chính

## Vấn đề đã fix:

### 1. Task không bắt đầu từ hôm nay ✅

**Triệu chứng:** Khi bấm "AI phân tích" hôm nay, lịch trình bắt đầu từ ngày mai

**Giải pháp:**

- Thêm điều kiện BẮT BUỘC trong prompt: "Task đầu tiên PHẢI bắt đầu từ HÔM NAY"
- Thêm validation warning khi không có task nào được xếp cho hôm nay
- Làm rõ giờ bắt đầu tối thiểu cho hôm nay (currentHour + 1)

### 2. Tổng thời gian không khớp với estimatedDuration ✅

**Triệu chứng:** Task có estimatedDuration = 420 phút nhưng AI xếp tổng 300 hoặc 500 phút

**Giải pháp:**

- Thêm dailyTargetMin và dailyTargetMax vào prompt
- Hướng dẫn AI: số ngày = estimatedDuration ÷ dailyTargetMax
- Yêu cầu: TỔNG = estimatedDuration (±5 phút)
- Validation backend tính tổng và log warning nếu sai lệch

### 3. Phiên làm việc vượt quá dailyTargetMax ✅ **MỚI**

**Triệu chứng:**

- Task có dailyTargetMax = 150 phút (2h30)
- AI xếp phiên 180 phút (3h) → SAI

**Ví dụ cụ thể:**

```
Task: "hoc code"
- estimatedDuration: 780 phút (13h)
- dailyTargetMin: 60 phút (1h)
- dailyTargetMax: 150 phút (2h30)

❌ SAI: AI xếp 180 phút/ngày (vượt quá 150)
✓ ĐÚNG: Mỗi ngày tối đa 150 phút
  - Ngày 1-5: 150 phút/ngày
  - Ngày 6: 30 phút
  - Tổng: 780 phút ✓
```

**Giải pháp:**

- Thêm quy tắc: "TUYỆT ĐỐI KHÔNG được vượt quá dailyTargetMax"
- Thêm ví dụ SAI để AI hiểu rõ hơn
- Validation backend kiểm tra TỪNG PHIÊN có vượt quá không
- Log warning chi tiết: "Session duration 180 exceeds dailyTargetMax 150"

## Chi tiết thay đổi:

### Prompt AI - Thêm ví dụ cụ thể:

```
5. **VÍ DỤ CỤ THỂ 2:**
   Task: "hoc code", estimatedDuration=780 phút, dailyMin=60, dailyMax=150

   Cách tính:
   - Số ngày cần: 780 ÷ 150 = 5.2 → 6 ngày
   - Phân bổ: 5 ngày × 150 phút + 1 ngày × 30 phút = 780 phút
   - Kiểm tra: Mỗi phiên ≤ 150 (dailyMax) ✓

   Lịch trình:
   - Ngày 1: 13:00-15:30 (150 phút) ✓
   - Ngày 2-5: 150 phút/ngày
   - Ngày 6: 30 phút

6. **VÍ DỤ SAI (KHÔNG LÀM NHƯ VẦY):**
   ❌ SAI: Ngày 1: 180 phút (vượt quá dailyMax=150)
   ❌ SAI: Ngày 2: 200 phút (vượt quá dailyMax=150)
   ✓ ĐÚNG: Mỗi ngày tối đa 150 phút
```

### Validation Backend - Kiểm tra từng phiên:

```typescript
// Kiểm tra dailyTargetMax cho từng phiên
const dailyMax = task.dailyTargetDuration || 180;
constrainedSchedule.forEach((day: any) => {
  day.tasks.forEach((t: any) => {
    if (String(t.taskId) === taskId) {
      const sessionDuration = calculateDuration(t.suggestedTime);

      if (sessionDuration > dailyMax) {
        console.warn(
          `Task "${task.title}" on ${day.date}: ` +
            `Session ${sessionDuration}min exceeds dailyTargetMax ${dailyMax}min`,
        );
      }
    }
  });
});
```

## Cách test:

### Test case 3: Phiên không vượt quá dailyTargetMax (MỚI)

1. Tạo task:
   - Title: "hoc code"
   - estimatedDuration: 780 phút (13h)
   - dailyTargetMin: 60 phút (1h)
   - dailyTargetMax: 150 phút (2h30)
   - deadline: 7 ngày sau

2. Bấm "AI phân tích"

3. **Kỳ vọng:**
   - Mỗi phiên ≤ 150 phút (KHÔNG có phiên 180 phút)
   - Tổng = 780 phút
   - Ví dụ: 150+150+150+150+150+30 = 780 ✓

4. **Kiểm tra console:**
   - Không có warning "exceeds dailyTargetMax"
   - Nếu có warning → AI vẫn sai, cần điều chỉnh thêm

## Lưu ý quan trọng:

1. **dailyTargetMax là giới hạn CỨNG:**
   - Mỗi phiên PHẢI ≤ dailyTargetMax
   - Không có ngoại lệ

2. **Tổng thời gian phải chính xác:**
   - Tổng các phiên = estimatedDuration (±5 phút)
   - Nếu sai lệch > 5 phút → có warning

3. **Kiểm tra console log:**
   - Backend sẽ log warning nếu phát hiện vi phạm
   - Dùng để debug khi AI vẫn sai

4. **AI có thể cần retry:**
   - Nếu lần đầu AI vẫn sai, thử bấm lại
   - AI có thể học từ prompt và cải thiện

## Kết quả mong đợi:

✅ Task bắt đầu từ hôm nay (nếu startDate = hôm nay)
✅ Tổng thời gian = estimatedDuration
✅ Mỗi phiên ≤ dailyTargetMax
✅ Hoàn thành đúng hoặc sớm hơn deadline
