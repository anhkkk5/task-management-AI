# Design Document: AI-Powered Task Breakdown with Chatbot Integration

## Overview

Feature này mở rộng hệ thống task management hiện tại bằng cách cho phép người dùng phân rã một task lớn thành các subtask nhỏ hơn thông qua Groq AI, sau đó tương tác với chatbot để học và thực hành từng subtask.

**Luồng chính:**

1. User tạo task lớn (Parent_Task) → click "AI Breakdown" → backend gọi Groq API → trả về danh sách subtasks với metadata (title, estimatedDuration, difficulty, description)
2. Subtasks được lưu vào `task.aiBreakdown` và hiển thị trong `SubtaskList` component
3. User click vào một subtask → Chatbot mở với system prompt được khởi tạo theo context của subtask đó
4. Task_Scheduler tự động xếp lịch các subtasks vào calendar của user

**Quyết định thiết kế quan trọng:**

- Tái sử dụng endpoint `POST /tasks/:id/ai-breakdown` đã có, mở rộng thêm fields `description` và `difficulty` trong response
- Chatbot vẫn gọi Groq trực tiếp từ frontend (giữ nguyên kiến trúc hiện tại), chỉ thêm cơ chế inject context theo subtask
- Không tạo backend endpoint mới cho chatbot — context được truyền qua props vào component hiện có

---

## Architecture

```mermaid
graph TB
    subgraph Frontend ["Frontend (React + TypeScript)"]
        TF[TaskForm]
        ABB[AIBreakdownButton]
        SL[SubtaskList]
        SI[SubtaskItem]
        CB[Chatbot Component]
        CBCtx[ChatbotContext Provider]
    end

    subgraph Backend ["Backend (Node.js + Express)"]
        TR[POST /tasks/:id/ai-breakdown]
        TS[task.service.aiBreakdown]
        AIS[ai.service.taskBreakdown]
        AIP[ai.provider - Groq]
        TM[Task Model - MongoDB]
    end

    subgraph External
        GROQ[Groq API\nllama-3.1-8b-instant]
    end

    TF --> ABB
    ABB -->|POST /tasks/:id/ai-breakdown| TR
    TR --> TS
    TS --> AIS
    AIS --> AIP
    AIP --> GROQ
    GROQ -->|subtasks JSON| AIP
    AIP --> AIS
    AIS --> TS
    TS -->|save aiBreakdown| TM
    TS -->|return PublicTask| TR
    TR -->|{ task }| ABB
    ABB --> SL
    SL --> SI
    SI -->|onClick: subtask context| CBCtx
    CBCtx --> CB
    CB -->|Groq API direct call| GROQ
```

**Luồng dữ liệu:**

- Backend xử lý AI breakdown và lưu vào MongoDB
- Frontend nhận subtasks từ response và render `SubtaskList`
- Khi user click subtask, `ChatbotContext` được cập nhật với subtask context
- Chatbot gọi Groq trực tiếp từ frontend với system prompt chứa subtask context

---

## Components and Interfaces

### Backend

#### `task.service.aiBreakdown` (mở rộng)

Endpoint đã có `POST /tasks/:id/ai-breakdown` được mở rộng để:

- Gọi `ai.service.taskBreakdown` với prompt mới yêu cầu thêm `difficulty` và `description`
- Lưu các fields mới vào `task.aiBreakdown`

#### `ai.service.taskBreakdown` (mở rộng prompt)

Prompt mới yêu cầu Groq trả về JSON với format:

```json
{
  "steps": [
    {
      "title": "string",
      "status": "todo",
      "estimatedDuration": 30,
      "difficulty": "easy|medium|hard",
      "description": "string"
    }
  ],
  "totalEstimatedDuration": 120
}
```

### Frontend

#### `AIBreakdownButton` component

```typescript
interface AIBreakdownButtonProps {
  taskId: string;
  onBreakdownComplete: (subtasks: Subtask[]) => void;
  disabled?: boolean;
}
```

- Hiển thị nút "AI Breakdown" trong TaskForm hoặc TaskDetail
- Gọi `POST /tasks/:id/ai-breakdown`
- Hiển thị loading state trong khi chờ
- Gọi `onBreakdownComplete` với danh sách subtasks khi thành công

#### `SubtaskList` component

```typescript
interface SubtaskListProps {
  subtasks: Subtask[];
  onSubtaskClick: (subtask: Subtask) => void;
  onStatusChange: (subtaskIndex: number, status: SubtaskStatus) => void;
  parentTaskTitle: string;
}
```

- Render danh sách subtasks theo thứ tự từ AI
- Mỗi item hiển thị: title, estimatedDuration, difficulty badge, description
- Click vào subtask title → trigger chatbot
- Dropdown để thay đổi status

#### `SubtaskItem` component

