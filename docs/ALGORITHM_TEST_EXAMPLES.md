# Ví dụ Test cho 3 Thuật Toán Core

## Cách chạy test

### 1. Test bằng API (Postman/cURL)

#### 1.1 Check Conflict
```bash
POST http://localhost:3000/api/scheduler/check-conflict
Content-Type: application/json

{
  "newTask": {
    "start": "2024-03-15T09:00:00Z",
    "end": "2024-03-15T10:00:00Z",
    "taskId": "task-new"
  },
  "existingTasks": [
    {
      "start": "2024-03-15T08:30:00Z",
      "end": "2024-03-15T09:30:00Z",
      "taskId": "task-1"
    },
    {
      "start": "2024-03-15T10:30:00Z",
      "end": "2024-03-15T11:30:00Z",
      "taskId": "task-2"
    }
  ]
}

// Expected: hasConflict = true (vì overlap 30 phút với task-1)
// suggestedNewSlot: 09:30 - 10:30
```

#### 1.2 Find Free Slots
```bash
POST http://localhost:3000/api/scheduler/find-free-slots
Content-Type: application/json

{
  "busySlots": [
    { "start": "2024-03-15T08:00:00Z", "end": "2024-03-15T10:00:00Z" },
    { "start": "2024-03-15T14:00:00Z", "end": "2024-03-15T16:00:00Z" }
  ],
  "date": "2024-03-15",
  "minDuration": 60,
  "workHours": { "start": 8, "end": 18 }
}

// Expected: 
// Slot 1: 10:00 - 14:00 (4 tiếng)
// Slot 2: 16:00 - 18:00 (2 tiếng)
```

#### 1.3 Calculate Productivity
```bash
POST http://localhost:3000/api/scheduler/calculate-productivity
Content-Type: application/json

{
  "completedTasks": [
    { "hour": 8, "completed": true, "duration": 60 },
    { "hour": 8, "completed": true, "duration": 45 },
    { "hour": 9, "completed": true, "duration": 90 },
    { "hour": 9, "completed": true, "duration": 60 },
    { "hour": 9, "completed": false, "duration": 30 },
    { "hour": 14, "completed": false, "duration": 60 },
    { "hour": 14, "completed": false, "duration": 45 },
    { "hour": 15, "completed": true, "duration": 120 }
  ]
}

// Expected:
// Hour 8: score cao (~0.9), confidence ~0.2 (2 samples)
// Hour 9: score cao (~0.8), confidence ~0.3 (3 samples)  
// Hour 14: score thấp (~0.3), vì toàn fail
// Hour 15: score cao nhưng chỉ 1 sample
```

#### 1.4 Find Optimal Slot
```bash
POST http://localhost:3000/api/scheduler/find-optimal-slot
Content-Type: application/json

{
  "taskDuration": 120,
  "busySlots": [
    { "start": "2024-03-15T08:00:00Z", "end": "2024-03-15T10:00:00Z" },
    { "start": "2024-03-15T14:00:00Z", "end": "2024-03-15T16:00:00Z" }
  ],
  "date": "2024-03-15",
  "preferredTimeOfDay": "morning",
  "workHours": { "start": 8, "end": 18 }
}

// Expected: 
// Trả về slot 10:00-14:00 (vừa đủ 4 tiếng, buổi sáng)
// productivityScore cao vì là morning
```

#### 1.5 Schedule Multiple Tasks (EDF)
```bash
POST http://localhost:3000/api/scheduler/schedule-tasks
Content-Type: application/json

{
  "tasks": [
    { 
      "start": "2024-03-15T09:00:00Z", 
      "end": "2024-03-15T10:00:00Z",
      "taskId": "task-a",
      "priority": 5
    },
    { 
      "start": "2024-03-15T09:30:00Z", 
      "end": "2024-03-15T10:30:00Z",
      "taskId": "task-b",
      "priority": 8
    }
  ],
  "busySlots": [],
  "startDate": "2024-03-15",
  "endDate": "2024-03-16"
}

// Expected:
// Task A: 09:00-10:00 (không đổi)
// Task B: Bị conflict với A → reschedule sang 10:00-11:00
```

#### 1.6 Find Optimal Hours
```bash
POST http://localhost:3000/api/scheduler/find-optimal-hours
Content-Type: application/json

{
  "completedTasks": [
    { "hour": 8, "completed": true, "duration": 60 },
    { "hour": 8, "completed": true, "duration": 60 },
    { "hour": 9, "completed": true, "duration": 60 },
    { "hour": 9, "completed": true, "duration": 60 },
    { "hour": 9, "completed": true, "duration": 60 },
    { "hour": 14, "completed": false, "duration": 30 },
    { "hour": 14, "completed": false, "duration": 30 }
  ],
  "taskProfile": {
    "difficulty": "hard",
    "requiresFocus": true,
    "estimatedDuration": 120,
    "preferredTimeOfDay": "morning"
  },
  "topN": 3
}

// Expected:
// Top 1: Hour 9 (score cao, confidence cao, trong morning)
// Top 2: Hour 8 (score cao, confidence trung bình)
// Top 3: ... (tùy thuộc vào default scores)
```

