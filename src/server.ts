import dotenv from "dotenv";

dotenv.config();

import { createApp } from "./app";
import { connect } from "./config/database";

const bootstrap = async (): Promise<void> => {
  await connect();

  const app = createApp();
  const port: number | string = process.env.PORT || 3002;

  app.listen(port, () => {
    console.log(`App listening on port ${port}`);
  });
};

void bootstrap();
