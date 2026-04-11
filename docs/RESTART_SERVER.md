# Hướng dẫn Restart Server

## Vấn đề:

Code đã được sửa nhưng server vẫn chạy code cũ → cần restart

## Các thay đổi đã thực hiện:

1. ✅ Chuyển từ `aiScheduleService` sang `hybridScheduleService`
2. ✅ Thêm breaks (11:30-14:00, 17:30-19:30)
3. ✅ Thêm buffer 15 phút giữa các task
4. ✅ Cập nhật workHours (8-23h)
5. ✅ Build thành công (`npm run build`)

## Cách restart:

### Option 1: Nếu đang dùng nodemon (dev mode)

```bash
# Server sẽ tự restart khi detect file changes
# Nếu không tự restart, Ctrl+C và chạy lại:
npm run dev
```

### Option 2: Nếu đang chạy production

```bash
# Stop server hiện tại (Ctrl+C hoặc kill process)
# Sau đó start lại:
npm start
```

### Option 3: Nếu dùng PM2

```bash
pm2 restart all
# hoặc
pm2 restart <app-name>
```

## Kiểm tra sau khi restart:

1. **Check console log:**
   - Xem có lỗi gì không
   - Xem port đang chạy (mặc định 3002)

2. **Test API:**

   ```bash
   # Test schedule plan
   POST http://localhost:3002/ai/schedule-plan
   {
     "taskIds": ["task1", "task2"],
     "startDate": "2026-03-07"
   }
   ```

3. **Kiểm tra kết quả:**
   - ✅ Có 15 phút buffer giữa các task
   - ✅ Không có task trong 11:30-14:00
   - ✅ Không có task trong 17:30-19:30
   - ✅ Task phân bổ đều sáng/chiều/tối

## Debug nếu vẫn lỗi:

### 1. Kiểm tra file đã build chưa:

```bash
ls -la dist/modules/ai/ai.service.js
# Xem modified time có mới không
```

### 2. Kiểm tra code trong dist:

```bash
cat dist/modules/ai/ai.service.js | grep "hybridScheduleService"
# Phải thấy hybridScheduleService, không phải aiScheduleService
```

### 3. Clear cache và rebuild:

```bash
npm run build
# hoặc
rm -rf dist && npm run build
```

### 4. Kiểm tra process đang chạy:

```bash
# Windows
netstat -ano | findstr :3002

# Linux/Mac
lsof -i :3002
```

## Lưu ý:

- Nếu dùng TypeScript, phải build trước khi start
- Nếu có cache, có thể cần clear cache
- Nếu dùng Docker, cần rebuild image

## Expected Output:

Sau khi restart, lịch trình sẽ như này:

```
Thứ Bảy 07/03/2026:
- 08:00-09:00: học tiếng anh (60 phút) ✓
- 09:15-10:45: học code (90 phút) ✓ [Buffer 15 phút]
- 11:00-11:30: học tiếng anh (30 phút) ✓

[Nghỉ trưa 11:30-14:00] ← KHÔNG có task

- 14:00-15:30: học code (90 phút) ✓
- 15:45-17:00: học tiếng anh (75 phút) ✓

[Nghỉ tối 17:30-19:30] ← KHÔNG có task

- 19:30-21:00: học code (90 phút) ✓
- 21:15-22:15: học tiếng anh (60 phút) ✓
```

## Nếu vẫn không work:

Kiểm tra xem frontend có đang gọi đúng API không:

- API endpoint: `POST /ai/schedule-plan`
- Không phải: `POST /ai-schedules/...`

Hoặc có thể frontend đang cache response cũ → clear browser cache hoặc hard refresh (Ctrl+Shift+R)
