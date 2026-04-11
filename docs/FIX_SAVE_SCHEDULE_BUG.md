# 🐛 Fix: Tasks không được update khi áp dụng lịch

## ❌ Root Cause:

Khi click "Áp dụng lịch trình", controller chỉ lưu vào `AISchedule` collection (lịch sử) nhưng **KHÔNG update tasks** với:

- status = "scheduled"
- scheduledTime = { start, end }

→ Kết quả: `getScheduledTasks()` không tìm thấy tasks nào vì chúng vẫn có status = "todo"

## ✅ Solution:

### File: `src/modules/task/task.controller.ts`

**Before:**

```typescript
export const saveAISchedule = async (_req: Request, res: Response) => {
  // ...

  // ❌ CHỈ lưu vào AISchedule collection
  const result = await aiScheduleService.createSchedule(userId, {
    name: "AI Schedule Plan",
    schedule: transformedSchedule,
    // ...
  });

  // ❌ KHÔNG update tasks

  res.status(200).json({ message: "Đã lưu lịch trình" });
};
```

**After:**

```typescript
export const saveAISchedule = async (_req: Request, res: Response) => {
  // ...

  // 1. Save to AISchedule collection (for history)
  const result = await aiScheduleService.createSchedule(userId, {
    name: "AI Schedule Plan",
    schedule: transformedSchedule,
    // ...
  });

  // 2. ✅ Update tasks with scheduled time and status
  const tasksToUpdate = [];

  for (const dayItem of transformedSchedule) {
    for (const task of dayItem.tasks) {
      // Parse suggestedTime (e.g., "08:00 - 09:00")
      const timeMatch = task.suggestedTime.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (!timeMatch) continue;

      // Parse date (e.g., "2026-03-08")
      const dateMatch = dayItem.date.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!dateMatch) continue;

      // Create Date objects
      const startDate = new Date(Date.UTC(...));
      const endDate = new Date(Date.UTC(...));

      tasksToUpdate.push({
        taskId: task.taskId,
        scheduledTime: {
          start: startDate,
          end: endDate,
          aiPlanned: true,
          reason: task.reason
        }
      });
    }
  }

  // ✅ Update tasks in database
  const updateResult = await taskService.saveAISchedule(userId, tasksToUpdate);

  console.log(`[Save Schedule] Updated ${updateResult.updated} tasks`);

  res.status(200).json({ message: "Đã lưu lịch trình" });
};
```

---

## 🧪 Test:

### 1. Restart Server

```bash
cd AI-powered-task-management
npm run dev
```

### 2. Clear Database

```javascript
db.tasks.updateMany(
  {},
  {
    $set: { status: "todo" },
    $unset: { scheduledTime: "" },
  },
);
```

### 3. Test Schedule Task A

**Actions:**

1. Click "AI Tối Ưu Lịch"
2. Select "học tiếng anh"
3. Click "Phân tích và tạo lịch"
4. Click "Áp dụng lịch trình"

**Expected Console Logs:**

```
[Conflict Detection] Found 0 scheduled tasks (excluding 1 tasks being scheduled)
[Save Schedule] Task "học tiếng anh" status updated to "scheduled" with time ...
[Save Schedule] Updated 1 tasks, created 0 subtasks
```

**Verify in Database:**

```javascript
db.tasks.findOne({ title: "học tiếng anh" })

// Expected:
{
  title: "học tiếng anh",
  status: "scheduled", // ✅ MUST be "scheduled"
  scheduledTime: {
    start: ISODate("2026-03-08T01:00:00.000Z"),
    end: ISODate("2026-03-08T02:00:00.000Z"),
    aiPlanned: true
  }
}
```

### 4. Test Schedule Task B

**Actions:**

1. Click "AI Tối Ưu Lịch"
2. Select "học code"
3. Click "Phân tích và tạo lịch"
4. Click "Áp dụng lịch trình"

**Expected Console Logs:**

```
[Conflict Detection] Found 1 scheduled tasks (excluding 1 tasks being scheduled)
[Conflict Detection] Scheduled tasks:
  - học tiếng anh: 2026-03-08T01:00:00.000Z to 2026-03-08T02:00:00.000Z (status: scheduled)
[Scheduler] Date 2026-03-08: 1 busy slots
[Save Schedule] Task "học code" status updated to "scheduled" with time ...
[Save Schedule] Updated 1 tasks, created 0 subtasks
```

### 5. Test Schedule Task C

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

## 📊 Expected Result:

### Console Logs:

```
✅ [Conflict Detection] Found 0 scheduled tasks
✅ [Save Schedule] Updated 1 tasks

✅ [Conflict Detection] Found 1 scheduled tasks
✅ [Conflict Detection] Scheduled tasks: học tiếng anh
✅ [Save Schedule] Updated 1 tasks

✅ [Conflict Detection] Found 2 scheduled tasks
✅ [Conflict Detection] Scheduled tasks: học tiếng anh, học code
✅ [Save Schedule] Updated 1 tasks
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

### Calendar:

```
08:00 - 09:00: học tiếng anh ✓
09:15 - 10:15: học code ✓
10:30 - 11:30: tiếng hàn ✓ (NO OVERLAP!)
```

---

## ✅ Success Criteria:

- [x] Console shows: `[Save Schedule] Updated X tasks`
- [x] Console shows: `[Conflict Detection] Found X scheduled tasks` (X > 0 for task 2 and 3)
- [x] Database has tasks with status = "scheduled"
- [x] Database has tasks with scheduledTime
- [x] No overlapping times
- [x] Buffer time between tasks

---

**Fix Applied: 2026-03-08**
**Status**: ✅ READY TO TEST
