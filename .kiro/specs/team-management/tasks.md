# Tasks: Team Management (Jira-style)

## Phase 1: Backend - Data Models & Core Infrastructure

- [x] 1.1 Tạo Team model (`src/modules/team/team.model.ts`)
  - Schema: name, description, ownerId, members[], settings, isArchived, timestamps
  - TeamMember embedded: userId, email, name, avatar, role (owner/admin/member/viewer), joinedAt
  - Index: ownerId, members.userId
  - Export: `Team`, `TeamDoc`, `TeamAttrs`, `TeamMember`, `TeamRole`

- [x] 1.2 Tạo TeamInvite model (`src/modules/team/team-invite.model.ts`)
  - Schema: teamId, inviterId, email, role, token (unique), expiresAt, status (pending/accepted/declined/expired)
  - Index: token (unique), teamId + email + status
  - TTL index trên expiresAt để auto-expire

- [x] 1.3 Extend Task model với `teamAssignment` field (`src/modules/task/task.model.ts`)
  - Thêm optional field `teamAssignment`: { teamId, assigneeId, assigneeEmail, assigneeName, assignedBy, assignedAt }
  - Thêm index: `teamAssignment.teamId + teamAssignment.assigneeId`
  - Cập nhật `TaskAttrs` và `TaskDoc` types

- [ ] 1.4 Tạo TeamRepository (`src/modules/team/team.repository.ts`)
  - `findById(id)`, `findByMemberId(userId)`, `findByOwnerId(userId)`
  - `create(data)`, `update(id, data)`, `delete(id)`
  - `addMember(teamId, member)`, `removeMember(teamId, userId)`, `updateMemberRole(teamId, userId, role)`
  - `isMember(teamId, userId): boolean`, `getMemberRole(teamId, userId): TeamRole | null`

- [ ] 1.5 Tạo TeamInviteRepository (`src/modules/team/team-invite.repository.ts`)
  - `create(data)`, `findByToken(token)`, `findByTeamAndEmail(teamId, email)`
  - `updateStatus(id, status)`, `listByTeam(teamId)`, `expireOldInvites()`

## Phase 2: Backend - Team & Invite Services

- [x] 2.1 Tạo TeamService (`src/modules/team/team.service.ts`)
  - `createTeam(userId, dto)`: tạo team, tự động thêm creator làm owner
  - `getTeam(teamId, userId)`: kiểm tra membership trước khi trả data
  - `updateTeam(teamId, userId, dto)`: chỉ owner/admin
  - `deleteTeam(teamId, userId)`: chỉ owner, soft delete (isArchived = true)
  - `listTeams(userId)`: trả về tất cả teams user là member
  - `removeMember(teamId, ownerId, memberId)`: không thể remove owner
  - `updateMemberRole(teamId, ownerId, memberId, role)`: không thể đổi role owner
  - `toPublicTeam(doc)`: mapper function

- [x] 2.2 Tạo InviteService (`src/modules/team/invite.service.ts`)
  - `inviteMember(teamId, inviterId, email, role)`:
    - Check inviter là owner/admin
    - Check email chưa là member
    - Check không có pending invite
    - Tạo token UUID v4, expiresAt = now + 7 ngày
    - Enqueue email qua `notificationQueueService`
  - `acceptInvite(token, userId)`:
    - Validate token tồn tại, status pending, chưa expired
    - Fetch user info từ userRepository
    - Add member vào team
    - Update invite status = accepted
  - `declineInvite(token)`: update status = declined
  - `revokeInvite(teamId, ownerId, inviteId)`: chỉ owner/admin
  - `listPendingInvites(teamId, userId)`: chỉ owner/admin xem được

- [ ] 2.3 Tạo email template cho team invite (`src/modules/team/invite-email.template.ts`)
  - HTML template với: team name, inviter name, role, accept/decline buttons
  - Link format: `${FRONTEND_URL}/teams/invite/accept?token={token}`
  - Tái dùng style từ `generateInviteEmailHtml` trong task.service.ts

## Phase 3: Backend - Task Assignment & Workload

- [ ] 3.1 Tạo TeamTaskService (`src/modules/team/team-task.service.ts`)
  - `assignTask(teamId, taskId, assigneeId, assignerId)`:
    - Validate assignee là member của team
    - Validate assigner là owner/admin/member (member chỉ assign cho mình)
    - Update `task.teamAssignment`
    - Gửi notification cho assignee
  - `unassignTask(teamId, taskId, assignerId)`: xóa teamAssignment
  - `getTeamTasks(teamId, userId, filters)`: query tasks theo teamId, filter by status/assignee/priority
  - `getMemberWorkload(teamId, memberId)`: tính tổng tasks, estimatedDuration, scheduled minutes
  - `getTeamBoard(teamId, userId)`: group tasks by status (todo/in_progress/completed)

