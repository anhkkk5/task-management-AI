# 🔔 Demo Notification System - Task Management AI

> Hướng dẫn demo tính năng Notification System cho recruiter

---

## 📋 Prerequisites

### 1. Environment Variables (`.env`)

```bash
# Database
MONGO_URI=mongodb://localhost:27017/task-management

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key

# SMTP (tùy chọn - cho email notification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@taskmanagement.com

# Client URL (cho CORS)
CLIENT_URL=http://localhost:3000
```

### 2. Khởi động services

```bash
# Terminal 1: Start MongoDB
mongod

# Terminal 2: Start Redis
redis-server

# Terminal 3: Start Backend
npm run dev
```

---

## 🎯 Demo Flow

### Step 1: Đăng nhập và lấy JWT Token

```bash
# Register (nếu chưa có account)
curl -X POST http://localhost:3002/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Demo User",
    "email": "demo@example.com",
    "password": "123456"
  }'

# Login để lấy token
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "123456"
  }'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIs...",
#   "user": { "_id": "...", "email": "demo@example.com" }
# }

export TOKEN="eyJhbGciOiJIUzI1NiIs..."
export USER_ID="user-id-from-response"
```

---

### Step 2: Kiểm tra unread count ban đầu

```bash
curl -X GET "http://localhost:3002/notifications" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "notifications": [],
#   "unreadCount": 0
# }
```

---

### Step 3: Tạo task với deadline trong 1 giờ tới

```bash
# Lấy thời điểm hiện tại + 30 phút (ISO format)
# Ví dụ: 2026-02-19T10:30:00.000Z

curl -X POST http://localhost:3002/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "🚀 Demo Task - Build Portfolio Website",
    "description": "Task này được tạo để demo notification system",
    "deadline": "2026-02-19T10:30:00.000Z",
    "priority": "high",
    "status": "todo"
  }'

# Response:
# {
#   "task": {
#     "_id": "65d3f2a1b2c3d4e5f6a7b8c9",
#     "title": "🚀 Demo Task - Build Portfolio Website",
#     "deadline": "2026-02-19T10:30:00.000Z"
#   }
# }

export TASK_ID="task-id-from-response"
```

> 💡 **Lưu ý:** Deadline phải trong vòng 1 giờ tới để cron job phát hiện!

---

### Step 4: Mở Socket.IO connection (cho realtime)

**Cách 1: Dùng Socket.IO Client Script**

Tạo file `test-socket.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Notification Demo</title>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .notification { 
      background: #f0f0f0; 
      padding: 15px; 
      margin: 10px 0; 
      border-radius: 5px;
      border-left: 4px solid #4CAF50;
    }
    .unread { border-left-color: #ff9800; }
    .log { 
      background: #333; 
      color: #0f0; 
      padding: 10px; 
      font-family: monospace;
      height: 300px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <h1>🔔 Notification Realtime Demo</h1>
  <div>
    <input type="text" id="token" placeholder="Paste JWT token here" style="width: 400px;">
    <button onclick="connect()">Connect</button>
    <button onclick="disconnect()">Disconnect</button>
  </div>
  
  <h2>Notifications</h2>
  <div id="notifications"></div>
  
  <h2>Socket Logs</h2>
  <div id="logs" class="log"></div>

  <script>
    let socket = null;
    const logs = document.getElementById('logs');
    const notifications = document.getElementById('notifications');

    function log(message) {
      logs.innerHTML += `[${new Date().toLocaleTimeString()}] ${message}<br>`;
      logs.scrollTop = logs.scrollHeight;
    }

    function addNotification(data) {
      const div = document.createElement('div');
      div.className = `notification ${data.isRead ? '' : 'unread'}`;
      div.innerHTML = `
        <strong>${data.title}</strong><br>
        <small>${data.type} | ${new Date(data.createdAt).toLocaleString()}</small><br>
        <p>${data.content}</p>
        <button onclick="markRead('${data.id}')">Mark as Read</button>
      `;
      notifications.prepend(div);
    }

    function connect() {
      const token = document.getElementById('token').value;
      
      socket = io('http://localhost:3002', {
        auth: { token }
      });

      socket.on('connect', () => {
        log('✅ Connected to server');
      });

      socket.on('notification:new', ({ notification }) => {
        log('🔔 Received notification:new');
        console.log('Notification:', notification);
        addNotification(notification);
      });

      socket.on('notification:read', ({ notificationId, isRead }) => {
        log(`📖 Notification ${notificationId} marked as read`);
      });

      socket.on('user:online', ({ userId }) => {
        log(`👤 User ${userId} online`);
      });

      socket.on('user:offline', ({ userId }) => {
        log(`👤 User ${userId} offline`);
      });

      socket.on('error', (err) => {
        log(`❌ Error: ${err.message}`);
      });

      socket.on('disconnect', () => {
        log('❌ Disconnected from server');
      });
    }

    function disconnect() {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    }

    function markRead(notificationId) {
      // Call API to mark as read
      const token = document.getElementById('token').value;
      fetch(`http://localhost:3002/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  </script>
