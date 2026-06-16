import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, "../..");
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const symbols = "@#$%";

function randomFrom(value) {
  return value[crypto.randomInt(0, value.length)];
}

function shuffle(value) {
  const chars = value.split("");
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
}

function randomPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const required = randomFrom(upper) + randomFrom(lower) + randomFrom(digits) + randomFrom(symbols);
  const rest = Array.from({ length: 8 }, () => randomFrom(passwordAlphabet + symbols)).join("");
  return shuffle(required + rest);
}

function csvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function rotateTeamPasswords() {
  const users = await prisma.user.findMany({
    where: {
      status: "active",
      role: { in: ["employee", "manager"] },
      employee: {
        status: { in: ["active", "probation", "on_leave"] },
      },
    },
    include: {
      employee: {
        select: {
          employeeCode: true,
          fullName: true,
          email: true,
          department: true,
          status: true,
        },
      },
    },
    orderBy: [{ employee: { employeeCode: "asc" } }],
  });

  const rows = [];
  for (const user of users) {
    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    rows.push({
      employeeCode: user.employee?.employeeCode || "",
      fullName: user.employee?.fullName || "",
      username: user.username || "",
      email: user.email,
      role: user.role,
      password,
      department: user.employee?.department || "",
      employeeStatus: user.employee?.status || "",
    });
  }

  const reportDir = resolve(serverDir, "reports");
  await mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = resolve(reportDir, `team-member-passwords-${timestamp}.csv`);
  const header = ["Employee Code", "Full Name", "Username", "Email", "Role", "Password", "Department", "Employee Status"];
  const csv = [
    header.map(csvValue).join(","),
    ...rows.map((row) => [
      row.employeeCode,
      row.fullName,
      row.username,
      row.email,
      row.role,
      row.password,
      row.department,
      row.employeeStatus,
    ].map(csvValue).join(",")),
  ].join("\n");

  await writeFile(filePath, `${csv}\n`, "utf8");
  return { updatedCount: rows.length, filePath, users: rows.map(({ password, ...row }) => row) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rotateTeamPasswords()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
