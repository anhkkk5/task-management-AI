# Design Document: Custom Available Time Slots

## Overview

### Purpose

Tính năng **Custom Available Time Slots** cho phép người dùng tự định nghĩa các khung giờ rảnh của mình, thay thế cơ chế `workHours` cố định hiện tại (8h-23h). Điều này giúp AI scheduler xếp task vào đúng thời gian mà người dùng thực sự có thể làm việc, tăng tính khả thi và độ hài lòng của lịch trình.

### Problem Statement

Hiện tại, hệ thống sử dụng `workHours` cố định cho tất cả người dùng:

```typescript
workHours: {
  start: 8,
  end: 23,
  breaks: [
    { start: 11.5, end: 14 },   // 11:30-14:00 nghỉ trưa
    { start: 17.5, end: 19 }    // 17:30-19:00 nghỉ tối
  ]
}
```

Vấn đề:

- Không phản ánh thực tế: Sinh viên có thể rảnh 20h-23h, nhân viên văn phòng rảnh 8h-17h
- Scheduler xếp task vào giờ user không rảnh → lịch trình không khả thi
- Không xử lý được trường hợp đặc biệt (ngày nghỉ, họp quan trọng)

### Solution Approach

1. **Weekly Pattern**: User định nghĩa lịch rảnh lặp lại hàng tuần (Thứ 2-CN)
2. **Custom Date Override**: User có thể override lịch rảnh cho ngày cụ thể
3. **Time Templates**: Cung cấp mẫu định sẵn để quick setup
4. **Scheduler Integration**: `hybrid-schedule.service.ts` sử dụng availability thay vì hardcoded workHours
5. **Conflict Detection**: Cảnh báo khi task bị xếp vào giờ không rảnh
6. **Feasibility Validation**: Kiểm tra xem user có đủ thời gian rảnh để hoàn thành task trước deadline

### Key Benefits

- **Tính khả thi cao hơn**: Lịch trình phù hợp với thời gian thực tế của user
- **Linh hoạt**: Xử lý được cả weekly pattern và special dates
- **User experience tốt hơn**: Calendar view trực quan, time templates tiện lợi
- **Backward compatible**: Fallback về workHours mặc định nếu user chưa setup

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
├─────────────────────────────────────────────────────────────┤
│  - Calendar View Component (Weekly Grid)                     │
│  - Time Picker Component                                     │
│  - Template Selector Component                               │
│  - Conflict Warning Component                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Express)                     │
├─────────────────────────────────────────────────────────────┤
│  - Availability Routes (/api/users/:userId/availability)     │
│  - Validation Middleware (Joi schemas)                       │
│  - Error Handling Middleware                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                            │
├─────────────────────────────────────────────────────────────┤
│  - availability.service.ts (CRUD, validation)                │
│  - availability-resolver.service.ts (resolve slots for date) │
│  - hybrid-schedule.service.ts (integration)                  │
│  - conflict-detection.service.ts (detect conflicts)          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Repository Layer                           │
├─────────────────────────────────────────────────────────────┤
│  - availability.repository.ts (MongoDB operations)           │
│  - Cache Layer (Redis - TTL 1h)                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
├─────────────────────────────────────────────────────────────┤
│  - MongoDB: UserAvailability collection                      │
│  - Redis: Cached weekly patterns                             │
└─────────────────────────────────────────────────────────────┘
```

### Integration with Existing Scheduler

**Current Flow** (hardcoded workHours):

```typescript
findOptimalSlotWithFallback({
  workHours: { start: 8, end: 23, breaks: [...] },  // ❌ Hardcoded
  ...
})
```

**New Flow** (dynamic availability from DB):

```typescript
// 1. Get user availability from DB (with cache)
const availableSlots = await availabilityResolver.getUserAvailableSlots(userId, date);
// This queries UserAvailability collection in MongoDB
// Returns: TimeSlot[] (e.g., [{ start: "08:00", end: "12:00" }, ...])

// 2. Get existing scheduled tasks from DB to build busy slots
const scheduledTasks = await taskRepository.getScheduledTasks({
  userId,
  startDate: date,
  endDate: date
});

// 3. Build busy slots from scheduled tasks
const busySlots = scheduledTasks.map(task => ({
  start: task.scheduledTime.start,
  end: task.scheduledTime.end,
  taskId: String(task._id)
}));

// 4. Convert available slots to workHours format for compatibility
const workHours = convertSlotsToWorkHours(availableSlots);

// 5. Use in scheduler with both availability and busy slots
findOptimalSlotWithFallback({
  workHours,      // ✅ Dynamic from UserAvailability DB
  busySlots,      // ✅ From scheduled tasks in DB
  ...
})
```

**Key Points**:

- **Backend-driven**: Tất cả logic scheduling dựa trên dữ liệu từ DB (MongoDB)
- **UserAvailability collection**: Lưu lịch rảnh của user (weekly pattern + custom dates)
- **Task collection**: Lưu scheduled tasks với `scheduledTime.start` và `scheduledTime.end`
- **Conflict prevention**: So sánh new slot với busy slots từ DB trước khi schedule
- **Frontend role**: Chỉ hiển thị UI và gọi API, không có scheduling logic

### Caching Strategy

**Redis Cache Structure**:

```typescript
// Key: `availability:weekly:${userId}`
// Value: JSON string of weeklyPattern
// TTL: 3600 seconds (1 hour)

// Key: `availability:custom:${userId}:${date}`
// Value: JSON string of custom slots for that date
// TTL: 86400 seconds (24 hours)
```

**Cache Invalidation**:

- Update weekly pattern → invalidate `availability:weekly:${userId}`
- Update custom date → invalidate `availability:custom:${userId}:${date}`
- Delete custom date → invalidate cache for that date

### Data Flow: Scheduling with Availability

**Scenario: User requests schedule plan for tasks**

```
1. Frontend → POST /api/schedule/plan
   Body: { taskIds: [...], startDate: "2025-01-06" }

2. Backend (hybrid-schedule.service.ts):
   ↓
   a. Query UserAvailability from MongoDB
      - Check cache first (Redis)
      - If miss, query DB and cache result
      Result: { weeklyPattern: {...}, customDates: [...] }

   ↓
   b. Query scheduled tasks from MongoDB
      - Find all tasks with scheduledTime in date range
      - Exclude tasks being scheduled (to avoid self-conflict)
      Result: [{ _id, scheduledTime: { start, end } }, ...]

   ↓
   c. For each day in schedule range:
      - Resolve available slots for that day
        * Check if custom date exists → use custom slots
        * Else → use weekly pattern for that day of week
      - Build busy slots from scheduled tasks
      - Convert available slots to workHours format
      - Call findOptimalSlotWithFallback with:
        * workHours (from available slots)
        * busySlots (from scheduled tasks)
        * productivityScores
      - If slot found → add to schedule
      - If no slot → warning (not enough available time)

   ↓
   d. Save schedule to MongoDB
      - Update each task with scheduledTime: { start, end }
      - Status: "scheduled"

   ↓
   e. Return schedule to frontend
      Response: { schedule: [...], warnings: [...] }

