import { aiScheduleRepository } from "./ai-schedule.repository";
import {
  CreateScheduleInput,
  ScheduleResponse,
  ScheduleDayResponse,
  ScheduleSessionResponse,
  UpdateSessionStatusInput,
} from "./ai-schedule.dto";
import { AIScheduleDoc } from "./ai-schedule.model";
import { Task } from "../task/task.model";
import { Types } from "mongoose";

export class AIScheduleService {
  async getUserSchedules(userId: string): Promise<ScheduleResponse[]> {
    const schedules = await aiScheduleRepository.findByUserId(userId);
    return schedules.map((s) => this.toResponse(s));
  }

  async getActiveSchedule(userId: string): Promise<ScheduleResponse | null> {
    const schedules = await aiScheduleRepository.findAllActiveByUserId(userId);
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return this.toResponse(schedules[0]);

    const dayMap = new Map<string, ScheduleDayResponse>();

    const allSuggestedOrder: string[] = [];
    const allSourceTasks: string[] = [];

    for (const s of schedules) {
      const res = this.toResponse(s);

      if (Array.isArray(res.suggestedOrder)) {
        allSuggestedOrder.push(...res.suggestedOrder);
      }
      if (Array.isArray(res.sourceTasks)) {
        allSourceTasks.push(...res.sourceTasks);
      }

      for (const d of res.schedule) {
        const date = String(d.date);
        if (!dayMap.has(date)) {
          dayMap.set(date, {
            day: d.day,
            date: d.date,
            tasks: [] as ScheduleSessionResponse[],
            note: d.note,
          });
        }
        dayMap
          .get(date)!
          .tasks.push(...d.tasks.map((t) => ({ ...t, scheduleId: res.id })));
      }
    }

    const mergedSchedule = Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const base = this.toResponse(schedules[0]);

    return {
      ...base,
      schedule: mergedSchedule,
      suggestedOrder: Array.from(new Set(allSuggestedOrder)),
      sourceTasks: Array.from(new Set(allSourceTasks)),
      isActive: true,
    };
  }

  async getScheduleById(
    scheduleId: string,
    userId: string,
  ): Promise<ScheduleResponse | null> {
    const schedule = await aiScheduleRepository.findByIdAndUserId(
      scheduleId,
      userId,
    );
    return schedule ? this.toResponse(schedule) : null;
  }

  async createSchedule(
    userId: string,
    input: CreateScheduleInput,
  ): Promise<ScheduleResponse> {
    // KHÔNG deactivate existing schedules - preserve tất cả tasks đã scheduled
    // Mỗi schedule mới sẽ được merge với existing schedules

    const schedule = await aiScheduleRepository.create(userId, {
      ...input,
      isActive: true,
      appliedAt: new Date(),
    });

    return this.toResponse(schedule);
  }

  async updateSessionStatus(
    scheduleId: string,
    userId: string,
    input: UpdateSessionStatusInput,
  ): Promise<ScheduleResponse | null> {
    const updated = await aiScheduleRepository.updateSessionStatus(
      scheduleId,
      userId,
      input.sessionId,
      input.status,
    );
    return updated ? this.toResponse(updated) : null;
  }

  async updateSessionTime(
    scheduleId: string,
    userId: string,
    sessionId: string,
    suggestedTime: string,
  ): Promise<ScheduleResponse | null> {
    const updated = await aiScheduleRepository.updateSessionTime(
      scheduleId,
      userId,
      sessionId,
      suggestedTime,
    );
    return updated ? this.toResponse(updated) : null;
  }

  async deleteSession(
    scheduleId: string,
    userId: string,
    sessionId: string,
  ): Promise<ScheduleResponse | null> {
    const updated = await aiScheduleRepository.deleteSession(
      scheduleId,
      userId,
      sessionId,
    );
    return updated ? this.toResponse(updated) : null;
  }

  async deleteSchedule(scheduleId: string, userId: string): Promise<boolean> {
    const deleted = await aiScheduleRepository.delete(scheduleId, userId);
    if (deleted) {
      await Task.deleteMany({
        userId: new Types.ObjectId(userId),
        "scheduledTime.aiPlanned": true,
        parentTaskId: { $exists: true },
      });
      await Task.updateMany(
        { 
          userId: new Types.ObjectId(userId), 
          status: "scheduled",
          "scheduledTime.start": { $exists: false }
        },
        { $set: { status: "todo" } }
      );
    }
    return deleted;
  }

  async deleteAllUserSchedules(userId: string): Promise<void> {
    await aiScheduleRepository.deleteAllForUser(userId);
    await Task.deleteMany({
      userId: new Types.ObjectId(userId),
      "scheduledTime.aiPlanned": true,
      parentTaskId: { $exists: true },
    });
    await Task.updateMany(
      { 
        userId: new Types.ObjectId(userId), 
        status: "scheduled",
        "scheduledTime.start": { $exists: false }
      },
      { $set: { status: "todo" } }
    );
  }

  private toResponse(schedule: AIScheduleDoc): ScheduleResponse {
    return {
      id: schedule._id.toString(),
      name: schedule.name,
      description: schedule.description,
      schedule: schedule.schedule.map((day) => ({
        day: day.day,
        date: day.date,
        tasks: day.tasks.map((task) => ({
          sessionId: task.sessionId,
          taskId: task.taskId,
          title: task.title,
          priority: task.priority,
          suggestedTime: task.suggestedTime,
          reason: task.reason,
          status: task.status,
          createSubtask: task.createSubtask,
        })),
        note: day.note,
      })),
      suggestedOrder: schedule.suggestedOrder,
      personalizationNote: schedule.personalizationNote,
      totalEstimatedTime: schedule.totalEstimatedTime,
      splitStrategy: schedule.splitStrategy,
      confidenceScore: schedule.confidenceScore,
      sourceTasks: schedule.sourceTasks,
      isActive: schedule.isActive,
      appliedAt: schedule.appliedAt,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }
}

export const aiScheduleService = new AIScheduleService();
