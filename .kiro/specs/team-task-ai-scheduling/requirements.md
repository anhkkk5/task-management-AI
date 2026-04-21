# Requirements Document

## Introduction

Hệ thống AI scheduling hiện tại hoạt động tốt với personal tasks nhưng không thể xử lý team tasks do thiếu các trường bắt buộc (`estimatedDuration`, `dailyTargetDuration`, `dailyTargetMin`). Team tasks chỉ có `teamAssignment.startAt` và `deadline`, dẫn đến việc thuật toán không tạo được lịch trình.

Feature này thiết kế giải pháp tự động ước tính các giá trị thiếu cho team tasks, cho phép AI scheduling hoạt động hiệu quả mà không yêu cầu user nhập thủ công quá nhiều thông tin.

## Glossary

- **Team_Task**: Task được assign từ team, có `teamAssignment` field với `startAt` và `deadline`
- **Personal_Task**: Task do user tự tạo, có đầy đủ `estimatedDuration`, `dailyTargetDuration`, `dailyTargetMin`
- **AI_Scheduler**: Service `hybridScheduleService.schedulePlan()` tạo lịch trình kết hợp AI và algorithms
- **Estimation_Engine**: Component tự động ước tính `estimatedDuration` và `dailyTargetDuration` cho team tasks
- **Heuristic_Estimator**: Algorithm ước tính dựa trên heuristics (deadline, priority, title analysis)
- **AI_Estimator**: AI model ước tính dựa trên natural language processing của title và description
- **Hybrid_Estimator**: Kết hợp cả heuristic và AI để tạo ước tính chính xác hơn

## Requirements

### Requirement 1: Automatic Duration Estimation for Team Tasks

**User Story:** Là một user, tôi muốn team tasks tự động được ước tính thời gian hoàn thành, để AI scheduler có thể tạo lịch trình mà không cần tôi nhập thủ công.

#### Acceptance Criteria

1. WHEN a team task lacks `estimatedDuration`, THE Estimation_Engine SHALL calculate it based on deadline range and task complexity
2. WHEN a team task has a deadline within 3 days, THE Estimation_Engine SHALL estimate `estimatedDuration` between 60-180 minutes
3. WHEN a team task has a deadline within 7 days, THE Estimation_Engine SHALL estimate `estimatedDuration` between 180-480 minutes
4. WHEN a team task has a deadline beyond 7 days, THE Estimation_Engine SHALL estimate `estimatedDuration` between 480-1440 minutes
5. WHEN a team task has priority "urgent" or "high", THE Estimation_Engine SHALL increase `estimatedDuration` by 20%
6. WHEN a team task title contains keywords indicating complexity (e.g., "design", "implement", "refactor", "research"), THE Estimation_Engine SHALL increase `estimatedDuration` by 30%

### Requirement 2: Automatic Daily Target Calculation

**User Story:** Là một user, tôi muốn team tasks tự động có mục tiêu phút/ngày hợp lý, để lịch trình được phân bổ đều và không quá tải.

#### Acceptance Criteria

1. WHEN a team task lacks `dailyTargetDuration`, THE Estimation_Engine SHALL calculate it as `estimatedDuration / daysUntilDeadline`
2. THE Estimation_Engine SHALL ensure `dailyTargetDuration` is at least 30 minutes
3. THE Estimation_Engine SHALL ensure `dailyTargetDuration` does not exceed 240 minutes (4 hours)
4. WHEN `dailyTargetMin` is not set, THE Estimation_Engine SHALL set it to 50% of `dailyTargetDuration`
5. THE Estimation_Engine SHALL ensure `dailyTargetMin` is at least 15 minutes

### Requirement 3: AI-Powered Estimation Enhancement

**User Story:** Là một user, tôi muốn AI phân tích nội dung task để ước tính thời gian chính xác hơn, để lịch trình phản ánh đúng độ phức tạp công việc.

#### Acceptance Criteria

1. WHEN a team task has a description, THE AI_Estimator SHALL analyze the description to determine task complexity
2. THE AI_Estimator SHALL classify tasks into "easy", "medium", or "hard" difficulty levels
3. WHEN difficulty is "easy", THE AI_Estimator SHALL apply a 0.7x multiplier to heuristic estimation
4. WHEN difficulty is "medium", THE AI_Estimator SHALL apply a 1.0x multiplier to heuristic estimation
5. WHEN difficulty is "hard", THE AI_Estimator SHALL apply a 1.5x multiplier to heuristic estimation
6. THE AI_Estimator SHALL cache estimation results for 24 hours to reduce API calls

### Requirement 4: Hybrid Estimation Strategy

**User Story:** Là một user, tôi muốn hệ thống kết hợp cả heuristics và AI để ước tính, để có độ chính xác cao nhất và fallback khi AI không khả dụng.

#### Acceptance Criteria

1. THE Hybrid_Estimator SHALL first attempt AI-based estimation
2. IF AI estimation fails or times out after 5 seconds, THEN THE Hybrid_Estimator SHALL fallback to heuristic estimation
3. THE Hybrid_Estimator SHALL combine heuristic and AI estimates using weighted average (60% AI, 40% heuristic)
4. THE Hybrid_Estimator SHALL log estimation method used (AI, heuristic, or hybrid) for debugging
5. THE Hybrid_Estimator SHALL round final estimates to nearest 5 minutes

### Requirement 5: Team Task Preprocessing for Scheduler

**User Story:** Là một developer, tôi muốn team tasks được tự động bổ sung các trường thiếu trước khi gọi AI scheduler, để không cần thay đổi logic scheduler hiện tại.