3. Frontend displays schedule in calendar view
```

**Scenario: User updates availability (weekly pattern)**

```
1. Frontend → POST /api/users/:userId/availability
   Body: { weeklyPattern: { monday: [...], ... } }

2. Backend (availability.service.ts):
   ↓
   a. Validate weeklyPattern
      - Check start < end for all slots
      - Check no overlaps within each day
      - If invalid → return 400 error

   ↓
   b. Save to MongoDB
      - Upsert UserAvailability document
      - Update weeklyPattern field

   ↓
   c. Invalidate cache
      - Delete Redis key: `availability:weekly:${userId}`

   ↓
   d. Find affected tasks
      - Query all scheduled tasks for this user
      - For each task, check if scheduledTime is still within new availability
      - If not → add to affectedTasks list

   ↓
   e. Return result
      Response: {
        availability: {...},
        affectedTasks: [
          {
            taskId,
            title,
            currentScheduledTime,
            suggestedNewSlot
          }
        ]
      }

3. Frontend shows affected tasks and offers auto-reschedule
```

**Scenario: Conflict detection when manually scheduling**

```
1. Frontend → POST /api/tasks/:taskId/schedule
   Body: { start: "2025-01-06T14:00:00", end: "2025-01-06T15:00:00" }

2. Backend (conflict-detection.service.ts):
   ↓
   a. Get user availability for that date from DB
      - Query UserAvailability
      - Resolve slots for 2025-01-06
      Result: [{ start: "08:00", end: "12:00" }]

   ↓
   b. Check if scheduled time is within available slots
      - 14:00-15:00 vs 08:00-12:00 → NOT within
      - Conflict type: "outside_availability"

   ↓
   c. Get existing scheduled tasks from DB
      - Query tasks with scheduledTime overlapping 14:00-15:00
      - If found → additional conflict type: "overlapping_task"

   ↓
   d. Find alternative slots
      - Get all available slots for that day
      - Filter out busy slots (from scheduled tasks)
      - Return top 3 slots with best productivity scores

   ↓
   e. Return conflict result
      Response: {
        hasConflict: true,
        conflictType: "outside_availability",
        message: "Task được xếp vào giờ không rảnh",
        suggestedSlots: [
          { start: "08:00", end: "09:00" },
          { start: "09:00", end: "10:00" },
          { start: "10:00", end: "11:00" }
        ]
      }

3. Frontend shows conflict warning and suggested alternatives
```

**Key Database Operations**:

1. **UserAvailability.findOne({ userId })** - Get user's availability
2. **Task.find({ userId, scheduledTime: { $exists: true } })** - Get scheduled tasks
3. **Task.updateOne({ \_id }, { $set: { scheduledTime } })** - Save scheduled time
4. **Redis.get/set** - Cache availability data
5. **Task.find({ userId, scheduledTime: { $gte: start, $lte: end } })** - Find tasks in date range

## Components and Interfaces

### 1. Data Models

**Database Collections Relationship**:

```
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB Collections                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │ UserAvailability │         │      Task        │         │
│  ├──────────────────┤         ├──────────────────┤         │
│  │ _id              │         │ _id              │         │
│  │ userId (ref)     │◄────────│ userId (ref)     │         │
│  │ weeklyPattern    │         │ title            │         │
│  │  - monday[]      │         │ estimatedDuration│         │
│  │  - tuesday[]     │         │ scheduledTime    │         │
│  │  - ...           │         │  - start (Date)  │         │
│  │ customDates[]    │         │  - end (Date)    │         │
│  │  - date          │         │ status           │         │
│  │  - slots[]       │         │ deadline         │         │
│  │ timezone         │         │ ...              │         │
│  │ createdAt        │         │                  │         │
│  │ updatedAt        │         │                  │         │
│  └──────────────────┘         └──────────────────┘         │
│                                                              │
│  Relationship: 1 User → 1 UserAvailability                  │
│  Relationship: 1 User → N Tasks                             │
│                                                              │
│  Indexes:                                                    │
│  - UserAvailability: { userId: 1 } (unique)                 │
│  - UserAvailability: { "customDates.date": 1 }              │
│  - Task: { userId: 1, "scheduledTime.start": 1 }            │
│  - Task: { userId: 1, status: 1 }                           │
└─────────────────────────────────────────────────────────────┘
```

#### UserAvailability Model

```typescript
interface TimeSlot {
  start: string; // "HH:mm" format (24-hour)
  end: string; // "HH:mm" format (24-hour)
}

interface WeeklyPattern {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

interface CustomDateOverride {
  date: string; // "YYYY-MM-DD" format
  slots: TimeSlot[];
}

interface UserAvailabilityDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  weeklyPattern: WeeklyPattern;
  customDates: CustomDateOverride[];
  timezone: string; // IANA timezone (e.g., "Asia/Ho_Chi_Minh")
  createdAt: Date;
  updatedAt: Date;
}
```

#### Time Template Model

```typescript
interface TimeTemplate {
  id: string;
  name: string;
  description: string;
  weeklyPattern: WeeklyPattern;
  category: "work" | "student" | "freelance" | "custom";
}

