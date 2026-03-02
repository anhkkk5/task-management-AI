"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const getSecret = () => {
    const secret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("Missing env JWT_ACCESS_SECRET");
    }
    return secret;
};
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ message: "Thiếu token" });
            return;
        }
        const token = authHeader.slice("Bearer ".length).trim();
        const decoded = jsonwebtoken_1.default.verify(token, getSecret());
        const payload = decoded;
        if (!payload.userId || !payload.email || !payload.role) {
            res.status(401).json({ message: "Token không hợp lệ" });
            return;
        }
        req.user = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role,
        };
        next();
    }
    catch (_err) {
        res.status(401).json({ message: "Token không hợp lệ" });
    }
};
exports.authMiddleware = authMiddleware;
