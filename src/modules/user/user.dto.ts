export type UpdateUserProfileDto = {
  name?: string;
  bio?: string;
  phone?: string;
  dob?: Date;
  address?: string;
  settings?: Record<string, unknown>;
};
