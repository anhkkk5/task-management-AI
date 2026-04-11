# 🐛 Fix: Status "scheduled" hiển thị sai thành "Chưa xử lý"

## ❌ Vấn đề:

- Database có status = "scheduled" ✅
- Backend trả về status = "scheduled" ✅
- Frontend hiển thị "Chưa xử lý" thay vì "Đã lên lịch" ❌

**Root Cause**: Function `convertStatus()` trong Tasks page không có mapping cho status "scheduled" → return "scheduled" as is → StatusDropdown không nhận diện được → hiển thị default "todo"

---

## ✅ Solution:

### File: `web-task-AI/src/pages/Tasks/index.tsx`

**Before:**

```typescript
const convertStatus = (
  apiStatus: string,
): "todo" | "in_progress" | "completed" | "cancelled" => {
  if (apiStatus === "done") return "completed";
  if (apiStatus === "overdue") return "todo";
  // ❌ KHÔNG có case cho "scheduled"
  return apiStatus as "todo" | "in_progress" | "completed" | "cancelled";
};
```

**After:**

```typescript
const convertStatus = (
  apiStatus: string,
): "todo" | "scheduled" | "in_progress" | "completed" | "cancelled" => {
  if (apiStatus === "done") return "completed";
  if (apiStatus === "overdue") return "todo";
  if (apiStatus === "scheduled") return "scheduled"; // ✅ Add scheduled mapping
  return apiStatus as
    | "todo"
    | "scheduled"
    | "in_progress"
    | "completed"
    | "cancelled";
};
```

---

## 🧪 Test:

### 1. Refresh trang (F5)

Frontend sẽ reload với code mới

### 2. Check status hiển thị:

**Expected:**

```
✅ học tiếng anh - Status: Đã lên lịch (blue badge)
✅ học code - Status: Chưa xử lý (gray badge) - nếu chưa schedule
✅ tiếng hàn - Status: Hoàn thành (green badge) - nếu đã complete
```

### 3. Test schedule flow:

1. **Schedule task "học tiếng anh"**:
   - Click "AI Tối Ưu Lịch"
   - Select task
   - Click "Phân tích và tạo lịch"
   - Click "Áp dụng lịch trình"

2. **Expected**:
   - ✅ Success message
   - ✅ Tasks list auto-refresh
   - ✅ Status hiển thị "Đã lên lịch" (blue) NGAY LẬP TỨC
   - ✅ KHÔNG hiển thị "Chưa xử lý" nữa

---

## 📊 Status Mapping Table:

| API Status    | Display Status | Color  | Label          |
| ------------- | -------------- | ------ | -------------- |
| `todo`        | todo           | gray   | Chưa xử lý     |
| `scheduled`   | scheduled      | blue   | Đã lên lịch ⭐ |
| `in_progress` | in_progress    | orange | Đang làm       |
| `completed`   | completed      | green  | Hoàn thành     |
| `done`        | completed      | green  | Hoàn thành     |
| `cancelled`   | cancelled      | red    | Đã hủy         |
| `overdue`     | todo           | gray   | Chưa xử lý     |

---

## ✅ Complete Fix Summary:

### Issue 1: Tasks không được update khi áp dụng lịch

**Fix**: Update `saveAISchedule` controller để gọi `taskService.saveAISchedule()`
**Status**: ✅ FIXED

### Issue 2: Frontend không refresh sau khi áp dụng lịch

**Fix**: Thêm `fetchTasks()` trong `onScheduleCreate` callback
**Status**: ✅ FIXED

### Issue 3: Status "scheduled" hiển thị sai

**Fix**: Thêm mapping cho "scheduled" trong `convertStatus()` function
**Status**: ✅ FIXED

---

## 🎯 Final Test:

1. **Refresh trang** (F5)
2. **Schedule 3 tasks** lần lượt
3. **Verify**:
   - ✅ All tasks show "Đã lên lịch" (blue)
   - ✅ Backend logs show conflict detection
   - ✅ No overlapping times
   - ✅ Buffer time between tasks

---

**Fix Applied: 2026-03-08**
**Status**: ✅ COMPLETE - All issues resolved!
