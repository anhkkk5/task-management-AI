"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
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
const createApp = () => {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: true,
        credentials: true,
    }));
    app.use((0, cookie_parser_1.default)());
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
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
    return app;
};
exports.createApp = createApp;
