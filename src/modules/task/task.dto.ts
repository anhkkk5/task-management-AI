export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type CreateTaskDto = {
  title: string;
  description?: string;
  deadline?: Date;
  priority?: TaskPriority;
  tags?: string[];
  reminderAt?: Date;
};

export type UpdateTaskDto = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: Date;
  tags?: string[];
  reminderAt?: Date;
  aiBreakdown?: { title: string; status?: TaskStatus }[];
};
