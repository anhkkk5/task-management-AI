"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const database_1 = require("./config/database");
const path_1 = __importDefault(require("path"));
const swagger_parser_1 = __importDefault(require("@apidevtools/swagger-parser"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const chat_gateway_1 = require("./modules/chat/chat.gateway");
const reminder_cron_1 = require("./modules/notification/reminder.cron");
require("./modules/notification/notification.worker");
const bootstrap = async () => {
    await (0, database_1.connect)();
    const app = (0, app_1.createApp)();
    // Create HTTP server for Socket.IO
    const server = http_1.default.createServer(app);
    // Initialize Socket.IO gateway
    (0, chat_gateway_1.initChatGateway)(server);
    console.log("Socket.IO gateway initialized");
    const openApiPath = path_1.default.resolve(process.cwd(), "openapi", "openapi.yml");
    const openApi = (await swagger_parser_1.default.dereference(openApiPath));
    app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openApi, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    }));
    const port = process.env.PORT || 3002;
    server.listen(port, () => {
        console.log(`App listening on port ${port}`);
        console.log(`Socket.IO ready for realtime chat`);
        // Start reminder cron job
        reminder_cron_1.reminderCronService.start();
        console.log(`Reminder cron job started for deadline alerts`);
        console.log(`Notification worker started for queue processing`);
    });
};
void bootstrap();
