# Requirements Document

## Introduction

Tính năng **Custom Available Time Slots** (Lịch rảnh cá nhân) cho phép người dùng tự định nghĩa các khung giờ rảnh của mình theo từng ngày trong tuần. Hiện tại, hệ thống AI scheduler sử dụng `workHours` cố định (8h-23h với các giờ nghỉ cố định) cho tất cả người dùng, không phản ánh thực tế rằng mỗi người có lịch rảnh khác nhau. Tính năng này sẽ cho phép AI scheduler chỉ xếp task vào những khung giờ mà người dùng thực sự rảnh, tăng tính khả thi và độ hài lòng của lịch trình.

## Glossary

- **User**: Người dùng hệ thống task management
- **Available_Time_Slot**: Khung giờ rảnh mà user có thể làm việc (ví dụ: 20:00-23:00)
- **Weekly_Pattern**: Mẫu lịch rảnh lặp lại hàng tuần (Thứ 2-CN)
- **Custom_Date_Override**: Lịch rảnh đặc biệt cho một ngày cụ thể, ghi đè lên weekly pattern
- **AI_Scheduler**: Module tự động xếp lịch task dựa trên thuật toán và AI
- **Work_Hours**: Khung giờ làm việc hiện tại (8h-23h) - sẽ được thay thế bởi Available_Time_Slot
- **Conflict**: Tình trạng task bị xếp vào giờ không rảnh hoặc trùng với task khác
- **Time_Template**: Mẫu lịch rảnh định sẵn (ví dụ: "Nhân viên văn phòng", "Sinh viên")
- **Timezone**: Múi giờ của user (ví dụ: "Asia/Ho_Chi_Minh")
- **Busy_Slot**: Khung giờ đã có task hoặc user không rảnh
- **Scheduler_Service**: Service xử lý logic scheduling (hybrid-schedule.service.ts)

## Requirements

### Requirement 1: Định nghĩa lịch rảnh theo tuần

**User Story:** Là một user, tôi muốn định nghĩa lịch rảnh của mình theo từng ngày trong tuần (Thứ 2-CN), để AI scheduler biết tôi rảnh vào giờ nào mỗi ngày.

#### Acceptance Criteria

1. THE User SHALL định nghĩa nhiều Available_Time_Slot cho mỗi ngày trong tuần
2. WHEN User thêm Available_Time_Slot, THE System SHALL validate rằng start time < end time
3. WHEN User thêm Available_Time_Slot, THE System SHALL validate rằng slot mới không overlap với slot khác trong cùng ngày
4. THE System SHALL lưu trữ Weekly_Pattern với format: `{ monday: [{start: "08:00", end: "10:00"}, ...], tuesday: [...], ... }`
5. THE System SHALL cho phép User xóa hoặc chỉnh sửa Available_Time_Slot đã tạo
6. THE System SHALL lưu timezone của User cùng với Weekly_Pattern

### Requirement 2: Override lịch rảnh cho ngày cụ thể

**User Story:** Là một user, tôi muốn set lịch rảnh đặc biệt cho một ngày cụ thể (ví dụ: 2026-04-25), để xử lý các trường hợp ngoại lệ như ngày nghỉ, họp quan trọng.

#### Acceptance Criteria

1. THE User SHALL tạo Custom_Date_Override cho một ngày cụ thể với format YYYY-MM-DD
2. WHEN Custom_Date_Override tồn tại cho một ngày, THE System SHALL sử dụng override thay vì Weekly_Pattern
3. THE User SHALL xóa Custom_Date_Override để quay lại sử dụng Weekly_Pattern
4. THE System SHALL hiển thị visual indicator khi một ngày có Custom_Date_Override
5. WHEN User tạo Custom_Date_Override, THE System SHALL validate Available_Time_Slot giống như Weekly_Pattern

### Requirement 3: Time templates cho quick setup

**User Story:** Là một user mới, tôi muốn chọn một Time_Template định sẵn (ví dụ: "Nhân viên văn phòng"), để nhanh chóng setup lịch rảnh mà không phải nhập thủ công.

#### Acceptance Criteria

1. THE System SHALL cung cấp ít nhất 3 Time_Template: "Nhân viên văn phòng", "Sinh viên", "Freelancer"
2. WHEN User chọn Time_Template, THE System SHALL tự động điền Weekly_Pattern tương ứng
3. THE User SHALL chỉnh sửa Weekly_Pattern sau khi apply Time_Template
4. THE System SHALL hiển thị preview của Time_Template trước khi apply
5. WHERE User đã có Weekly_Pattern, WHEN User apply Time_Template, THE System SHALL cảnh báo rằng dữ liệu hiện tại sẽ bị ghi đè

### Requirement 4: AI Scheduler tôn trọng lịch rảnh

**User Story:** Là một user, tôi muốn AI scheduler chỉ xếp task vào khung giờ tôi rảnh, để lịch trình phù hợp với thời gian thực tế của tôi.

#### Acceptance Criteria

