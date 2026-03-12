/**
 * StatusDropdown Component - Example Implementation
 *
 * Component này cho phép user click vào status tag để thay đổi trạng thái task
 *
 * Features:
 * - Click to open dropdown
 * - Auto close when click outside
 * - Loading state during API call
 * - Error handling
 * - Success callback
 * - Color coding for each status
 */

import React, { useState, useRef, useEffect } from "react";

// Types
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

interface StatusOption {
  value: TaskStatus;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}

interface StatusDropdownProps {
  taskId: string;
  currentStatus: TaskStatus;
  onStatusChange?: (newStatus: TaskStatus) => void;
  disabled?: boolean;
}

// Status configuration
const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "todo",
    label: "Chưa xử lý",
    color: "gray",
    bgColor: "bg-gray-200",
    textColor: "text-gray-700",
  },
  {
    value: "in_progress",
    label: "Đang làm",
    color: "blue",
    bgColor: "bg-blue-200",
    textColor: "text-blue-700",
  },
  {
    value: "completed",
    label: "Hoàn thành",
    color: "green",
    bgColor: "bg-green-200",
    textColor: "text-green-700",
  },
  {
    value: "cancelled",
    label: "Đã hủy",
    color: "red",
    bgColor: "bg-red-200",
    textColor: "text-red-700",
  },
];

// API helper
const updateTaskStatus = async (
  taskId: string,
  status: TaskStatus,
): Promise<void> => {
  const token = localStorage.getItem("authToken"); // Adjust based on your auth implementation

  const response = await fetch(`/api/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update status");
  }

  return response.json();
};

// Main component
export const StatusDropdown: React.FC<StatusDropdownProps> = ({
  taskId,
  currentStatus,
  onStatusChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle status change
  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      await updateTaskStatus(taskId, newStatus);

      // Callback to parent component
      if (onStatusChange) {
        onStatusChange(newStatus);
      }

      // Optional: Show success toast
      console.log(`✓ Đã cập nhật trạng thái thành ${newStatus}`);
    } catch (error) {
      console.error("Error updating status:", error);
      alert(
        `Không thể cập nhật trạng thái: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
      setIsOpen(false);
    }
  };

  // Get current status option
  const currentOption = STATUS_OPTIONS.find(
    (opt) => opt.value === currentStatus,
  );

  if (!currentOption) {
    return <span className="text-gray-500">Unknown status</span>;
  }

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {/* Current Status Tag (Button) */}
      <button
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className={`
          px-3 py-1 rounded-full text-sm font-medium transition-all
          ${currentOption.bgColor} ${currentOption.textColor}
          ${disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-80"}
        `}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Đang cập nhật...
          </span>
        ) : (
          currentOption.label
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !loading && (
        <div className="absolute z-50 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleStatusChange(option.value)}
              className={`
                w-full text-left px-4 py-2 flex items-center gap-2
                transition-colors hover:bg-gray-100
                ${option.value === currentStatus ? "bg-gray-50 font-semibold" : ""}
              `}
            >
              {/* Status indicator dot */}
              <span
                className={`
                inline-block w-2 h-2 rounded-full
                ${option.color === "gray" ? "bg-gray-500" : ""}
                ${option.color === "blue" ? "bg-blue-500" : ""}
                ${option.color === "green" ? "bg-green-500" : ""}
                ${option.color === "red" ? "bg-red-500" : ""}
              `}
              />

              {/* Status label */}
              <span>{option.label}</span>

              {/* Checkmark for current status */}
              {option.value === currentStatus && (
                <svg
                  className="ml-auto w-4 h-4 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example 1: Basic usage in task list
 */
export const TaskListExample = () => {
  const [tasks, setTasks] = useState([
    { id: "1", title: "học tiếng anh", status: "todo" as TaskStatus },
    { id: "2", title: "học code", status: "in_progress" as TaskStatus },
    { id: "3", title: "tiếng hàn", status: "completed" as TaskStatus },
  ]);

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, status: newStatus } : task,
      ),
    );
  };

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center justify-between p-4 bg-white rounded-lg shadow"
        >
          <h3 className="font-medium">{task.title}</h3>
          <StatusDropdown
            taskId={task.id}
            currentStatus={task.status}
            onStatusChange={(newStatus) =>
              handleStatusChange(task.id, newStatus)
            }
          />
        </div>
      ))}
    </div>
  );
};

/**
 * Example 2: Usage in table (like your screenshot)
 */
export const TaskTableExample = () => {
  const [tasks, setTasks] = useState([
    {
      id: "1",
      title: "học tiếng anh",
      assignee: "Bạn",
      status: "todo" as TaskStatus,
      priority: "Cao",
      deadline: "11/3/2026",
      estimatedTime: "7h",
      dailyTarget: "1h-3h",
    },
    {
      id: "2",
      title: "học code",
      assignee: "Bạn",
      status: "in_progress" as TaskStatus,
      priority: "Trung bình",
      deadline: "14/3/2026",
      estimatedTime: "13h",
      dailyTarget: "1h-2h30",
    },
  ]);

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, status: newStatus } : task,
      ),
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Công việc
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Người thực hiện
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Trạng thái
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Ưu tiên
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Hạn chót
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Thời gian dự kiến
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Mục tiêu/ngày
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">{task.title}</td>
              <td className="px-6 py-4 whitespace-nowrap">{task.assignee}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusDropdown
                  taskId={task.id}
                  currentStatus={task.status}
                  onStatusChange={(newStatus) =>
                    handleStatusChange(task.id, newStatus)
                  }
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">{task.priority}</td>
              <td className="px-6 py-4 whitespace-nowrap">{task.deadline}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                {task.estimatedTime}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {task.dailyTarget}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Example 3: With custom styling (matching your UI)
 */
export const CustomStyledStatusDropdown: React.FC<StatusDropdownProps> = (
  props,
) => {
  // You can customize the styling to match your existing UI
  // Just modify the className strings in the StatusDropdown component
  return <StatusDropdown {...props} />;
};

export default StatusDropdown;