- [ ] 3.2 Cập nhật TaskRepository để support team queries (`src/modules/task/task.repository.ts`)
  - Thêm `findByTeamId(teamId, filters)`: query tasks với teamAssignment.teamId
  - Thêm `findByAssignee(teamId, assigneeId)`: tasks của 1 member trong team
  - Thêm `getTeamWorkloadStats(teamId)`: aggregate workload per member

## Phase 4: Backend - Team Calendar & AI Scheduling

- [ ] 4.1 Tạo TeamCalendarService (`src/modules/team/team-calendar.service.ts`)
  - `getTeamCalendar(teamId, userId, range)`:
    - Fetch scheduled tasks của tất cả members trong range
    - Group by member và by date
    - Trả về `{ members: [{ memberId, name, events: [...] }] }`
  - `detectConflicts(teamId, userId, range)`:
    - Detect overload: member > 8h/ngày
    - Detect time overlap: 2 tasks của cùng member overlap
    - Trả về `ConflictReport[]`

- [ ] 4.2 Tạo AITeamScheduler (`src/modules/team/ai-team-scheduler.service.ts`)
  - `suggestAssignments(teamId, taskIds, requesterId)`:
    - Fetch workload của tất cả members
    - Build AI prompt với workload data
    - Parse AI response thành `AssignmentSuggestion[]`
    - Fallback: round-robin nếu AI lỗi
  - `scheduleForTeam(teamId, taskIds, startDate, requesterId)`:
    - Gọi `suggestAssignments` để lấy assignments
    - Với mỗi assignment, gọi `hybridScheduleService.schedulePlan`
    - Detect cross-member conflicts
    - Save `TeamSchedule` document
    - Trả về full schedule result

## Phase 5: Backend - API Routes & Controllers

- [ ] 5.1 Tạo Team controller (`src/modules/team/team.controller.ts`)
  - `POST /teams` → createTeam
  - `GET /teams` → listTeams (teams của current user)
  - `GET /teams/:id` → getTeam
  - `PUT /teams/:id` → updateTeam
  - `DELETE /teams/:id` → deleteTeam
  - `DELETE /teams/:id/members/:memberId` → removeMember
  - `PATCH /teams/:id/members/:memberId/role` → updateMemberRole

- [ ] 5.2 Tạo Invite controller (`src/modules/team/invite.controller.ts`)
  - `POST /teams/:id/invite` → inviteMember (body: email, role)
  - `GET /teams/:id/invites` → listPendingInvites
  - `DELETE /teams/:id/invites/:inviteId` → revokeInvite
  - `POST /teams/invite/accept` → acceptInvite (body: token)
  - `POST /teams/invite/decline` → declineInvite (body: token)

- [ ] 5.3 Tạo TeamTask controller (`src/modules/team/team-task.controller.ts`)
  - `GET /teams/:id/tasks` → getTeamTasks (query: status, assigneeId, priority)
  - `POST /teams/:id/tasks/:taskId/assign` → assignTask (body: assigneeId)
  - `DELETE /teams/:id/tasks/:taskId/assign` → unassignTask
  - `GET /teams/:id/board` → getTeamBoard
  - `GET /teams/:id/members/:memberId/workload` → getMemberWorkload

- [ ] 5.4 Tạo TeamCalendar & AI controller (`src/modules/team/team-calendar.controller.ts`)
  - `GET /teams/:id/calendar` → getTeamCalendar (query: from, to)
  - `GET /teams/:id/conflicts` → detectConflicts (query: from, to)
  - `POST /teams/:id/ai-schedule` → scheduleForTeam (body: taskIds, startDate)
  - `POST /teams/:id/ai-suggest` → suggestAssignments (body: taskIds)

- [x] 5.5 Tạo team routes và middleware (`src/modules/team/team.routes.ts`)
  - Apply `authMiddleware` cho tất cả routes
  - Tạo `requireTeamMember` middleware: check user là member của team
  - Tạo `requireTeamAdmin` middleware: check user là owner/admin
  - Register router trong `src/app.ts` tại `/teams`

## Phase 6: Frontend - Team Management Pages

- [ ] 6.1 Tạo TypeScript interfaces cho team (`web-task-AI/src/types/team.types.ts`)
  - `Team`, `TeamMember`, `TeamRole`, `TeamInvite`
  - `TeamTask`, `MemberWorkload`, `TeamBoard`
  - `TeamCalendarData`, `ConflictReport`
  - `AssignmentSuggestion`, `TeamScheduleResult`

- [x] 6.2 Tạo team API service (`web-task-AI/src/services/teamServices/index.ts`)
  - `createTeam`, `getTeam`, `updateTeam`, `deleteTeam`, `listTeams`
  - `inviteMember`, `acceptInvite`, `declineInvite`, `listPendingInvites`, `revokeInvite`
  - `getTeamTasks`, `assignTask`, `unassignTask`, `getTeamBoard`, `getMemberWorkload`
  - `getTeamCalendar`, `detectConflicts`
  - `suggestAssignments`, `scheduleForTeam`

