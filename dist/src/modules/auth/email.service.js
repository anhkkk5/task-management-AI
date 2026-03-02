"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const getSmtpConfig = () => {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT
        ? Number(process.env.SMTP_PORT)
        : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !port || !user || !pass) {
        throw new Error("Missing env SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS");
    }
    const fromEmail = process.env.EMAIL_FROM;
    const fromName = process.env.EMAIL_FROM_NAME;
    if (!fromEmail) {
        throw new Error("Missing env EMAIL_FROM");
    }
    return {
        host,
        port,
        user,
        pass,
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    };
};
exports.emailService = {
    sendOtpEmail: async (toEmail, otp) => {
        const cfg = getSmtpConfig();
        const transporter = nodemailer_1.default.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.port === 465,
            auth: {
                user: cfg.user,
                pass: cfg.pass,
            },
        });
        await transporter.sendMail({
            from: cfg.from,
            to: toEmail,
            subject: "Mã OTP xác thực tài khoản",
            text: `Mã OTP của bạn là: ${otp}. Mã có hiệu lực trong 5 phút.`,
            html: `<p>Mã OTP của bạn là: <b>${otp}</b></p><p>Mã có hiệu lực trong <b>5 phút</b>.</p>`,
        });
    },
    sendChangePasswordOtpEmail: async (toEmail, otp) => {
        const cfg = getSmtpConfig();
        const transporter = nodemailer_1.default.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.port === 465,
            auth: {
                user: cfg.user,
                pass: cfg.pass,
            },
        });
        await transporter.sendMail({
            from: cfg.from,
            to: toEmail,
            subject: "Mã OTP đổi mật khẩu",
            text: `Mã OTP đổi mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 5 phút.`,
            html: `<p>Mã OTP đổi mật khẩu của bạn là: <b>${otp}</b></p><p>Mã có hiệu lực trong <b>5 phút</b>.</p>`,
        });
    },
};
