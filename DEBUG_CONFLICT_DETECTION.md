# 🔍 Debug: Conflict Detection Not Working

## 🐛 Vấn đề:

Console log cho thấy: `Found 0 scheduled tasks` cho cả 3 lần schedule
→ Nghĩa là `getScheduledTasks()` không tìm thấy tasks đã schedule trước đó

## 🔧 Debug Steps:

### 1. Restart Server với Debug Logs

```bash
cd AI-powered-task-management
npm run dev
```

### 2. Xóa tất cả lịch cũ

```javascript
// MongoDB
db.tasks.updateMany(
  {},
  {
    $set: { status: "todo" },
    $unset: { scheduledTime: "" },
  },
);
```

### 3. Test từng bước và check logs:

#### Step 1: Schedule Task A

1. Click "AI Tối Ưu Lịch"
2. Chọn ONLY "học tiếng anh"
3. Click "Phân tích và tạo lịch"
4. Click "Áp dụng lịch trình"

**Expected Console Logs:**

```
[Conflict Detection] Found 0 scheduled tasks (excluding 1 tasks being scheduled)
[Conflict Detection] No scheduled tasks found in database
[Conflict Detection] Total scheduled tasks in DB: 0
[Save Schedule] Task "học tiếng anh" status updated to "scheduled" with time ...
```

#### Step 2: Verify Task A in Database

```javascript
// MongoDB - Check task A
db.tasks.findOne({ title: "học tiếng anh" })

// Expected:
{
  title: "học tiếng anh",
  status: "scheduled", // ← MUST be "scheduled"
  scheduledTime: {
    start: ISODate("..."),
    end: ISODate("..."),
    aiPlanned: true
  }
}
```

#### Step 3: Schedule Task B

1. Click "AI Tối Ưu Lịch"
2. Chọn ONLY "học code"
3. Click "Phân tích và tạo lịch"
4. Click "Áp dụng lịch trình"

**Expected Console Logs:**

```
[Conflict Detection] Found 1 scheduled tasks (excluding 1 tasks being scheduled)
[Conflict Detection] Scheduled tasks:
  - học tiếng anh: 2026-03-08T01:00:00.000Z to 2026-03-08T02:00:00.000Z (status: scheduled)
[Scheduler] Date 2026-03-08: 1 busy slots
[Save Schedule] Task "học code" status updated to "scheduled" with time ...
```

#### Step 4: Schedule Task C

1. Click "AI Tối Ưu Lịch"
2. Chọn ONLY "tiếng hàn"
3. Click "Phân tích và tạo lịch"
4. Click "Áp dụng lịch trình"

**Expected Console Logs:**

```
[Conflict Detection] Found 2 scheduled tasks (excluding 1 tasks being scheduled)
[Conflict Detection] Scheduled tasks:
  - học tiếng anh: ... (status: scheduled)
  - học code: ... (status: scheduled)
[Scheduler] Date 2026-03-08: 2 busy slots
[Save Schedule] Task "tiếng hàn" status updated to "scheduled" with time ...
```

---

## 🔍 Possible Issues:

### Issue 1: Tasks không được save với status "scheduled"

**Check:**

```javascript
// MongoDB - Check all tasks
db.tasks.find({ userId: ObjectId("YOUR_USER_ID") });
```

**If status ≠ "scheduled":**

- Check `saveAISchedule` method
- Check if update is successful
- Check console log: `[Save Schedule] Task "..." status updated...`

### Issue 2: Query filter không đúng

**Check:**

```javascript
// MongoDB - Manual query
db.tasks.find({
  userId: ObjectId("YOUR_USER_ID"),
  status: { $in: ["scheduled", "in_progress"] },
  "scheduledTime.start": { $exists: true, $ne: null },
  "scheduledTime.end": { $exists: true, $ne: null },
});
```

**If returns 0 results but tasks exist:**

- Check if `scheduledTime` field exists
- Check if `scheduledTime.start` and `scheduledTime.end` are not null
- Check date format

### Issue 3: Timing issue (race condition)

**Symptom:** Task được save nhưng query chạy trước khi save xong

**Solution:** Đã fix bằng cách exclude tasks đang được schedule

---

## 📊 Debug Checklist:

- [ ] Server restarted với debug logs
- [ ] All tasks reset to "todo" status
- [ ] Schedule Task A → Check console logs
- [ ] Verify Task A in database (status = "scheduled")
- [ ] Schedule Task B → Check console logs (should find 1 scheduled task)
- [ ] Verify Task B in database
- [ ] Schedule Task C → Check console logs (should find 2 scheduled tasks)
- [ ] Verify no overlapping times

---

## 🎯 Expected Final Result:

### Console Logs:

```
[Conflict Detection] Found 0 scheduled tasks (excluding 1 tasks being scheduled)
[Save Schedule] Task "học tiếng anh" status updated to "scheduled"

[Conflict Detection] Found 1 scheduled tasks (excluding 1 tasks being scheduled)
[Conflict Detection] Scheduled tasks:
  - học tiếng anh: 08:00-09:00 (status: scheduled)
[Save Schedule] Task "học code" status updated to "scheduled"

[Conflict Detection] Found 2 scheduled tasks (excluding 1 tasks being scheduled)
[Conflict Detection] Scheduled tasks:
  - học tiếng anh: 08:00-09:00 (status: scheduled)
  - học code: 09:15-10:15 (status: scheduled)
[Save Schedule] Task "tiếng hàn" status updated to "scheduled"
```

### Database:

```javascript
db.tasks.find({ status: "scheduled" }).sort({ "scheduledTime.start": 1 })[
  // Expected:
  ({ title: "học tiếng anh", scheduledTime: { start: "08:00", end: "09:00" } },
  { title: "học code", scheduledTime: { start: "09:15", end: "10:15" } },
  { title: "tiếng hàn", scheduledTime: { start: "10:30", end: "11:30" } })
];
```

### Calendar View:

```
08:00 - 09:00: học tiếng anh ✓
09:15 - 10:15: học code ✓
10:30 - 11:30: tiếng hàn ✓
```

---

## 🚀 Next Steps:

1. **Restart server** với debug logs
2. **Clear database** (reset all tasks to "todo")
3. **Test từng task** một và check console logs
4. **Gửi console logs** nếu vẫn có vấn đề

---

**Debug Added: 2026-03-08**
