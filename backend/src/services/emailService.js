const nodemailer = require("nodemailer");
const { primaryClientUrl } = require("../config/env");

/**
 * Providers (first configured wins):
 *   1. Resend  -> RESEND_API_KEY
 *   2. SMTP    -> SMTP_HOST + SMTP_USER + SMTP_PASS (SMTP_PORT, SMTP_SECURE, SMTP_FROM optional)
 *   3. none    -> the message is printed to the backend console (local development)
 */
const FROM = () => process.env.SMTP_FROM || "FlyWallets <no-reply@flywallets.local>";

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const layout = (title, bodyHtml) => `<!doctype html>
<html><body style="margin:0;background:#0d0d15;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border:1px solid #2a2a45;border-radius:12px;">
      <tr><td style="padding:28px 32px 8px;color:#d4af37;font-size:24px;font-weight:bold;">FlyWallets</td></tr>
      <tr><td style="padding:8px 32px 0;color:#ffffff;font-size:18px;font-weight:bold;">${escapeHtml(title)}</td></tr>
      <tr><td style="padding:12px 32px 32px;color:#c9c9d6;font-size:14px;line-height:22px;">${bodyHtml}</td></tr>
    </table>
    <p style="color:#6b6b80;font-size:12px;margin-top:16px;">If you did not request this, you can safely ignore this e-mail.</p>
  </td></tr></table>
</body></html>`;

const isSmtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

/**
 * Sends an e-mail. Resolves with { delivered, provider }. Never throws: callers must not fail a
 * user flow because the mail provider is down (the error is logged).
 */
const sendEmail = async ({ to, subject, html, text, devLog }) => {
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      return { delivered: true, provider: "resend" };
    }

    if (isSmtpConfigured()) {
      await getTransporter().sendMail({ from: FROM(), to, subject, html, text });
      return { delivered: true, provider: "smtp" };
    }

    if (process.env.NODE_ENV === "production") {
      // Never write OTPs / reset links to production logs
      console.error("❌ No e-mail provider configured (RESEND_API_KEY or SMTP_*): message NOT sent.");
    } else if (process.env.NODE_ENV !== "test") {
      console.log(
        `\n📧 [DEV EMAIL - no provider configured]\n   To: ${to}\n   Subject: ${subject}\n   ${devLog || text}\n`
      );
    }
    return { delivered: false, provider: "console" };
  } catch (err) {
    console.error(`❌ Email delivery to ${to} failed:`, err.message);
    return { delivered: false, provider: "error" };
  }
};

exports.sendVerificationOtp = (to, code) =>
  sendEmail({
    to,
    subject: `${code} is your FlyWallets verification code`,
    text: `Your FlyWallets verification code is ${code}. It expires in 10 minutes.`,
    devLog: `🔑 VERIFICATION CODE: ${code} (valid 10 minutes)`,
    html: layout(
      "Verify your e-mail",
      `<p>Use this code to confirm your e-mail address. It expires in 10 minutes.</p>
       <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#d4af37;margin:20px 0;">${escapeHtml(code)}</p>`
    ),
  });

exports.sendPasswordReset = (to, rawToken) => {
  const link = `${primaryClientUrl}/reset-password?token=${rawToken}`;
  return sendEmail({
    to,
    subject: "Reset your FlyWallets password",
    text: `Reset your password using this link (valid 1 hour): ${link}`,
    devLog: `🔗 PASSWORD RESET LINK (valid 1 hour): ${link}`,
    html: layout(
      "Reset your password",
      `<p>We received a request to reset your password. This link is valid for 1 hour.</p>
       <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#d4af37;color:#000;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;">Choose a new password</a></p>
       <p style="font-size:12px;color:#8a8aa0;word-break:break-all;">${escapeHtml(link)}</p>`
    ),
  });
};