// Predefined templates
const TIME_TEMPLATES: TimeTemplate[] = [
  {
    id: "office-worker",
    name: "Nhân viên văn phòng",
    description: "Thứ 2-6: 8h-17h, Thứ 7-CN: 9h-12h",
    category: "work",
    weeklyPattern: {
      monday: [
        { start: "08:00", end: "12:00" },
        { start: "13:30", end: "17:00" },
      ],
      tuesday: [
        { start: "08:00", end: "12:00" },
        { start: "13:30", end: "17:00" },
      ],
      // ... similar for wed-fri
      saturday: [{ start: "09:00", end: "12:00" }],
      sunday: [{ start: "09:00", end: "12:00" }],
    },
  },
  {
    id: "student",
    name: "Sinh viên",
    description: "Buổi tối và cuối tuần",
    category: "student",
    weeklyPattern: {
      monday: [{ start: "19:00", end: "23:00" }],
      // ... similar for tue-fri
      saturday: [
        { start: "08:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      sunday: [
        { start: "08:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
    },
  },
  {
    id: "freelancer",
    name: "Freelancer",
    description: "Linh hoạt, tập trung buổi sáng và tối",
    category: "freelance",
    weeklyPattern: {
      monday: [
        { start: "08:00", end: "12:00" },
        { start: "20:00", end: "23:00" },
      ],
      // ... similar for all days
    },
  },
];
```

### 2. Service Interfaces

#### AvailabilityService

```typescript
interface AvailabilityService {
  // CRUD operations
  createOrUpdateWeeklyPattern(
    userId: string,
    weeklyPattern: WeeklyPattern,
  ): Promise<UserAvailabilityDoc>;
  getAvailability(userId: string): Promise<UserAvailabilityDoc | null>;

  // Custom dates
  addCustomDate(
    userId: string,
    date: string,
    slots: TimeSlot[],
  ): Promise<UserAvailabilityDoc>;
  removeCustomDate(userId: string, date: string): Promise<UserAvailabilityDoc>;

  // Templates
  getTemplates(): TimeTemplate[];
  applyTemplate(
    userId: string,
    templateId: string,
  ): Promise<UserAvailabilityDoc>;

  // Validation
  validateTimeSlot(slot: TimeSlot): { valid: boolean; error?: string };
  validateWeeklyPattern(pattern: WeeklyPattern): {
    valid: boolean;
    errors: string[];
  };
  checkOverlap(slots: TimeSlot[]): {
    hasOverlap: boolean;
    overlappingPairs?: [TimeSlot, TimeSlot][];
  };
}
```

#### AvailabilityResolverService

```typescript
interface AvailabilityResolverService {
  // Core resolver
  getUserAvailableSlots(userId: string, date: Date): Promise<TimeSlot[]>;

  // Batch operations
  getUserAvailableSlotsForRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, TimeSlot[]>>;

  // Conversion utilities
  convertSlotsToWorkHours(slots: TimeSlot[]): WorkHours;
  calculateTotalAvailableMinutes(slots: TimeSlot[]): number;

  // Feasibility check
  checkFeasibility(
    userId: string,
    tasks: Task[],
    startDate: Date,
  ): Promise<FeasibilityResult>;
}

interface FeasibilityResult {
  feasible: boolean;
  totalAvailableMinutes: number;
  totalRequiredMinutes: number;
  shortfallMinutes: number;
  suggestions: string[];
  taskFeasibility: {
    taskId: string;
    feasible: boolean;
    availableMinutes: number;
    requiredMinutes: number;
  }[];
}
```

#### ConflictDetectionService

```typescript
interface ConflictDetectionService {
  // Detect conflicts when scheduling
  detectSchedulingConflict(
    userId: string,
    scheduledTime: { start: Date; end: Date },
  ): Promise<ConflictResult>;

  // Find affected tasks when availability changes
  findAffectedTasks(
    userId: string,
    newAvailability: UserAvailabilityDoc,
  ): Promise<AffectedTask[]>;

  // Suggest alternative slots
  suggestAlternativeSlots(
    userId: string,
    task: Task,
    count: number,
  ): Promise<TimeSlot[]>;
}

interface ConflictResult {
  hasConflict: boolean;
  conflictType: "outside_availability" | "overlapping_task" | "none";
  message: string;
  suggestedSlots: TimeSlot[];
}

interface AffectedTask {
  taskId: string;
  title: string;
  currentScheduledTime: { start: Date; end: Date };
  isOutsideNewAvailability: boolean;
  suggestedNewSlot: TimeSlot | null;
}
```

### 3. API Endpoints

#### Availability Management

```typescript
// Create/Update weekly pattern
POST /api/users/:userId/availability
Body: {
  weeklyPattern: WeeklyPattern,
  timezone?: string
}
Response: UserAvailabilityDoc

// Get availability
GET /api/users/:userId/availability
Response: UserAvailabilityDoc | null

// Add custom date override
POST /api/users/:userId/availability/custom-dates
Body: {
  date: string,  // "YYYY-MM-DD"
  slots: TimeSlot[]
}
Response: UserAvailabilityDoc

// Remove custom date override
DELETE /api/users/:userId/availability/custom-dates/:date
Response: { success: boolean }

// Get templates
GET /api/users/:userId/availability/templates
Response: TimeTemplate[]

// Apply template
POST /api/users/:userId/availability/templates/:templateId
Response: UserAvailabilityDoc

// Copy day to other days
POST /api/users/:userId/availability/copy
Body: {
  sourceDay: "monday" | "tuesday" | ...,
  targetDays: ("monday" | "tuesday" | ...)[]
}
Response: UserAvailabilityDoc
```

#### Conflict Detection & Feasibility

```typescript
// Check feasibility for schedule plan
POST /api/users/:userId/availability/check-feasibility
Body: {
  taskIds: string[],
  startDate: string
}
Response: FeasibilityResult

// Find affected tasks after availability change
POST /api/users/:userId/availability/find-affected-tasks
Body: {
  newWeeklyPattern?: WeeklyPattern,
  newCustomDate?: CustomDateOverride
}
Response: AffectedTask[]

// Get available slots for date range
GET /api/users/:userId/availability/slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
Response: {
  [date: string]: TimeSlot[]
}
```

### 4. Frontend Components

#### CalendarView Component

```typescript
interface CalendarViewProps {
  userId: string;
  weeklyPattern: WeeklyPattern;
  customDates: CustomDateOverride[];
  scheduledTasks: Task[];
  onSlotAdd: (day: string, slot: TimeSlot) => void;
  onSlotEdit: (day: string, oldSlot: TimeSlot, newSlot: TimeSlot) => void;
  onSlotDelete: (day: string, slot: TimeSlot) => void;
}

// Features:
// - 7-column grid (Mon-Sun)
// - Color coding: green (available), gray (unavailable), yellow (custom override), blue (scheduled task)
// - Click to add slot
// - Drag & drop to resize slot
// - Hover to show details
```

#### TimePicker Component

```typescript
interface TimePickerProps {
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  min?: string; // "HH:mm"
  max?: string; // "HH:mm"
  step?: number; // minutes (default: 15)
}

// Features:
// - Native time picker on mobile
// - Custom dropdown on desktop
// - Validation (start < end)
```

#### TemplateSelector Component

```typescript
interface TemplateSelectorProps {
  templates: TimeTemplate[];
  currentPattern: WeeklyPattern | null;
  onSelect: (templateId: string) => void;
}

// Features:
// - Preview template before apply
// - Warning if current pattern exists
// - Category filtering
```

#### ConflictWarning Component

```typescript
interface ConflictWarningProps {
  conflicts: ConflictResult[];
  affectedTasks: AffectedTask[];
  onResolve: (resolution: "reschedule" | "force" | "cancel") => void;
}

// Features:
// - Visual indicator (red badge)
// - List of conflicts
// - Suggested alternative slots
// - One-click auto-reschedule
```

## Data Models

### MongoDB Schema

```typescript
import mongoose, { Schema, Types } from "mongoose";

const timeSlotSchema = new Schema(
  {
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/, // HH:mm format
    },
    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
  },
  { _id: false },
);

const weeklyPatternSchema = new Schema(
  {
    monday: [timeSlotSchema],
    tuesday: [timeSlotSchema],
    wednesday: [timeSlotSchema],
    thursday: [timeSlotSchema],
    friday: [timeSlotSchema],
    saturday: [timeSlotSchema],
    sunday: [timeSlotSchema],
  },
  { _id: false },
);

const customDateOverrideSchema = new Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD format
    },
    slots: [timeSlotSchema],
  },
  { _id: false },
);

const userAvailabilitySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
      ref: "User",
    },
    weeklyPattern: {
      type: weeklyPatternSchema,
      required: true,
      default: () => ({
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      }),
    },
    customDates: {
      type: [customDateOverrideSchema],
      default: [],
    },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Ho_Chi_Minh",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
userAvailabilitySchema.index({ userId: 1 });
userAvailabilitySchema.index({ "customDates.date": 1 });

// Validation middleware
userAvailabilitySchema.pre("save", function (next) {
  // Validate time slots don't overlap
  for (const day of Object.keys(this.weeklyPattern)) {
    const slots = this.weeklyPattern[day];
    if (hasOverlap(slots)) {
      return next(new Error(`Overlapping slots detected in ${day}`));
    }
  }

  // Validate custom dates
  for (const customDate of this.customDates) {
    if (hasOverlap(customDate.slots)) {
      return next(
        new Error(
          `Overlapping slots detected in custom date ${customDate.date}`,
        ),
      );
    }
  }

  next();
});

export const UserAvailability = mongoose.model(
  "UserAvailability",
  userAvailabilitySchema,
);
```

### Helper Functions

```typescript
// Check if time slots overlap
function hasOverlap(slots: TimeSlot[]): boolean {
  const sorted = slots.slice().sort((a, b) => a.start.localeCompare(b.start));

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.end > next.start) {
      return true;
    }
  }

  return false;
}

