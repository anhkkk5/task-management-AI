"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const auth_model_1 = require("../modules/auth/auth.model");
const TARGET_EMAIL = "anh271020k5@gmail.com";
const TARGET_PASSWORD = "12345678";
const TARGET_NAME = "Anh Admin";
async function grantAdmin() {
    try {
        await (0, database_1.connect)();
        console.log("📡 Connected to database");
        const user = await auth_model_1.User.findOne({ email: TARGET_EMAIL });
        const saltRounds = 10;
        const hashedPassword = await bcryptjs_1.default.hash(TARGET_PASSWORD, saltRounds);
        if (user) {
            user.role = "admin";
            user.password = hashedPassword;
            user.isVerified = true;
            await user.save();
            console.log(`✅ Successfully updated ${TARGET_EMAIL} to admin role with new password!`);
        }
        else {
            const newAdmin = await auth_model_1.User.create({
                email: TARGET_EMAIL,
                password: hashedPassword,
                name: TARGET_NAME,
                role: "admin",
                isVerified: true,
            });
            console.log(`✅ Successfully created new admin ${TARGET_EMAIL}! ID: ${newAdmin._id}`);
        }
        await mongoose_1.default.disconnect();
        process.exit(0);
    }
    catch (err) {
        console.error("❌ Error granting admin:", err);
        await mongoose_1.default.disconnect();
        process.exit(1);
    }
}
grantAdmin();
