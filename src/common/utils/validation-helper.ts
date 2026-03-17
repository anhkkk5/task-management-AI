import { Types } from "mongoose";

export class ValidationHelper {
  static isValidObjectId(id: string | Types.ObjectId): boolean {
    return Types.ObjectId.isValid(id);
  }

  static toObjectId(id: string): Types.ObjectId {
    if (!this.isValidObjectId(id)) {
      throw new Error("INVALID_OBJECT_ID");
    }
    return new Types.ObjectId(id);
  }

  static validateObjectIds(ids: string[]): string[] {
    return ids.filter((id) => this.isValidObjectId(id));
  }

  static ensureValidUserId(userId: string): Types.ObjectId {
    if (!this.isValidObjectId(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    return new Types.ObjectId(userId);
  }
}
