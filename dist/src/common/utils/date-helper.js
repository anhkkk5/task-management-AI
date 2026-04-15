"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateHelper = void 0;
class DateHelper {
    static toLocalDateStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    static getDayOfWeek(dateStr) {
        const days = [
            "Chủ Nhật",
            "Thứ Hai",
            "Thứ Ba",
            "Thứ Tư",
            "Thứ Năm",
            "Thứ Sáu",
            "Thứ Bảy",
        ];
        const date = new Date(`${dateStr}T00:00:00`);
        return days[date.getDay()];
    }
    static formatTimeRange(start, end) {
        const formatTime = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return `${formatTime(start)} - ${formatTime(end)}`;
    }
    static addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }
    static isSameDay(date1, date2) {
        return this.toLocalDateStr(date1) === this.toLocalDateStr(date2);
    }
}
exports.DateHelper = DateHelper;
