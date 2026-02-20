/**
 * Admin Seeder - Tạo tài khoản admin ban đầu
 *
 * Chạy: npx ts-node src/seeds/admin.seed.ts
 */

import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connect } from "../config/database";
import { User } from "../modules/auth/auth.model";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrator";

async function seedAdmin(): Promise<void> {
  try {
    await connect();
    console.log("📡 Connected to database");

    // Kiểm tra admin đã tồn tại chưa
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });

    if (existingAdmin) {
      if (existingAdmin.role === "admin") {
        console.log(`✅ Admin already exists: ${ADMIN_EMAIL}`);
      } else {
        // Update thành admin nếu chưa phải
        existingAdmin.role = "admin";
        await existingAdmin.save();
        console.log(`✅ Updated ${ADMIN_EMAIL} to admin role`);
      }
      await mongoose.disconnect();
      return;
    }

    // Tạo admin mới
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    const admin = await User.create({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      name: ADMIN_NAME,
      role: "admin",
      isVerified: true,
    });

    console.log("✅ Admin created successfully!");
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   ID: ${admin._id}`);

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Error seeding admin:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Chạy nếu gọi trực tiếp
if (require.main === module) {
  seedAdmin();
}

export { seedAdmin };