</body>
</html>
```

**Cách 2: Dùng curl + log (không cần Socket.IO)**

```bash
# Chỉ cần polling API
watch -n 5 'curl -s http://localhost:3002/notifications -H "Authorization: Bearer '$TOKEN'" | jq'
```

---

### Step 5: Đợi Cron Job chạy (1 phút)

```bash
# Trong terminal backend, bạn sẽ thấy log:
# [ReminderCron] Sent deadline alert for task: 🚀 Demo Task - Build Portfolio Website to user: xxx
```

> ⏱️ **Cron job chạy mỗi phút** (`* * * * *`)

---

### Step 6: Kiểm tra kết quả

#### 6.1 API - Unread count tăng

```bash
curl -X GET "http://localhost:3002/notifications" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "notifications": [
#     {
#       "id": "65d3f2a1b2c3d4e5f6a7b8d0",
#       "type": "deadline_alert",
#       "title": "Task sắp đến hạn: 🚀 Demo Task - Build Portfolio Website",
#       "content": "Task \"🚀 Demo Task - Build Portfolio Website\" sẽ đến hạn vào...",
#       "isRead": false,
#       "channels": { "inApp": true, "email": true, "push": false },
#       "createdAt": "2026-02-19T09:30:00.000Z"
#     }
#   ],
#   "unreadCount": 1
# }

export NOTIFICATION_ID="notification-id-from-response"
```

#### 6.2 Socket.IO - Nhận realtime event

Trong browser console:
```
🔔 Received notification:new
Notification: { id: "...", type: "deadline_alert", ... }
```

#### 6.3 Email (nếu cấu hình SMTP)

Kiểm tra inbox email (hoặc spam folder) của `demo@example.com`:

```
From: Task Management <noreply@taskmanagement.com>
Subject: Task sắp đến hạn: 🚀 Demo Task - Build Portfolio Website

[Email HTML content...]
```

---

### Step 7: Click đọc - Gọi API PATCH

```bash
curl -X PATCH "http://localhost:3002/notifications/$NOTIFICATION_ID/read" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "notification": {
#     "id": "65d3f2a1b2c3d4e5f6a7b8d0",
#     "isRead": true,
#     "readAt": "2026-02-19T09:35:00.000Z"
#   }
# }
```

---

### Step 8: Kiểm tra realtime cập nhật

#### 8.1 Socket.IO Event

Trong browser console:
```
📖 Notification 65d3f2a1b2c3d4e5f6a7b8d0 marked as read
```

#### 8.2 API - Unread count giảm

```bash
curl -X GET "http://localhost:3002/notifications" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "notifications": [...],
#   "unreadCount": 0  // Giảm từ 1 xuống 0
# }
```

---

### Step 9: Mark all as read (tùy chọn)

```bash
# Tạo thêm vài notification để test

# Mark all as read
curl -X PATCH "http://localhost:3002/notifications/read-all" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "message": "All notifications marked as read"
# }
```

---

## 🎥 Demo Checklist cho Recruiter

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Login | Get JWT token | ☐ |
| 2 | Check unread count | Count = 0 | ☐ |
| 3 | Create task (deadline in 1h) | Task created | ☐ |
| 4 | Open Socket.IO connection | Connected | ☐ |
| 5 | Wait 1 minute | Cron job runs | ☐ |
| 6 | Receive `notification:new` | Realtime event | ☐ |
| 7 | API unread count | Count = 1 | ☐ |
| 8 | Call PATCH read | Response 200 | ☐ |
| 9 | Receive `notification:read` | Realtime update | ☐ |
| 10 | API unread count | Count = 0 | ☐ |
| 11 | (Optional) Receive email | Email in inbox | ☐ |

---

## 🔧 Troubleshooting

### 1. Cron job không chạy

```bash
# Kiểm tra log backend
tail -f logs/app.log | grep "ReminderCron"

# Kiểm tra task deadline có trong range 1h không
db.tasks.find({
  deadline: { $gte: new Date(), $lte: new Date(Date.now() + 60*60*1000) }
})
```

### 2. Không nhận được Socket.IO event

```bash
# Test Socket.IO connection
curl http://localhost:3002/socket.io/

# Kiểm tra CORS trong .env
CLIENT_URL=http://localhost:3000
```

### 3. Email không gửi được

```bash
# Kiểm tra SMTP credentials
echo $SMTP_USER $SMTP_PASS

# Test email service manually
curl -X POST http://localhost:3002/test-email \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"to": "test@example.com", "subject": "Test", "html": "<p>Test</p>"}'
```

### 4. Queue không xử lý

```bash
# Kiểm tra Redis có jobs không
redis-cli
LLEN bull:notification:wait
```

---

## 📸 Screenshots để chụp cho Recruiter

1. **Swagger UI** - `/docs` với Notification endpoints
2. **API Response** - GET /notifications với unread count
3. **Browser Console** - Socket.IO events realtime
4. **Email Inbox** - Notification email received
5. **Database** - MongoDB Compass với `notifications` collection

---

## 🚀 Quick Start (1-liner)

```bash
# Clone & setup
git clone <repo>
cd AI-powered-task-management
npm install

# Setup env
cp .env.example .env
# Edit .env với MongoDB, Redis, SMTP

# Start
docker-compose up -d mongo redis  # hoặc local install
npm run dev

# Demo
open http://localhost:3002/docs  # Swagger
open test-socket.html             # Socket.IO test
```

---

**Sẵn sàng demo! 🎉**
