import dotenv from "dotenv";

dotenv.config();

import { createApp } from "./app";
import { connect } from "./config/database";
import path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import swaggerUi from "swagger-ui-express";

const bootstrap = async (): Promise<void> => {
  await connect();

  const app = createApp();

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

  app.listen(port, () => {
    console.log(`App listening on port ${port}`);
  });
};

void bootstrap();
