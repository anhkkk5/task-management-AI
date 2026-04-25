"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = void 0;
const auth_model_1 = require("../auth/auth.model");
exports.userRepository = {
    findById: async (userId) => {
        return auth_model_1.User.findById(userId).exec();
    },
    findByIdWithPassword: async (userId) => {
        return auth_model_1.User.findById(userId).select("+password").exec();
    },
    updateProfile: async (userId, update) => {
        return auth_model_1.User.findByIdAndUpdate(userId, {
            $set: {
                ...(update.name !== undefined ? { name: update.name } : {}),
                ...(update.bio !== undefined ? { bio: update.bio } : {}),
                ...(update.phone !== undefined ? { phone: update.phone } : {}),
                ...(update.dob !== undefined ? { dob: update.dob } : {}),
                ...(update.address !== undefined ? { address: update.address } : {}),
                ...(update.settings !== undefined
                    ? { settings: update.settings }
                    : {}),
            },
        }, { new: true }).exec();
    },
    updateAvatar: async (userId, avatar) => {
        return auth_model_1.User.findByIdAndUpdate(userId, {
            $set: {
                avatar,
            },
        }, { new: true }).exec();
    },
    updatePassword: async (userId, passwordHash) => {
        return auth_model_1.User.findByIdAndUpdate(userId, {
            $set: {
                password: passwordHash,
            },
        }, { new: true }).exec();
    },
    // Users who enabled notification digest
    findDigestEnabledUsers: async () => {
        return auth_model_1.User.find({
            "settings.notifications.digest.enabled": true,
        })
            .select({ email: 1, settings: 1 })
            .lean();
    },
};
