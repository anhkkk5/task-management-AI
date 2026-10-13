import dotenv from "dotenv";
dotenv.config();

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test_jwt_access_secret_12345";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test_jwt_refresh_secret_12345";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_12345";

import bcrypt from "bcryptjs";
import { authService } from "../../modules/auth/auth.service";
import { authRepository } from "../../modules/auth/auth.repository";
import { emailService } from "../../modules/auth/email.service";
import { otpService } from "../../modules/auth/otp.service";

// Mock dependencies
jest.mock("../../modules/auth/auth.repository");
jest.mock("../../modules/auth/email.service");
jest.mock("../../modules/auth/otp.service");
jest.mock("../../services/redis.service", () => ({
  getRedis: jest.fn().mockReturnValue({
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(["0", []]),
  }),
}));

describe("AuthService - Unit & Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should throw INVALID_INPUT when required fields are missing", async () => {
      await expect(
        authService.register({ email: "", password: "", name: "" }),
      ).rejects.toThrow("INVALID_INPUT");
    });

    it("should throw INVALID_EMAIL when email format is incorrect", async () => {
      await expect(
        authService.register({
          email: "invalid-email",
          password: "password123",
          name: "Test User",
        }),
      ).rejects.toThrow("INVALID_EMAIL");
    });

    it("should throw INVALID_PASSWORD when password is shorter than 6 characters", async () => {
      await expect(
        authService.register({
          email: "user@test.com",
          password: "123",
          name: "Test User",
        }),
      ).rejects.toThrow("INVALID_PASSWORD");
    });

    it("should throw EMAIL_EXISTS if user already exists", async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValueOnce({
        _id: "user_123",
        email: "existing@test.com",
        isVerified: true,
      });

      await expect(
        authService.register({
          email: "existing@test.com",
          password: "password123",
          name: "Existing User",
        }),
      ).rejects.toThrow("EMAIL_EXISTS");
    });

    it("should generate OTP and send email on successful registration input", async () => {
      (authRepository.findByEmail as jest.Mock).mockResolvedValueOnce(null);
      (otpService.generateOtp as jest.Mock).mockReturnValueOnce("123456");
      (otpService.savePendingRegister as jest.Mock).mockResolvedValueOnce(undefined);
      (otpService.saveOtp as jest.Mock).mockResolvedValueOnce(undefined);
      (otpService.getOtpTtlSeconds as jest.Mock).mockReturnValueOnce(300);
      (emailService.sendOtpEmail as jest.Mock).mockResolvedValueOnce(true);

      const result = await authService.register({
        email: "newuser@test.com",
        password: "password123",
        name: "New User",
      });

      expect(result).toHaveProperty("message");
      expect(otpService.savePendingRegister).toHaveBeenCalled();
      expect(otpService.saveOtp).toHaveBeenCalledWith("newuser@test.com", "123456");
      expect(emailService.sendOtpEmail).toHaveBeenCalledWith(
        "newuser@test.com",
        "123456",
      );
    });
  });

  describe("login", () => {
    it("should throw INVALID_INPUT if email or password is missing", async () => {
      await expect(
        authService.login({ email: "", password: "", ip: "127.0.0.1" }),
      ).rejects.toThrow("INVALID_INPUT");
    });

    it("should throw INVALID_CREDENTIALS if user does not exist", async () => {
      (authRepository.findByEmailWithPassword as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        authService.login({
          email: "nonexistent@test.com",
          password: "password123",
          ip: "127.0.0.1",
        }),
      ).rejects.toThrow("INVALID_CREDENTIALS");
    });

    it("should throw EMAIL_NOT_VERIFIED if user exists but is not verified", async () => {
      (authRepository.findByEmailWithPassword as jest.Mock).mockResolvedValueOnce({
        _id: "user_123",
        email: "unverified@test.com",
        isVerified: false,
      });

      await expect(
        authService.login({
          email: "unverified@test.com",
          password: "password123",
          ip: "127.0.0.1",
        }),
      ).rejects.toThrow("EMAIL_NOT_VERIFIED");
    });

    it("should throw INVALID_CREDENTIALS if password does not match", async () => {
      const hashedPassword = await bcrypt.hash("correct_password", 10);
      (authRepository.findByEmailWithPassword as jest.Mock).mockResolvedValueOnce({
        _id: "user_123",
        email: "valid@test.com",
        password: hashedPassword,
        isVerified: true,
      });

      await expect(
        authService.login({
          email: "valid@test.com",
          password: "wrong_password",
          ip: "127.0.0.1",
        }),
      ).rejects.toThrow("INVALID_CREDENTIALS");
    });

    it("should return accessToken, refreshToken and user when credentials are correct", async () => {
      const plainPassword = "mypassword123";
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      (authRepository.findByEmailWithPassword as jest.Mock).mockResolvedValueOnce({
        _id: "507f1f77bcf86cd799439011",
        email: "success@test.com",
        name: "Success User",
        password: hashedPassword,
        role: "user",
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.login({
        email: "success@test.com",
        password: plainPassword,
        ip: "127.0.0.1",
      });

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user.email).toBe("success@test.com");
      expect(result.user.name).toBe("Success User");
    });
  });
});