```typescript
interface SubtaskItemProps {
  subtask: Subtask;
  index: number;
  parentTaskTitle: string;
  onChatOpen: (subtask: Subtask, parentTaskTitle: string) => void;
  onStatusChange: (index: number, status: SubtaskStatus) => void;
}
```

#### `ChatbotContext` (React Context)

```typescript
interface ChatbotContextValue {
  isOpen: boolean;
  subtaskContext: SubtaskChatContext | null;
  openWithSubtask: (subtask: Subtask, parentTaskTitle: string) => void;
  openGeneral: () => void;
  close: () => void;
}

interface SubtaskChatContext {
  subtaskTitle: string;
  parentTaskTitle: string;
  difficulty?: string;
  description?: string;
}
```

Context này wrap toàn bộ app, cho phép bất kỳ component nào trigger chatbot với context cụ thể.

#### `Chatbot` component (mở rộng)

Component hiện tại được mở rộng để nhận `subtaskContext` prop:

- Khi `subtaskContext` có giá trị, system prompt được thay thế bằng prompt học tập
- Khi `subtaskContext` thay đổi (user chuyển sang subtask khác), conversation history được reset
- Khi `subtaskContext` là null, dùng system prompt mặc định hiện tại

---

## Data Models

### Mở rộng `aiBreakdown` trong Task Model

**Hiện tại:**

```typescript
aiBreakdown: {
  title: string;
  status: TaskStatus;
  estimatedDuration?: number;
}[]
```

**Sau khi mở rộng:**

```typescript
aiBreakdown: {
  title: string;
  status: TaskStatus;
  estimatedDuration?: number;
  difficulty?: "easy" | "medium" | "hard";  // NEW
  description?: string;                       // NEW
}[]
```

**MongoDB Schema update:**

```typescript
aiBreakdown: {
  type: [
    {
      title: { type: String, required: true },
      status: {
        type: String,
        enum: ["todo", "in_progress", "completed", "cancelled"],
        default: "todo",
      },
      estimatedDuration: { type: Number, min: 0 },
      difficulty: {                              // NEW
        type: String,
        enum: ["easy", "medium", "hard"],
      },
      description: { type: String },             // NEW
    },
  ],
  default: [],
}
```

### TypeScript types (Frontend)

```typescript
export type SubtaskStatus = "todo" | "in_progress" | "completed" | "cancelled";
export type SubtaskDifficulty = "easy" | "medium" | "hard";

export interface Subtask {
  title: string;
  status: SubtaskStatus;
  estimatedDuration?: number;
  difficulty?: SubtaskDifficulty;
  description?: string;
}
```

**Cập nhật `Task` interface trong `taskServices/index.tsx`:**

```typescript
aiBreakdown?: {
  title: string;
  status?: SubtaskStatus;
  estimatedDuration?: number;
  difficulty?: SubtaskDifficulty;  // NEW
  description?: string;             // NEW
}[];
```

---

## API Design

### `POST /tasks/:id/ai-breakdown` (mở rộng)

Endpoint đã tồn tại, không thay đổi signature. Chỉ mở rộng response data.

**Request:**

```
POST /tasks/:id/ai-breakdown
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "task": {
    "id": "...",
    "title": "Learn English for 12 weeks",
    "aiBreakdown": [
      {
        "title": "Week 1-2: Basic Vocabulary",
        "status": "todo",
        "estimatedDuration": 120,
        "difficulty": "easy",
        "description": "Learn 200 common English words and basic greetings"
      },
      {
        "title": "Week 3-4: Grammar Fundamentals",
        "status": "todo",
        "estimatedDuration": 180,
        "difficulty": "medium",
        "description": "Study present tense, past tense, and basic sentence structure"
      }
    ],
    "estimatedDuration": 1440
  }
}
```

**Error responses:**

- `401` — Chưa đăng nhập
- `403` — Không có quyền truy cập task
- `429` — Groq rate limit
- `500` — AI trả về dữ liệu không hợp lệ / lỗi hệ thống

### `PATCH /tasks/:id` — Cập nhật subtask status

Dùng endpoint update task hiện có để cập nhật `aiBreakdown` array:

**Request:**

```json
{
  "aiBreakdown": [
    {
      "title": "Week 1-2: Basic Vocabulary",
      "status": "completed",
      "estimatedDuration": 120,
      "difficulty": "easy"
    },
    {
      "title": "Week 3-4: Grammar Fundamentals",
      "status": "in_progress",
      "estimatedDuration": 180,
      "difficulty": "medium"
    }
  ]
}
```

---

## Integration Points với Chatbot hiện tại

### System Prompt cho Subtask Learning

Khi user click vào một subtask, Chatbot được khởi tạo với system prompt:

```
Bạn là AI tutor chuyên về "{subtaskTitle}" trong context của task "{parentTaskTitle}".

Nhiệm vụ của bạn:
1. Giải thích lý thuyết về "{subtaskTitle}" một cách rõ ràng, dễ hiểu
2. Cung cấp các bài tập thực hành có hướng dẫn từng bước
3. Đưa ra ví dụ minh họa cụ thể và thực tế
4. Trả lời câu hỏi follow-up và duy trì context cuộc trò chuyện

Độ khó: {difficulty}
Mô tả: {description}

Bắt đầu bằng cách chào hỏi và giới thiệu ngắn gọn về chủ đề này.
```

### Initial Message

Khi chatbot mở với subtask context, tin nhắn đầu tiên từ AI được tạo tự động:

```
📚 Chào bạn! Tôi sẽ giúp bạn học về **{subtaskTitle}** trong task "{parentTaskTitle}".

Chủ đề này có độ khó: {difficulty}

Bạn muốn bắt đầu từ đâu?
- 📖 **Lý thuyết** — Giải thích khái niệm cơ bản
- 🏋️ **Bài tập** — Thực hành ngay
- 💡 **Ví dụ** — Xem ví dụ thực tế
```

### Conversation History Isolation

Mỗi subtask có conversation history riêng biệt, được lưu trong state của `ChatbotContext`:

```typescript
// Map từ subtask key → conversation history
type ConversationMap = Map<string, Message[]>;

// Key = `${parentTaskId}:${subtaskIndex}`
const subtaskKey = `${taskId}:${subtaskIndex}`;
```

Khi user chuyển sang subtask khác, history của subtask cũ được giữ nguyên trong map. Khi quay lại, history được restore.

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: Subtask extraction preserves all metadata fields

_For any_ valid Groq API response containing subtasks with title, estimatedDuration, difficulty, and description fields, the `AI_Breakdown_Service` extraction function SHALL produce subtask objects where all provided fields are present and correctly typed.

**Validates: Requirements 1.2, 10.1, 10.2, 10.3**

### Property 2: aiBreakdown storage round-trip

_For any_ array of valid subtask objects (with title, status, estimatedDuration, difficulty, description), storing them in the `aiBreakdown` field of a Task document and then retrieving that document SHALL produce an array equivalent to the original input.

**Validates: Requirements 1.3, 3.5**

### Property 3: Subtask validation rejects invalid data

_For any_ subtask with an empty title, a non-positive estimatedDuration, or a difficulty value outside `["easy", "medium", "hard"]`, the `AI_Breakdown_Service` validation function SHALL reject that subtask and not store it.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4**

### Property 4: Subtask normalization is idempotent

_For any_ subtask data, applying the normalization function (trim whitespace, lowercase difficulty) twice SHALL produce the same result as applying it once.

**Validates: Requirements 10.5**

### Property 5: SubtaskList renders all subtasks with required fields

_For any_ non-empty array of subtasks, rendering the `SubtaskList` component SHALL produce output that contains each subtask's title, and for each subtask that has estimatedDuration, difficulty, or description, those fields SHALL also appear in the rendered output.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 6: SubtaskList preserves order

_For any_ ordered array of subtasks, the order of subtask titles in the rendered `SubtaskList` output SHALL match the order of the input array.

**Validates: Requirements 2.6**

### Property 7: Scheduler assigns all subtasks to non-overlapping slots

_For any_ list of subtasks with estimated durations and a set of existing calendar events, the `Task_Scheduler` SHALL assign each subtask to a time slot such that no two scheduled subtasks overlap with each other and no subtask overlaps with an existing event.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 8: Scheduler respects deadline constraint

_For any_ list of subtasks and a Parent_Task with a deadline, all time slots assigned by the `Task_Scheduler` SHALL have an end time that is before or equal to the deadline.

**Validates: Requirements 3.4**

### Property 9: Subtask status update is reflected in model

_For any_ task with an aiBreakdown array and any valid status value, updating the status of a subtask at index `i` SHALL result in the stored aiBreakdown array having the new status at index `i` while all other subtasks remain unchanged.

**Validates: Requirements 4.2**

### Property 10: Chatbot system prompt contains subtask context

_For any_ subtask with a title and parent task title, the system prompt generated by `ChatbotContext` SHALL contain both the subtask title and the parent task title as substrings.

**Validates: Requirements 5.2, 5.3, 14.2**

### Property 11: Conversation history is isolated per subtask

_For any_ two distinct subtask contexts, the conversation history accumulated while interacting with subtask A SHALL NOT appear in the conversation history when switching to subtask B, and vice versa.

**Validates: Requirements 9.5, 14.5**

### Property 12: Conversation history accumulates correctly

_For any_ sequence of user messages and AI responses in a chatbot session, each subsequent Groq API call SHALL include all previous messages in the conversation history in the correct order (oldest first).

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 13: Regeneration replaces existing subtasks