#### Acceptance Criteria

1. WHEN `schedulePlan()` receives a team task without `estimatedDuration`, THE AI_Scheduler SHALL invoke Estimation_Engine before processing
2. THE AI_Scheduler SHALL preserve original task data and only add estimated fields
3. THE AI_Scheduler SHALL mark estimated fields with metadata flag `isEstimated: true`
4. THE AI_Scheduler SHALL include estimation confidence score (0-1) in response
5. THE AI_Scheduler SHALL log warning if estimation confidence is below 0.6

### Requirement 6: User Override and Manual Adjustment

**User Story:** Là một user, tôi muốn có thể override các giá trị ước tính tự động, để điều chỉnh khi AI ước tính không chính xác.

#### Acceptance Criteria

1. WHEN a user manually sets `estimatedDuration` for a team task, THE System SHALL use user value instead of estimation
2. WHEN a user manually sets `dailyTargetDuration` for a team task, THE System SHALL use user value instead of calculation
3. THE System SHALL provide UI indicator showing which fields are estimated vs. user-provided
4. THE System SHALL allow user to "reset to estimated" after manual override
5. THE System SHALL track estimation accuracy by comparing estimated vs. actual completion time

### Requirement 7: Estimation Validation and Feasibility Check

**User Story:** Là một user, tôi muốn được cảnh báo khi ước tính không khả thi với deadline, để điều chỉnh kế hoạch sớm.

#### Acceptance Criteria

1. WHEN `estimatedDuration` exceeds available time until deadline, THE System SHALL generate a feasibility warning
2. THE System SHALL calculate `maxPossibleHours = daysUntilDeadline × (dailyTargetDuration / 60)`
3. IF `estimatedDuration / 60 > maxPossibleHours`, THEN THE System SHALL mark task as "not feasible"
4. THE System SHALL include feasibility warnings in scheduler response
5. THE System SHALL suggest increasing `dailyTargetDuration` or extending deadline in warning message

### Requirement 8: Historical Data Learning

**User Story:** Là một user, tôi muốn hệ thống học từ lịch sử hoàn thành task của tôi, để ước tính ngày càng chính xác hơn theo thời gian.

#### Acceptance Criteria

1. WHEN a team task is completed, THE System SHALL record actual duration vs. estimated duration
2. THE System SHALL calculate estimation error percentage for each completed task
3. WHEN estimation error exceeds 30% for 3 consecutive tasks, THE System SHALL adjust estimation algorithm parameters
4. THE System SHALL maintain per-user estimation accuracy metrics
5. THE System SHALL use historical data to personalize future estimations

### Requirement 9: Edge Case Handling

**User Story:** Là một developer, tôi muốn hệ thống xử lý các edge cases một cách graceful, để không bị crash hoặc tạo lịch trình không hợp lý.

#### Acceptance Criteria

1. WHEN a team task has no deadline, THE Estimation_Engine SHALL use default 7-day window
2. WHEN a team task deadline is in the past, THE System SHALL skip estimation and mark as "overdue"
3. WHEN `teamAssignment.startAt` is after deadline, THE System SHALL log error and use deadline as startAt
4. WHEN estimation results in duration < 5 minutes, THE System SHALL set minimum 15 minutes
5. WHEN estimation results in duration > 8 hours, THE System SHALL cap at 480 minutes and log warning

### Requirement 10: API Response Enhancement

**User Story:** Là một frontend developer, tôi muốn API response bao gồm thông tin về estimation, để hiển thị cho user biết giá trị nào là ước tính.

#### Acceptance Criteria

1. THE API response SHALL include `estimationMetadata` object for each scheduled task
2. THE `estimationMetadata` SHALL contain `method` field ("ai", "heuristic", "hybrid", or "user")
3. THE `estimationMetadata` SHALL contain `confidence` field (0-1 score)
4. THE `estimationMetadata` SHALL contain `estimatedDuration` and `estimatedDailyTarget` fields
5. THE API response SHALL include overall estimation quality score for the entire schedule

## Implementation Notes

### Estimation Algorithm Priority

1. **User-provided values**: Always use if available (highest priority)
2. **AI estimation**: Use if task has description and AI is available
3. **Heuristic estimation**: Fallback based on deadline, priority, title keywords
4. **Default values**: Last resort (estimatedDuration: 120min, dailyTargetDuration: 60min)

### Heuristic Formula

```
baseEstimate = calculateFromDeadline(daysUntilDeadline)
priorityMultiplier = getPriorityMultiplier(priority)
complexityMultiplier = getComplexityMultiplier(title)
estimatedDuration = baseEstimate × priorityMultiplier × complexityMultiplier
```

### AI Prompt Template

```
Analyze this task and estimate completion time:
Title: {title}
Description: {description}
Deadline: {deadline}
Priority: {priority}

Return JSON:
{
  "estimatedDuration": number (minutes),
  "difficulty": "easy" | "medium" | "hard",
  "confidence": number (0-1),
  "reasoning": string
}
```

### Caching Strategy

- Cache key: `hash(userId, taskTitle, deadline, description)`
- TTL: 24 hours
- Invalidate on: task update, user manual override
- Storage: Redis or in-memory cache

## Success Metrics

1. **Estimation Accuracy**: Average error < 25% compared to actual completion time
2. **API Performance**: Estimation adds < 200ms to scheduler response time
3. **User Satisfaction**: < 10% of users manually override estimations
4. **Feasibility Detection**: 95% of infeasible tasks detected before scheduling
5. **AI Availability**: Fallback to heuristics in < 5 seconds when AI fails
