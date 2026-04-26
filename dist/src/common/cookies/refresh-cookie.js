"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearRefreshCookie = exports.setRefreshCookie = void 0;
const setRefreshCookie = (res, refreshToken, input) => {
    const isProduction = input.nodeEnv === "production";
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/auth",
        maxAge: input.maxAgeMs,
    });
};
exports.setRefreshCookie = setRefreshCookie;
const clearRefreshCookie = (res) => {
    res.clearCookie("refreshToken", {
        path: "/auth",
    });
};
exports.clearRefreshCookie = clearRefreshCookie;