_For any_ task with an existing non-empty aiBreakdown array, explicitly requesting a new AI breakdown SHALL replace all existing subtasks with the newly generated ones, resulting in an aiBreakdown array that contains only the new subtasks.

**Validates: Requirements 12.4**

---

## Error Handling

### Backend Error Codes

| Error                   | HTTP Status | Message                                     |
| ----------------------- | ----------- | ------------------------------------------- |
| `TASK_FORBIDDEN`        | 403         | Không có quyền truy cập task này            |
| `AI_JSON_INVALID`       | 500         | AI trả về dữ liệu không đúng định dạng      |
| `AI_RESPONSE_INVALID`   | 500         | AI trả về dữ liệu không đúng định dạng      |
| `GROQ_RATE_LIMIT`       | 429         | Groq bị giới hạn rate limit. Thử lại sau    |
| `GROQ_API_KEY_MISSING`  | 500         | Thiếu GROQ_API_KEY trong env                |
| `GROQ_UNAUTHORIZED`     | 500         | Groq bị từ chối (API key không hợp lệ)      |
| `DESCRIPTION_TOO_SHORT` | 400         | Mô tả task quá ngắn, vui lòng thêm chi tiết |

### Frontend Error Handling

- `AIBreakdownButton` hiển thị Ant Design `message.error()` khi API call thất bại
- Nút "Thử lại" xuất hiện sau khi lỗi để user có thể retry
- Chatbot hiển thị `❌ {error message}` inline trong conversation khi Groq call thất bại
- Nếu Groq API key không được cấu hình, chatbot hiển thị hướng dẫn cấu hình

### Retry Strategy

- `AIBreakdownButton`: User-triggered retry (không tự động retry)
- Chatbot: User có thể gửi lại message nếu lỗi xảy ra
- Backend không implement retry với Groq để tránh tăng latency

---

## Testing Strategy

### Unit Tests

Tập trung vào các pure functions và logic xử lý dữ liệu:

- `extractSubtasksFromGroqResponse(raw: string)` — parsing JSON từ Groq response
- `validateSubtask(subtask: unknown)` — validation logic
- `normalizeSubtask(subtask: RawSubtask)` — normalization (trim, lowercase)
- `buildSubtaskSystemPrompt(context: SubtaskChatContext)` — system prompt generation
- `getSubtaskConversationKey(taskId: string, index: number)` — key generation

### Property-Based Tests

Sử dụng **fast-check** (TypeScript) cho backend và frontend.

Mỗi property test chạy tối thiểu **100 iterations**.

Tag format: `// Feature: ai-task-breakdown-chatbot, Property {N}: {property_text}`

**Backend (Jest + fast-check):**

```typescript
// Property 1: Subtask extraction preserves all metadata fields
// Feature: ai-task-breakdown-chatbot, Property 1: subtask extraction preserves all metadata fields
it("extracts all metadata fields from Groq response", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          title: fc.string({ minLength: 1 }),
          estimatedDuration: fc.integer({ min: 1, max: 480 }),
          difficulty: fc.constantFrom("easy", "medium", "hard"),
          description: fc.string(),
        }),
        { minLength: 1 },
      ),
      (subtasks) => {
        const raw = JSON.stringify({ steps: subtasks });
        const result = extractSubtasksFromGroqResponse(raw);
        return result.every(
          (s, i) =>
            s.title === subtasks[i].title.trim() &&
            s.estimatedDuration === subtasks[i].estimatedDuration &&
            s.difficulty === subtasks[i].difficulty &&
            s.description === subtasks[i].description,
        );
      },
    ),
    { numRuns: 100 },
  );
});
```

**Frontend (Vitest + fast-check):**

```typescript
// Property 5: SubtaskList renders all subtasks with required fields
// Feature: ai-task-breakdown-chatbot, Property 5: SubtaskList renders all subtasks
it('renders all subtasks with their fields', () => {
  fc.assert(fc.property(
    fc.array(subtaskArbitrary, { minLength: 1, maxLength: 20 }),
    (subtasks) => {
      const { container } = render(<SubtaskList subtasks={subtasks} ... />);
      return subtasks.every(s => container.textContent?.includes(s.title));
    }
  ), { numRuns: 100 });
});
```

### Integration Tests

- `POST /tasks/:id/ai-breakdown` với Groq API được mock — verify response shape
- `PATCH /tasks/:id` với aiBreakdown update — verify MongoDB document
- Chatbot component với mock Groq responses — verify conversation flow

### Example-Based Tests

- Trigger breakdown trên task đã có subtasks → verify subtasks được replace
- Click subtask → verify chatbot mở với đúng context
- Đánh dấu tất cả subtasks completed → verify suggestion xuất hiện
- Chuyển giữa 2 subtasks → verify conversation histories độc lập
