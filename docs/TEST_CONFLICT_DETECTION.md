# Test Guide: Conflict Detection & Scheduled Status

## 🎯 Mục tiêu test:

1. ✅ Verify status "scheduled" hoạt động
2. ✅ Verify auto status update khi AI schedule
3. ✅ Verify conflict detection (tasks mới tránh tasks cũ)
4. ✅ Verify status dropdown có option "Đã lên lịch"

---

## 🚀 Quick Start (3 cách test):

### Cách 1: Visual Test Guide (Recommended)

```bash
# Mở file HTML trong browser
start test-conflict-detection.html
# hoặc
open test-conflict-detection.html
```

→ Hướng dẫn chi tiết với UI đẹp, checklist, timeline visualization

### Cách 2: Interactive CLI Test

```bash
node test-conflict.js
```

→ Step-by-step guide trong terminal, nhấn ENTER để next step

### Cách 3: API Testing

```bash
# Mở file test-conflict-api.http trong VS Code
# Cần cài REST Client extension
# Follow các requests từ trên xuống
```

→ Test trực tiếp API endpoints

---

## 🚀 Bước 1: Start Server

### Backend:

```bash
cd AI-powered-task-management
npm run dev
```

**Expected output:**

```
App listening on port 3002
Socket.IO ready for realtime chat
Reminder cron job started
Cache cleanup job started
```

### Frontend:

```bash
cd web-taskmanagerment-AI/web-task-AI
npm run dev
```

**Expected output:**

```
VITE ready in XXX ms
Local: http://localhost:5173/
```

---

## 🧪 Test Case 1: Create Task và AI Schedule

### Step 1.1: Tạo Task A

1. Vào trang Tasks: `http://localhost:5173/tasks`
2. Click "Thêm công việc"
3. Nhập:
   - **Tiêu đề**: "Test Task A - học tiếng anh"
   - **Thời gian dự kiến**: "2h"
   - **Mục tiêu/ngày**: "1h-1h"
   - **Hạn chót**: 11/3/2026
4. Click "Tạo công việc"

**Expected:**

- ✅ Task được tạo với status = "Chưa xử lý" (todo)
- ✅ Hiện trong danh sách tasks

### Step 1.2: AI Schedule Task A

1. Click "AI Tối Ưu Lịch"
2. Chọn Task A
3. Click "Phân tích và tạo lịch"
4. Đợi AI phân tích (5-10 giây)
5. Click "Áp dụng lịch trình"

**Expected:**

- ✅ Success message: "Đã lưu lịch trình"
- ✅ Task A status tự động chuyển sang "Đã lên lịch" (scheduled) ⭐
- ✅ Task A có thời gian: VD "08:00 - 09:00"

**Check trong database (MongoDB Compass):**

```javascript
db.tasks.findOne({ title: /Test Task A/ })

// Expected:
{
  title: "Test Task A - học tiếng anh",
  status: "scheduled", // ⭐ Phải là "scheduled"
  scheduledTime: {
    start: ISODate("2026-03-07T01:00:00.000Z"), // 08:00 GMT+7
    end: ISODate("2026-03-07T02:00:00.000Z"),   // 09:00 GMT+7
    aiPlanned: true
  }
}
```

---

## 🧪 Test Case 2: Conflict Detection

### Step 2.1: Tạo Task B

1. Click "Thêm công việc"
2. Nhập:
   - **Tiêu đề**: "Test Task B - học code"
   - **Thời gian dự kiến**: "2h"
   - **Mục tiêu/ngày**: "1h-1h"
   - **Hạn chót**: 11/3/2026
3. Click "Tạo công việc"

**Expected:**

- ✅ Task B được tạo với status = "Chưa xử lý" (todo)

### Step 2.2: AI Schedule Task B (Conflict Detection Test)

1. Click "AI Tối Ưu Lịch"
2. Chọn ONLY Task B (không chọn Task A)
3. Click "Phân tích và tạo lịch"
4. **Check backend console logs** ⭐

**Expected Console Logs:**

```
[Conflict Detection] Found 1 scheduled tasks
[Scheduler] Date 2026-03-07: 1 busy slots
[Scheduler] Task B scheduled at 09:15-10:15 (avoiding Task A)
```

5. Click "Áp dụng lịch trình"

**Expected:**

- ✅ Task B được schedule VÀO THỜI GIAN KHÁC với Task A
- ✅ Task B status = "Đã lên lịch" (scheduled)
- ✅ **KHÔNG có overlap** với Task A

**Example Result:**

```
Task A: 08:00 - 09:00 ✓
Task B: 09:15 - 10:15 ✓ (có 15 phút buffer)
```

**Verify NO CONFLICT:**

```javascript
// Task A end time: 09:00
// Task B start time: 09:15
// Gap: 15 minutes (buffer) ✓
// NO OVERLAP! 🎉
```

---

## 🧪 Test Case 3: Multiple Scheduled Tasks

### Step 3.1: Tạo Task C

1. Tạo thêm Task C:
   - **Tiêu đề**: "Test Task C - tiếng hàn"
   - **Thời gian dự kiến**: "1h"
   - **Mục tiêu/ngày**: "1h-1h"
   - **Hạn chót**: 11/3/2026

### Step 3.2: AI Schedule Task C

1. Click "AI Tối Ưu Lịch"
2. Chọn ONLY Task C
3. Click "Phân tích và tạo lịch"

**Expected Console Logs:**

```
[Conflict Detection] Found 2 scheduled tasks
[Scheduler] Date 2026-03-07: 2 busy slots
[Scheduler] Task C scheduled at 10:30-11:30 (avoiding Task A & B)
```

**Expected Result:**

