"use strict";
/**
 * Admin Seeder - Tạo tài khoản admin ban đầu
 *
 * Chạy: npx ts-node src/seeds/admin.seed.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAdmin = seedAdmin;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const auth_model_1 = require("../modules/auth/auth.model");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrator";
async function seedAdmin() {
    try {
        await (0, database_1.connect)();
        console.log("📡 Connected to database");
        // Kiểm tra admin đã tồn tại chưa
        const existingAdmin = await auth_model_1.User.findOne({ email: ADMIN_EMAIL });
        if (existingAdmin) {
            if (existingAdmin.role === "admin") {
                console.log(`✅ Admin already exists: ${ADMIN_EMAIL}`);
            }
            else {
                // Update thành admin nếu chưa phải
                existingAdmin.role = "admin";
                await existingAdmin.save();
                console.log(`✅ Updated ${ADMIN_EMAIL} to admin role`);
            }
            await mongoose_1.default.disconnect();
            return;
        }
        // Tạo admin mới
        const saltRounds = 10;
        const hashedPassword = await bcryptjs_1.default.hash(ADMIN_PASSWORD, saltRounds);
        const admin = await auth_model_1.User.create({
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
        await mongoose_1.default.disconnect();
    }
    catch (err) {
        console.error("❌ Error seeding admin:", err);
        await mongoose_1.default.disconnect();
        process.exit(1);
    }
}
// Chạy nếu gọi trực tiếp
if (require.main === module) {
    seedAdmin();
}
