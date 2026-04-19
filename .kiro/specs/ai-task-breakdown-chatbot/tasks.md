# Implementation Plan: AI-Powered Task Breakdown with Chatbot Integration

## Overview

Mở rộng hệ thống task management hiện tại để hỗ trợ AI breakdown subtasks và tích hợp chatbot học tập theo context subtask. Backend dùng TypeScript/Node.js + Express + MongoDB; Frontend dùng React + TypeScript + Ant Design.

## Tasks

- [x] 1. Phase 1: Backend — Mở rộng Task Model
  - [x] 1.1 Thêm fields `difficulty` và `description` vào `aiBreakdown` schema trong `task.model.ts`
    - Mở file `AI-powered-task-management/src/modules/task/task.model.ts`
    - Trong `taskSchema`, tìm block `aiBreakdown` và thêm:
      ```typescript
      difficulty: { type: String, enum: ["easy", "medium", "hard"] },
      description: { type: String },
      ```
    - Cập nhật type `TaskDoc` — thêm `difficulty?: "easy" | "medium" | "hard"` và `description?: string` vào kiểu của từng phần tử trong `aiBreakdown`
    - Cập nhật type `TaskAttrs` tương tự
    - _Requirements: 1.3, 10.3_

  - [x] 1.2 Cập nhật `task.dto.ts` nếu có DTO liên quan đến `aiBreakdown`
    - Mở `AI-powered-task-management/src/modules/task/task.dto.ts`
    - Thêm `difficulty` và `description` vào bất kỳ DTO/interface nào mô tả subtask item
    - _Requirements: 1.3_

- [x] 2. Phase 2: Backend — Mở rộng AI Breakdown Service & Endpoint
  - [x] 2.1 Mở rộng prompt trong `ai.service.taskBreakdown` để yêu cầu Groq trả về `difficulty` và `description`
    - Mở `AI-powered-task-management/src/modules/ai/ai.service.ts`
    - Tìm method `taskBreakdown`, cập nhật `prompt` để yêu cầu format JSON mới:
      ```
      { "steps": [ { "title": string, "status": "todo", "estimatedDuration": number, "difficulty": "easy"|"medium"|"hard", "description": string } ], "totalEstimatedDuration": number }
      ```
    - Cập nhật `maxTokens` lên `1000` để đủ chỗ cho `description`
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Cập nhật normalization logic trong `taskBreakdown` để xử lý `difficulty` và `description`
    - Trong cùng method `taskBreakdown`, tìm block `normalized = steps.map(...)`:
      - Thêm `difficulty`: validate là `"easy" | "medium" | "hard"`, nếu không hợp lệ thì bỏ qua (undefined)
      - Thêm `description`: `String(s?.description ?? "").trim() || undefined`
      - Lowercase `difficulty` khi normalize
    - Cập nhật return type của method từ `{ title, status, estimatedDuration? }[]` thành bao gồm `difficulty?` và `description?`
    - _Requirements: 1.2, 10.3, 10.5_

  - [x] 2.3 Cập nhật `task.service.ts` — method xử lý `POST /tasks/:id/ai-breakdown` để lưu fields mới
    - Mở `AI-powered-task-management/src/modules/task/task.service.ts`
    - Tìm logic gọi `aiService.taskBreakdown` và lưu kết quả vào `task.aiBreakdown`
    - Đảm bảo `difficulty` và `description` từ response được map vào document khi save
    - Cập nhật input của `taskBreakdown` để truyền thêm `description` từ task (dùng cho prompt context)
    - _Requirements: 1.3, 1.4_

  - [x] 2.4 Cập nhật `ai.service.taskBreakdown` signature để nhận `description` từ task
    - Thêm `description?: string` vào `input` parameter của `taskBreakdown`
    - Thêm description vào prompt: `"Mô tả: ${input.description}"` nếu có
    - Cập nhật cache key để bao gồm `description`
    - _Requirements: 1.1, 11.2_

  - [x] 2.5 Thêm error handling cho `DESCRIPTION_TOO_SHORT` trong `task.service.ts`
    - Trước khi gọi `aiService.taskBreakdown`, kiểm tra nếu `task.description` tồn tại nhưng `< 10 ký tự` thì throw error `DESCRIPTION_TOO_SHORT`
    - Đảm bảo `task.controller.ts` map error này thành HTTP 400
    - _Requirements: 11.2_

  - [x] 2.6 Checkpoint — Kiểm tra backend hoạt động đúng
    - Đảm bảo TypeScript compile không lỗi: `npx tsc --noEmit` trong thư mục `AI-powered-task-management`
    - Hỏi user nếu có thắc mắc trước khi tiếp tục