1. WHEN AI_Scheduler tìm slot cho task, THE Scheduler_Service SHALL chỉ xem xét Available_Time_Slot của User
2. THE Scheduler_Service SHALL KHÔNG xếp task vào giờ nằm ngoài Available_Time_Slot
3. WHEN không tìm được slot trong Available_Time_Slot, THE System SHALL cảnh báo User và suggest mở rộng lịch rảnh
4. THE Scheduler_Service SHALL ưu tiên xếp task vào Available_Time_Slot dài hơn trước (để chứa task lớn)
5. WHEN User không có Weekly_Pattern, THE System SHALL fallback về Work_Hours mặc định (8h-23h)
6. THE Scheduler_Service SHALL tính toán Busy_Slot bằng cách kết hợp scheduled tasks và giờ không rảnh

### Requirement 5: Conflict detection với lịch rảnh

**User Story:** Là một user, tôi muốn hệ thống cảnh báo khi tôi cố schedule task vào giờ không rảnh, để tránh tạo lịch trình không khả thi.

#### Acceptance Criteria

1. WHEN User thủ công schedule task vào giờ nằm ngoài Available_Time_Slot, THE System SHALL hiển thị warning
2. THE System SHALL cho phép User force schedule task vào giờ không rảnh (với confirmation)
3. WHEN task được schedule vào giờ không rảnh, THE System SHALL đánh dấu task đó với visual indicator
4. THE System SHALL suggest alternative slots trong Available_Time_Slot khi detect conflict
5. WHEN User thay đổi Weekly_Pattern, THE System SHALL kiểm tra existing scheduled tasks và cảnh báo nếu có task nằm ngoài lịch rảnh mới

### Requirement 6: Feasibility validation trước khi schedule

**User Story:** Là một user, tôi muốn biết liệu tôi có đủ thời gian rảnh để hoàn thành task trước deadline, để điều chỉnh lịch rảnh hoặc deadline kịp thời.

#### Acceptance Criteria

1. WHEN User request schedule plan, THE System SHALL tính tổng Available_Time_Slot từ ngày bắt đầu đến deadline
2. THE System SHALL so sánh tổng thời gian rảnh với tổng estimatedDuration của các task
3. IF tổng thời gian rảnh < tổng estimatedDuration, THEN THE System SHALL hiển thị warning với shortfall hours
4. THE System SHALL suggest 3 giải pháp: (1) mở rộng lịch rảnh, (2) gia hạn deadline, (3) giảm scope task
5. THE System SHALL tính toán feasibility cho từng task riêng lẻ và cảnh báo task nào không khả thi

### Requirement 7: Calendar view UI cho lịch rảnh

**User Story:** Là một user, tôi muốn xem lịch rảnh của mình dạng calendar view, để dễ dàng visualize và chỉnh sửa.

#### Acceptance Criteria

1. THE System SHALL hiển thị Weekly_Pattern dạng calendar grid (7 cột cho 7 ngày)
2. THE System SHALL dùng màu xanh cho Available_Time_Slot và màu xám cho giờ không rảnh
3. THE User SHALL click vào calendar cell để thêm Available_Time_Slot mới
4. THE User SHALL drag & drop để thay đổi start/end time của Available_Time_Slot
5. THE System SHALL hiển thị scheduled tasks overlay trên calendar để user thấy task nào đã được xếp vào giờ rảnh
6. THE System SHALL hiển thị Custom_Date_Override với màu khác biệt (ví dụ: màu vàng)

### Requirement 8: Copy và apply lịch rảnh giữa các ngày

**User Story:** Là một user, tôi muốn copy lịch rảnh từ ngày này sang ngày khác, để tiết kiệm thời gian khi nhiều ngày có lịch giống nhau.

#### Acceptance Criteria

1. THE User SHALL chọn một ngày source và copy Available_Time_Slot của ngày đó
2. THE User SHALL chọn một hoặc nhiều ngày target để paste Available_Time_Slot
3. WHEN User paste, THE System SHALL ghi đè Available_Time_Slot của ngày target
4. THE System SHALL hiển thị confirmation trước khi ghi đè dữ liệu
5. THE User SHALL apply một ngày làm template cho tất cả các ngày trong tuần

### Requirement 9: Reschedule khi lịch rảnh thay đổi

**User Story:** Là một user, tôi muốn hệ thống suggest reschedule các task đã schedule khi tôi thay đổi lịch rảnh, để lịch trình luôn phù hợp với thời gian rảnh hiện tại.

#### Acceptance Criteria

1. WHEN User thay đổi Weekly_Pattern hoặc Custom_Date_Override, THE System SHALL tìm các scheduled task bị ảnh hưởng
2. THE System SHALL định nghĩa task bị ảnh hưởng là task có scheduledTime nằm ngoài Available_Time_Slot mới
3. THE System SHALL hiển thị danh sách task bị ảnh hưởng với suggested new slots
4. THE User SHALL chọn auto-reschedule tất cả hoặc manually reschedule từng task
5. WHEN User chọn auto-reschedule, THE Scheduler_Service SHALL tìm optimal slot mới trong Available_Time_Slot

