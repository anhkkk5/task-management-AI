import { aiScheduleRepository } from "./ai-schedule.repository";
import {
  CreateScheduleInput,
  ScheduleResponse,
  UpdateSessionStatusInput,
} from "./ai-schedule.dto";
import { AIScheduleDoc } from "./ai-schedule.model";
import { Types } from "mongoose";

export class AIScheduleService {
  async getUserSchedules(userId: string): Promise<ScheduleResponse[]> {
    const schedules = await aiScheduleRepository.findByUserId(userId);
    return schedules.map((s) => this.toResponse(s));
  }

  async getActiveSchedule(userId: string): Promise<ScheduleResponse | null> {
    const schedule = await aiScheduleRepository.findActiveByUserId(userId);
    return schedule ? this.toResponse(schedule) : null;
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

  async deleteSchedule(scheduleId: string, userId: string): Promise<boolean> {
    return aiScheduleRepository.delete(scheduleId, userId);
  }

  async deleteAllUserSchedules(userId: string): Promise<void> {
    await aiScheduleRepository.deleteAllForUser(userId);
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
