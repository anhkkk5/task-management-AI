import moment from "moment-timezone";

// Mặc định sử dụng múi giờ Việt Nam
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Trả về chuỗi ngày YYYY-MM-DD theo múi giờ địa phương (VN)
 * @param date Đối tượng Date
 */
export function toLocalDateStr(date: Date): string {
  return moment(date).tz(DEFAULT_TIMEZONE).format("YYYY-MM-DD");
}

/**
 * Lấy string thứ trong tuần bằng tiếng Việt
 * @param dateStr Chuỗi YYYY-MM-DD
 */
export function getDayOfWeek(dateStr: string): string {
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  return days[moment.tz(dateStr, DEFAULT_TIMEZONE).day()];
}

/**
 * Format chuỗi "HH:mm - HH:mm" từ 2 objects Date
 */
export function formatTimeRange(start: Date, end: Date): string {
  const mStart = moment(start).tz(DEFAULT_TIMEZONE);
  const mEnd = moment(end).tz(DEFAULT_TIMEZONE);
  return `${mStart.format("HH:mm")} - ${mEnd.format("HH:mm")}`;
}

/**
 * Khởi tạo một đối tượng Date mới từ chuỗi YYYY-MM-DD và đặt giờ (HH, mm) theo timezone VN
 * Phục vụ cho hàm chia lịch với giờ/phút cụ thể.
 */
export function createDateWithTime(
  dateStr: string,
  hour: number,
  minute: number,
  second: number = 0
): Date {
  // Parse in timezone the specified date and set its time parts
  return moment.tz(dateStr, DEFAULT_TIMEZONE).set({ hour, minute, second, millisecond: 0 }).toDate();
}
