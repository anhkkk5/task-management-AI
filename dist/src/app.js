"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const passport_1 = __importDefault(require("passport"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const user_routes_1 = __importDefault(require("./modules/user/user.routes"));
const task_routes_1 = __importDefault(require("./modules/task/task.routes"));
const ai_routes_1 = __importDefault(require("./modules/ai/ai.routes"));
const chat_routes_1 = __importDefault(require("./modules/chat/chat.routes"));
const notification_routes_1 = __importDefault(require("./modules/notification/notification.routes"));
const admin_routes_1 = __importDefault(require("./modules/admin/admin.routes"));
const schedule_template_routes_1 = __importDefault(require("./modules/schedule-template/schedule-template.routes"));
const ai_schedule_routes_1 = __importDefault(require("./modules/ai-schedule/ai-schedule.routes"));
const scheduler_routes_1 = __importDefault(require("./modules/scheduler/scheduler.routes"));
const free_time_routes_1 = __importDefault(require("./modules/free-time/free-time.routes"));
const guest_routes_1 = __importDefault(require("./modules/guest/routes/guest.routes"));
const colors_routes_1 = __importDefault(require("./modules/colors/colors.routes"));
const team_routes_1 = __importDefault(require("./modules/team/team.routes"));
const catalog_routes_1 = __importDefault(require("./modules/catalog/catalog.routes"));
const passport_2 = require("./config/passport");
const getAllowedCorsOrigins = () => {
    const envOrigins = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
        .filter((value) => Boolean(value))
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean);
    return Array.from(new Set([...envOrigins, "http://localhost:5173", "http://127.0.0.1:5173"]));
};
const createApp = () => {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: getAllowedCorsOrigins(),
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }));
    // Gzip/Brotli compression for all responses. Critical on managed hosts
    // (Vercel/Render) where bandwidth & cold-start TTFB dominate. Skip when
    // the client opts-out or when the response sets `x-no-compression`.
    app.use((0, compression_1.default)({
        threshold: 1024, // do not bother compressing tiny payloads
        filter: (req, res) => {
            if (req.headers["x-no-compression"])
                return false;
            return compression_1.default.filter(req, res);
        },
    }));
    app.use((0, cookie_parser_1.default)());
    // Generous JSON limit for AI breakdown payloads. Keep urlencoded smaller
    // since we only use it for OAuth callbacks.
    app.use(express_1.default.json({ limit: "2mb" }));
    app.use(express_1.default.urlencoded({ extended: true, limit: "1mb" }));
    // Initialize Passport
    (0, passport_2.setupPassport)();
    app.use(passport_1.default.initialize());
    app.use(((err, _req, res, next) => {
        if (err instanceof SyntaxError && "body" in err) {
            res.status(400).json({ message: "JSON không hợp lệ" });
            return;
        }
        next(err);
    }));
    app.get("/", (_req, res) => {
        res.send("hello");
    });
    // Health check used by Render/Vercel to keep the dyno warm.
    app.get("/healthz", (_req, res) => {
        res.json({ ok: true, ts: Date.now() });
    });
    app.use("/auth", auth_routes_1.default);
    app.use("/users", user_routes_1.default);
    app.use("/tasks", task_routes_1.default);
    app.use("/ai", ai_routes_1.default);
    app.use("/chat", chat_routes_1.default);
    app.use("/notifications", notification_routes_1.default);
    app.use("/admin", admin_routes_1.default);
    app.use("/schedule-templates", schedule_template_routes_1.default);
    app.use("/ai-schedules", ai_schedule_routes_1.default);
    app.use("/scheduler", scheduler_routes_1.default);
    app.use("/free-time", free_time_routes_1.default);
    app.use("/guests", guest_routes_1.default);
    app.use("/colors", colors_routes_1.default);
    app.use("/teams", team_routes_1.default);
    app.use("/catalog", catalog_routes_1.default);
    return app;
};
exports.createApp = createApp;
