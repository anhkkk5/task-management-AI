# TaskMind AI — Backend

> Hệ thống quản lý công việc thông minh tích hợp AI, lên lịch tự động và cộng tác nhóm real-time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | MongoDB (Mongoose 9) |
| Cache / Queue | Redis (ioredis) + BullMQ |
| Real-time | Socket.IO 4 |
| AI | Groq (LLaMA) · Google Gemini · OpenAI-compatible |
| Auth | JWT (access + refresh) · Google OAuth 2.0 · Passport.js |
| Email | Nodemailer (SMTP) |
| Storage | Cloudinary |
| Docs | Swagger / OpenAPI |
| Testing | Jest · Supertest · fast-check (property-based) |

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

### 1. Multi-Factor Slot Scoring
Tìm slot tối ưu cho task bằng scoring đa tiêu chí:
- **Productivity** (40%) — điểm năng suất theo giờ từ lịch sử user
- **Slot Fitness** (20%) — mức độ vừa vặn của slot với duration task
- **Preferred Time** (15%) — ưu tiên buổi sáng/chiều/tối theo user
- **Urgency** (15%) — deadline càng gần, slot sớm càng được ưu tiên
- **Fragmentation Penalty** (10%) — phạt slot quá lớn gây lãng phí

📍 `src/modules/scheduler/slot-finder.service.ts`

### 2. Pomodoro-Inspired Adaptive Buffer
Buffer nghỉ tự điều chỉnh theo thời lượng session + tích lũy mệt mỏi:
- < 25 phút → 5 phút nghỉ (micro break)
- 25-50 phút → 10 phút (short break)
- 50-90 phút → 15 phút (standard break)
- \> 90 phút → 20 phút (long break)
- +5 phút bonus mỗi 3 session liên tiếp (fatigue accumulation)

📍 `src/modules/scheduler/adaptive-buffer.ts`

### 3. Bayesian Productivity Scoring + Exponential Decay
Tính điểm năng suất theo giờ kết hợp:
- **Exponential Decay**: Task gần đây có trọng số cao hơn (λ = 0.1)
- **Bayesian Smoothing**: Kết hợp dữ liệu user với circadian rhythm prior
- **Confidence Score**: Nhiều data → tin tưởng user history, ít data → fallback prior

📍 `src/modules/scheduler/productivity.service.ts`

### 4. Binary Search Conflict Detection
Kiểm tra xung đột lịch trình O(n log n):
- Sort intervals theo start time
- Binary search tìm upper bound (start < newEnd)
- Chỉ check overlap trong range [0..bound-1]

📍 `src/modules/scheduler/scheduler.service.ts`

### 5. Continuous Logarithmic Duration Estimation
Ước lượng thời gian task bằng hàm logarithmic liên tục thay vì step function:
- Base estimate từ keyword matching + complexity analysis
- Multipliers: priority, industry level, user history
- AI difficulty adjustment (easy/medium/hard)

📍 `src/modules/scheduler/hybrid-schedule.service.ts`

### 6. Jaccard Similarity for Task Grounding
Đánh giá mức độ tương đồng giữa AI-generated subtasks và input gốc:
- Jaccard Index = |A ∩ B| / |A ∪ B| trên tập từ khóa
- Loại bỏ subtask có similarity quá thấp (không liên quan)

📍 `src/modules/ai/ai.service.ts`

### 7. Interval Merging (Free Slot Discovery)
Tìm tất cả khoảng trống trong ngày:
- Merge overlapping busy intervals O(n log n)
- Gap detection giữa merged intervals
- Skip past slots (chỉ trả slot tương lai)

📍 `src/modules/scheduler/slot-finder.service.ts`

### 8. Hybrid AI + Algorithm Scheduling
Kết hợp AI (phân tích task) + thuật toán (chọn slot):
- AI: phân tích complexity, ước lượng duration, breakdown subtasks
- Algorithm: tìm slot, scoring, conflict detection, buffer calculation
- Kết quả: deterministic, nhanh, không tốn API calls cho scheduling

📍 `src/modules/scheduler/hybrid-schedule.service.ts`

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