// Convert time string to minutes since midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to time string
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Get day name from date
function getDayName(date: Date): keyof WeeklyPattern {
  const days: (keyof WeeklyPattern)[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[date.getDay()];
}

// Format date to YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

## Algorithms

### 1. getUserAvailableSlots Algorithm

**Purpose**: Resolve available time slots for a specific date, considering both weekly pattern and custom date overrides.

**Algorithm**:

```typescript
function getUserAvailableSlots(userId: string, date: Date): TimeSlot[] {
  // 1. Check cache first
  const cacheKey = `availability:custom:${userId}:${formatDate(date)}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Get user availability from database
  const availability = await UserAvailability.findOne({ userId });
  if (!availability) {
    // Fallback to default workHours (8h-23h)
    return [
      { start: "08:00", end: "11:30" },
      { start: "14:00", end: "17:30" },
      { start: "19:00", end: "23:00" },
    ];
  }

  // 3. Check if there's a custom date override
  const dateStr = formatDate(date);
  const customDate = availability.customDates.find((cd) => cd.date === dateStr);

  if (customDate) {
    // Use custom date slots
    await redis.set(cacheKey, JSON.stringify(customDate.slots), "EX", 86400);
    return customDate.slots;
  }

  // 4. Use weekly pattern
  const dayName = getDayName(date);
  const slots = availability.weeklyPattern[dayName];

  // Cache weekly pattern slots
  await redis.set(cacheKey, JSON.stringify(slots), "EX", 3600);

  return slots;
}
```

**Time Complexity**: O(1) with cache, O(n) without cache (n = number of custom dates)
**Space Complexity**: O(1)

### 2. Conflict Detection Algorithm

**Purpose**: Detect if a scheduled time conflicts with user availability or existing tasks.

**Algorithm**:

```typescript
function detectSchedulingConflict(
  userId: string,
  scheduledTime: { start: Date; end: Date },
): ConflictResult {
  // 1. Get available slots for the date
  const date = scheduledTime.start;
  const availableSlots = await getUserAvailableSlots(userId, date);

  // 2. Check if scheduled time is within available slots
  const isWithinAvailability = availableSlots.some((slot) => {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);
    const schedStart =
      scheduledTime.start.getHours() * 60 + scheduledTime.start.getMinutes();
    const schedEnd =
      scheduledTime.end.getHours() * 60 + scheduledTime.end.getMinutes();

    return schedStart >= slotStart && schedEnd <= slotEnd;
  });

  if (!isWithinAvailability) {
    return {
      hasConflict: true,
      conflictType: "outside_availability",
      message: "Task được xếp vào giờ không rảnh",
      suggestedSlots: availableSlots,
    };
  }

  // 3. Check if overlaps with existing tasks
  const existingTasks = await Task.find({
    userId,
    "scheduledTime.start": { $lte: scheduledTime.end },
    "scheduledTime.end": { $gte: scheduledTime.start },
  });

  if (existingTasks.length > 0) {
    return {
      hasConflict: true,
      conflictType: "overlapping_task",
      message: `Trùng với ${existingTasks.length} task khác`,
      suggestedSlots: await findAlternativeSlots(
        userId,
        scheduledTime,
        availableSlots,
      ),
    };
  }

  return {
    hasConflict: false,
    conflictType: "none",
    message: "Không có conflict",
    suggestedSlots: [],
  };
}
```

**Time Complexity**: O(n + m) where n = number of available slots, m = number of existing tasks
**Space Complexity**: O(m)

### 3. Feasibility Check Algorithm

**Purpose**: Validate if user has enough available time to complete all tasks before their deadlines.

**Algorithm**:

```typescript
function checkFeasibility(
  userId: string,
  tasks: Task[],
  startDate: Date,
): FeasibilityResult {
  const taskFeasibility = [];
  let totalAvailableMinutes = 0;
  let totalRequiredMinutes = 0;

  for (const task of tasks) {
    const deadline =
      task.deadline || new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const requiredMinutes = task.estimatedDuration || 0;
    totalRequiredMinutes += requiredMinutes;

    // Calculate available minutes from startDate to deadline
    let availableMinutes = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= deadline) {
      const slots = await getUserAvailableSlots(userId, currentDate);
      const dailyAvailable = slots.reduce((sum, slot) => {
        return sum + (timeToMinutes(slot.end) - timeToMinutes(slot.start));
      }, 0);

      availableMinutes += dailyAvailable;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    totalAvailableMinutes += availableMinutes;

    taskFeasibility.push({
      taskId: task._id,
      feasible: availableMinutes >= requiredMinutes,
      availableMinutes,
      requiredMinutes,
    });
  }

  const shortfallMinutes = Math.max(
    0,
    totalRequiredMinutes - totalAvailableMinutes,
  );
  const feasible = shortfallMinutes === 0;

  const suggestions = [];
  if (!feasible) {
    suggestions.push(
      `Mở rộng lịch rảnh thêm ${Math.ceil(shortfallMinutes / 60)} giờ`,
    );
    suggestions.push("Gia hạn deadline của các task");
    suggestions.push("Giảm scope hoặc chia nhỏ task");
  }

  return {
    feasible,
    totalAvailableMinutes,
    totalRequiredMinutes,
    shortfallMinutes,
    suggestions,
    taskFeasibility,
  };
}
```

**Time Complexity**: O(t × d × s) where t = number of tasks, d = days until deadline, s = slots per day
**Space Complexity**: O(t)

### 4. Find Affected Tasks Algorithm

**Purpose**: Find tasks that will be affected when user changes their availability.

**Algorithm**:

```typescript
function findAffectedTasks(
  userId: string,
  newAvailability: UserAvailabilityDoc,
): AffectedTask[] {
  // 1. Get all scheduled tasks
  const scheduledTasks = await Task.find({
    userId,
    status: "scheduled",
    "scheduledTime.start": { $exists: true },
  });

  const affectedTasks: AffectedTask[] = [];

  // 2. Check each task against new availability
  for (const task of scheduledTasks) {
    const scheduledStart = task.scheduledTime.start;
    const scheduledEnd = task.scheduledTime.end;
    const date = new Date(scheduledStart);

    // Get new available slots for this date
    const dateStr = formatDate(date);
    const customDate = newAvailability.customDates.find(
      (cd) => cd.date === dateStr,
    );
    const dayName = getDayName(date);
    const newSlots = customDate
      ? customDate.slots
      : newAvailability.weeklyPattern[dayName];

    // Check if task is still within available slots
    const isWithinNewAvailability = newSlots.some((slot) => {
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);
      const taskStart =
        scheduledStart.getHours() * 60 + scheduledStart.getMinutes();
      const taskEnd = scheduledEnd.getHours() * 60 + scheduledEnd.getMinutes();

      return taskStart >= slotStart && taskEnd <= slotEnd;
    });

    if (!isWithinNewAvailability) {
      // Find suggested new slot
      const suggestedSlot = await findBestSlot(userId, task, newSlots);

      affectedTasks.push({
        taskId: task._id,
        title: task.title,
        currentScheduledTime: {
          start: scheduledStart,
          end: scheduledEnd,
        },
        isOutsideNewAvailability: true,
        suggestedNewSlot: suggestedSlot,
      });
    }
  }

  return affectedTasks;
}
```

**Time Complexity**: O(t × s) where t = number of scheduled tasks, s = slots per day
**Space Complexity**: O(a) where a = number of affected tasks

### 5. Overlap Detection Algorithm

**Purpose**: Check if time slots overlap within the same day.

**Algorithm**:

```typescript
function checkOverlap(slots: TimeSlot[]): {
  hasOverlap: boolean;
  overlappingPairs?: [TimeSlot, TimeSlot][];
} {
  if (slots.length < 2) {
    return { hasOverlap: false };
  }

  // Sort slots by start time
  const sorted = slots.slice().sort((a, b) => {
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });

  const overlappingPairs: [TimeSlot, TimeSlot][] = [];

  // Check adjacent slots
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentEnd = timeToMinutes(current.end);
    const nextStart = timeToMinutes(next.start);

    if (currentEnd > nextStart) {
      overlappingPairs.push([current, next]);
    }
  }

  return {
    hasOverlap: overlappingPairs.length > 0,
    overlappingPairs:
      overlappingPairs.length > 0 ? overlappingPairs : undefined,
  };
}
```

**Time Complexity**: O(n log n) due to sorting
**Space Complexity**: O(n)

### 6. Convert Slots to WorkHours Algorithm

**Purpose**: Convert user's available time slots to the `workHours` format used by the scheduler.

**Algorithm**:

```typescript
function convertSlotsToWorkHours(slots: TimeSlot[]): WorkHours {
  if (slots.length === 0) {
    // Fallback to default
    return {
      start: 8,
      end: 23,
      breaks: [
        { start: 11.5, end: 14 },
        { start: 17.5, end: 19 },
      ],
    };
  }

  // Sort slots by start time
  const sorted = slots.slice().sort((a, b) => {
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });

  // Find overall start and end
  const firstSlot = sorted[0];
  const lastSlot = sorted[sorted.length - 1];

  const start = timeToMinutes(firstSlot.start) / 60;
  const end = timeToMinutes(lastSlot.end) / 60;

  // Find breaks (gaps between slots)
  const breaks: { start: number; end: number }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = timeToMinutes(sorted[i].end);
    const nextStart = timeToMinutes(sorted[i + 1].start);

    if (nextStart > currentEnd) {
      breaks.push({
        start: currentEnd / 60,
        end: nextStart / 60,
      });
    }
  }

  return {
    start,
    end,
    breaks,
  };
}
```

**Time Complexity**: O(n log n) due to sorting
**Space Complexity**: O(b) where b = number of breaks

### 7. Integration with Scheduler

**Modified `findOptimalSlotWithFallback` in hybrid-schedule.service.ts**:

```typescript
// BEFORE (hardcoded):
const { slot: optimalSlot, duration: actualDuration } =
  findOptimalSlotWithFallback({
    preferredDuration,
    minDuration: Math.min(minChunkMinutes, preferredDuration),
    stepMinutes,
    preferredTimeOfDay,
    productivityScores,
    busySlots: existingBusySlots,
    date: new Date(currentDate),
    workHours: {
      start: 8,
      end: 23,
      breaks: [
        { start: 11.5, end: 14 },
        { start: 17.5, end: 19 },
      ],
    },
    bufferMinutes: 15,
    currentTime: now,
  });

// AFTER (dynamic availability):
const availableSlots = await availabilityResolver.getUserAvailableSlots(
  userId,
  currentDate,
);
const workHours = convertSlotsToWorkHours(availableSlots);

const { slot: optimalSlot, duration: actualDuration } =
  findOptimalSlotWithFallback({
    preferredDuration,
    minDuration: Math.min(minChunkMinutes, preferredDuration),
    stepMinutes,
    preferredTimeOfDay,
    productivityScores,
    busySlots: existingBusySlots,
    date: new Date(currentDate),
    workHours, // ✅ Dynamic from user availability
    bufferMinutes: 15,
    currentTime: now,
  });
