"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRepository = void 0;
const auth_model_1 = require("./auth.model");
exports.authRepository = {
    findByEmail: async (email) => {
        return auth_model_1.User.findOne({ email }).exec();
    },
    findByEmailWithPassword: async (email) => {
        return auth_model_1.User.findOne({ email }).select("+password").exec();
    },
    findById: async (userId) => {
        return auth_model_1.User.findById(userId).exec();
    },
    createUser: async (attrs) => {
        const doc = await auth_model_1.User.create({
            email: attrs.email,
            password: attrs.password,
            name: attrs.name,
            role: attrs.role ?? "user",
            avatar: attrs.avatar,
            isVerified: attrs.isVerified ?? false,
        });
        return doc;
    },
    updateProfile: async (userId, update) => {
        return auth_model_1.User.findByIdAndUpdate(userId, {
            $set: {
                ...(update.name !== undefined ? { name: update.name } : {}),
                ...(update.avatar !== undefined ? { avatar: update.avatar } : {}),
                ...(update.googleAccessToken !== undefined
                    ? { googleAccessToken: update.googleAccessToken }
                    : {}),
            },
        }, { new: true }).exec();
    },
    updatePassword: async (userId, hashedPassword) => {
        return auth_model_1.User.findByIdAndUpdate(userId, { $set: { password: hashedPassword } }, { new: true }).exec();
    },
};