- [x] 3. Phase 3: Frontend — Types & Services
  - [x] 3.1 Thêm types `Subtask`, `SubtaskStatus`, `SubtaskDifficulty` vào `taskServices/index.tsx`
    - Mở `web-taskmanagerment-AI/web-task-AI/src/services/taskServices/index.tsx`
    - Thêm ở đầu file (sau imports):

      ```typescript
      export type SubtaskStatus =
        | "todo"
        | "in_progress"
        | "completed"
        | "cancelled";
      export type SubtaskDifficulty = "easy" | "medium" | "hard";

      export interface Subtask {
        title: string;
        status: SubtaskStatus;
        estimatedDuration?: number;
        difficulty?: SubtaskDifficulty;
        description?: string;
      }
      ```

    - Cập nhật `Task.aiBreakdown` type từ `{ title, status?, estimatedDuration? }[]` thành `Subtask[]`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Thêm hàm `triggerAiBreakdown` vào `taskServices/index.tsx`
    - Thêm function:
      ```typescript
      export const triggerAiBreakdown = async (
        taskId: string,
      ): Promise<{ task: Task }> => {
        return await post(`/tasks/${taskId}/ai-breakdown`, {});
      };
      ```
    - _Requirements: 1.1, 12.1_

  - [x] 3.3 Thêm hàm `updateSubtaskStatus` vào `taskServices/index.tsx`
    - Thêm function nhận `taskId`, `subtasks: Subtask[]` và gọi `PATCH /tasks/:id` với `{ aiBreakdown: subtasks }`:
      ```typescript
      export const updateSubtaskStatus = async (
        taskId: string,
        subtasks: Subtask[],
      ): Promise<{ task: Task }> => {
        return await patch(`/tasks/${taskId}`, { aiBreakdown: subtasks });
      };
      ```
    - _Requirements: 4.2_

- [x] 4. Phase 4: Frontend — SubtaskList Component
  - [x] 4.1 Tạo file `SubtaskItem.tsx` trong `web-taskmanagerment-AI/web-task-AI/src/components/SubtaskList/`
    - Tạo thư mục `SubtaskList` nếu chưa có
    - Implement `SubtaskItem` component với props:
      ```typescript
      interface SubtaskItemProps {
        subtask: Subtask;
        index: number;
        parentTaskTitle: string;
        onChatOpen: (subtask: Subtask, parentTaskTitle: string) => void;
        onStatusChange: (index: number, status: SubtaskStatus) => void;
      }
      ```
    - Hiển thị: title (clickable → `onChatOpen`), badge difficulty (màu xanh/vàng/đỏ), estimatedDuration (phút), description (nếu có)
    - Dropdown Ant Design `Select` để thay đổi status với 4 options: todo, in_progress, completed, cancelled
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 4.1_

  - [x] 4.2 Tạo file `SubtaskList.tsx` trong cùng thư mục
    - Implement `SubtaskList` component với props:
      ```typescript
      interface SubtaskListProps {
        subtasks: Subtask[];
        onSubtaskClick: (subtask: Subtask) => void;
        onStatusChange: (subtaskIndex: number, status: SubtaskStatus) => void;
        parentTaskTitle: string;
      }
      ```
    - Render danh sách `SubtaskItem` theo đúng thứ tự từ mảng `subtasks`
    - Hiển thị tổng số subtasks và tổng `estimatedDuration` ở header
    - Khi tất cả subtasks có status `completed`, hiển thị Ant Design `Alert` gợi ý đánh dấu parent task hoàn thành
    - _Requirements: 2.1, 2.6, 4.4_

  - [x] 4.3 Tạo file `index.ts` export từ thư mục `SubtaskList`
    - Export `SubtaskList` và `SubtaskItem`
    - _Requirements: 2.1_

