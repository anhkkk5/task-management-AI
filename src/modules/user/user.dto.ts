export type UpdateUserProfileDto = {
  name?: string;
  bio?: string;
  phone?: string;
  dob?: Date;
  address?: string;
  settings?: Record<string, unknown>;
};

export type ChangePasswordDto = {
  oldPassword: string;
  newPassword: string;
};

export type SendChangePasswordOtpDto = Record<string, never>;

export type VerifyChangePasswordOtpDto = {
  otp: string;
  newPassword: string;
};
