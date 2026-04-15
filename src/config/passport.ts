// Passport configuration for Google OAuth
// Sử dụng cùng hệ thống JWT + Redis refresh token như login thường
import passport from "passport";
import {
  Strategy as GoogleStrategy,
  VerifyCallback,
} from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { User } from "../modules/auth/auth.model";
import { getRedis } from "../services/redis.service";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:3002/auth/google/callback";

// ========== JWT helpers (phải ĐỒNG BỘ với auth.service.ts) ==========

const getAccessSecret = (): Secret => {
  const raw = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
  if (!raw) throw new Error("Missing env JWT_ACCESS_SECRET");
  return raw;
};

const getRefreshSecret = (): Secret => {
  const raw =
    process.env.JWT_REFRESH_SECRET ??
    process.env.JWT_ACCESS_SECRET ??
    process.env.JWT_SECRET;
  if (!raw) throw new Error("Missing env JWT_REFRESH_SECRET");
  return raw;
};

const getRefreshTtlSeconds = (): number => {
  // Hỗ trợ cả 2 tên biến env
  const env =
    process.env.JWT_REFRESH_TTL_SECONDS ??
    process.env.REFRESH_TOKEN_TTL_SECONDS;
  if (!env) return 86400; // default 1 day
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : 86400;
};

// ========== Passport Setup ==========

export const setupPassport = (): void => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: [
          "profile",
          "email",
          "https://www.googleapis.com/auth/contacts.readonly",
          "https://www.googleapis.com/auth/calendar",
        ],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: any,
        done: VerifyCallback,
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email found in Google profile"), false);
          }

          console.log("[Google Strategy] Processing user:", email);

          // Find or create user
          let user = await User.findOne({ email });

          if (!user) {
            // Google user không cần mật khẩu, nhưng schema yêu cầu required
            // → Tạo random hash để schema không reject
            const placeholder = `google:${randomUUID()}`;
            const hash = await bcrypt.hash(placeholder, 10);

            user = await User.create({
              email,
              name: profile.displayName || email.split("@")[0],
              avatar: profile.photos?.[0]?.value,
              password: hash,
              role: "user",
              isVerified: true,
              googleAccessToken: accessToken,
            });
            console.log("[Google Strategy] Created new user:", email);
          } else {
            // Update avatar nếu chưa có + lưu googleAccessToken
            if (profile.photos?.[0]?.value && !user.avatar) {
              user.avatar = profile.photos[0].value;
            }
            user.googleAccessToken = accessToken;
            await user.save();
            console.log("[Google Strategy] Found existing user:", email);
          }

          const userId = String(user._id);

          // ===== Access Token (ĐÚNG format như auth.service.ts) =====
          const accessExpiresIn: SignOptions["expiresIn"] = (process.env
            .JWT_ACCESS_EXPIRES_IN ?? "1h") as SignOptions["expiresIn"];

          const token = jwt.sign(
            {
              userId,
              email: user.email,
              role: user.role,
              googleAccessToken: accessToken,
            },
            getAccessSecret(),
            { expiresIn: accessExpiresIn },
          );

          // ===== Refresh Token + lưu Redis (ĐÚNG như auth.service.ts) =====
          const jti = randomUUID();
          const refreshExpiresIn: SignOptions["expiresIn"] = (process.env
            .JWT_REFRESH_EXPIRES_IN ?? "1d") as SignOptions["expiresIn"];

          const refreshTokenValue = jwt.sign(
            { userId, email: user.email, role: user.role, jti },
            getRefreshSecret(),
            { expiresIn: refreshExpiresIn },
          );

          const redis = getRedis();
          const redisKey = `refresh:${userId}:${jti}`;
          await redis.set(redisKey, "1", "EX", getRefreshTtlSeconds());
          console.log(
            "[Google Strategy] Refresh token saved to Redis:",
            redisKey,
          );

          return done(null, {
            user,
            token,
            refreshToken: refreshTokenValue,
            googleAccessToken: accessToken,
          });
        } catch (error) {
          console.error("[Google Strategy] Error:", error);
          return done(error as Error, false);
        }
      },
    ),
  );

  passport.serializeUser(
    (user: any, done: (err: Error | null, user?: any) => void) => {
      done(null, user);
    },
  );

  passport.deserializeUser(
    (obj: any, done: (err: Error | null, user?: any) => void) => {
      done(null, obj);
    },
  );
};

export default passport;