```

**Key Changes**:

1. Call `getUserAvailableSlots(userId, date)` before scheduling each day
2. Convert slots to `workHours` format using `convertSlotsToWorkHours()`
3. Pass dynamic `workHours` to `findOptimalSlotWithFallback()`
4. Cache results to avoid repeated database queries

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property Reflection

Sau khi phân tích acceptance criteria, tôi đã xác định các properties sau. Một số properties có thể được kết hợp để tránh redundancy:

**Redundancy Analysis**:

- Properties 1.2 và 2.5 (validation start < end) → Kết hợp thành Property 1
- Properties 4.1 và 4.2 (scheduler chỉ xếp vào available slots) → Kết hợp thành Property 4
- Properties 6.2 và 6.3 (feasibility check) → Kết hợp thành Property 7

### Property 1: Time Slot Validation

_For any_ time slot with start and end times, the validation function SHALL reject slots where start time >= end time, and SHALL accept slots where start time < end time.

**Validates: Requirements 1.2, 2.5**

### Property 2: Overlap Detection Correctness

_For any_ set of time slots within the same day, the overlap detection function SHALL correctly identify all pairs of overlapping slots, where two slots overlap if and only if one slot's end time is greater than the other slot's start time (after sorting by start time).

**Validates: Requirements 1.3**

### Property 3: Custom Date Override Resolution

_For any_ date and user, if a custom date override exists for that date, then `getUserAvailableSlots(userId, date)` SHALL return the custom override slots; otherwise, it SHALL return the weekly pattern slots for that day of the week.

**Validates: Requirements 2.2**

### Property 4: Template Application Correctness

_For any_ time template, when a user applies that template, the resulting weekly pattern SHALL exactly match the template's weekly pattern.

**Validates: Requirements 3.2**

### Property 5: Scheduler Respects Availability

_For any_ task scheduled by the AI scheduler, the scheduled time slot SHALL fall entirely within one of the user's available time slots for that date (no part of the scheduled task SHALL be outside available slots).

**Validates: Requirements 4.1, 4.2**

### Property 6: Scheduler Prioritizes Longer Slots

_For any_ scheduling scenario with multiple available slots of different lengths, when the scheduler needs to place a task, it SHALL prefer slots with longer duration over shorter slots (given equal productivity scores).

**Validates: Requirements 4.4**

### Property 7: Busy Slot Calculation Correctness

_For any_ date, the calculated busy slots SHALL be the union of (1) time ranges occupied by scheduled tasks and (2) time ranges outside the user's available slots, such that no two busy slots overlap and they are sorted by start time.

**Validates: Requirements 4.6**

### Property 8: Conflict Detection Accuracy

_For any_ scheduled time and user availability, the conflict detection function SHALL return `hasConflict: true` if and only if the scheduled time is not entirely contained within any available slot OR overlaps with an existing scheduled task.

**Validates: Requirements 5.1**

### Property 9: Alternative Slot Suggestions Validity

_For any_ conflict scenario, all suggested alternative slots SHALL be (1) within the user's available time slots, (2) not overlapping with existing scheduled tasks, and (3) long enough to accommodate the task duration.

**Validates: Requirements 5.4**

### Property 10: Affected Task Detection Completeness

_For any_ change to user availability (weekly pattern or custom date), the affected task detection function SHALL identify all and only those scheduled tasks whose scheduled time is no longer entirely within the new available slots.

**Validates: Requirements 5.5**

### Property 11: Total Available Time Calculation

_For any_ date range and user availability, the calculated total available minutes SHALL equal the sum of (end - start) for all available slots across all dates in the range, where custom date overrides take precedence over weekly patterns.

**Validates: Requirements 6.1**

### Property 12: Feasibility Check Correctness

_For any_ set of tasks with deadlines and a user's availability, the feasibility check SHALL return `feasible: false` if and only if the total required minutes (sum of all task durations) exceeds the total available minutes from start date to the latest deadline.

**Validates: Requirements 6.3, 6.5**

### Property 13: Slot-to-WorkHours Conversion Preserves Time

_For any_ set of available time slots, converting them to `WorkHours` format and back SHALL preserve the total available minutes (within a tolerance of 1 minute due to rounding).

**Validates: Integration requirement (not explicitly in requirements but critical for scheduler integration)**

### Property 14: Cache Consistency

_For any_ user availability update (weekly pattern or custom date), after cache invalidation, the next call to `getUserAvailableSlots` SHALL return data consistent with the database, not stale cached data.

**Validates: Requirements 13.2**

## Error Handling

### Validation Errors

**Time Slot Validation**:

```typescript
class TimeSlotValidationError extends Error {
  constructor(
    message: string,
    public slot: TimeSlot,
  ) {
    super(message);
    this.name = "TimeSlotValidationError";
  }
}

// Usage
if (timeToMinutes(slot.start) >= timeToMinutes(slot.end)) {
  throw new TimeSlotValidationError("Start time must be before end time", slot);
}
```

**Overlap Detection**:

```typescript
class OverlapError extends Error {
  constructor(
    message: string,
    public overlappingPairs: [TimeSlot, TimeSlot][],
  ) {
    super(message);
    this.name = "OverlapError";
  }
}

// Usage
const { hasOverlap, overlappingPairs } = checkOverlap(slots);
if (hasOverlap) {
  throw new OverlapError("Time slots overlap", overlappingPairs!);
}
```

**Invalid Date Format**:

```typescript
class InvalidDateFormatError extends Error {
  constructor(
    message: string,
    public date: string,
  ) {
    super(message);
    this.name = "InvalidDateFormatError";
  }
}

// Usage
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  throw new InvalidDateFormatError(
    "Date must be in YYYY-MM-DD format",
    dateStr,
  );
}
```

### API Error Responses

**400 Bad Request** - Validation errors:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Time slot validation failed",
  "details": {
    "field": "weeklyPattern.monday[0]",
    "reason": "Start time must be before end time",
    "value": { "start": "10:00", "end": "08:00" }
  }
}
```

**404 Not Found** - User or resource not found:

```json
{
  "error": "NOT_FOUND",
  "message": "User availability not found",
  "userId": "507f1f77bcf86cd799439011"
}
```

**409 Conflict** - Overlapping slots:

```json
{
  "error": "OVERLAP_DETECTED",
  "message": "Time slots overlap",
  "overlappingPairs": [
    [
      { "start": "08:00", "end": "10:00" },
      { "start": "09:00", "end": "11:00" }
    ]
  ]
}
```

**500 Internal Server Error** - Database or cache errors:

```json
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to update user availability",
  "details": "Database connection timeout"
}
```

### Graceful Degradation

**Cache Failure**:

```typescript
async function getUserAvailableSlots(
  userId: string,
  date: Date,
): Promise<TimeSlot[]> {
  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (cacheError) {
    console.warn("Cache read failed, falling back to database", cacheError);
    // Continue to database query
  }

  // Query database
  const availability = await UserAvailability.findOne({ userId });

  // ... rest of logic
}
```

**Database Failure**:

```typescript
async function getUserAvailableSlots(
  userId: string,
  date: Date,
): Promise<TimeSlot[]> {
  try {
    const availability = await UserAvailability.findOne({ userId });
    // ... logic
  } catch (dbError) {
    console.error("Database query failed, using default workHours", dbError);

    // Fallback to default workHours
    return [
      { start: "08:00", end: "11:30" },
      { start: "14:00", end: "17:30" },
      { start: "19:00", end: "23:00" },
    ];
  }
}
```

**Scheduler Integration Failure**:

