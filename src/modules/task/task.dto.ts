export type TaskStatus =
  | "todo"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskType = "event" | "todo" | "appointment";

export type TaskVisibility = "default" | "public" | "private";

/**
 * Guest summary information for API responses
 * Contains essential guest details including permissions and status
 */
export type GuestSummaryDto = {
  guestId: string; // MongoDB ObjectId as string
  email: string;
  name: string;
  avatar?: string; // URL to avatar image
  permission: "edit_event" | "view_guest_list" | "invite_others";
  status?: "pending" | "accepted" | "declined";
};

export type CreateTaskDto = {
  title: string;
  description?: string;
  deadline?: Date;
  priority?: TaskPriority;
  tags?: string[];
  reminderAt?: Date;
  reminderMinutes?: number;
  type?: TaskType;
  allDay?: boolean;
  guests?: string[];
  guestDetails?: GuestSummaryDto[]; // New: detailed guest information with permissions
  location?: string;
  visibility?: TaskVisibility;
  recurrence?: string;
  meetingLink?: string;
  estimatedDuration?: number;
  dailyTargetDuration?: number; // Max minutes per day
  dailyTargetMin?: number; // Min minutes per day
  parentTaskId?: string;
  scheduledTime?: {
    start: Date;
    end: Date;
    aiPlanned?: boolean;
    reason?: string;
  };
};

export type UpdateTaskDto = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: Date;
  tags?: string[];
  reminderAt?: Date;
  reminderMinutes?: number | null;
  type?: TaskType;
  allDay?: boolean;
  guests?: string[];
  guestDetails?: GuestSummaryDto[]; // New: detailed guest information with permissions
  location?: string;
  visibility?: TaskVisibility;
  recurrence?: string;
  meetingLink?: string;
  aiBreakdown?: {
    title: string;
    status?: TaskStatus;
    estimatedDuration?: number;
    difficulty?: "easy" | "medium" | "hard";
    description?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }[];
  estimatedDuration?: number;
  dailyTargetDuration?: number;
  dailyTargetMin?: number;
  parentTaskId?: string;
  scheduledTime?: {
    start: Date;
    end: Date;
    aiPlanned: boolean;
    reason?: string;
  } | null;
};
