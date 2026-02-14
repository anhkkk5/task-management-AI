import { Types } from "mongoose";
import { User, UserDoc } from "../auth/auth.model";

export const userRepository = {
  findById: async (userId: string | Types.ObjectId): Promise<UserDoc | null> => {
    return User.findById(userId).exec();
  },
};
