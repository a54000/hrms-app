import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function googleEnvConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    (process.env.GOOGLE_MAIL_FROM || process.env.MAIL_FROM)
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendMail({ to, subject, html, text, attachments = [] }) {
  if (googleEnvConfigured() && !attachments.length) {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const accessToken = await client.getAccessToken();
    return sendGmail({
      accessToken: accessToken.token,
      from: process.env.GOOGLE_MAIL_FROM || process.env.MAIL_FROM,
      to,
      subject,
      html,
      text,
    });
  }

  if (!smtpConfigured()) {
    return {
      status: "queued",
      deliveryMode: "smtp_not_configured",
      messageId: null,
    };
  }

  const result = await createTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
    text,
    attachments,
  });

  return {
    status: "sent",
    deliveryMode: "smtp",
    messageId: result.messageId,
  };
}

export async function sendGmail({ accessToken, from, to, subject, html, text }) {
  const body = [
    from ? `From: ${from}` : "",
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html || `<pre>${text || ""}</pre>`,
  ].filter((line) => line !== "").join("\r\n");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodeBase64Url(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Google email send failed.");
  }

  return {
    status: "sent",
    deliveryMode: "google_gmail",
    messageId: data.id || null,
    fallbackText: text || htmlToText(html || ""),
  };
}