- [x] 5. Phase 5: Frontend — AIBreakdownButton Component
  - [x] 5.1 Tạo file `AIBreakdownButton.tsx` trong `web-taskmanagerment-AI/web-task-AI/src/components/AIBreakdownButton/`
    - Implement component với props:
      ```typescript
      interface AIBreakdownButtonProps {
        taskId: string;
        hasExistingBreakdown?: boolean;
        onBreakdownComplete: (subtasks: Subtask[]) => void;
        disabled?: boolean;
      }
      ```
    - Nút hiển thị text: "AI Breakdown" (lần đầu) hoặc "Tạo lại Breakdown" (khi đã có subtasks)
    - Khi click: gọi `triggerAiBreakdown(taskId)`, hiển thị Ant Design `Spin` loading
    - Khi thành công: gọi `onBreakdownComplete(task.aiBreakdown)`
    - Khi lỗi: hiển thị `message.error(errorMessage)` và hiển thị nút "Thử lại"
    - _Requirements: 1.1, 11.4, 11.5, 12.1, 12.5_

  - [x] 5.2 Tạo file `index.ts` export `AIBreakdownButton`
    - _Requirements: 1.1_

- [x] 6. Phase 6: Frontend — ChatbotContext & Mở rộng Chatbot
  - [x] 6.1 Tạo file `ChatbotContext.tsx` trong `web-taskmanagerment-AI/web-task-AI/src/contexts/`
    - Tạo thư mục `contexts` nếu chưa có
    - Định nghĩa interfaces:

      ```typescript
      interface SubtaskChatContext {
        subtaskTitle: string;
        parentTaskTitle: string;
        difficulty?: string;
        description?: string;
        subtaskKey: string; // `${taskId}:${subtaskIndex}`
      }

      interface ChatbotContextValue {
        isOpen: boolean;
        subtaskContext: SubtaskChatContext | null;
        openWithSubtask: (
          subtask: Subtask,
          parentTaskTitle: string,
          taskId: string,
          index: number,
        ) => void;
        openGeneral: () => void;
        close: () => void;
      }
      ```

    - Implement `ChatbotProvider` với `useState` cho `isOpen` và `subtaskContext`
    - Export `ChatbotContext` và `useChatbot` hook
    - _Requirements: 5.1, 5.3, 14.1, 14.4_

  - [x] 6.2 Mở rộng `Chatbot/index.tsx` để nhận `subtaskContext` và thay đổi system prompt
    - Mở `web-taskmanagerment-AI/web-task-AI/src/components/Chatbot/index.tsx`
    - Thêm prop `subtaskContext?: SubtaskChatContext | null`
    - Tạo hàm `buildSystemPrompt(subtaskContext)`:
      - Nếu `subtaskContext` có giá trị: trả về system prompt học tập (theo template trong design)
      - Nếu null: trả về system prompt mặc định hiện tại
    - Khi `subtaskContext` thay đổi (dùng `useEffect`): reset `chatHistory` về initial message mới theo subtask
    - Initial message khi có subtask context: hiển thị tên subtask, difficulty, và 3 lựa chọn (Lý thuyết / Bài tập / Ví dụ)
    - _Requirements: 5.2, 5.3, 6.1, 9.5, 14.2, 14.3_

  - [x] 6.3 Implement conversation history isolation theo subtask key trong `ChatbotContext`
    - Trong `ChatbotProvider`, thêm `conversationMap: Map<string, Message[]>` vào state (dùng `useRef`)
    - Khi `openWithSubtask` được gọi: load history từ map theo `subtaskKey` (hoặc tạo mới nếu chưa có)
    - Khi chatbot nhận message mới: lưu history vào map theo `subtaskKey` hiện tại
    - Truyền `conversationMap` và setter xuống `Chatbot` component qua props hoặc context
    - _Requirements: 9.4, 9.5, 14.5_

  - [x] 6.4 Wrap `App` (hoặc root layout) với `ChatbotProvider` và render `Chatbot` component từ context
    - Tìm file root layout/App (thường là `App.tsx` hoặc `main.tsx`)
    - Wrap với `<ChatbotProvider>`
    - Render `<Chatbot>` component một lần duy nhất ở root, điều khiển visibility qua `isOpen` từ context
    - Xóa hoặc giữ nguyên floating button hiện tại — nếu giữ, đảm bảo `openGeneral()` vẫn hoạt động
    - _Requirements: 5.1, 14.1_

  - [x] 6.5 Checkpoint — Kiểm tra ChatbotContext và Chatbot mở rộng
    - Đảm bảo TypeScript không có lỗi trong các file vừa tạo/sửa
    - Hỏi user nếu có thắc mắc

