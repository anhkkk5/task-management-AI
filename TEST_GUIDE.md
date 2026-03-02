# HƯỚNG DẪN TEST HỆ THỐNG AI TASK SCHEDULER

## Chuẩn bị

1. **Khởi động Backend** (Terminal 1):
   ```bash
   cd d:\KhoaNode\AI-powered-task-management
   npm run dev
   ```

2. **Khởi động Frontend** (Terminal 2):
   ```bash
   cd d:\Khoafronend\web-taskmanagerment-AI\web-task-AI
   npm run dev
   ```

3. **Mở trình duyệt**: http://localhost:5173

---

## TEST 1: Tạo Công Việc Mới với AI Breakdown

### Mục tiêu
Test chức năng tạo task mới và AI phân tích task thành các bước nhỏ

### Các bước thực hiện

1. **Vào trang Công việc**
   - Click menu "Công việc" trên navbar
   - Click nút "Thêm công việc" (màu xanh, có icon +)

2. **Điền form tạo task**
   - Tiêu đề: `Học tiếng Anh - 12 thì cơ bản`
   - Mô tả: `Cần học và thuộc 12 thì trong tiếng Anh để phục vụ thi IELTS`
   - Mức độ ưu tiên: **Cao**
   - Hạn chót: Chọn ngày 5 ngày sau
   - Tags: `english, ielts, study`
   - Click **Tạo công việc**

3. **Kiểm tra AI Breakdown tự động**
   - Sau khi tạo, đợi 2-3 giây
   - AI sẽ tự động phân tích task và gán `estimatedDuration`
   - Vào chi tiết task, kiểm tra có hiển thị:
     - "⏱️ Thời gian dự kiến: XXX phút"
     - "🤖 AI Breakdown" với danh sách các bước

4. **Verify Database** (MongoDB Atlas)
   ```javascript
   // Vào collection 'tasks', tìm task vừa tạo
   db.tasks.find({ title: /Học tiếng Anh/ }).pretty()
   // Kiểm tra các trường:
   // - estimatedDuration: có giá trị (VD: 360 phút)
   // - aiBreakdown: có mảng các bước
   ```

### Kết quả mong đợi
- Task được tạo thành công
- AI tự động phân tích và gán estimatedDuration ≈ 360 phút (6 giờ)
- aiBreakdown chứa danh sách 12 thì cần học

---

## TEST 2: AI Schedule Plan (Tối ưu lịch làm việc)

### Mục tiêu
Test chức năng AI lập lịch làm việc tối ưu

### Các bước thực hiện

1. **Tạo nhiều task để test**
   - Tạo ít nhất 3-4 task với các độ ưu tiên khác nhau
   - Ví dụ:
     - Task 1: Học tiếng Anh (High, deadline: 5 ngày)
     - Task 2: Viết báo cáo (Medium, deadline: 3 ngày)
     - Task 3: Code tính năng mới (High, deadline: 2 ngày)
     - Task 4: Họp team (Low, deadline: 1 ngày)

2. **Mở AI Task Scheduler**
   - Ở trang Công việc, click nút **"🤖 Tối ưu lịch với AI"**
   - Hoặc vào trang Dashboard, click **"Tạo lịch AI"**

3. **Chọn task để lập lịch**
   - Chọn 3-4 task vừa tạo (checkbox bên trái)
   - Chọn ngày bắt đầu: **Hôm nay**
   - Click **"Tạo lịch tối ưu"**

4. **Kiểm tra kết quả AI**
   - AI phải trả về lịch với:
     - Các task được sắp xếp theo ngày
     - Thời gian cụ thể (VD: "08:00 - 10:00")
     - Lý do giải thích cho mỗi task
     - `personalizationNote` giải thích tổng quan
     - `confidenceScore` (0-1)
   - **QUAN TRỌNG**: Kiểm tra không có task nào được xếp vào giờ đã qua (trước giờ hiện tại)

5. **Áp dụng lịch AI**
   - Click **"Áp dụng lịch này"**
   - Kiểm tra toast message: "Đã cập nhật lịch cho X công việc"

