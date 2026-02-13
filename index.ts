import express, { Express, Request, Response } from "express";
import * as database from "./config/database";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

database.connect();

const app: Express = express();
const port: number | string = process.env.PORT || 3002;

app.use(cors());
app.use((req: Request, _res: Response, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.send("hello");
});

// Lắng nghe cổng
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