---

## Test trên UI

### Test Case 1: Thêm task mới không conflict
1. Vào Calendar UI
2. Tạo task "Học tiếng Anh" lúc 9:00-10:00
3. Tạo task "Code review" lúc 10:30-11:30
4. **Expected**: Cả 2 task hiển thị bình thường, không warning

### Test Case 2: Thêm task bị conflict
1. Đã có task A: 9:00-10:00
2. Tạo task B: 9:30-10:30
3. **Expected**: 
   - Backend detect conflict
   - Auto suggest: 10:00-11:00
   - Hiển thị notification: "Task đã được tự động dời sang 10:00"

### Test Case 3: AI gợi ý + Algorithm chọn giờ
1. User tạo task: "Làm bài tập lớn" (difficulty: hard)
2. AI phân tích: "Task khó, nên làm buổi sáng"
3. Backend chạy:
   - calculateProductivity() → 9h có score cao nhất
   - findOptimalSlot() → tìm slot rảnh lúc 9h
   - checkConflict() → OK
4. **Expected**: Task được xếp lúc 9:00-11:00

### Test Case 4: Reschedule task bị miss
1. Task "Học tiếng Anh" đã lên lịch 9:00-10:00
2. User miss deadline (không làm)
3. User click "Reschedule"
4. Backend:
   - findEarliestSlot() → tìm slot rảnh tiếp theo
   - checkConflict() → verify
   - Update calendar
5. **Expected**: Task được chuyển sang slot rảnh gần nhất (không phải đợi AI)

---

## Kết quả mong đợi sau khi có thuật toán

| Feature Trước | Feature Sau |
|---------------|-------------|
| AI quyết định giờ cụ thể | AI chỉ phân tích, Algorithm chọn giờ |
| Prompt dài 2000 tokens | Prompt ngắn 300 tokens |
| Không test được (AI non-deterministic) | Có unit test, deterministic |
| AI lỗi = crash | AI lỗi = fallback algorithm |
| Phụ thuộc hoàn toàn AI | Hybrid: AI + Algorithm |

---

## Integration Test Script

```typescript
// Test file: scheduler.integration.test.ts

import { intervalScheduler, slotFinder, productivityScorer } from '../modules/scheduler';

describe('Scheduler Integration', () => {
  test('Full pipeline: Task → AI suggestion → Algorithm → Schedule', () => {
    // 1. AI gợi ý (giả lập)
    const aiSuggestion = {
      difficulty: 'hard',
      preferredTimeOfDay: 'morning'
    };

    // 2. Calculate productivity
    const completedTasks = [
      { hour: 8, completed: true, duration: 60 },
      { hour: 9, completed: true, duration: 90 },
      { hour: 14, completed: false, duration: 30 }
    ];
    const productivityScores = productivityScorer.calculateHourlyScores(completedTasks);

    // 3. Find optimal hours
    const optimalHours = productivityScorer.findOptimalHours(
      productivityScores,
      aiSuggestion as any,
      3
    );
    expect(optimalHours[0].hour).toBe(9); // 9h có score cao nhất

    // 4. Find free slot
    const busySlots = [
      { start: new Date('2024-03-15T08:00Z'), end: new Date('2024-03-15T10:00Z') }
    ];
    const optimalSlot = slotFinder.findOptimalSlot({
      taskDuration: 120,
      preferredTimeOfDay: 'morning',
      productivityScores,
      busySlots,
      date: new Date('2024-03-15'),
      workHours: { start: 8, end: 18 }
    });

    expect(optimalSlot).not.toBeNull();
    expect(optimalSlot!.start.getHours()).toBe(10); // Sau busy slot

    // 5. Check conflict
    const newTask = {
      start: optimalSlot!.start,
      end: new Date(optimalSlot!.start.getTime() + 120 * 60 * 1000),
      taskId: 'new-task'
    };
    const conflict = intervalScheduler.checkConflict(newTask, busySlots);
    expect(conflict.hasConflict).toBe(false);

    // 6. Schedule
    const scheduled = intervalScheduler.scheduleTasks(
      [newTask],
      busySlots,
      new Date('2024-03-15'),
      new Date('2024-03-16')
    );
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].taskId).toBe('new-task');
  });
});
```
