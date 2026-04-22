import { Types } from "mongoose";
import {
  FreeTime,
  FreeTimeDoc,
  WeeklyPattern,
  AvailableTimeSlot,
} from "./free-time.model";

export class FreeTimeRepository {
  async findByUserId(userId: string): Promise<FreeTimeDoc | null> {
    return FreeTime.findOne({ userId: new Types.ObjectId(userId) }).exec();
  }

  async upsertWeeklyPattern(
    userId: string,
    weeklyPattern: WeeklyPattern,
    timezone?: string,
  ): Promise<FreeTimeDoc | null> {
    const updated = await FreeTime.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          weeklyPattern,
          ...(timezone ? { timezone } : {}),
        },
        $setOnInsert: {
          customDates: [],
        },
      },
      { new: true, upsert: true },
    ).exec();

    if (updated) return updated;
    return this.findByUserId(userId);
  }

  async upsertCustomDate(
    userId: string,
    date: string,
    slots: AvailableTimeSlot[],
  ): Promise<FreeTimeDoc | null> {
    const base = await FreeTime.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $setOnInsert: {
          weeklyPattern: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: [],
          },
          customDates: [],
          timezone: "Asia/Ho_Chi_Minh",
        },
      },
      { new: true, upsert: true },
    ).exec();

    if (!base) return null;

    // remove old date then push latest for idempotent upsert
    base.customDates = (base.customDates || []).filter((x) => x.date !== date);
    base.customDates.push({ date, slots });
    base.markModified("customDates");
    await base.save();
    return base;
  }

  async deleteCustomDate(
    userId: string,
    date: string,
  ): Promise<FreeTimeDoc | null> {
    return FreeTime.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $pull: { customDates: { date } } },
      { new: true },
    ).exec();
  }
}

export const freeTimeRepository = new FreeTimeRepository();
