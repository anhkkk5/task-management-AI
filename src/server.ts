import dotenv from "dotenv";

dotenv.config();

import http from "http";
import { createApp } from "./app";
import { connect } from "./config/database";
import path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import swaggerUi from "swagger-ui-express";
import { initChatGateway } from "./modules/chat/chat.gateway";
import { reminderCronService } from "./modules/notification/reminder.cron";

const bootstrap = async (): Promise<void> => {
  await connect();

  const app = createApp();

  // Create HTTP server for Socket.IO
  const server = http.createServer(app);

  // Initialize Socket.IO gateway
  initChatGateway(server);
  console.log("Socket.IO gateway initialized");

  const openApiPath = path.resolve(process.cwd(), "openapi", "openapi.yml");
  const openApi = (await SwaggerParser.dereference(openApiPath)) as object;
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApi, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  const port: number | string = process.env.PORT || 3002;

  server.listen(port, () => {
    console.log(`App listening on port ${port}`);
    console.log(`Socket.IO ready for realtime chat`);

    // Start reminder cron job
    reminderCronService.start();
    console.log(`Reminder cron job started for deadline alerts`);
  });
};

void bootstrap();