```typescript
// In hybrid-schedule.service.ts
try {
  const availableSlots = await availabilityResolver.getUserAvailableSlots(
    userId,
    currentDate,
  );
  const workHours = convertSlotsToWorkHours(availableSlots);
} catch (error) {
  console.error(
    "Failed to get user availability, using default workHours",
    error,
  );

  // Fallback to hardcoded workHours
  const workHours = {
    start: 8,
    end: 23,
    breaks: [
      { start: 11.5, end: 14 },
      { start: 17.5, end: 19 },
    ],
  };
}
```

### Conflict Resolution Strategies

**Strategy 1: Auto-Reschedule**

```typescript
async function autoRescheduleAffectedTasks(
  affectedTasks: AffectedTask[]
): Promise<{ success: boolean; rescheduled: string[]; failed: string[] }> {
  const rescheduled: string[] = [];
  const failed: string[] = [];

  for (const affectedTask of affectedTasks) {
    try {
      if (affectedTask.suggestedNewSlot) {
        await Task.updateOne(
          { _id: affectedTask.taskId },
          {
            $set: {
              "scheduledTime.start": /* convert suggestedNewSlot to Date */,
              "scheduledTime.end": /* convert suggestedNewSlot to Date */
            }
          }
        );
        rescheduled.push(affectedTask.taskId);
      } else {
        failed.push(affectedTask.taskId);
      }
    } catch (error) {
      console.error(`Failed to reschedule task ${affectedTask.taskId}`, error);
      failed.push(affectedTask.taskId);
    }
  }

  return {
    success: failed.length === 0,
    rescheduled,
    failed
  };
}
```

**Strategy 2: Manual Review**

```typescript
// Return affected tasks to user for manual decision
async function getAffectedTasksForReview(
  userId: string,
  newAvailability: UserAvailabilityDoc,
): Promise<{
  affectedTasks: AffectedTask[];
  recommendations: string[];
}> {
  const affectedTasks = await findAffectedTasks(userId, newAvailability);

  const recommendations = [
    "Review each affected task and choose to reschedule or adjust availability",
    `${affectedTasks.length} tasks need attention`,
    "Consider using auto-reschedule for tasks with suggested slots",
  ];

  return { affectedTasks, recommendations };
}
```

### Logging and Monitoring

**Structured Logging**:

```typescript
import { logger } from "../utils/logger";

// Log availability updates
logger.info("User availability updated", {
  userId,
  action: "update_weekly_pattern",
  affectedDays: Object.keys(weeklyPattern).filter(
    (day) => weeklyPattern[day].length > 0,
  ),
  timestamp: new Date().toISOString(),
});

// Log conflicts
logger.warn("Scheduling conflict detected", {
  userId,
  taskId,
  scheduledTime,
  conflictType: "outside_availability",
  timestamp: new Date().toISOString(),
});

// Log errors
logger.error("Failed to get user availability", {
  userId,
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString(),
});
```

**Metrics**:

```typescript
// Track availability utilization
metrics.gauge("availability.utilization_rate", utilizationRate, {
  userId,
  week: weekNumber,
});

// Track conflict detection
metrics.increment("availability.conflicts_detected", {
  userId,
  conflictType,
});

// Track cache hit rate
metrics.increment("availability.cache_hit", { hit: cached ? "true" : "false" });
```

## Testing Strategy

### Dual Testing Approach

Tính năng này sử dụng kết hợp **Property-Based Testing** và **Example-Based Unit Testing**:

- **Property-Based Tests**: Verify universal properties across all inputs (validation, conflict detection, scheduling integration)
- **Unit Tests**: Verify specific examples, edge cases, and error conditions (CRUD operations, API endpoints, UI components)

### Property-Based Testing

**Library**: `fast-check` (already in package.json)

**Configuration**:

- Minimum 100 iterations per property test
- Each test tagged with feature name and property number
- Tag format: `Feature: custom-available-time-slots, Property {number}: {property_text}`

**Example Property Test**:

```typescript
import fc from "fast-check";

describe("Feature: custom-available-time-slots", () => {
  describe("Property 1: Time Slot Validation", () => {
    it("should reject slots where start >= end", () => {
      fc.assert(
        fc.property(
          fc.record({
            start: fc
              .string({ minLength: 5, maxLength: 5 })
              .filter((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
            end: fc
              .string({ minLength: 5, maxLength: 5 })
              .filter((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
          }),
          (slot) => {
            const result = validateTimeSlot(slot);
            const startMinutes = timeToMinutes(slot.start);
            const endMinutes = timeToMinutes(slot.end);

            if (startMinutes >= endMinutes) {
              expect(result.valid).toBe(false);
              expect(result.error).toContain(
                "Start time must be before end time",
              );
            } else {
              expect(result.valid).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property 2: Overlap Detection Correctness", () => {
    it("should correctly identify all overlapping pairs", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc
              .record({
                start: fc
                  .string({ minLength: 5, maxLength: 5 })
                  .filter((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
                end: fc
                  .string({ minLength: 5, maxLength: 5 })
                  .filter((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
              })
              .filter(
                (slot) => timeToMinutes(slot.start) < timeToMinutes(slot.end),
              ),
            { minLength: 0, maxLength: 10 },
          ),
          (slots) => {
            const result = checkOverlap(slots);

            // Manually check for overlaps
            const sorted = slots
              .slice()
              .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

            let expectedOverlaps = 0;
            for (let i = 0; i < sorted.length - 1; i++) {
              if (
                timeToMinutes(sorted[i].end) >
                timeToMinutes(sorted[i + 1].start)
              ) {
                expectedOverlaps++;
              }
            }

            expect(result.hasOverlap).toBe(expectedOverlaps > 0);
            if (result.hasOverlap) {
              expect(result.overlappingPairs?.length).toBe(expectedOverlaps);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property 5: Scheduler Respects Availability", () => {
    it("should only schedule tasks within available slots", async () => {
      fc.assert(
        await fc.asyncProperty(
          fc.record({
            userId: fc.hexaString({ minLength: 24, maxLength: 24 }),
            tasks: fc.array(
              fc.record({
                title: fc.string({ minLength: 1, maxLength: 50 }),
                estimatedDuration: fc.integer({ min: 30, max: 240 }),
                priority: fc.constantFrom("low", "medium", "high", "urgent"),
              }),
              { minLength: 1, maxLength: 5 },
            ),
            availableSlots: fc.array(
              fc
                .record({
                  start: fc
                    .string({ minLength: 5, maxLength: 5 })
                    .filter((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
                  end: fc
                    .string({ minLength: 5, maxLength: 5 })
                    .filter((s) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(s)),
                })
                .filter(
                  (slot) => timeToMinutes(slot.start) < timeToMinutes(slot.end),
                ),
              { minLength: 1, maxLength: 5 },
            ),
          }),
          async ({ userId, tasks, availableSlots }) => {
            // Setup: Create user availability
            await UserAvailability.create({
              userId: new Types.ObjectId(userId),
              weeklyPattern: {
                monday: availableSlots,
                tuesday: availableSlots,
                wednesday: availableSlots,
                thursday: availableSlots,
                friday: availableSlots,
                saturday: availableSlots,
                sunday: availableSlots,
              },
              timezone: "Asia/Ho_Chi_Minh",
            });

            // Create tasks
            const createdTasks = await Promise.all(
              tasks.map((task) =>
                Task.create({ ...task, userId: new Types.ObjectId(userId) }),
              ),
            );

            // Schedule tasks
            const schedule = await hybridScheduleService.schedulePlan(userId, {
              taskIds: createdTasks.map((t) => String(t._id)),
              startDate: new Date(),
            });

            // Verify: All scheduled tasks are within available slots
            for (const day of schedule.schedule) {
              for (const session of day.tasks) {
                const [startTime, endTime] = session.suggestedTime.split(" - ");
                const sessionStart = timeToMinutes(startTime);
                const sessionEnd = timeToMinutes(endTime);

                const isWithinAvailability = availableSlots.some((slot) => {
                  const slotStart = timeToMinutes(slot.start);
                  const slotEnd = timeToMinutes(slot.end);
                  return sessionStart >= slotStart && sessionEnd <= slotEnd;
                });

                expect(isWithinAvailability).toBe(true);
              }
            }

            // Cleanup
            await UserAvailability.deleteOne({
              userId: new Types.ObjectId(userId),
            });
            await Task.deleteMany({ userId: new Types.ObjectId(userId) });
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
```

