# Auto Status Update - Tự động cập nhật trạng thái task

## Vấn đề:

User muốn:

1. Khi AI tối ưu và áp dụng lịch → task tự động chuyển sang trạng thái "Đang làm"
2. Click vào tag trạng thái → hiện dropdown các trạng thái
3. Click chọn trạng thái khác → tự động cập nhật

## Giải pháp Backend:

### 1. Auto Status Update khi AI Schedule

**File:** `src/modules/task/task.service.ts`

**Thay đổi trong `saveAISchedule`:**

```typescript
// Task chính được update với status "in_progress" khi AI schedule
await taskRepository.updateByIdForUser(
  { taskId: item.taskId, userId: new Types.ObjectId(userId) },
  {
    status: "in_progress", // ← Auto chuyển sang in_progress
    scheduledTime: { ... }
  }
);

// Subtask cũng được tạo với status "in_progress"
await taskRepository.create({
  title: subtaskTitle,
  status: "in_progress", // ← Auto chuyển sang in_progress
  scheduledTime: { ... }
});
```

**Kết quả:**

- Khi user click "Áp dụng lịch AI" → tất cả tasks được lên lịch tự động chuyển sang "Đang làm" (in_progress)
- Subtasks được tạo ra cũng có status "in_progress"

### 2. Quick Status Update API

**Endpoint mới:** `PATCH /tasks/:id/status`

**Request:**

```json
{
  "status": "completed"
}
```

**Response:**

```json
{
  "task": {
    "id": "task_id",
    "title": "học tiếng anh",
    "status": "completed",
    ...
  },
  "message": "Đã cập nhật trạng thái thành completed"
}
```

**Các status hợp lệ:**

- `todo` - Chưa xử lý
- `in_progress` - Đang làm
- `completed` - Hoàn thành
- `cancelled` - Đã hủy

**Error responses:**

- 400: Status không hợp lệ
- 401: Chưa đăng nhập
- 403: Không có quyền cập nhật task
- 500: Lỗi hệ thống

## Frontend Implementation Guide:

### 1. Status Tag Component

Tạo component dropdown cho status tag:

