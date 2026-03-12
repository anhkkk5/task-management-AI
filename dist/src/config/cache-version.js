"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionedKey = exports.CACHE_VERSION = void 0;
exports.CACHE_VERSION = {
    // Scheduler cache version
    SCHEDULER: "v3", // Tăng lên v3 sau khi thêm adaptive buffer
    // AI cache version
    AI: "v2", // Tăng lên v2 sau khi chuyển sang hybrid algorithm
    // Slot finder cache version
    SLOT_FINDER: "v3", // Tăng lên v3 sau khi thêm adaptive buffer
    // Productivity cache version
    PRODUCTIVITY: "v1",
};
/**
 * Helper để tạo cache key với version
 */
const versionedKey = (version, key) => {
    return `${version}:${key}`;
};
exports.versionedKey = versionedKey;
/**
 * Changelog:
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
