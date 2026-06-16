import dotenv from "dotenv";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sendMail } from "../lib/mailer.js";

dotenv.config();

const serverDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const reportsDir = resolve(serverDir, "reports");

function latestPasswordFile() {
  const files = readdirSync(reportsDir)
    .filter((file) => /^team-member-passwords-.*\.csv$/i.test(file))
    .sort()
    .reverse();
  if (!files.length) throw new Error("No team member password CSV found in reports.");
  return resolve(reportsDir, files[0]);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readPasswordRows(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function onboardingHtml(row) {
  const appUrl = process.env.CLIENT_ORIGIN || "https://hrms.hrgp.in";
  const name = row["Full Name"] || "Team member";
  const username = row.Username || row.Email;
  const password = row.Password;
  return `
    <p>Hi ${name},</p>
    <p>Your HR Guru HRMS account is ready.</p>
    <p><strong>Login URL:</strong> <a href="${appUrl}">${appUrl}</a><br>
    <strong>Username:</strong> ${username}<br>
    <strong>Email:</strong> ${row.Email}<br>
    <strong>Temporary password:</strong> ${password}</p>
    <p>When you sign in, HRMS will ask you to change this temporary password before opening the dashboard.</p>
    <p><strong>Important attendance instructions</strong></p>
    <ul>
      <li>Use only your approved laptop or desktop. Mobile login is not allowed.</li>
      <li>Login is available from 8:30 AM to 8:00 PM.</li>
      <li>Check-in is allowed till 10:30 AM.</li>
      <li>If you miss check-in after 10:30 AM, raise a Forgot to punch - Check in request.</li>
      <li>If you miss checkout, raise a Forgot to punch - Checkout request before next day check-in.</li>
      <li>Maximum 5 Forgot to punch requests are allowed per month. Working from 2nd Half does not count in this limit.</li>
      <li>If your working hours are less than 6 hours, HRMS may mark that day as half day as per policy.</li>
    </ul>
    <p>Please do not share your password with anyone.</p>
    <p>Regards,<br>HR Guru HRMS</p>
  `;
}

function onboardingText(row) {
  const appUrl = process.env.CLIENT_ORIGIN || "https://hrms.hrgp.in";
  return [
    `Hi ${row["Full Name"] || "Team member"},`,
    "",
    "Your HR Guru HRMS account is ready.",
    "",
    `Login URL: ${appUrl}`,
    `Username: ${row.Username || row.Email}`,
    `Email: ${row.Email}`,
    `Temporary password: ${row.Password}`,
    "",
    "When you sign in, HRMS will ask you to change this temporary password before opening the dashboard.",
    "",
    "Important attendance instructions:",
    "- Use only your approved laptop or desktop. Mobile login is not allowed.",
    "- Login is available from 8:30 AM to 8:00 PM.",
    "- Check-in is allowed till 10:30 AM.",
    "- If you miss check-in after 10:30 AM, raise a Forgot to punch - Check in request.",
    "- If you miss checkout, raise a Forgot to punch - Checkout request before next day check-in.",
    "- Maximum 5 Forgot to punch requests are allowed per month. Working from 2nd Half does not count in this limit.",
    "- If your working hours are less than 6 hours, HRMS may mark that day as half day as per policy.",
    "",
    "Please do not share your password with anyone.",
    "",
    "Regards,",
    "HR Guru HRMS",
  ].join("\n");
}

export async function sendOnboardingEmails({ filePath = latestPasswordFile(), send = false } = {}) {
  if (!existsSync(filePath)) throw new Error(`Password file not found: ${filePath}`);
  const rows = readPasswordRows(filePath).filter((row) => row.Email && row.Password);
  const sample = rows[0] ? {
    to: rows[0].Email,
    subject: "Your HR Guru HRMS login details",
    text: onboardingText(rows[0]),
    html: onboardingHtml(rows[0]),
  } : null;
  if (!send) return { mode: "dry_run", filePath, count: rows.length, sample };

  const deliveries = [];
  for (const row of rows) {
    deliveries.push({
      to: row.Email,
      result: await sendMail({
        to: row.Email,
        subject: "Your HR Guru HRMS login details",
        html: onboardingHtml(row),
        text: onboardingText(row),
      }),
    });
  }
  return { mode: "send", filePath, count: rows.length, deliveries };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const send = process.argv.includes("--send");
  const fileArgIndex = process.argv.findIndex((arg) => arg === "--file");
  const filePath = fileArgIndex >= 0 ? process.argv[fileArgIndex + 1] : undefined;
  sendOnboardingEmails({ filePath, send })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
