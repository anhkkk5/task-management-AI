import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@taskmanagement.com";

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const emailService = {
  // Send email
  send: async (
    options: EmailOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    try {
      if (!SMTP_USER || !SMTP_PASS) {
        console.warn("[EmailService] SMTP credentials not configured");
        return { success: false, error: "SMTP not configured" };
      }

      const info = await transporter.sendMail({
        from: `"Task Management" <${SMTP_FROM}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      console.log(`[EmailService] Email sent: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      console.error("[EmailService] Failed to send email:", error);
      return { success: false, error };
    }
  },

  // Send notification email (deadline reminder, etc.)
  sendNotification: async (params: {
    to: string;
    title: string;
    content: string;
    actionUrl?: string;
    actionText?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    const html = generateNotificationTemplate({
      title: params.title,
      content: params.content,
      actionUrl: params.actionUrl,
      actionText: params.actionText,
    });

    return emailService.send({
      to: params.to,
      subject: params.title,
      html,
    });
  },
};

// HTML email template
function generateNotificationTemplate(params: {
  title: string;
  content: string;
  actionUrl?: string;
  actionText?: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background: #f9f9f9;
      border-radius: 8px;
      padding: 30px;
    }
    .header {
      border-bottom: 2px solid #4CAF50;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin: 0;
    }
    .content {
      font-size: 16px;
      color: #555;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      background: #4CAF50;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 4px;
      margin-top: 20px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">${params.title}</h1>
    </div>
    <div class="content">
      ${params.content}
    </div>
    ${
      params.actionUrl
        ? `
    <a href="${params.actionUrl}" class="button">${params.actionText || "Xem chi tiết"}</a>
    `
        : ""
    }
    <div class="footer">
      <p>Email này được gửi tự động từ Task Management System.</p>
      <p>Nếu bạn không muốn nhận email này, vui lòng cập nhật cài đặt thông báo trong tài khoản.</p>
    </div>
  </div>
</body>
</html>
`;
}
