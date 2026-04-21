import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const senderEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;
const senderName = process.env.EMAIL_FROM_NAME || "TaskMind AI";

export interface InviteEmailData {
  to: string;
  teamName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}

export class MailService {
  async sendTeamInvite(data: InviteEmailData): Promise<void> {
    const { to, teamName, inviterName, role, inviteUrl, expiresAt } = data;

    const formattedDate = expiresAt.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const roleText = role === "admin" ? "Quản trị viên" : "Thành viên";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lời mời tham gia Team</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #059669 0%, #06b6d4 100%); padding: 40px 30px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px; }
    .content { padding: 40px 30px; }
    .invite-box { background: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
    .team-name { font-size: 24px; font-weight: 700; color: #059669; margin-bottom: 8px; }
    .role-badge { display: inline-block; background: #059669; color: white; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }
    .button { display: inline-block; background: linear-gradient(135deg, #059669 0%, #06b6d4 100%); color: white; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 16px 0; box-shadow: 0 4px 12px rgba(5,150,105,0.3); }
    .footer { padding: 20px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 14px; }
    .expiry { color: #dc2626; font-size: 14px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👋 Xin chào!</h1>
      <p>Bạn có một lời mời tham gia team</p>
    </div>
    <div class="content">
      <p><strong>${inviterName}</strong> đã mời bạn tham gia team trong <strong>TaskMind AI</strong>.</p>
      
      <div class="invite-box">
        <div class="team-name">${teamName}</div>
        <span class="role-badge">${roleText}</span>
      </div>

      <p style="text-align: center;">
        <a href="${inviteUrl}" class="button">Tham gia ngay</a>
      </p>

      <p class="expiry">⏰ Lời mời hết hạn vào: ${formattedDate}</p>
      
      <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
        Hoặc copy link này: <a href="${inviteUrl}" style="color: #059669;">${inviteUrl}</a>
      </p>
    </div>
    <div class="footer">
      <p>Email này được gửi từ TaskMind AI - Hệ thống quản lý công việc thông minh</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Xin chào!

${inviterName} đã mời bạn tham gia team "${teamName}" trong TaskMind AI với vai trò ${roleText}.

Tham gia ngay: ${inviteUrl}

Lời mời hết hạn vào: ${formattedDate}

---
Email này được gửi từ TaskMind AI
    `;

    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject: `🎉 ${inviterName} mời bạn tham gia team "${teamName}"`,
      html,
      text,
    });

    console.log(
      `[MailService] Invite email sent to ${to} for team ${teamName}`,
    );
  }
}

export const mailService = new MailService();
