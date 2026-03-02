"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAuthError = void 0;
const handleAuthError = (err, res, map) => {
    const key = err instanceof Error ? err.message : "UNKNOWN";
    if (key.includes("Missing env SMTP")) {
        res.status(500).json({ message: "Thiếu cấu hình SMTP" });
        return;
    }
    const matched = map[key];
    if (matched) {
        res.status(matched.status).json({ message: matched.message });
        return;
    }
    res.status(500).json({ message: "Lỗi hệ thống" });
};
exports.handleAuthError = handleAuthError;
