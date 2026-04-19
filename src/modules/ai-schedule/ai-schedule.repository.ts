import {
  AISchedule,
  AIScheduleDoc,
  AIScheduleAttrs,
} from "./ai-schedule.model";
import { Types } from "mongoose";

export class AIScheduleRepository {
  async findByUserId(userId: string): Promise<AIScheduleDoc[]> {
    return AISchedule.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findAllActiveByUserId(userId: string): Promise<AIScheduleDoc[]> {
    return AISchedule.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findActiveByUserId(userId: string): Promise<AIScheduleDoc | null> {
    return AISchedule.findOne({
      userId: new Types.ObjectId(userId),
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findById(id: string): Promise<AIScheduleDoc | null> {
    return AISchedule.findById(id).exec();
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<AIScheduleDoc | null> {
    return AISchedule.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async create(userId: string, data: AIScheduleAttrs): Promise<AIScheduleDoc> {
    const schedule = new AISchedule({
      ...data,
      userId: new Types.ObjectId(userId),
    });
    return schedule.save();
  }

  async update(
    id: string,
    userId: string,
    data: Partial<AIScheduleAttrs>,
  ): Promise<AIScheduleDoc | null> {
    return AISchedule.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { $set: data },
      { new: true },
    ).exec();
  }

  async deleteSession(
    scheduleId: string,
    userId: string,
    sessionId: string,
  ): Promise<AIScheduleDoc | null> {
    return AISchedule.findOneAndUpdate(
      {
        _id: new Types.ObjectId(scheduleId),
        userId: new Types.ObjectId(userId),
      },
      {
        $pull: { "schedule.$[day].tasks": { sessionId } },
      },
      {
        new: true,
        arrayFilters: [{ "day.tasks": { $elemMatch: { sessionId } } }],
      },
    ).exec();
  }

  async updateSessionStatus(
    scheduleId: string,
    userId: string,
    sessionId: string,
    status: string,
  ): Promise<AIScheduleDoc | null> {
    // ✅ FIX: Query nested array đúng cách với 2 cấp arrayFilters
    return AISchedule.findOneAndUpdate(
      {
        _id: new Types.ObjectId(scheduleId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { "schedule.$[day].tasks.$[task].status": status },
      },
      {
        new: true,
        arrayFilters: [
          { "day.tasks": { $elemMatch: { sessionId } } }, // Filter day chứa session
          { "task.sessionId": sessionId }, // Filter đúng task
        ],
      },
    ).exec();
  }

  async updateSessionTime(
    scheduleId: string,
    userId: string,
    sessionId: string,
    suggestedTime: string,
  ): Promise<AIScheduleDoc | null> {
    // ✅ FIX: Query nested array đúng cách với 2 cấp arrayFilters
    return AISchedule.findOneAndUpdate(
      {
        _id: new Types.ObjectId(scheduleId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { "schedule.$[day].tasks.$[task].suggestedTime": suggestedTime },
      },
      {
        new: true,
        arrayFilters: [
          { "day.tasks": { $elemMatch: { sessionId } } }, // Filter day chứa session
          { "task.sessionId": sessionId }, // Filter đúng task
        ],
      },
    ).exec();
  }

  async deactivateAllForUser(userId: string): Promise<void> {
    await AISchedule.updateMany(
      { userId: new Types.ObjectId(userId), isActive: true },
      { $set: { isActive: false } },
    );
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await AISchedule.deleteOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    }).exec();
    return result.deletedCount > 0;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await AISchedule.deleteMany({ userId: new Types.ObjectId(userId) });
  }

  async updateSessionTitlesForTask(
    userId: string,
    taskId: string,
    subtaskTitles: string[],
  ): Promise<void> {
    const schedules = await AISchedule.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
      sourceTasks: taskId,
    }).exec();

    for (const schedule of schedules) {
      let slotIndex = 0;
      let modified = false;
      for (const day of schedule.schedule) {
        for (const session of day.tasks) {
          if (
            String(session.taskId) === taskId &&
            slotIndex < subtaskTitles.length
          ) {
            session.title = subtaskTitles[slotIndex];
            slotIndex++;
            modified = true;
          }
        }
      }
      if (modified) {
        schedule.markModified("schedule");
        await schedule.save();
      }
    }
  }
}

export const aiScheduleRepository = new AIScheduleRepository();
