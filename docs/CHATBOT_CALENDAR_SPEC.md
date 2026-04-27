# Chatbot Calendar-Aware & AI Scheduling — Spec S1 → S4

> Tài liệu đặc tả tính năng nâng cấp chatbot để: (1) đọc được lịch cá nhân,
> (2) phân tích bận/rảnh, (3) đề xuất lịch cho hoạt động mới, (4) tự tạo task
> khi user xác nhận.

**Repo BE:** `d:\KhoaNode\AI-powered-task-management`
**Repo FE:** `d:\Khoafronend\web-taskmanagerment-AI\web-task-AI`
**Provider:** Groq (OpenAI-compatible tool-calling)
**Tài liệu này là single source of truth cho 4 sprint S1–S4.**

---

## 0. Bối cảnh & Mục tiêu

Hiện chatbot chỉ dựa vào prompt + lịch sử hội thoại; **không có quyền truy cập
dữ liệu lịch người dùng**, nên không thể trả lời câu hỏi như:

- "Tuần này tôi bận gì?"
- "Khi nào tôi rảnh chiều đến tối?"
- "Sắp xếp giúp tôi tập gym 2 tiếng, ≥3 buổi/tuần."

Mục tiêu cuối (sau S4): user chat tự nhiên → bot lấy snapshot lịch → đề xuất →
user chốt → bot **tự tạo task scheduled** xuất hiện ngay trên Calendar.

### Kiến trúc nguyên tắc

- Tái sử dụng tối đa: `taskService`, `freeTimeService`, `hybridScheduleService`.
- Mọi hành động ghi DB phải đi qua **tool calling**, BE bind `userId` server-side.
- LLM **không được tự bịa** task hay slot — luôn phải qua tool.
- Multi-turn confirmation trước khi tạo task.

---

## 1. Sprint 1 — Calendar Read-Only (✅ đã làm)

### Mục tiêu
Bot đọc được lịch user và trả lời câu hỏi free/busy. Chưa tạo task.

### Files đã thêm/sửa

| File | Vai trò |
|---|---|
| `src/modules/ai/ai-calendar-context.service.ts` | `getCalendarSnapshot(userId, fromISO, toISO)` + `renderSnapshotForPrompt` |
| `src/modules/ai/ai-tools.ts` | Schema + handler tool `get_free_busy_report` |
| `src/modules/ai/ai.provider.ts` | Thêm `chatWithTools`, types tool-calling |
| `src/modules/ai/ai-intent.ts` | Intent `CALENDAR_QUERY` + prompt mode |
| `src/modules/ai/ai-chat.service.ts` | Tool-calling loop khi intent là calendar |

### Flow
1. User hỏi "tuần này tôi bận gì?".
2. `detectIntent` → `CALENDAR_QUERY`.
3. BE inject snapshot 14 ngày tới vào system prompt + cung cấp tool `get_free_busy_report`.
4. LLM gọi tool → BE thực thi → trả JSON cô đọng cho LLM → LLM trả markdown summary.
5. Mỗi tool exchange được lưu vào `aiRepository.createMessage` với `meta.kind = "tool_call"`.

### Tool S1
```ts
get_free_busy_report({ from: ISO, to: ISO })
→ { timezone, range, days: [{ date, weekday, busy:[{start,end,title}], free:[{start,end}] }] }
```

### Definition of Done
- [x] `npm run ts.check` pass
- [x] Câu hỏi "tuần này tôi rảnh khi nào?" trả ra slot đúng theo `freeTimePattern` − busy
- [x] Câu hỏi "tuần này tôi bận gì?" liệt kê đúng tasks `scheduledTime`
- [x] Lưu tool exchange vào DB

### Env mới
```
GROQ_TOOL_MODEL=llama-3.3-70b-versatile   # bắt buộc cho tool calling
DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh
```

---

## 2. Sprint 2 — Scheduling Tools (proposal-only)

### Mục tiêu
Bot có thể **đề xuất lịch** cho hoạt động mới user mô tả (ví dụ gym, học bài,
deep work) — vẫn chưa tạo task, chỉ propose.

