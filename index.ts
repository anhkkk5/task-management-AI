import express, { Express, Request, Response } from "express";
import * as database from "./config/database";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

database.connect();

const app: Express = express();
const port: number | string = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// mainV1Routes(app);
// Lắng nghe cổng
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
