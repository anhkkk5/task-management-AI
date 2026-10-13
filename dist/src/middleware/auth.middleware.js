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
        // Prioritize httpOnly cookie over header (for fresh Google auth)
        let token;
        let tokenSource = "none";
        if (req.cookies?.token) {
            token = req.cookies.token;
            tokenSource = "cookie";
        }
        else if (req.headers.authorization?.startsWith("Bearer ")) {
            token = req.headers.authorization.slice("Bearer ".length).trim();
            tokenSource = "header";
        }
        if (!token) {
            res.status(401).json({ message: "Thiếu token" });
            return;
        }
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
            googleAccessToken: payload.googleAccessToken,
        };
        next();
    }
    catch (err) {
        // Clear expired/invalid token cookie
        if (err.message === "jwt expired" || err.message === "invalid token") {
            res.clearCookie("token", { path: "/" });
        }
        res.status(401).json({ message: "Token không hợp lệ" });
    }
};
exports.authMiddleware = authMiddleware;
