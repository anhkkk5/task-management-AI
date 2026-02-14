import mongoose, { Model, Schema, Types } from "mongoose";

export type UserRole = "user" | "admin";

export type UserAttrs = {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  dob?: Date;
  address?: string;
  settings?: Record<string, unknown>;
  isVerified?: boolean;
};

export type UserDoc = {
  _id: Types.ObjectId;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  dob?: Date;
  address?: string;
  settings?: Record<string, unknown>;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type UserModel = Model<UserDoc>;

const userSchema = new Schema<UserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["user", "admin"],
      default: "user",
    },
    avatar: {
      type: String,
      required: false,
    },
    bio: {
      type: String,
      required: false,
    },
    phone: {
      type: String,
      required: false,
    },
    dob: {
      type: Date,
      required: false,
    },
    address: {
      type: String,
      required: false,
    },
    settings: {
      type: Schema.Types.Mixed,
      required: false,
    },
    isVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const User =
  (mongoose.models.User as UserModel) ||
  mongoose.model<UserDoc>("User", userSchema);
