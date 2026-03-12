# Scheduled Status & Conflict Detection Implementation

## ✅ Đã hoàn thành:

### Phase 1: Add "scheduled" Status

#### Backend Changes:

**1. Task Model** (`src/modules/task/task.model.ts`)

```typescript
status: {
  type: String,
  enum: ["todo", "scheduled", "in_progress", "completed", "cancelled"],
  //      ↑ NEW: "scheduled" status
  default: "todo",
}
```

**2. Task DTO** (`src/modules/task/task.dto.ts`)

```typescript
export type TaskStatus =
  | "todo"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";
//                                 ↑ NEW
```

**3. Task Controller** (`src/modules/task/task.controller.ts`)

- Updated `parseStatus()` to accept "scheduled"
- Updated error message to include "scheduled"

**4. Task Service** (`src/modules/task/task.service.ts`)

- Auto update status to "scheduled" when AI schedule is applied
- Both main tasks and subtasks get "scheduled" status

**5. Task Repository** (`src/modules/task/task.repository.ts`)

- Added `getScheduledTasks()` method for conflict detection

#### Frontend Changes:

**1. StatusDropdown Component** (`web-task-AI/src/components/StatusDropdown/index.tsx`)

```typescript
const STATUS_OPTIONS = [
  { value: "todo", label: "Chưa xử lý", color: "default" },
  { value: "scheduled", label: "Đã lên lịch", color: "blue" }, // ⭐ NEW
  { value: "in_progress", label: "Đang làm", color: "processing" },
  { value: "completed", label: "Hoàn thành", color: "success" },
  { value: "cancelled", label: "Đã hủy", color: "error" },
];
```

---

## 🎯 Status Flow:

```
┌─────────┐
│  todo   │ (Task mới tạo)
└────┬────┘
     │
     │ [AI Schedule Applied]
     ↓
┌──────────┐
│scheduled │ ⭐ Đã lên lịch - CHECK CONFLICT Ở ĐÂY
└────┬─────┘
     │
     │ [User starts working / Auto at scheduled time]
     ↓
┌─────────────┐
│in_progress  │ (Đang làm)
└──────┬──────┘
       │
       │ [User completes]
       ↓
┌───────────┐
│completed  │ (Hoàn thành)
└───────────┘

Alternative flows:
- scheduled → cancelled (Hủy lịch)
- in_progress → cancelled (Hủy giữa chừng)
- Any status → User can manually change via dropdown
```

---

## 🔍 Conflict Detection Logic:

### Current Implementation:

**Repository Method:**

```typescript
// Get scheduled tasks in date range
getScheduledTasks(userId, startDate, endDate) {
  return Task.find({
    userId,
    status: { $in: ['scheduled', 'in_progress'] }, // ⭐ Only these statuses
    'scheduledTime.start': { $gte: startDate, $lte: endDate }
  });
}

// Find conflicting tasks
findConflictingTasks(userId, startTime, endTime, excludeTaskId?) {
  // Overlap condition: (taskStart < givenEnd) AND (taskEnd > givenStart)
  return Task.find({
    userId,
    status: { $nin: ['completed', 'cancelled'] },
    'scheduledTime.start': { $lt: endTime },
    'scheduledTime.end': { $gt: startTime }
  });
}
```

### Next Steps (Phase 2):

**1. Integrate into Hybrid Scheduler:**

```typescript
// In hybrid-schedule.service.ts
async schedulePlan(userId, taskIds, startDate) {
  // 1. Get scheduled tasks
  const scheduledTasks = await taskRepository.getScheduledTasks({
    userId,
    startDate,
    endDate: calculateEndDate(startDate, tasks)
  });

  // 2. Convert to busy slots
  const busySlots = scheduledTasks.map(t => ({
    start: t.scheduledTime.start,
    end: t.scheduledTime.end,
    taskId: t._id
  }));

  // 3. Pass to slot-finder
  const freeSlots = slotFinder.findFreeSlots({
    busySlots, // ⭐ Avoid conflicts
    date,
    minDuration,
    workHours
  });

  // 4. Schedule only in free slots
}
```

**2. Conflict Warning UI:**

```typescript
// Show warning if conflicts detected
if (conflicts.length > 0) {
  Modal.warning({
    title: "Phát hiện xung đột lịch",
    content: `${conflicts.length} task bị trùng thời gian. Bạn có muốn tự động điều chỉnh?`,
    onOk: () => autoResolveConflicts(),
  });
}
```

---

## 📊 Database Queries:

### Get Scheduled Tasks:

```typescript
// Get all scheduled tasks for a user in date range
const scheduledTasks = await taskRepository.getScheduledTasks({
  userId: "123",
  startDate: new Date("2026-03-07"),
  endDate: new Date("2026-03-14"),
});

// Result: Tasks with status "scheduled" or "in_progress" that have scheduledTime
```

