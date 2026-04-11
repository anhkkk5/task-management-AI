// Passport configuration for Google OAuth
import passport from "passport";
import {
  Strategy as GoogleStrategy,
  VerifyCallback,
} from "passport-google-oauth20";
import { User } from "../modules/auth/auth.model";
import { generateJWT } from "../utils/jwt";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:3002/auth/google/callback";

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
        refreshToken: string,
        profile: any,
        done: VerifyCallback,
      ) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email found in Google profile"), false);
          }

          // Find or create user
          let user = await User.findOne({ email });

          if (!user) {
            // Create new user from Google profile
            user = await User.create({
              email,
              name: profile.displayName || email.split("@")[0],
              avatar: profile.photos?.[0]?.value,
              password: "google-auth-" + Date.now(), // Google auth users - random password
              role: "user",
              isVerified: true,
            });
          } else {
            // Update avatar if changed
            if (profile.photos?.[0]?.value && !user.avatar) {
              user.avatar = profile.photos[0].value;
              await user.save();
            }
          }

          // Generate JWT with Google tokens
          const token = generateJWT({
            userId: String(user._id),
            email: user.email,
            name: user.name,
            picture: user.avatar,
            googleAccessToken: accessToken,
            googleRefreshToken: refreshToken,
          });

          return done(null, {
            user,
            token,
            googleAccessToken: accessToken,
            googleRefreshToken: refreshToken,
          });
        } catch (error) {
          return done(error as Error, false);
        }
      },
    ),
  );

  // Serialize/deserialize user for session (not used with JWT but required by passport)
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