6. **Verify Database**
   ```javascript
   // Kiểm tra task đã được cập nhật scheduledTime
   db.tasks.find({ _id: ObjectId("task-id") }).pretty()
   // Kiểm tra trường:
   // - scheduledTime.start, scheduledTime.end
   // - scheduledTime.aiScheduled: true
   ```

### Kết quả mong đợi
- AI tạo lịch trong khung giờ 08:00-17:00
- Không có task nào được xếp vào giờ quá khứ
- Task ưu tiên cao được xếp buổi sáng
- Có buffer 15 phút giữa các task

---

## TEST 3: Hiển thị Lịch (Calendar)

### Mục tiêu
Test giao diện Calendar hiển thị đúng và không đè lên nhau

### Các bước thực hiện

1. **Vào trang Lịch**
   - Click menu "Lịch" trên navbar

2. **Kiểm tra hiển thị**
   - Các task được hiển thị đúng vị trí theo giờ
   - **Nếu có nhiều task cùng giờ**: Các task hiển thị song song (chia đôi chiều rộng), không đè lên nhau
   - Task có màu theo priority:
     - 🔴 Red: High/Urgent
     - 🟡 Yellow: Medium
     - 🟢 Green: Low
   - Task có `aiScheduled` hiển thị icon 🤖

3. **Test tooltip**
   - Hover chuột vào một task
   - Kiểm tra tooltip hiển thị:
     - Tên task
     - Thời gian (HH:mm - HH:mm)
     - Lý do (reason) nếu có

4. **Test điều hướng**
   - Click vào một task → Chuyển sang trang Công việc với task đó
   - Click nút "Tuần trước"/"Tuần sau" → Lịch chuyển tuần
   - Click "Hôm nay" → Về tuần hiện tại

### Kết quả mong đợi
- Task không đè lên nhau khi cùng giờ
- Màu sắc đúng theo priority
- Tooltip hiển thị đầy đủ thông tin

---

## TEST 4: Smart Reschedule (Tái lập lịch thông minh)

### Mục tiêu
Test chức năng tái lập lịch khi task bị bỏ lỡ

### Các bước thực hiện

1. **Tạo task đã quá giờ**
   - Tạo một task với scheduledTime đã qua (VD: hôm nay lúc 08:00 nhưng hiện tại là 10:00)
   ```javascript
   // Hoặc update trực tiếp trong MongoDB:
   db.tasks.updateOne(
     { _id: ObjectId("task-id") },
     { 
       $set: { 
         "scheduledTime.start": new Date("2026-03-01T08:00:00"),
         "scheduledTime.end": new Date("2026-03-01T09:00:00"),
         status: "todo"
       }
     }
   )
   ```

2. **Gọi Smart Reschedule**
   - Hiện tại API đã có, cần tích hợp vào UI
   - Hoặc test bằng Postman/cURL:
   ```bash
   curl -X POST http://localhost:3000/api/v1/ai/smart-reschedule \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "missedTask": {
         "id": "task-id",
         "title": "Task bị bỏ lỡ",
         "priority": "high",
         "estimatedDuration": 60
       },
       "reason": "missed"
     }'
   ```

3. **Kiểm tra response**
   - API trả về:
     ```json
     {
       "suggestion": {
         "newStartTime": "14:00",
         "newEndTime": "15:00",
         "newDate": "2026-03-01",
         "reason": "Đề xuất buổi chiều vì bạn làm việc hiệu quả vào giờ này",
         "confidence": "high"
       },
       "alternativeSlots": [...],
       "advice": "Hãy đặt reminder để không bỏ lỡ task lần sau"
     }
     ```

### Kết quả mong đợi
- AI đề xuất thời gian mới phù hợp
- Có lý do giải thích
- Confidence score cao (high/medium)

---

## TEST 5: Conflict Detection (Phát hiện xung đột)

### Mục tiêu
Test phát hiện khi có 2 task trùng thời gian

### Các bước thực hiện

1. **Tạo 2 task trùng giờ**
   - Task A: scheduled 14:00 - 16:00
   - Task B: scheduled 15:00 - 17:00 (trùng 1 giờ với Task A)

