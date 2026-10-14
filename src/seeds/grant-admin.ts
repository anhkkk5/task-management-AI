import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connect } from "../config/database";
import { User } from "../modules/auth/auth.model";

const TARGET_EMAIL = "anh271020k5@gmail.com";
const TARGET_PASSWORD = "12345678";
const TARGET_NAME = "Anh Admin";

async function grantAdmin(): Promise<void> {
  try {
    await connect();
    console.log("📡 Connected to database");

    const user = await User.findOne({ email: TARGET_EMAIL });
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(TARGET_PASSWORD, saltRounds);

    if (user) {
      user.role = "admin";
      user.password = hashedPassword;
      user.isVerified = true;
      await user.save();
      console.log(`✅ Successfully updated ${TARGET_EMAIL} to admin role with new password!`);
    } else {
      const newAdmin = await User.create({
        email: TARGET_EMAIL,
        password: hashedPassword,
        name: TARGET_NAME,
        role: "admin",
        isVerified: true,
      });
      console.log(`✅ Successfully created new admin ${TARGET_EMAIL}! ID: ${newAdmin._id}`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error granting admin:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

grantAdmin();
