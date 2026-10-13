import express from "express";
import request from "supertest";
import helmet from "helmet";
import {
  globalLimiter,
  authLimiter,
  aiLimiter,
} from "../../middleware/rate-limit.middleware";

describe("Security & Rate Limiting Middleware Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // 1. Security Headers
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
      }),
    );

    // 2. Global Limiter
    app.use(globalLimiter);

    // Test endpoints
    app.get("/healthz", (_req, res) => {
      res.json({ ok: true });
    });

    app.post("/auth/login", authLimiter, (_req, res) => {
      res.json({ message: "login endpoint" });
    });

    // Mock AI endpoint with dummy auth user
    app.post("/ai/chat", (req, _res, next) => {
      if (req.headers["x-user-id"]) {
        (req as any).user = { userId: req.headers["x-user-id"] };
      }
      next();
    }, aiLimiter, (_req, res) => {
      res.json({ message: "ai chat response" });
    });
  });

  describe("Helmet Security Headers", () => {
    it("should set standard security headers and remove X-Powered-By", async () => {
      const res = await request(app).get("/healthz");

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  describe("Auth Rate Limiter", () => {
    it("should allow requests within limit and return 429 when limit is exceeded", async () => {
      // First request should succeed
      const firstRes = await request(app).post("/auth/login").send({});
      expect(firstRes.status).toBe(200);

      // Send requests up to limit (15 requests/min)
      let lastRes: any;
      for (let i = 0; i < 16; i++) {
        lastRes = await request(app).post("/auth/login").send({});
      }

      expect(lastRes.status).toBe(429);
      expect(lastRes.body.success).toBe(false);
      expect(lastRes.body.message).toContain("quá nhiều yêu cầu");
    });
  });

  describe("AI Rate Limiter", () => {
    it("should limit requests per user ID", async () => {
      const userId = "user_test_999";

      // First request should succeed
      const firstRes = await request(app)
        .post("/ai/chat")
        .set("x-user-id", userId)
        .send({ prompt: "Hello AI" });
      expect(firstRes.status).toBe(200);

      // Exceed 20 requests
      let lastRes: any;
      for (let i = 0; i < 21; i++) {
        lastRes = await request(app)
          .post("/ai/chat")
          .set("x-user-id", userId)
          .send({ prompt: "Hello AI" });
      }

      expect(lastRes.status).toBe(429);
      expect(lastRes.body.success).toBe(false);
      expect(lastRes.body.message).toContain("yêu cầu AI quá nhanh");
    });
  });
});
