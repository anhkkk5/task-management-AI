export type RegisterDto = {
  email: string;
  password: string;
  name: string;
};

export type LoginDto = {
  email: string;
  password: string;
};

export type UpdateProfileDto = {
  name?: string;
  avatar?: string;
};
