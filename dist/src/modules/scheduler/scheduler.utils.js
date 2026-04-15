"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLocalDateStr = toLocalDateStr;
exports.getDayOfWeek = getDayOfWeek;
exports.formatTimeRange = formatTimeRange;
exports.createDateWithTime = createDateWithTime;
const moment_timezone_1 = __importDefault(require("moment-timezone"));
// Mặc định sử dụng múi giờ Việt Nam
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
/**
 * Trả về chuỗi ngày YYYY-MM-DD theo múi giờ địa phương (VN)
 * @param date Đối tượng Date
 */
function toLocalDateStr(date) {
    return (0, moment_timezone_1.default)(date).tz(DEFAULT_TIMEZONE).format("YYYY-MM-DD");
}
/**
 * Lấy string thứ trong tuần bằng tiếng Việt
 * @param dateStr Chuỗi YYYY-MM-DD
 */
function getDayOfWeek(dateStr) {
    const days = [
        "Chủ Nhật",
        "Thứ Hai",
        "Thứ Ba",
        "Thứ Tư",
        "Thứ Năm",
        "Thứ Sáu",
        "Thứ Bảy",
    ];
    return days[moment_timezone_1.default.tz(dateStr, DEFAULT_TIMEZONE).day()];
}
/**
 * Format chuỗi "HH:mm - HH:mm" từ 2 objects Date
 */
function formatTimeRange(start, end) {
    const mStart = (0, moment_timezone_1.default)(start).tz(DEFAULT_TIMEZONE);
    const mEnd = (0, moment_timezone_1.default)(end).tz(DEFAULT_TIMEZONE);
    return `${mStart.format("HH:mm")} - ${mEnd.format("HH:mm")}`;
}
/**
 * Khởi tạo một đối tượng Date mới từ chuỗi YYYY-MM-DD và đặt giờ (HH, mm) theo timezone VN
 * Phục vụ cho hàm chia lịch với giờ/phút cụ thể.
 */
function createDateWithTime(dateStr, hour, minute, second = 0) {
    // Parse in timezone the specified date and set its time parts
    return moment_timezone_1.default.tz(dateStr, DEFAULT_TIMEZONE).set({ hour, minute, second, millisecond: 0 }).toDate();
}