- [x] 6.3 Refactor trang Teams hiện có (`web-task-AI/src/pages/Teams/index.tsx`)
  - Thay `getUsers()` bằng `listTeams()` API
  - Thêm TeamList: hiển thị danh sách teams của user
  - Thêm nút "Tạo Team mới" → mở CreateTeamModal
  - Click vào team → navigate đến `/teams/:id`

- [ ] 6.4 Tạo CreateTeamModal component (`web-task-AI/src/components/Team/CreateTeamModal.tsx`)
  - Form: Team name (required), description (optional)
  - Ant Design Form + Modal
  - Submit → gọi `createTeam` API → refresh list

- [x] 6.5 Tạo trang Team Detail (`web-task-AI/src/pages/Teams/TeamDetail.tsx`)
  - Tabs: Members | Tasks | Calendar | AI Schedule
  - Header: team name, description, member count
  - Route: `/teams/:id`

- [ ] 6.6 Tạo Members tab (`web-task-AI/src/components/Team/MembersTab.tsx`)
  - Danh sách members với avatar, name, email, role tag
  - Nút "Mời thành viên" → InviteModal (chỉ owner/admin)
  - Dropdown actions: Đổi role, Xóa khỏi team (chỉ owner/admin)
  - Pending invites section với nút revoke

- [ ] 6.7 Tạo InviteModal component (`web-task-AI/src/components/Team/InviteModal.tsx`)
  - Input email, Select role (admin/member/viewer)
  - Submit → gọi `inviteMember` API
  - Hiển thị success/error message

- [ ] 6.8 Tạo Tasks tab - Team Board (`web-task-AI/src/components/Team/TeamBoardTab.tsx`)
  - Kanban board: columns Todo | In Progress | Completed
  - Mỗi task card: title, assignee avatar, priority tag, deadline
  - Filter bar: by assignee, by priority
  - Click task → TaskDetailDrawer với assign dropdown
  - Drag & drop để đổi status (Ant Design DnD hoặc @dnd-kit)

- [ ] 6.9 Tạo AssignTask component (`web-task-AI/src/components/Team/AssignTaskSelect.tsx`)
  - Select dropdown với danh sách members (avatar + name)
  - Hiển thị workload badge (số task hiện tại)
  - onChange → gọi `assignTask` API

- [ ] 6.10 Tạo Team Calendar tab (`web-task-AI/src/components/Team/TeamCalendarTab.tsx`)
  - Calendar view (tái dùng Ant Design Calendar hoặc FullCalendar)
  - Color-coded events theo member
  - Legend: member name → color
  - Conflict indicators: đỏ cho overload, vàng cho overlap
  - Date range picker để chọn khoảng xem

- [ ] 6.11 Tạo Conflict Alert component (`web-task-AI/src/components/Team/ConflictAlert.tsx`)
  - Alert list hiển thị conflicts từ `detectConflicts` API
  - Mỗi conflict: type (overload/overlap), member name, date, description
  - Nút "Xem chi tiết" → highlight trên calendar

- [ ] 6.12 Tạo AI Schedule tab (`web-task-AI/src/components/Team/AIScheduleTab.tsx`)
  - Step 1: Chọn tasks cần schedule (multi-select từ unassigned tasks)
  - Step 2: Chọn start date
  - Step 3: Click "AI Phân bổ" → gọi `suggestAssignments` trước
  - Hiển thị suggestions với workload preview
  - Confirm → gọi `scheduleForTeam`
  - Hiển thị kết quả: schedule per member, warnings nếu có

- [x] 6.13 Tạo trang Accept Invite (`web-task-AI/src/pages/Teams/AcceptInvite.tsx`)
  - Route: `/teams/invite/accept?token=xxx`
  - Hiển thị: "Bạn được mời vào team [name] với role [role]"
  - Nút Accept / Decline
  - Redirect về `/teams/:id` sau khi accept

- [x] 6.14 Cập nhật routes (`web-task-AI/src/routes/routes.tsx`)
  - Thêm `/teams/:id` → TeamDetail
  - Thêm `/teams/invite/accept` → AcceptInvite (public route, không cần auth)

## Phase 7: Testing

- [ ] 7.1 Unit tests cho TeamService (`src/modules/team/__tests__/team.service.test.ts`)
  - Test createTeam: owner được thêm vào members
  - Test removeMember: không thể remove owner
  - Test updateMemberRole: không thể đổi role của owner

- [ ] 7.2 Unit tests cho InviteService (`src/modules/team/__tests__/invite.service.test.ts`)
  - Test inviteMember: duplicate invite check
  - Test acceptInvite: expired token, already member
  - Test token expiry logic

- [ ] 7.3 Property-based tests (`src/modules/team/__tests__/team.properties.test.ts`)
  - Property: team luôn có đúng 1 owner
  - Property: accepted invite ⟹ member trong team
  - Property: workload không âm
  - Dùng fast-check (đã có trong project)

- [ ] 7.4 Integration test cho assign flow (`src/modules/team/__tests__/team-task.integration.test.ts`)
  - Flow: createTeam → invite → accept → assignTask → getWorkload
  - Mock MongoDB với mongodb-memory-server (đã có trong project)
