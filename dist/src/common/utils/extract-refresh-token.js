"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRefreshToken = void 0;
const extractRefreshToken = (req) => {
    const r = req;
    const cookieToken = String(r.cookies?.refreshToken ?? "");
    const bodyToken = String(req.body?.refreshToken ?? "");
    return cookieToken || bodyToken;
};
exports.extractRefreshToken = extractRefreshToken;
