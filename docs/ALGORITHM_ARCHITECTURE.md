# Kiến Trúc 3 Thuật Toán Core - AI Smart Calendar

## 1. INTERVAL SCHEDULING + CONFLICT DETECTION

### Mục tiêu
- Đảm bảo không có task nào overlap trong calendar
- AI chỉ gợi ý, backend quyết định final schedule
- Nếu conflict → tự động reschedule không cần gọi AI lại

### Data Structure
```typescript
interface TimeInterval {
  start: Date;      // ISO string
  end: Date;        // ISO string
  taskId: string;
  priority: number;  // 1-10
}

interface ConflictResult {
  hasConflict: boolean;
  conflictingTasks: string[];
  suggestedNewSlot?: TimeInterval;
}
```

### Algorithm Design

#### 1.1 Conflict Detection (O(n log n))
```
Input: newTask (TimeInterval), existingTasks (TimeInterval[])
Output: ConflictResult

Steps:
1. Sort existingTasks by start time
2. Binary search tìm task có thể overlap
3. Check: newTask.start < existing.end && newTask.end > existing.start
4. Nếu conflict → trả về list conflicting tasks
```

#### 1.2 Interval Scheduling (Greedy - O(n log n))
```
Input: tasksToSchedule (TimeInterval[]), busySlots (TimeInterval[])
Output: scheduledTasks (TimeInterval[])

Steps:
1. Sort tasksToSchedule by deadline (EDF)
2. For each task:
   a. Find first available slot không overlap busySlots
   b. If conflict → shift task đến slot rảnh tiếp theo
   c. Add to busySlots
3. Return scheduled tasks
```

### API Interface
```typescript
class IntervalScheduler {
  // Kiểm tra conflict trước khi add
  checkConflict(newTask: TimeInterval, userId: string): Promise<ConflictResult>;
  
  // Auto-schedule nhiều tasks
  scheduleTasks(
    tasks: TimeInterval[], 
    userId: string, 
    dateRange: { start: Date, end: Date }
  ): Promise<TimeInterval[]>;
  
  // Tìm slot tốt nhất cho 1 task
  findBestSlot(
    task: TimeInterval, 
    userId: string,
    productivityScores: Map<number, number>  // từ algorithm 3
  ): Promise<TimeInterval>;
}
```

### Integration Flow
```
User tạo task
    ↓
AI analyze → trả về: { suggestedOrder: ['A', 'B'], difficulty: 'high' }
    ↓
Backend gọi IntervalScheduler.scheduleTasks()
    ↓
Check conflict → auto-reschedule nếu cần
    ↓
Save to DB
```

---

## 2. FREE SLOT DETECTION (Gap Finding)

### Mục tiêu
- Tìm tất cả khoảng trống trong lịch user
- Dùng cho: suggest slot mới, reschedule, task chưa lên lịch
- Giảm 70% prompt size (không cần gửi busySlots cho AI)

### Data Structure
```typescript
interface FreeSlot {
  start: Date;
  end: Date;
  duration: number;  // minutes
  productivityScore: number;  // 0-1, từ algorithm 3
}

interface SlotFinderInput {
  userId: string;
  date: Date;
  minDuration: number;  // ví dụ: 60 phút
  workHours: { start: number, end: number };  // 8-17
}
```

### Algorithm Design

#### 2.1 Merge Intervals (O(n log n))
```
Input: busySlots (TimeInterval[])
Output: mergedSlots (TimeInterval[])

Steps:
1. Sort busySlots by start time
2. Initialize merged = [firstSlot]
3. For each slot:
   - If slot.start <= lastMerged.end → merge (extend end)
   - Else → push new slot to merged
4. Return merged (không overlap, đã gộp)
```

#### 2.2 Find Free Slots (O(n))
```
Input: mergedBusySlots, workHours, minDuration
Output: FreeSlot[]

Steps:
1. freeSlots = []
2. previousEnd = workHours.start
3. For each busySlot:
   - gap = busySlot.start - previousEnd
   - If gap >= minDuration:
     - Add { start: previousEnd, end: busySlot.start, duration: gap }
   - previousEnd = busySlot.end
4. Check gap sau last busySlot đến workHours.end
5. Return freeSlots (sorted by start)
```

### API Interface
```typescript
class SlotFinder {
  // Tìm tất cả slot rảnh trong ngày
  findFreeSlots(input: SlotFinderInput): Promise<FreeSlot[]>;
  
  // Tìm slot phù hợp nhất cho task cụ thể
  findOptimalSlot(
    taskDuration: number,
    userId: string,
    preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening',
    productivityScores?: Map<number, number>
  ): Promise<FreeSlot | null>;
  
  // Kiểm tra có slot đủ lớn không (boolean)
  hasAvailableSlot(
    userId: string,
    duration: number,
    deadline: Date
  ): Promise<boolean>;
}
```