### Check Conflicts:

```typescript
// Check if new task conflicts with existing schedule
const conflicts = await taskRepository.findConflictingTasks({
  userId: "123",
  startTime: new Date("2026-03-07 08:00"),
  endTime: new Date("2026-03-07 09:00"),
  excludeTaskId: "optional-task-id-to-exclude",
});

// Result: Tasks that overlap with the given time range
```

---

## 🎨 UI/UX Improvements:

### Status Colors:

- **todo**: Gray (default) - Chưa có gì
- **scheduled**: Blue - Đã lên lịch, sẵn sàng làm
- **in_progress**: Orange (processing) - Đang làm
- **completed**: Green (success) - Hoàn thành
- **cancelled**: Red (error) - Đã hủy

### Filter Options:

```typescript
<Select>
  <Option value="all">Tất cả</Option>
  <Option value="todo">Chưa lên lịch</Option>
  <Option value="scheduled">Đã lên lịch</Option> {/* ⭐ NEW */}
  <Option value="in_progress">Đang làm</Option>
  <Option value="completed">Hoàn thành</Option>
  <Option value="cancelled">Đã hủy</Option>
</Select>
```

### Visual Indicators:

```typescript
// In task list
{task.status === 'scheduled' && (
  <Tag color="blue" icon={<CalendarOutlined />}>
    Đã lên lịch: {formatTime(task.scheduledTime.start)}
  </Tag>
)}
```

---

## 🧪 Testing:

### Test Case 1: Auto Status Update

```bash
# 1. Create task
POST /tasks
{ "title": "Test task", "status": "todo" }

# 2. Apply AI schedule
POST /tasks/save-ai-schedule
{ "schedule": [...] }

# 3. Verify status changed
GET /tasks/:id
# Expected: status = "scheduled" ✓
```

### Test Case 2: Manual Status Change

```bash
# Change status via dropdown
PATCH /tasks/:id/status
{ "status": "in_progress" }

# Expected: Success ✓
```

### Test Case 3: Get Scheduled Tasks

```bash
# Get scheduled tasks for conflict check
# (Internal API - used by scheduler)
const tasks = await taskRepository.getScheduledTasks({
  userId,
  startDate: new Date('2026-03-07'),
  endDate: new Date('2026-03-14')
});

# Expected: Only tasks with status "scheduled" or "in_progress" ✓
```

---

## 📝 API Endpoints:

### Existing (Updated):

- `PATCH /tasks/:id/status` - Now accepts "scheduled"
- `POST /tasks/save-ai-schedule` - Auto sets status to "scheduled"

### Internal Methods (For Scheduler):

- `taskRepository.getScheduledTasks()` - Get scheduled tasks
- `taskRepository.findConflictingTasks()` - Find conflicts

---

## 🚀 Next Implementation Steps:

### Phase 2: Conflict Detection Integration

**Step 1**: Update `hybrid-schedule.service.ts`

```typescript
// Get scheduled tasks before scheduling
const scheduledTasks = await taskRepository.getScheduledTasks(...);
const busySlots = convertToBusySlots(scheduledTasks);
```

**Step 2**: Pass busy slots to slot-finder

```typescript
const freeSlots = slotFinder.findFreeSlots({
  busySlots, // ⭐ Include scheduled tasks
  date,
  minDuration,
  workHours,
});
```

**Step 3**: Add conflict warning UI

```typescript
// Show conflicts to user
if (conflicts.length > 0) {
  showConflictWarning(conflicts);
}
```

**Step 4**: Auto-resolve conflicts

```typescript
// Suggest alternative times
const alternatives = findAlternativeSlots(conflicts);
```

---

## 📚 Files Changed:

### Backend:

- ✅ `src/modules/task/task.model.ts`
- ✅ `src/modules/task/task.dto.ts`
- ✅ `src/modules/task/task.controller.ts`
- ✅ `src/modules/task/task.service.ts`
- ✅ `src/modules/task/task.repository.ts`

### Frontend:

- ✅ `web-task-AI/src/components/StatusDropdown/index.tsx`

### Documentation:

- ✅ `SCHEDULED_STATUS_AND_CONFLICT_DETECTION.md` (this file)

---

## ✅ Checklist:

- [x] Add "scheduled" to TaskStatus enum
- [x] Update task model schema
- [x] Update task controller validation
- [x] Auto set status to "scheduled" when AI schedule applied
- [x] Add getScheduledTasks() repository method
- [x] Update frontend StatusDropdown
- [x] Build successful
- [ ] Integrate conflict detection into scheduler (Phase 2)
- [ ] Add conflict warning UI (Phase 2)
- [ ] Add auto-resolve conflicts (Phase 2)

---

**Status**: Phase 1 Complete ✅ | Ready for Phase 2 🚀