```typescript
// StatusDropdown.tsx
import { useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Chưa xử lý', color: 'gray' },
  { value: 'in_progress', label: 'Đang làm', color: 'blue' },
  { value: 'completed', label: 'Hoàn thành', color: 'green' },
  { value: 'cancelled', label: 'Đã hủy', color: 'red' }
];

interface StatusDropdownProps {
  taskId: string;
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
}

export const StatusDropdown = ({ taskId, currentStatus, onStatusChange }: StatusDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}` // Your auth token
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      const data = await response.json();

      // Callback to parent component
      if (onStatusChange) {
        onStatusChange(newStatus);
      }

      // Show success message
      console.log(data.message);

    } catch (error) {
      console.error('Error updating status:', error);
      alert('Không thể cập nhật trạng thái');
    } finally {
      setLoading(false);
      setIsOpen(false);
    }
  };

  const currentOption = STATUS_OPTIONS.find(opt => opt.value === currentStatus);

  return (
    <div className="relative">
      {/* Current Status Tag */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className={`px-3 py-1 rounded-full text-sm font-medium cursor-pointer
          ${currentOption?.color === 'gray' ? 'bg-gray-200 text-gray-700' : ''}
          ${currentOption?.color === 'blue' ? 'bg-blue-200 text-blue-700' : ''}
          ${currentOption?.color === 'green' ? 'bg-green-200 text-green-700' : ''}
          ${currentOption?.color === 'red' ? 'bg-red-200 text-red-700' : ''}
          ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}
        `}
      >
        {loading ? 'Đang cập nhật...' : currentOption?.label}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !loading && (
        <div className="absolute z-10 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-200">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => handleStatusChange(option.value)}
              className={`w-full text-left px-4 py-2 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg
                ${option.value === currentStatus ? 'bg-gray-50 font-semibold' : ''}
              `}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2
                ${option.color === 'gray' ? 'bg-gray-500' : ''}
                ${option.color === 'blue' ? 'bg-blue-500' : ''}
                ${option.color === 'green' ? 'bg-green-500' : ''}
                ${option.color === 'red' ? 'bg-red-500' : ''}
              `} />
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
```

### 2. Usage trong Task List

```typescript
// TaskList.tsx
import { StatusDropdown } from './StatusDropdown';

const TaskList = () => {
  const [tasks, setTasks] = useState([...]);

  const handleStatusChange = (taskId: string, newStatus: string) => {
    // Update local state
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === taskId
          ? { ...task, status: newStatus }
          : task
      )
    );
  };

  return (
    <div>
      {tasks.map(task => (
        <div key={task.id} className="task-item">
          <h3>{task.title}</h3>

          {/* Status Dropdown */}
          <StatusDropdown
            taskId={task.id}
            currentStatus={task.status}
            onStatusChange={(newStatus) => handleStatusChange(task.id, newStatus)}
          />

          <p>{task.description}</p>
        </div>
      ))}
    </div>
  );
};
```

### 3. Hiển thị trong bảng

Nếu bạn dùng table như trong ảnh:

```typescript
// TaskTable.tsx
<table>
  <thead>
    <tr>
      <th>Công việc</th>
      <th>Người thực hiện</th>
      <th>Trạng thái</th>
      <th>Ưu tiên</th>
      <th>Hạn chót</th>
      <th>Thời gian dự kiến</th>
      <th>Mục tiêu/ngày</th>
    </tr>
  </thead>
  <tbody>
    {tasks.map(task => (
      <tr key={task.id}>
        <td>{task.title}</td>
        <td>{task.userId}</td>

        {/* Status Column with Dropdown */}
        <td>
          <StatusDropdown
            taskId={task.id}
            currentStatus={task.status}
            onStatusChange={(newStatus) => handleStatusChange(task.id, newStatus)}
          />
        </td>

        <td>{task.priority}</td>
        <td>{formatDate(task.deadline)}</td>
        <td>{task.estimatedDuration}h</td>
        <td>{task.dailyTargetMin}h-{task.dailyTargetDuration}h</td>
      </tr>
    ))}
  </tbody>
</table>
```

## Testing:

### 1. Test Auto Status Update

**Bước 1:** Tạo task mới

```bash
POST /tasks
{
  "title": "học tiếng anh",
  "estimatedDuration": 420,
  "dailyTargetMin": 60,
  "dailyTargetDuration": 60,
  "deadline": "2026-03-11"
}
```

**Bước 2:** AI phân tích lịch

```bash
POST /ai/schedule-plan
{
  "taskIds": ["task_id"],
  "startDate": "2026-03-07"
}
```

**Bước 3:** Áp dụng lịch

```bash
POST /tasks/save-ai-schedule
{
  "schedule": [ ... ]
}
```

**Kết quả:** Task tự động chuyển sang status "in_progress" ✓

### 2. Test Quick Status Update

**Request:**

```bash
PATCH /tasks/69ac0531b6b8b98faca1a581/status
{
  "status": "completed"
}
```

**Response:**

```json
{
  "task": {
    "id": "69ac0531b6b8b98faca1a581",
    "title": "học tiếng anh",
    "status": "completed",
    ...
  },
  "message": "Đã cập nhật trạng thái thành completed"
}
```

### 3. Test Invalid Status

**Request:**

```bash
PATCH /tasks/69ac0531b6b8b98faca1a581/status
{
  "status": "invalid_status"
}
```

**Response (400):**

```json
{
  "message": "Status không hợp lệ. Phải là: todo, in_progress, completed, cancelled"
}
```

## Status Flow:

```
todo (Chưa xử lý)
  ↓
  ↓ [AI Schedule Applied]
  ↓
in_progress (Đang làm)
  ↓
  ↓ [User completes task]
  ↓
completed (Hoàn thành)

Hoặc:

todo → cancelled (Đã hủy)
in_progress → cancelled (Đã hủy)
```

## Status Colors (Recommended):

| Status      | Color | Background | Text Color |
| ----------- | ----- | ---------- | ---------- |
| todo        | Gray  | #E5E7EB    | #374151    |
| in_progress | Blue  | #DBEAFE    | #1E40AF    |
| completed   | Green | #D1FAE5    | #065F46    |
| cancelled   | Red   | #FEE2E2    | #991B1B    |

## API Endpoints Summary:

### 1. Quick Status Update

```
PATCH /tasks/:id/status
Body: { "status": "completed" }
```

### 2. Full Task Update (existing)

```
PATCH /tasks/:id
Body: { "status": "completed", "title": "...", ... }
```

### 3. Save AI Schedule (auto status update)

```
POST /tasks/save-ai-schedule
Body: { "schedule": [...] }
```

## Cache Invalidation:

Khi status được update:

- ✅ Task cache tự động invalidate
- ✅ User habits được track (khi completed)
- ✅ Frontend nhận response mới ngay lập tức

## Lưu ý:

1. **Auto status update chỉ áp dụng khi:**
   - AI schedule được apply
   - Task được lên lịch với `scheduledTime`

2. **User có thể thay đổi status thủ công:**
   - Click vào tag status
   - Chọn status mới từ dropdown
   - API tự động cập nhật

3. **Status tracking:**
   - Khi task chuyển sang "completed" → track completion history
   - Dùng để AI học habits của user

4. **Permission:**
   - Chỉ owner của task mới có thể update status
   - API check quyền tự động

## Files Changed:

1. ✅ `src/modules/task/task.service.ts` (added `updateStatus`, modified `saveAISchedule`)
2. ✅ `src/modules/task/task.controller.ts` (added `updateTaskStatus`)
3. ✅ `src/modules/task/task.routes.ts` (added `PATCH /:id/status`)
4. ✅ `AUTO_STATUS_UPDATE.md` (this file)

## Next Steps (Frontend):

1. Implement `StatusDropdown` component
2. Add to task list/table
3. Handle status change callback
4. Update local state after API call
5. Show success/error messages
6. Add loading state during update

## Deployment:

```bash
# Build
npm run build

# Restart server
npm run dev  # or npm start
```

Không cần thay đổi database schema - status field đã có sẵn!