### Integration Flow
```
User muốn thêm task 2 tiếng
    ↓
AI nói: "Nên làm task này buổi sáng" (không cần biết giờ cụ thể)
    ↓
Backend gọi SlotFinder.findOptimalSlot(
  duration: 120,
  preferredTimeOfDay: 'morning',
  productivityScores: { 9: 0.9, 10: 0.85, ... }
)
    ↓
Trả về: { start: 09:00, end: 11:00, productivityScore: 0.9 }
    ↓
Check conflict → save
```

---

## 3. PRODUCTIVITY SCORING ALGORITHM

### Mục tiêu
- Tính điểm hiệu suất từng giờ từ lịch sử user
- Không cần AI → deterministic, free, testable
- Dùng cho: chọn giờ tốt nhất cho task

### Data Structure
```typescript
interface ProductivityData {
  hour: number;        // 0-23
  dayOfWeek: number;   // 0-6
  completionRate: number;  // 0-1
  averageFocusDuration: number;  // minutes
  taskCount: number;
}

interface ProductivityScore {
  hour: number;
  score: number;       // 0-1 weighted
  confidence: number;  // dựa trên sample size
}

interface TaskProfile {
  difficulty: 'easy' | 'medium' | 'hard';
  requiresFocus: boolean;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
}
```

### Algorithm Design

#### 3.1 Calculate Hourly Score (O(n))
```
Input: userHistory (completedTasks[]), lookbackDays: 30
Output: Map<hour, ProductivityScore>

Steps:
1. Filter tasks trong lookbackDays
2. Group by hour (0-23)
3. For each hour:
   - totalTasks = count
   - completedTasks = count(status === 'completed')
   - completionRate = completed / total
   - avgDuration = average(actualDuration)
   - score = completionRate * 0.7 + normalize(avgDuration) * 0.3
   - confidence = min(totalTasks / 10, 1)  // cần ít nhất 10 tasks
4. Return score map
```

#### 3.2 Weighted Scoring Formula
```typescript
function calculateTaskSlotScore(
  hour: number,
  taskProfile: TaskProfile,
  productivityData: Map<number, ProductivityScore>,
  freeSlot: FreeSlot
): number {
  
  const baseScore = productivityData.get(hour)?.score ?? 0.5;
  
  // Weight factors
  const weights = {
    productivity: 0.4,
    timePreference: 0.3,
    slotLength: 0.2,
    deadlineUrgency: 0.1
  };
  
  let score = baseScore * weights.productivity;
  
  // Time preference match
  if (taskProfile.preferredTimeOfDay) {
    const hourMatch = checkPreferredTime(hour, taskProfile.preferredTimeOfDay);
    score += (hourMatch ? 1 : 0) * weights.timePreference;
  }
  
  // Slot length adequacy
  const slotAdequacy = freeSlot.duration / estimatedDuration;
  score += Math.min(slotAdequacy, 1) * weights.slotLength;
  
  return score;
}
```

#### 3.3 Day-of-Week Adjustment
```
Phát hiện pattern theo ngày:
- User làm tốt thứ 2-6, kém chủ nhật
- Điều chỉnh score = baseScore * dayMultiplier

Day multiplier:
Mon-Fri: 1.0
Sat: 0.9
Sun: 0.7 (nếu history cho thấy ít productive)
```

### API Interface
```typescript
class ProductivityScorer {
  // Tính điểm cho tất cả giờ trong ngày
  calculateHourlyScores(
    userId: string,
    date: Date,
    lookbackDays?: number  // default 30
  ): Promise<Map<number, ProductivityScore>>;
  
  // Tìm giờ tốt nhất cho task cụ thể
  findOptimalHours(
    userId: string,
    taskProfile: TaskProfile,
    topN?: number  // trả về top N giờ
  ): Promise<ProductivityScore[]>;
  
  // So sánh 2 khung giờ cho cùng task
  compareSlots(
    slot1: FreeSlot,
    slot2: FreeSlot,
    taskProfile: TaskProfile,
    userId: string
  ): Promise<{ better: FreeSlot, reason: string }>;
  
  // Trend analysis cho dashboard
  getProductivityTrend(
    userId: string,
    days: number
  ): Promise<{ improving: boolean, bestHour: number, worstHour: number }>;
}
```