### Requirement 10: API endpoints cho availability management

**User Story:** Là một developer, tôi muốn có API endpoints để quản lý user availability, để frontend có thể CRUD lịch rảnh.

#### Acceptance Criteria

1. THE System SHALL cung cấp endpoint `POST /api/users/:userId/availability` để tạo/update Weekly_Pattern
2. THE System SHALL cung cấp endpoint `GET /api/users/:userId/availability` để lấy Weekly_Pattern và Custom_Date_Override
3. THE System SHALL cung cấp endpoint `POST /api/users/:userId/availability/custom-dates` để tạo Custom_Date_Override
4. THE System SHALL cung cấp endpoint `DELETE /api/users/:userId/availability/custom-dates/:date` để xóa Custom_Date_Override
5. THE System SHALL cung cấp endpoint `GET /api/users/:userId/availability/templates` để lấy danh sách Time_Template
6. THE System SHALL validate request body theo schema và trả về 400 Bad Request nếu invalid
7. THE System SHALL trả về 404 Not Found nếu userId không tồn tại

### Requirement 11: Data model cho user availability

**User Story:** Là một developer, tôi muốn có data model rõ ràng cho user availability, để dễ dàng query và update trong database.

#### Acceptance Criteria

1. THE System SHALL tạo collection `UserAvailability` với schema chứa userId, weeklyPattern, customDates, timezone
2. THE System SHALL index userId trong UserAvailability collection để tăng tốc query
3. THE System SHALL validate weeklyPattern có đúng 7 keys (monday-sunday)
4. THE System SHALL validate mỗi Available_Time_Slot có start và end theo format HH:mm (24-hour)
5. THE System SHALL validate timezone là valid IANA timezone string
6. THE System SHALL set default timezone là "Asia/Ho_Chi_Minh" nếu User không chỉ định

### Requirement 12: Integration với existing scheduler

**User Story:** Là một developer, tôi muốn integrate availability logic vào Scheduler_Service hiện tại, để không phá vỡ existing functionality.

#### Acceptance Criteria

1. THE Scheduler_Service SHALL thay thế hardcoded Work_Hours bằng function `getUserAvailableSlots(userId, date)`
2. THE function `getUserAvailableSlots` SHALL trả về Available_Time_Slot cho một ngày cụ thể (check Custom_Date_Override trước, fallback về Weekly_Pattern)
3. THE function `findOptimalSlotWithFallback` SHALL nhận Available_Time_Slot thay vì Work_Hours
4. THE Scheduler_Service SHALL giữ nguyên logic về breaks, bufferMinutes, và productivity scoring
5. WHEN User không có availability data, THE System SHALL sử dụng Work_Hours mặc định (8h-23h) để backward compatible

### Requirement 13: Performance optimization cho availability queries

**User Story:** Là một developer, tôi muốn availability queries chạy nhanh, để không làm chậm scheduling process.

#### Acceptance Criteria

1. THE System SHALL cache Weekly_Pattern của User trong Redis với TTL 1 giờ
2. WHEN User update Weekly_Pattern, THE System SHALL invalidate cache tương ứng
3. THE System SHALL batch query availability cho nhiều ngày trong một database call
4. THE System SHALL sử dụng projection để chỉ lấy fields cần thiết từ UserAvailability
5. THE System SHALL complete availability query trong vòng 100ms cho 90% requests

### Requirement 14: Analytics cho availability utilization

**User Story:** Là một user, tôi muốn xem thống kê về việc sử dụng lịch rảnh của mình, để biết tôi đang tận dụng thời gian rảnh hiệu quả như thế nào.

#### Acceptance Criteria

1. THE System SHALL tính tổng Available_Time_Slot per week của User
2. THE System SHALL tính tổng scheduled time per week của User
3. THE System SHALL tính utilization rate = scheduled time / available time
4. THE System SHALL hiển thị utilization rate dạng percentage và progress bar
5. THE System SHALL cảnh báo nếu utilization rate < 30% (under-utilized) hoặc > 90% (over-scheduled)
6. THE System SHALL hiển thị breakdown utilization theo từng ngày trong tuần

### Requirement 15: Mobile-responsive availability editor

**User Story:** Là một mobile user, tôi muốn chỉnh sửa lịch rảnh trên điện thoại, để có thể update lịch khi đang di chuyển.

#### Acceptance Criteria

1. THE System SHALL hiển thị calendar view responsive trên màn hình mobile (< 768px width)
2. THE System SHALL chuyển từ drag & drop sang tap-to-edit mode trên mobile
3. THE System SHALL hiển thị time picker native của mobile OS khi User chọn start/end time
4. THE System SHALL cho phép User swipe left/right để chuyển giữa các ngày trong tuần
5. THE System SHALL hiển thị Available_Time_Slot dạng list view thay vì calendar grid trên mobile nếu cần thiết
