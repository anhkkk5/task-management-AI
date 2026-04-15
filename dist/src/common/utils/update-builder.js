"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateBuilder = void 0;
class UpdateBuilder {
    static buildUpdateObject(update) {
        const result = {};
        for (const [key, value] of Object.entries(update)) {
            if (value !== undefined) {
                result[key] = value;
            }
        }
        return result;
    }
    static buildMongoUpdate(update) {
        const setFields = this.buildUpdateObject(update);
        return { $set: setFields };
    }
}
exports.UpdateBuilder = UpdateBuilder;
