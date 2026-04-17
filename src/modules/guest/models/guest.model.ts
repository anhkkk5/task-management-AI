import mongoose, { Schema, Types } from "mongoose";

/**
 * Guest interface representing a person invited to a calendar event
 * @interface Guest
 */
export interface Guest {
  _id?: Types.ObjectId;
  eventId: Types.ObjectId; // Reference to Event/Task
  userId: Types.ObjectId; // Reference to User (event owner)
  email: string; // Normalized to lowercase
  name: string;
  avatar?: string; // URL to avatar image
  permission: "edit_event" | "view_guest_list" | "invite_others";
  googleContactId?: string; // Reference to Google Contact
  status: "pending" | "accepted" | "declined";
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Attributes for creating a new Guest document
 * @interface GuestAttrs
 */
export type GuestAttrs = {
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  email: string;
  name: string;
  avatar?: string;
  permission?: "edit_event" | "view_guest_list" | "invite_others";
  googleContactId?: string;
  status?: "pending" | "accepted" | "declined";
};

/**
 * Mongoose document type for Guest
 * @type GuestDoc
 */
export type GuestDoc = mongoose.Document & Guest;

/**
 * Mongoose model type for Guest
 * @type GuestModel
 */
type GuestModel = mongoose.Model<GuestDoc>;

/**
 * Mongoose schema for Guest collection
 * Stores guest information for calendar events including email, name, avatar, and permissions
 *
 * Indexes:
 * - Compound index (eventId, email) for duplicate prevention
 * - Index on userId for efficient user queries
 * - Index on eventId for efficient event queries
 */
const guestSchema = new Schema<GuestDoc>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    permission: {
      type: String,
      enum: ["edit_event", "view_guest_list", "invite_others"],
      default: "view_guest_list",
    },
    googleContactId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
  },
  { timestamps: true },
);

/**
 * Compound index for duplicate prevention
 * Ensures that the same email cannot be added twice to the same event
 */
guestSchema.index({ eventId: 1, email: 1 }, { unique: true });

/**
 * Composite index for efficient queries by userId and eventId
 */
guestSchema.index({ userId: 1, eventId: 1 });

export const Guest =
  (mongoose.models.Guest as GuestModel) ||
  mongoose.model<GuestDoc>("Guest", guestSchema);
