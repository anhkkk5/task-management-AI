# TaskMind AI — Backend

> Hệ thống quản lý công việc thông minh tích hợp AI, lên lịch tự động và cộng tác nhóm real-time.

## Tech Stack

| Layer         | Technology                                              |
| ------------- | ------------------------------------------------------- |
| Runtime       | Node.js + TypeScript                                    |
| Framework     | Express 5                                               |
| Database      | MongoDB (Mongoose 9)                                    |
| Cache / Queue | Redis (ioredis) + BullMQ                                |
| Real-time     | Socket.IO 4                                             |
| AI            | Groq (LLaMA) · Google Gemini · OpenAI-compatible        |
| Auth          | JWT (access + refresh) · Google OAuth 2.0 · Passport.js |
| Email         | Nodemailer (SMTP)                                       |
| Storage       | Cloudinary                                              |
| Docs          | Swagger / OpenAPI                                       |
| Testing       | Jest · Supertest · fast-check (property-based)          |

## Architecture

```
src/
├── config/          # Database, Passport, cache versioning
├── middleware/       # Auth middleware, validation
├── modules/
│   ├── auth/        # Register (OTP), Login, Google OAuth, JWT refresh
│   ├── user/        # Profile, habits, password reset
│   ├── task/        # CRUD tasks, AI breakdown, guest details
│   ├── ai/          # Chat, streaming, task breakdown, reschedule
│   ├── scheduler/   # Slot finder, productivity scorer, interval scheduler
│   ├── ai-schedule/ # AI-powered schedule plans
│   ├── chat/        # Real-time messaging (Socket.IO gateway)
│   ├── team/        # Team management, invites, comments
│   ├── guest/       # Event guest management
│   ├── notification/# Email alerts, reminder cron, BullMQ worker
│   ├── free-time/   # User availability slots
│   ├── catalog/     # Industry/position data
│   ├── colors/      # Theme colors
│   └── admin/       # Admin operations
├── services/        # Redis, Mail, Cloudinary, Cron, Cache cleanup
└── server.ts        # Bootstrap: HTTP + Socket.IO + Swagger + Cron jobs
```

**Design Pattern**: Controller → Service → Repository → Model (MongoDB)

## Algorithms & Techniques

> Chi tiết đầy đủ: **[ALGORITHMS.md](./ALGORITHMS.md)** — giải thích từng bước, ví dụ minh hoạ, thuật ngữ IT.

| #   | Thuật toán                             | Mô tả ngắn                                                                                  | File                                          |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | **Binary Search Conflict Detection**   | Phát hiện xung đột lịch O(log n) bằng tìm kiếm nhị phân                                     | `scheduler.service.ts`                        |
| 2   | **Bayesian Productivity Scoring**      | Chấm điểm năng suất theo giờ, kết hợp Exponential Decay + Circadian Rhythm Prior            | `productivity.service.ts`                     |
| 3   | **Multi-Factor Weighted Scoring**      | Chọn slot tối ưu bằng 5 tiêu chí có trọng số (productivity, fitness, urgency...)            | `slot-finder.service.ts`                      |
| 4   | **Interval Merging + Adaptive Buffer** | Gộp busy intervals, tìm khoảng trống, buffer nghỉ thông minh kiểu Pomodoro                  | `scheduler.service.ts` · `adaptive-buffer.ts` |
| 5   | **Hybrid AI + Heuristic Estimation**   | Ước lượng thời gian task bằng hàm logarit + AI difficulty analysis + contextual multipliers | `hybrid-schedule.service.ts`                  |

## Key Features

- **AI Chat**: Streaming chat với Groq/Gemini, conversation history, tool calling
- **Smart Scheduling**: Tự động xếp lịch tối ưu dựa trên productivity + availability
- **Smart Reschedule**: Đề xuất slot thay thế khi có conflict
- **Task Breakdown**: AI chia nhỏ task lớn thành subtasks có thời gian cụ thể
- **Real-time Chat**: Nhắn tin nhóm/cá nhân, typing indicator, online presence
- **Team Collaboration**: Tạo nhóm, mời thành viên qua email, task comments
- **Guest Management**: Mời khách vào sự kiện, gửi email invite
- **Notifications**: Email reminders cho deadline, BullMQ queue processing
- **Google Calendar Sync**: Tạo Google Meet, sync events qua Google Calendar API

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env
# → Edit .env with your values

# 3. Start Redis (required)
docker compose -f docker-compose.local.yml up -d

# 4. Development
npm run dev

# 5. Build
npm run build

# 6. Production
npm start
```

**API Docs**: http://localhost:3002/docs

## Testing

```bash
npm test
```

Test coverage includes: productivity scoring, guest management (controller, service, repository, validation), conflict detection, team comments.