### Files dự kiến

| File | Vai trò |
|---|---|
| `src/modules/scheduler/activity-scheduler.service.ts` | Wrapper sạch trên `hybridScheduleService` cho input dạng activity (window + duration + frequency + gap) |
| `src/modules/ai/ai-tools.ts` | Bổ sung 2 tool: `propose_schedule`, `breakdown_activity` |
| `src/modules/ai/ai-intent.ts` | Mở rộng `CALENDAR_QUERY` prompt: cho phép propose nhưng cấm tạo |

### Tools S2

```ts
// Sinh n buổi đề xuất, tôn trọng free pattern, busy tasks, forbidden, gap.
propose_schedule({
  activityName: string,
  durationMin: number,
  sessionsPerWeek: number,        // ≥3
  windowStart: "HH:mm",            // chiều
  windowEnd: "HH:mm",              // tối
  daysAllowed?: ("mon"|...|"sun")[],
  minGapDays?: number,             // gym: 1 (tránh 2 ngày liên tiếp)
  from: ISO, to: ISO,
})
→ { proposals: [{ date, start, end, reason, score }] }

// Chia nhỏ nội dung từng buổi (LLM-driven hoặc rule).
breakdown_activity({
  activityName: string,
  totalSessions: number,
  durationMinPerSession: number,
})
→ { sessions: [{ index, focus, drills:[string] }] }
// Ví dụ gym: Buổi 1 Push (ngực/vai/tay sau), Buổi 2 Pull, Buổi 3 Legs.
```

### Thuật toán `propose_schedule` (pseudo)

```text
1. Lấy snapshot busy + free pattern từ aiCalendarContextService.
2. Với mỗi ngày trong [from, to] thuộc daysAllowed:
   a. Lấy free intervals giao với [windowStart, windowEnd].
   b. Trừ busy tasks (đã có trong snapshot.days[i].busy).
   c. Sinh candidate: mọi sub-interval đủ durationMin.
3. Lọc theo minGapDays so với candidate đã chọn.
4. Score:
   - +consistencyScore: cùng giờ với buổi trước (habit).
   - +centerPreference: ưu tiên giữa window > rìa.
   - −conflictRisk: gần task quan trọng (priority high/urgent).
5. Greedy pick top sessionsPerWeek slots theo score.
6. Trả về proposals kèm reason ("Free 16:00-18:00, không trùng task nào").
```

### Persistence proposal draft
- Lưu draft vào `aiConversation.context.proposalDraft` (cần extend schema `ai.model.ts`):
  ```ts
  proposalDraft?: {
    activityName: string;
    sessions: { date: string; start: string; end: string; focus?: string }[];
    createdAt: Date;
  }
  ```
- Mỗi lần `propose_schedule` chạy → ghi đè draft.
- Lý do: S3 cần draft này để confirm.

### DoD S2
- [ ] Nói "Sắp xếp gym 2h, chiều–tối, 3 buổi/tuần" → bot trả ra 3 slot cụ thể, hợp lệ với busy tasks ảnh demo (T6 20:15/21:30/22:45 không bị chọn).
- [ ] Bot kèm breakdown nội dung 3 buổi (Push/Pull/Legs hoặc tương tự).
- [ ] Draft lưu vào DB.
- [ ] Bot **không** tạo task, message kết thúc bằng "Bạn muốn chốt và tạo lịch chứ?".

---

## 3. Sprint 3 — Confirm & Auto-Create

### Mục tiêu
User nói "OK tạo đi" → bot gọi tool `create_scheduled_tasks` với draft hiện
tại → task xuất hiện trên Calendar.

### Files dự kiến

| File | Vai trò |
|---|---|
| `src/modules/ai/ai-tools.ts` | Bổ sung `create_scheduled_tasks`, `cancel_proposal`, `update_proposal` |
| `src/modules/ai/ai-intent.ts` | Detect intent `CONFIRM_SCHEDULE` (regex: "ok tạo đi", "chốt", "đồng ý") |
| `src/modules/ai/ai-chat.service.ts` | Khi intent confirm → ép `tool_choice: "required"` để LLM phải gọi tool |