```
Task A: 08:00 - 09:00 ✓
Task B: 09:15 - 10:15 ✓
Task C: 10:30 - 11:30 ✓ (tránh cả A và B)
```

---

## 🧪 Test Case 4: Status Dropdown

### Step 4.1: Click vào Status Tag

1. Trong danh sách tasks, click vào status tag của Task A
2. Dropdown hiện ra

**Expected Options:**

- ☐ Chưa xử lý (gray)
- ☑ Đã lên lịch (blue) ⭐ **NEW**
- ☐ Đang làm (orange)
- ☐ Hoàn thành (green)
- ☐ Đã hủy (red)

### Step 4.2: Change Status

1. Click "Đang làm"
2. Đợi loading

**Expected:**

- ✅ Success message: "Đã cập nhật trạng thái"
- ✅ Status tag chuyển sang "Đang làm" (orange)
- ✅ Task list tự động refresh

### Step 4.3: Change Back to Scheduled

1. Click vào status tag lại
2. Click "Đã lên lịch"

**Expected:**

- ✅ Status chuyển về "Đã lên lịch" (blue)

---

## 🧪 Test Case 5: Filter by Status

### Step 5.1: Filter Scheduled Tasks

1. Click dropdown "Tất cả trạng thái"
2. Chọn "Đã lên lịch"

**Expected:**

- ✅ Chỉ hiện tasks có status = "scheduled"
- ✅ Task A, B, C đều hiện (nếu đang ở status scheduled)

---

## 🧪 Test Case 6: Database Verification

### Check MongoDB:

```javascript
// 1. Count scheduled tasks
db.tasks.count({ status: "scheduled" });
// Expected: 3 (Task A, B, C)

// 2. Get all scheduled tasks
db.tasks.find({ status: "scheduled" }).pretty();

// 3. Verify no overlaps
db.tasks
  .find({
    status: "scheduled",
    "scheduledTime.start": { $exists: true },
  })
  .sort({ "scheduledTime.start": 1 });

// Expected: Tasks sorted by start time, no overlaps
```

---

## 🧪 Test Case 7: Conflict Detection with Same Day

### Scenario: Schedule nhiều tasks cùng ngày

1. Tạo 5 tasks mới (Task D, E, F, G, H)
2. Mỗi task: 1h duration, 1h-1h daily target
3. AI Schedule tất cả cùng lúc

**Expected:**

- ✅ Console log: `[Conflict Detection] Found 3 scheduled tasks` (A, B, C)
- ✅ Tasks D, E, F, G, H được schedule vào free slots
- ✅ Không có overlap với A, B, C
- ✅ Có buffer 10-15 phút giữa các tasks

**Example Result:**

```
08:00 - 09:00: Task A ✓
09:15 - 10:15: Task B ✓
10:30 - 11:30: Task C ✓
[Lunch break 11:30-14:00]
14:00 - 15:00: Task D ✓
15:15 - 16:15: Task E ✓
16:30 - 17:30: Task F ✓
[Evening break 17:30-19:30]
19:30 - 20:30: Task G ✓
20:45 - 21:45: Task H ✓
```

---

## 🐛 Troubleshooting:

### Issue 1: Status không chuyển sang "scheduled"

**Check:**

```bash
# 1. Verify backend build
cd AI-powered-task-management
npm run build

# 2. Check logs
# Should see: "Task status updated to scheduled"

# 3. Check database
db.tasks.findOne({ _id: ObjectId("...") })
```

**Fix:**

- Restart backend server
- Clear Redis cache: `redis-cli FLUSHALL`

### Issue 2: Conflict detection không hoạt động

**Check console logs:**

```
[Conflict Detection] Found X scheduled tasks
```

**If X = 0:**

- Check database: `db.tasks.find({ status: "scheduled" })`
- Verify tasks có `scheduledTime.start` và `scheduledTime.end`

**Fix:**

- Ensure tasks được schedule qua AI (có `aiPlanned: true`)
- Restart server

### Issue 3: Tasks vẫn bị overlap

**Debug:**

```javascript
// Check scheduled times
db.tasks
  .find({
    status: "scheduled",
  })
  .forEach((t) => {
    print(`${t.title}: ${t.scheduledTime.start} - ${t.scheduledTime.end}`);
  });
```

**Fix:**

- Clear all scheduled tasks: `db.tasks.updateMany({ status: "scheduled" }, { $set: { status: "todo" } })`
- Re-schedule từ đầu

---

## ✅ Success Criteria:

- [x] Task status tự động chuyển sang "scheduled" khi AI schedule
- [x] Status dropdown có option "Đã lên lịch"
- [x] Console log hiện: `[Conflict Detection] Found X scheduled tasks`
- [x] Tasks mới tránh tasks cũ (no overlap)
- [x] Buffer time được áp dụng (10-15 phút)
- [x] User có thể manually change status
- [x] Filter by status hoạt động

---

## 📊 Expected Performance:

- **Conflict Detection Query**: < 50ms
- **Schedule Generation**: 5-10 seconds (AI processing)
- **Status Update**: < 100ms
- **No Errors**: 0 errors in console

---

## 🎉 Test Complete!

Nếu tất cả test cases pass → System hoạt động hoàn hảo! 🚀

**Next Steps:**

1. Test với real data
2. Test với nhiều users
3. Test edge cases (tasks quá nhiều, deadline quá gần, etc.)

---

## 📞 Need Help?

Check logs:

```bash
# Backend logs
cd AI-powered-task-management
npm run dev

# Look for:
[Conflict Detection] Found X scheduled tasks
[Scheduler] Task scheduled at HH:MM-HH:MM
```

Check database:

```javascript
db.tasks.find({ status: "scheduled" }).count();
```

---

**Happy Testing! 🧪✨**