### Unit Testing

**CRUD Operations**:

```typescript
describe("AvailabilityService", () => {
  describe("createOrUpdateWeeklyPattern", () => {
    it("should create new availability for user without existing data", async () => {
      const userId = new Types.ObjectId();
      const weeklyPattern = {
        monday: [{ start: "08:00", end: "12:00" }],
        tuesday: [{ start: "08:00", end: "12:00" }],
        // ... rest of week
      };

      const result = await availabilityService.createOrUpdateWeeklyPattern(
        String(userId),
        weeklyPattern,
      );

      expect(result.userId).toEqual(userId);
      expect(result.weeklyPattern.monday).toEqual(weeklyPattern.monday);
    });

    it("should update existing availability", async () => {
      // ... test update scenario
    });
  });

  describe("addCustomDate", () => {
    it("should add custom date override", async () => {
      // ... test
    });

    it("should replace existing custom date for same date", async () => {
      // ... test
    });
  });
});
```

**API Endpoints**:

```typescript
describe("Availability API", () => {
  describe("POST /api/users/:userId/availability", () => {
    it("should create availability with valid data", async () => {
      const response = await request(app)
        .post(`/api/users/${userId}/availability`)
        .send({
          weeklyPattern: validWeeklyPattern,
          timezone: "Asia/Ho_Chi_Minh",
        })
        .expect(200);

      expect(response.body.userId).toBe(userId);
    });

    it("should return 400 for invalid time slot", async () => {
      const response = await request(app)
        .post(`/api/users/${userId}/availability`)
        .send({
          weeklyPattern: {
            monday: [{ start: "10:00", end: "08:00" }], // Invalid: start > end
          },
        })
        .expect(400);

      expect(response.body.error).toBe("VALIDATION_ERROR");
    });

    it("should return 409 for overlapping slots", async () => {
      // ... test
    });
  });
});
```

**Edge Cases**:

```typescript
describe("Edge Cases", () => {
  it("should handle user with no availability (fallback to default)", async () => {
    const slots = await availabilityResolver.getUserAvailableSlots(
      userId,
      new Date(),
    );

    expect(slots).toEqual([
      { start: "08:00", end: "11:30" },
      { start: "14:00", end: "17:30" },
      { start: "19:00", end: "23:00" },
    ]);
  });

  it("should handle empty weekly pattern for a day", async () => {
    // ... test
  });

  it("should handle custom date in the past", async () => {
    // ... test
  });

  it("should handle timezone conversion", async () => {
    // ... test
  });
});
```

### Integration Testing

**Scheduler Integration**:

```typescript
describe("Scheduler Integration", () => {
  it("should use user availability instead of hardcoded workHours", async () => {
    // Setup: Create user with limited availability (only 20:00-23:00)
    await UserAvailability.create({
      userId,
      weeklyPattern: {
        monday: [{ start: "20:00", end: "23:00" }],
        // ... same for all days
      },
    });

    // Create task
    const task = await Task.create({
      userId,
      title: "Test Task",
      estimatedDuration: 60,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Schedule
    const schedule = await hybridScheduleService.schedulePlan(userId, {
      taskIds: [String(task._id)],
      startDate: new Date(),
    });

    // Verify: All sessions are between 20:00-23:00
    for (const day of schedule.schedule) {
      for (const session of day.tasks) {
        const [startTime] = session.suggestedTime.split(" - ");
        const hour = parseInt(startTime.split(":")[0]);
        expect(hour).toBeGreaterThanOrEqual(20);
        expect(hour).toBeLessThan(23);
      }
    }
  });
});
```

**Conflict Detection Integration**:

```typescript
describe("Conflict Detection Integration", () => {
  it("should detect conflict when manually scheduling outside availability", async () => {
    // Setup availability: 08:00-12:00
    await UserAvailability.create({
      userId,
      weeklyPattern: {
        monday: [{ start: "08:00", end: "12:00" }],
      },
    });

    // Try to schedule at 14:00-15:00 (outside availability)
    const conflict = await conflictDetectionService.detectSchedulingConflict(
      userId,
      {
        start: new Date("2025-01-06T14:00:00"), // Monday 14:00
        end: new Date("2025-01-06T15:00:00"),
      },
    );

    expect(conflict.hasConflict).toBe(true);
    expect(conflict.conflictType).toBe("outside_availability");
    expect(conflict.suggestedSlots.length).toBeGreaterThan(0);
  });
});
```

### Performance Testing

**Cache Performance**:

```typescript
describe("Cache Performance", () => {
  it("should complete availability query within 100ms (90% of requests)", async () => {
    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await availabilityResolver.getUserAvailableSlots(userId, new Date());
      const end = Date.now();
      times.push(end - start);
    }

    times.sort((a, b) => a - b);
    const p90 = times[Math.floor(iterations * 0.9)];

    expect(p90).toBeLessThan(100);
  });
});
```

### Test Coverage Goals

- **Unit Tests**: 80% code coverage
- **Property Tests**: 100% coverage of correctness properties
- **Integration Tests**: All critical paths (scheduler integration, conflict detection, API endpoints)
- **E2E Tests**: Key user flows (setup availability, schedule tasks, handle conflicts)