### Integration Flow
```
User tạo task: "Học tiếng Anh" (difficulty: hard)
    ↓
AI analyze → { difficulty: 'hard', requiresFocus: true }
    ↓
Backend gọi ProductivityScorer.findOptimalHours(
  taskProfile: { difficulty: 'hard', requiresFocus: true }
)
    ↓
Trả về: [
  { hour: 9, score: 0.92 },
  { hour: 10, score: 0.88 },
  { hour: 8, score: 0.85 }
]
    ↓
Gọi SlotFinder.findFreeSlots() cho các giờ này
    ↓
Chọn slot tốt nhất → check conflict → save
```

---

## 4. INTEGRATION PIPELINE (Full Flow)

### 4.1 New Task Scheduling
```
User tạo task
    ↓
┌─────────────────────────────────────┐
│  STEP 1: AI Analysis (Light)        │
│  - Phân tích difficulty             │
│  - Estimate duration                │
│  - Suggest priority order           │
│  Prompt: ~300 tokens (ngắn)         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STEP 2: Productivity Scoring       │
│  - Tính điểm các giờ trong ngày     │
│  - Find top 3 optimal hours         │
│  - No AI, O(n) algorithm            │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STEP 3: Slot Finding               │
│  - Find free slots cho 3 giờ đó     │
│  - No AI, O(n log n) algorithm      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STEP 4: Interval Scheduling        │
│  - Check conflict                   │
│  - Auto-reschedule nếu cần          │
│  - Greedy algorithm                 │
└─────────────────────────────────────┘
    ↓
Save to Calendar
```

### 4.2 Reschedule Task (Khi miss deadline)
```
Task bị miss
    ↓
┌─────────────────────────────────────┐
│  STEP 1: AI Suggestion (Optional)    │
│  - Tại sao bị miss?                 │
│  - Có cần chia nhỏ task không?      │
│  - Skip nếu user tự reschedule       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STEP 2: Find Free Slots            │
│  - Tìm tất cả slots từ now          │
│  - Cho đến deadline mới             │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STEP 3: Score & Rank Slots         │
│  - Productivity score cho mỗi slot  │
│  - Deadline urgency score           │
│  - Task difficulty match              │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  STEP 4: Conflict Check             │
│  - Kiểm tra slot đầu tiên             │
│  - Nếu conflict → check slot tiếp   │
└─────────────────────────────────────┘
    ↓
Notify user + Update calendar
```

---

## 5. DATABASE SCHEMA

### Productivity Collection
```typescript
{
  userId: ObjectId,
  hourlyStats: [
    { hour: 9, completedTasks: 45, totalTasks: 50, avgDuration: 62 },
    { hour: 14, completedTasks: 30, totalTasks: 50, avgDuration: 45 }
  ],
  lastCalculated: Date,
  lookbackDays: 30
}
```

### ScheduledTask Collection
```typescript
{
  userId: ObjectId,
  taskId: ObjectId,
  scheduledTime: {
    start: Date,
    end: Date
  },
  algorithmUsed: 'interval-scheduler',
  scores: {
    productivity: 0.92,
    urgency: 0.8,
    difficulty: 0.9
  },
  isAutoScheduled: boolean,
  aiSuggested: boolean
}
```

---

## 6. PERFORMANCE CHARACTERISTICS

| Algorithm | Time Complexity | Space Complexity | Cache Strategy |
|-----------|-----------------|------------------|----------------|
| Conflict Detection | O(n log n) | O(1) | Cache busy slots 5 min |
| Interval Scheduling | O(n log n) | O(n) | Cache schedule 1 min |
| Free Slot Detection | O(n log n) | O(n) | Cache free slots 5 min |
| Productivity Scoring | O(n) | O(1) | Cache 1 day (overnight refresh) |

---

## 7. ERROR HANDLING & FALLBACK

```typescript
// Fallback chain
1. AI suggestion + algorithms
   ↓ (if AI fails)
2. Algorithms only (deterministic)
   ↓ (if conflict)
3. Simple round-robin to next available slot
   ↓ (if no slot)
4. Queue for manual scheduling
```

---

## 8. TESTING STRATEGY

### Unit Tests
- Conflict detection: 100 test cases (edge cases)
- Slot finding: varied calendar density
- Productivity scoring: mock historical data

### Integration Tests
- Full pipeline: task → AI → algorithm → calendar
- Reschedule flow: miss → find new slot → notify

### Load Tests
- Schedule 1000 tasks concurrently
- Query free slots for 1000 users

---

**Next Step:** Bạn muốn tôi implement thuật toán nào trước?