### Tool S3

```ts
create_scheduled_tasks({
  // Truyền lại draft (LLM lấy từ context proposalDraft) hoặc empty để dùng draft DB.
  sessions?: { date: string; start: string; end: string; title: string; description?: string }[],
  parentTitle?: string,   // "Tập gym tuần 17" → tạo 1 parent task
  tags?: string[],
})
→ { taskIds: string[], parentTaskId?: string }
```

Handler:
1. Validate slot không conflict (gọi lại `taskRepository.findConflictingTasks`).
2. Gọi `taskService.create` từng session với `scheduledTime.aiPlanned = true`, `scheduledTime.reason = "AI scheduled via chat: <activityName>"`.
3. Optional: tạo 1 parent task gom subtasks (nếu `parentTitle` có).
4. Xoá `proposalDraft` khỏi conversation context.
5. Trả về list taskIds để FE highlight Calendar.

### Update / Cancel
- `update_proposal({ index, newStart?, newEnd?, newDate? })` — user nói "đẩy buổi 2 sang T5 17:00".
- `cancel_proposal({})` — user nói "huỷ", clear draft.

### Message meta cho FE
Sau khi tool `create_scheduled_tasks` chạy xong, BE thêm 1 system message:
```ts
{
  role: "system",
  content: "Đã tạo 3 buổi tập gym tuần 17.",
  meta: { kind: "tasks_created", taskIds: [...], summary: [...] }
}
```

### DoD S3
- [ ] User: "OK tạo đi" → tasks xuất hiện trên Calendar (kiểm bằng GET /tasks).
- [ ] User: "huỷ" → draft bị clear, lần sau hỏi lại bot phải re-propose.
- [ ] User: "đẩy buổi 2 sang T5 17:00" → draft update đúng, không tạo task.
- [ ] Conflict guard: nếu user thêm 1 task mới chen vào slot draft trước khi confirm → bot báo và re-propose.

---

## 4. Sprint 4 — UI Rich Blocks (FE)

### Mục tiêu
Thay vì markdown text thuần, render bảng free/busy + card proposal có nút.

### Files dự kiến

| File | Vai trò |
|---|---|
| `src/components/Chatbot/blocks/FreeBusyTable.tsx` | Bảng ngày × (busy / free) |
| `src/components/Chatbot/blocks/ProposalCard.tsx` | Card list buổi + nút "Tạo lịch", "Đổi giờ", "Huỷ" |
| `src/components/Chatbot/blocks/TasksCreatedCard.tsx` | Success card + link Calendar |
| `src/components/Chatbot/ChatMessage.tsx` | Switch render theo `meta.kind` |
| `src/pages/Chat/index.tsx` | Đồng bộ renderer ở trang full Chat |
| `src/services/chatServices/index.tsx` | Mở rộng `AiMessage.meta` types |

### Schema meta FE đọc

```ts
type AiMessageMeta =
  | { kind: "free_busy_table"; days: FreeBusyDay[] }
  | { kind: "proposal"; activityName: string; sessions: ProposalSession[] }
  | { kind: "tasks_created"; taskIds: string[]; summary: string[] }
  | { kind: "tool_call"; toolName: string; toolCallId: string }
  | { kind: "chat" };
```

### Hành vi tương tác
- Bấm **"Tạo lịch này"** → gửi message `"OK tạo đi"` (hoặc gọi endpoint confirm dedicated).
- Bấm **"Đổi giờ buổi N"** → mở modal sửa → gửi `"đẩy buổi N sang ..."`.
- Bấm **"Huỷ"** → gửi `"huỷ đề xuất"`.
- Sau `tasks_created` → invalidate query `useTasks` + scroll Calendar tới ngày đầu tiên trong list.

### DoD S4
- [ ] Bảng free/busy render đúng từ snapshot, không còn JSON text.
- [ ] Card proposal có 3 nút action work end-to-end.
- [ ] Calendar tự refresh sau khi tạo task.
- [ ] Mobile responsive (popup chatbot không bị tràn).

