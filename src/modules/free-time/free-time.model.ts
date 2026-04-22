import mongoose, { Schema, Types } from "mongoose";

export type AvailableTimeSlot = {
  start: string; // HH:mm
  end: string; // HH:mm
};

export type WeeklyPattern = {
  monday: AvailableTimeSlot[];
  tuesday: AvailableTimeSlot[];
  wednesday: AvailableTimeSlot[];
  thursday: AvailableTimeSlot[];
  friday: AvailableTimeSlot[];
  saturday: AvailableTimeSlot[];
  sunday: AvailableTimeSlot[];
};

export type CustomDateOverride = {
  date: string; // YYYY-MM-DD
  slots: AvailableTimeSlot[];
};

export type FreeTimeAttrs = {
  userId: Types.ObjectId;
  weeklyPattern?: WeeklyPattern;
  customDates?: CustomDateOverride[];
  timezone?: string;
};

export type FreeTimeDoc = mongoose.Document & {
  userId: Types.ObjectId;
  weeklyPattern: WeeklyPattern;
  customDates: CustomDateOverride[];
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
};

type FreeTimeModel = mongoose.Model<FreeTimeDoc>;

const slotSchema = new Schema<AvailableTimeSlot>(
  {
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
  },
  { _id: false },
);

const weeklyPatternSchema = new Schema<WeeklyPattern>(
  {
    monday: { type: [slotSchema], default: [] },
    tuesday: { type: [slotSchema], default: [] },
    wednesday: { type: [slotSchema], default: [] },
    thursday: { type: [slotSchema], default: [] },
    friday: { type: [slotSchema], default: [] },
    saturday: { type: [slotSchema], default: [] },
    sunday: { type: [slotSchema], default: [] },
  },
  { _id: false },
);

const customDateSchema = new Schema<CustomDateOverride>(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    slots: { type: [slotSchema], default: [] },
  },
  { _id: false },
);

const freeTimeSchema = new Schema<FreeTimeDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
      ref: "User",
    },
    weeklyPattern: {
      type: weeklyPatternSchema,
      required: true,
      default: () => ({
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      }),
    },
    customDates: { type: [customDateSchema], default: [] },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Ho_Chi_Minh",
    },
  },
  { timestamps: true },
);

freeTimeSchema.index({ userId: 1 }, { unique: true });
freeTimeSchema.index({ "customDates.date": 1 });

export const FreeTime =
  (mongoose.models.FreeTime as FreeTimeModel) ||
  mongoose.model<FreeTimeDoc>("FreeTime", freeTimeSchema);
