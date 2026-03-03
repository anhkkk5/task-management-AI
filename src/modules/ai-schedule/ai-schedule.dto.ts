export interface CreateScheduleInput {
  name?: string;
  description?: string;
  schedule: ScheduleDayInput[];
  suggestedOrder: string[];
  personalizationNote?: string;
  totalEstimatedTime?: string;
  splitStrategy?: string;
  confidenceScore?: number;
  sourceTasks: string[];
}

export interface ScheduleDayInput {
  day: string;
  date: string;
  tasks: ScheduleSessionInput[];
  note?: string;
}

export interface ScheduleSessionInput {
  sessionId: string;
  taskId: string;
  title: string;
  priority: string;
  suggestedTime: string;
  reason: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  createSubtask?: boolean;
}

export interface UpdateSessionStatusInput {
  sessionId: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
}

export interface ScheduleResponse {
  id: string;
  name?: string;
  description?: string;
  schedule: ScheduleDayResponse[];
  suggestedOrder: string[];
  personalizationNote?: string;
  totalEstimatedTime?: string;
  splitStrategy?: string;
  confidenceScore?: number;
  sourceTasks: string[];
  isActive: boolean;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleDayResponse {
  day: string;
  date: string;
  tasks: ScheduleSessionResponse[];
  note?: string;
}

export interface ScheduleSessionResponse {
  sessionId: string;
  taskId: string;
  title: string;
  priority: string;
  suggestedTime: string;
  reason: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  createSubtask?: boolean;
}
