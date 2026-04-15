"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationHelper = void 0;
const mongoose_1 = require("mongoose");
class ValidationHelper {
    static isValidObjectId(id) {
        return mongoose_1.Types.ObjectId.isValid(id);
    }
    static toObjectId(id) {
        if (!this.isValidObjectId(id)) {
            throw new Error("INVALID_OBJECT_ID");
        }
        return new mongoose_1.Types.ObjectId(id);
    }
    static validateObjectIds(ids) {
        return ids.filter((id) => this.isValidObjectId(id));
    }
    static ensureValidUserId(userId) {
        if (!this.isValidObjectId(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        return new mongoose_1.Types.ObjectId(userId);
    }
}
exports.ValidationHelper = ValidationHelper;
