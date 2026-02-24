import request from "supertest";
import { createApp } from "../../app";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "../../modules/user/user.model";
import { Task } from "../../modules/task/task.model";

const app = createApp();
let mongoServer: MongoMemoryServer;
let authToken: string;
let userId: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Create test user
  const user = await User.create({
    email: "test@example.com",
    password: "password123",
    name: "Test User",
  });
  userId = user._id.toString();

  // Generate auth token
  authToken = jwt.sign({ userId }, process.env.JWT_SECRET || "test-secret");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Task.deleteMany({});
});

describe("POST /ai/schedule-plan", () => {
  it("should return 401 if not authenticated", async () => {
    const response = await request(app)
      .post("/ai/schedule-plan")
      .send({ taskIds: ["task1", "task2"] });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Chưa đăng nhập");
  });

  it("should return 400 if taskIds is empty", async () => {
    const response = await request(app)
      .post("/ai/schedule-plan")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ taskIds: [] });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Danh sách taskIds không hợp lệ");
  });

  it("should return 400 if more than 20 tasks", async () => {
    const response = await request(app)
      .post("/ai/schedule-plan")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ taskIds: Array(21).fill("taskId") });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Tối đa 20 công việc trong một lịch trình",
    );
  });

  it("should return 404 if task not found", async () => {
    const response = await request(app)
      .post("/ai/schedule-plan")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ taskIds: ["507f1f77bcf86cd799439011"] }); // Invalid ObjectId

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Không tìm thấy công việc");
  });

  it("should create schedule plan with valid tasks", async () => {
    // Create test tasks
    const task1 = await Task.create({
      title: "Task 1 - High Priority",
      description: "Description 1",
      priority: "high",
      status: "todo",
      userId: new mongoose.Types.ObjectId(userId),
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    });

    const task2 = await Task.create({
      title: "Task 2 - Medium Priority",
      description: "Description 2",
      priority: "medium",
      status: "todo",
      userId: new mongoose.Types.ObjectId(userId),
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    });

    const response = await request(app)
      .post("/ai/schedule-plan")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        taskIds: [task1._id.toString(), task2._id.toString()],
        startDate: new Date().toISOString().split("T")[0],
      });

    // API should return either 200 (success) or 501 (AI not configured in test)
    expect([200, 501]).toContain(response.status);

    if (response.status === 200) {
      expect(response.body).toHaveProperty("schedule");
      expect(response.body).toHaveProperty("totalTasks");
      expect(response.body).toHaveProperty("suggestedOrder");
      expect(response.body.totalTasks).toBe(2);
      expect(Array.isArray(response.body.schedule)).toBe(true);
      expect(Array.isArray(response.body.suggestedOrder)).toBe(true);
    }
  });
});
