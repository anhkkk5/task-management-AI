import express, { Express, Request, Response } from "express";
import { connect } from "./src/config/database";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

void connect();

const app: Express = express();
const port: number | string = process.env.PORT || 3002;

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.send("hello");
});

// Lắng nghe cổng
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