---

## 5. Cấu trúc dữ liệu chung

### CalendarSnapshot (S1, dùng xuyên suốt)
```ts
type CalendarSnapshot = {
  range: { from: ISO; to: ISO };
  timezone: string;
  now: ISO;
  tasks: CalendarTaskItem[];
  days: FreeBusyDay[];
};

type FreeBusyDay = {
  date: string;        // YYYY-MM-DD
  weekday: string;     // "monday" | ...
  freeSlots: { start: "HH:mm"; end: "HH:mm" }[];
  busySlots: { start: "HH:mm"; end: "HH:mm"; title: string; taskId: string }[];
};
```

### Conversation context mở rộng (S2+)
```ts
// ai.model.ts AiConversationDoc
{
  ...
  context?: {
    domain?: string;
    lastSubtaskKey?: string;
    proposalDraft?: {
      activityName: string;
      durationMin: number;
      sessions: { date: string; start: string; end: string; focus?: string }[];
      windowStart?: string;
      windowEnd?: string;
      sessionsPerWeek?: number;
      createdAt: Date;
    };
  };
}
```

---

## 6. Bảo mật & Reliability

| Rủi ro | Biện pháp |
|---|---|
| LLM gửi userId giả qua tool args | Handler **bỏ qua** mọi field userId trong args, chỉ dùng userId từ session |
| LLM tạo task vô tội vạ | S2 cấm tool create; S3 chỉ tạo khi intent CONFIRM + có draft |
| Tool result quá lớn → vượt context | `renderSnapshotForPrompt` nén dạng bullet; tool reply giới hạn 4000 chars khi lưu DB |
| Vòng lặp tool vô hạn | `MAX_TOOL_ITERATIONS = 4` |
| Conflict slot do user vừa tạo task khác | S3 re-validate `findConflictingTasks` ngay trước khi `taskService.create` |
| Timezone lệch | Luôn pass `timezone` (default `Asia/Ho_Chi_Minh`); tool args dùng ISO có offset |

---

## 7. Test plan

### Smoke (sau mỗi sprint)
```text
S1:
- "Tuần này tôi bận gì?" → liệt kê đúng tasks.
- "Khi nào tôi rảnh ngày mai?" → list free intervals.

S2:
- "Sắp xếp gym 2h, chiều đến tối, 3 buổi/tuần" → 3 slot, kèm breakdown.
- "Sắp xếp học tiếng Anh 30 phút mỗi sáng, 5 buổi/tuần" → 5 slot sáng sớm.

S3:
- "OK tạo đi"          → tasks xuất hiện.
- "đẩy buổi 2 sang T5" → draft cập nhật, chưa tạo.
- "huỷ"                → draft clear.

S4:
- Bảng free/busy hiển thị đúng.
- Bấm nút "Tạo lịch" → tasks tạo + Calendar refresh.
```

### Regression
- Câu hỏi không liên quan lịch (vd "giải thích phương trình bậc 2") vẫn trả lời bình thường, không gọi tool.
- Câu hỏi `SYSTEM_HELP` ("hướng dẫn dùng AI Breakdown") không bị nuốt bởi `CALENDAR_QUERY`.

---

## 8. Roadmap thời gian

| Sprint | Estimate | Trạng thái |
|---|---|---|
| S1 — Calendar read-only | 2–3 ngày | ✅ Done (Apr 26 2026) |
| S2 — Scheduling tools | 3 ngày | ⏳ |
| S3 — Confirm & auto-create | 2 ngày | ⏳ |
| S4 — UI rich blocks | 2 ngày | ⏳ |

Tổng ~ 9–10 ngày làm việc cho full feature.

---

## 9. Mở rộng tương lai (out of scope S1–S4)

- `forbiddenSlots` model riêng (hiện dùng custom date trống = forbidden).
- Tool `reschedule_existing_task` để dời task khi conflict.
- Streaming tool calls (SSE) thay vì non-streaming.
- Multi-user / team scheduling (xem free time của cả nhóm).
- iCal export sau khi tạo task.
