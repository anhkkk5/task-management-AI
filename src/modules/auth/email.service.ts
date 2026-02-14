import nodemailer from "nodemailer";

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

export const emailService = {
  sendOtpEmail: async (toEmail: string, otp: string): Promise<void> => {
    const cfg = getSmtpConfig();

    const transporter = nodemailer.createTransport({
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

  sendChangePasswordOtpEmail: async (
    toEmail: string,
    otp: string,
  ): Promise<void> => {
    const cfg = getSmtpConfig();

    const transporter = nodemailer.createTransport({
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
