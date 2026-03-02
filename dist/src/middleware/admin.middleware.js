"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = void 0;
// Middleware kiểm tra user có role admin không
const adminMiddleware = (req, res, next) => {
    const userRole = req.user?.role;
    if (userRole !== "admin") {
        res.status(403).json({
            message: "Forbidden - Admin access required",
        });
        return;
    }
    next();
};
exports.adminMiddleware = adminMiddleware;
