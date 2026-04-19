/**
 * Cache Version Configuration
 *
 * Tăng version này khi thay đổi:
 * - Thuật toán scheduling
 * - AI prompt
 * - Business logic
 * - WorkHours/breaks
 *
 * Cache cũ sẽ tự động bị bỏ qua (không cần xóa thủ công)
 */

export const CACHE_VERSION = {
  // Scheduler cache version
  SCHEDULER: "v6", // Tăng lên v6 sau khi fix break boundary và thêm clear scheduledTime

  // AI cache version
  AI: "v3", // Tăng lên v3 sau khi fix thuật toán scale thời gian breakdown

  // Slot finder cache version
  SLOT_FINDER: "v3", // Tăng lên v3 sau khi thêm adaptive buffer

  // Productivity cache version
  PRODUCTIVITY: "v1",
};

/**
 * Helper để tạo cache key với version
 */
export const versionedKey = (version: string, key: string): string => {
  return `${version}:${key}`;
};

/**
 * Changelog:
 *
 * v4 (2026-03-08 - Fix Conflict Detection):
 * - Fix getScheduledTasks query: sử dụng overlap condition thay vì range filter
 * - Thêm excludeTaskIds để loại trừ tasks đang được schedule
 * - Fix bug: tasks bị trùng giờ khi re-schedule
 *
 * v3 (2026-03-07 - Adaptive Buffer):
 * - Thêm adaptive buffer: session < 40 phút → buffer 10 phút
 * - Session ≥ 40 phút → buffer 15 phút
 * - Tối ưu thời gian nghỉ dựa trên độ dài session
 *
 * v2 (2026-03-07):
 * - Thêm breaks (11:30-14:00, 17:30-19:30)
 * - Thêm buffer 15 phút giữa các task
 * - Chuyển từ AI service sang Hybrid Algorithm
 * - Cập nhật workHours (8-23h)
 *
 * v1 (Initial):
 * - Basic scheduling
 * - Pure AI approach
 */
