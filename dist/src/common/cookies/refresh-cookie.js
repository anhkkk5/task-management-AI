"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearRefreshCookie = exports.setRefreshCookie = void 0;
const setRefreshCookie = (res, refreshToken, input) => {
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: input.nodeEnv === "production",
        sameSite: "strict",
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
