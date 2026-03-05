export interface TimeInterval {
  start: Date;
  end: Date;
  taskId?: string;
  priority?: number;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingTasks: string[];
  suggestedNewSlot?: TimeInterval;
}

export interface FreeSlot {
  start: Date;
  end: Date;
  duration: number;
  productivityScore: number;
}

export interface ProductivityScore {
  hour: number;
  score: number;
  confidence: number;
  sampleSize: number;
}

export interface TaskProfile {
  difficulty: 'easy' | 'medium' | 'hard';
  requiresFocus: boolean;
  estimatedDuration: number;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
}

export interface ScheduledTask {
  userId: string;
  taskId: string;
  scheduledTime: {
    start: Date;
    end: Date;
  };
  algorithmUsed: string;
  scores?: {
    productivity: number;
    urgency?: number;
    difficulty?: number;
  };
  isAutoScheduled: boolean;
  aiSuggested: boolean;
}