2. **Kiểm tra API Conflict Detection**
   ```bash
   curl -X POST http://localhost:3000/api/v1/tasks/check-conflicts \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "taskIds": ["task-a-id", "task-b-id"]
     }'
   ```

3. **Kiểm tra response**
   ```json
   {
     "hasConflicts": true,
     "conflicts": [
       {
         "task1": { "id": "task-a-id", "title": "Task A", ... },
         "task2": { "id": "task-b-id", "title": "Task B", ... },
         "overlapStart": "15:00",
         "overlapEnd": "16:00",
         "overlapMinutes": 60
       }
     ],
     "affectedTaskIds": ["task-a-id", "task-b-id"]
   }
   ```

### Kết quả mong đợi
- Hệ thống phát hiện được xung đột
- Trả về chi tiết thời gian trùng nhau
- Gợi ý cách giải quyết

---

## TEST 6: Schedule Template Management

### Mục tiêu
Test quản lý mẫu lịch làm việc

### Các bước thực hiện

1. **Tạo Template từ lịch AI**
   - Sau khi tạo lịch AI (Test 2)
   - Click nút **"Lưu thành template"**
   - Nhập tên: `Template Làm việc buổi sáng`
   - Nhập tags: `morning, productive`
   - Click **Lưu**

2. **Kiểm tra danh sách Template**
   - Vào trang Công việc → Tab "Templates"
   - Hoặc mở modal Schedule Template Manager
   - Kiểm tra template vừa tạo hiển thị trong danh sách

3. **Áp dụng Template**
   - Chọn template từ danh sách
   - Click **"Áp dụng"**
   - Kiểm tra thông báo thành công

4. **Verify Database**
   ```javascript
   db.schedule_templates.find().pretty()
   // Kiểm tra có document với:
   // - name: "Template Làm việc buổi sáng"
   // - pattern: chứa các timeBlocks
   // - isDefault: false
   ```

5. **Test Set Default**
   - Click **"Đặt mặc định"** trên một template
   - Kiểm tra `isDefault: true` trong database
   - Các template khác tự động `isDefault: false`

### Kết quả mong đợi
- Template được lưu vào database
- Có thể áp dụng template cho lịch mới
- Chỉ có 1 template được đặt làm default

---

## TEST 7: Notifications (Thông báo)

### Mục tiêu
Test hệ thống thông báo tự động

### Các bước thực hiện

1. **Test Scheduled Task Alert**
   - Tạo task với scheduledTime sắp tới (VD: 2 phút nữa)
   - Đợi đến giờ (hoặc kiểm tra cron job đang chạy)
   - Kiểm tra notification được tạo
   - Kiểm tra UI có badge thông báo mới

2. **Test Missed Task Notification**
   - Tạo task với scheduledTime đã qua và status != completed
   - Cron job sẽ tự động phát hiện và gửi thông báo
   - Kiểm tra notification type: `MISSED_TASK`

3. **Verify Database**
   ```javascript
   db.notifications.find({ type: "SCHEDULED_TASK_ALERT" }).pretty()
   db.notifications.find({ type: "MISSED_TASK" }).pretty()
   ```

### Kết quả mong đợi
- Thông báo được tạo đúng giờ
- UI hiển thị badge số lượng thông báo chưa đọc
- Click vào thông báo chuyển đến task liên quan

---

## TỔNG KẾT

### Các tính năng đã test:
- [ ] Tạo task với AI breakdown
- [ ] AI Schedule Plan
- [ ] Calendar UI (không đè task)
- [ ] Smart Reschedule
- [ ] Conflict Detection
- [ ] Schedule Template Management
- [ ] Notifications

### Nếu phát hiện lỗi:
1. Chụp screenshot lỗi
2. Ghi rõ bước tái hiện
3. Kiểm tra console browser (F12 → Console)
4. Kiểm tra log backend (Terminal)

### Liên hệ hỗ trợ:
- Tạo issue trên GitHub với label `bug`
- Hoặc gửi thông tin lỗi qua chat