- [x] 7. Phase 7: Frontend — Tích hợp vào TaskForm / TaskDetail
  - [x] 7.1 Tìm và mở component TaskForm hoặc TaskDetail hiện tại
    - Tìm file TaskForm/TaskDetail trong `web-taskmanagerment-AI/web-task-AI/src/`
    - Xác định nơi hiển thị thông tin task để thêm `AIBreakdownButton` và `SubtaskList`
    - _Requirements: 1.1, 2.1_

  - [x] 7.2 Thêm state `subtasks` và tích hợp `AIBreakdownButton` vào TaskForm/TaskDetail
    - Thêm state: `const [subtasks, setSubtasks] = useState<Subtask[]>(task?.aiBreakdown ?? [])`
    - Render `<AIBreakdownButton>` chỉ khi task đã được tạo (có `task._id`):
      ```tsx
      <AIBreakdownButton
        taskId={task._id}
        hasExistingBreakdown={subtasks.length > 0}
        onBreakdownComplete={setSubtasks}
      />
      ```
    - _Requirements: 1.1, 12.1, 12.5_

  - [x] 7.3 Render `SubtaskList` bên dưới `AIBreakdownButton` khi có subtasks
    - Lấy `openWithSubtask` từ `useChatbot()` hook
    - Render:
      ```tsx
      {
        subtasks.length > 0 && (
          <SubtaskList
            subtasks={subtasks}
            parentTaskTitle={task.title}
            onSubtaskClick={(subtask) =>
              openWithSubtask(
                subtask,
                task.title,
                task._id,
                subtasks.indexOf(subtask),
              )
            }
            onStatusChange={async (index, status) => {
              const updated = subtasks.map((s, i) =>
                i === index ? { ...s, status } : s,
              );
              setSubtasks(updated);
              await updateSubtaskStatus(task._id, updated);
            }}
          />
        );
      }
      ```
    - _Requirements: 2.1, 4.2, 4.3, 5.1_

  - [x] 7.4 Đồng bộ `subtasks` state khi task được load từ API
    - Trong `useEffect` load task data, sau khi nhận response: `setSubtasks(task.aiBreakdown ?? [])`
    - Đảm bảo khi task được refresh (sau khi tạo breakdown), `subtasks` state được cập nhật từ response
    - _Requirements: 2.1, 4.3_

  - [x] 7.5 Checkpoint cuối — Kiểm tra toàn bộ luồng
    - Đảm bảo TypeScript compile không lỗi cho toàn bộ frontend: `npx tsc --noEmit` trong `web-taskmanagerment-AI/web-task-AI`
    - Hỏi user nếu có thắc mắc trước khi kết thúc

## Notes

- Tasks đánh dấu `*` là optional, có thể bỏ qua để MVP nhanh hơn
- Mỗi task tham chiếu requirements cụ thể để đảm bảo traceability
- Chatbot vẫn gọi Groq trực tiếp từ frontend — không tạo backend endpoint mới cho chatbot
- Endpoint `POST /tasks/:id/ai-breakdown` đã tồn tại, chỉ mở rộng response data
- `PATCH /tasks/:id` hiện có được tái sử dụng để update subtask status
