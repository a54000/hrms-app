import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { httpError } from "../../lib/http-error.js";
import { enforceLoginDevice, recordLoginEvent } from "../../lib/login-devices.js";
import { sendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();
const loginSchema = z.object({
  email: z.string().min(1).optional(),
  login: z.string().min(1).optional(),
  password: z.string().min(1),
});
const googleLoginSchema = z.object({
  credential: z.string().min(1),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
const forgotPasswordSchema = z.object({
  login: z.string().min(1),
});
const googleAvailabilitySchema = z.object({
  login: z.string().min(1),
});
const impersonateSchema = z.object({
  userId: z.string().uuid().optional(),
  login: z.string().min(1).optional(),
});
const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8),
});
const attendanceLimitResetSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  justification: z.string().min(10),
});
const googleClient = new OAuth2Client();
const ATTENDANCE_REQUEST_LIMIT = 5;
const IST_OFFSET_MINUTES = 330;

function publicUser(user) {
  return {
    id: user.id,
    username: user.username || "",
    email: user.email,
    role: user.role,
    impersonatedBy: user.impersonatedBy || null,
    mustChangePassword: Boolean(user.mustChangePassword),
    employee: user.employee
      ? {
          id: user.employee.id,
          employeeCode: user.employee.employeeCode,
          fullName: user.employee.fullName,
          designation: user.employee.designation,
          department: user.employee.department,
          managerId: user.employee.managerId,
        }
      : null,
  };
}

function resetTokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validatePassword(value) {
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) {
    return "Password must include uppercase, lowercase, and a number.";
  }
  return "";
}

function resetLink(token) {
  const origin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  return `${origin.replace(/\/$/, "")}/?resetToken=${encodeURIComponent(token)}`;
}

function passwordResetHtml(user, link) {
  return `
    <p>Hi ${user.employee?.fullName || user.username || user.email},</p>
    <p>A password reset was requested for your HR Guru HRMS account.</p>
    <p><a href="${link}">Reset your HRMS password</a></p>
    <p>This link expires in 60 minutes. If you did not request it, please ignore this email or contact Admin.</p>
  `;
}

function signSession(user, extraPayload = {}) {
  return jwt.sign(
    {
      role: user.role,
      email: user.email,
      username: user.username,
      ...extraPayload,
    },
    process.env.JWT_SECRET || "dev-only-hrguru-secret",
    {
      expiresIn: "8h",
      subject: user.id,
    },
  );
}

function sessionCookieOptions(request) {
  const origin = request?.get?.("origin") || process.env.CLIENT_ORIGIN || "";
  const isHrgpDomain = /https:\/\/[^/]+\.hrgp\.in$/i.test(origin);
  return {
    httpOnly: true,
    sameSite: isHrgpDomain ? "none" : "lax",
    secure: isHrgpDomain || process.env.NODE_ENV === "production",
    domain: isHrgpDomain ? ".hrgp.in" : undefined,
  };
}

function setSessionCookie(request, response, token) {
  response.cookie("hrguru_session", token, {
    ...sessionCookieOptions(request),
    maxAge: 8 * 60 * 60 * 1000,
  });
}

function loginWindowError(user) {
  if (user.role !== "employee") return null;
  const ist = new Date(Date.now() + IST_OFFSET_MINUTES * 60000);
  const minutes = (ist.getUTCHours() * 60) + ist.getUTCMinutes();
  if (minutes < 510) return "Employee login opens at 8:30 AM.";
  if (minutes >= 1200) return "Employee login is closed after 8:00 PM.";
  return null;
}

function currentIstMonth() {
  const ist = new Date(Date.now() + IST_OFFSET_MINUTES * 60000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

async function attendanceRequestCount(employeeId, month = currentIstMonth()) {
  const { start, end } = monthRange(month);
  const latestReset = await prisma.attendanceLimitResetRequest.findFirst({
    where: { employeeId, month, status: "approved" },
    orderBy: { approvedAt: "desc" },
    select: { approvedAt: true, createdAt: true },
  });
  const resetAt = latestReset?.approvedAt || latestReset?.createdAt || null;
  return prisma.attendanceUpdateRequest.count({
    where: {
      employeeId,
      attendanceDate: { gte: start, lt: end },
      requestType: { not: "Working from 2nd Half" },
      ...(resetAt ? { createdAt: { gt: resetAt } } : {}),
    },
  });
}

async function attendanceLimitBlock(user) {
  if (user.role !== "employee" || !user.employee?.id) return null;
  const month = currentIstMonth();
  const requestCount = await attendanceRequestCount(user.employee.id, month);
  if (requestCount < ATTENDANCE_REQUEST_LIMIT) return null;
  return {
    month,
    requestCount,
    message: `Monthly attendance request limit reached: ${requestCount}/5. Please contact Admin.`,
  };
}

async function findActiveUserByLogin(login) {
  const normalized = login.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalized },
        { username: { equals: login.trim(), mode: "insensitive" } },
      ],
    },
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          designation: true,
          department: true,
          managerId: true,
        },
      },
    },
  });
  if (!user) throw httpError(401, "Invalid username/email or password.");
  if (user.status !== "active") throw httpError(403, "This user account is not active.");
  return user;
}

async function findActiveUserByEmail(email) {
  return findActiveUserByLogin(email);
}

function isAllowedGoogleAdminAlias(email) {
  return (process.env.GOOGLE_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

async function findGoogleUser(email) {
  try {
    const user = await findActiveUserByEmail(email);
    if (user.role !== "admin" && !isAllowedGoogleAdminAlias(email)) {
      throw httpError(403, "Google sign-in is available only for admin users.");
    }
    return user;
  } catch (error) {
    if (error.status !== 401 || !isAllowedGoogleAdminAlias(email)) throw error;
  }

  const admin = await prisma.user.findFirst({
    where: { role: "admin", status: "active" },
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          designation: true,
          department: true,
          managerId: true,
        },
      },
    },
  });
  if (!admin) {
    throw httpError(403, "Google sign-in is available only for admin users.");
  }
  return admin;
}

async function completeLogin(request, response, user) {
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = signSession(user);
  setSessionCookie(request, response, token);
  response.json({ token, user: publicUser(user) });
}

function userInclude() {
  return {
    employee: {
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        designation: true,
        department: true,
        managerId: true,
      },
    },
  };
}

function limitResetInclude() {
  return {
    employee: { select: { employeeCode: true, fullName: true } },
    approver: { select: { employee: { select: { fullName: true } }, email: true } },
  };
}

function publicLimitResetRequest(request) {
  return {
    id: request.id,
    employeeId: request.employee.employeeCode,
    employee: request.employee.fullName,
    month: request.month,
    requestCount: request.requestCount,
    justification: request.justification,
    status: request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Pending",
    approver: request.approver?.employee?.fullName || request.approver?.email || "",
    createdAt: request.createdAt?.toISOString().slice(0, 10) || "",
    approvedAt: request.approvedAt?.toISOString() || "",
  };
}

router.post("/login", async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success || !(parsed.data.login || parsed.data.email)) throw httpError(400, "Enter a valid username/email and password.");

    const user = await findActiveUserByLogin(parsed.data.login || parsed.data.email);
    const passwordOk = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!passwordOk) throw httpError(401, "Invalid username/email or password.");
    const windowMessage = loginWindowError(user);
    if (windowMessage) throw httpError(403, windowMessage);
    const limitBlock = await attendanceLimitBlock(user);
    if (limitBlock) {
      response.status(403).json({
        error: {
          message: limitBlock.message,
          status: 403,
          code: "attendance_limit_reached",
          requestCount: limitBlock.requestCount,
          month: limitBlock.month,
        },
      });
      return;
    }

    let loginDeviceId = null;
    try {
      loginDeviceId = await enforceLoginDevice(request);
    } catch (error) {
      await recordLoginEvent(request, { user, loginDeviceId: error.loginDeviceId || null, successful: false, blockedReason: error.message });
      throw error;
    }
    await recordLoginEvent(request, { user, loginDeviceId, successful: true });
    await completeLogin(request, response, user);
  } catch (error) {
    next(error);
  }
});

router.post("/google", async (request, response, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) throw httpError(503, "Google login is not configured.");

    const parsed = googleLoginSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Google login credential is missing.");

    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified === false) throw httpError(401, "Google account email is not verified.");

    const user = await findGoogleUser(payload.email);
    const windowMessage = loginWindowError(user);
    if (windowMessage) throw httpError(403, windowMessage);
    const limitBlock = await attendanceLimitBlock(user);
    if (limitBlock) {
      response.status(403).json({
        error: {
          message: limitBlock.message,
          status: 403,
          code: "attendance_limit_reached",
          requestCount: limitBlock.requestCount,
          month: limitBlock.month,
        },
      });
      return;
    }
    let loginDeviceId = null;
    try {
      loginDeviceId = await enforceLoginDevice(request);
    } catch (error) {
      await recordLoginEvent(request, { user, loginDeviceId: error.loginDeviceId || null, successful: false, blockedReason: error.message });
      throw error;
    }
    await recordLoginEvent(request, { user, loginDeviceId, successful: true });
    await completeLogin(request, response, user);
  } catch (error) {
    next(error);
  }
});

router.post("/google-availability", async (request, response, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      response.json({ available: false });
      return;
    }
    const parsed = googleAvailabilitySchema.safeParse(request.body);
    if (!parsed.success) {
      response.json({ available: false });
      return;
    }
    const user = await findActiveUserByLogin(parsed.data.login);
    response.json({ available: user.role === "admin" || isAllowedGoogleAdminAlias(user.email) });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      response.json({ available: false });
      return;
    }
    next(error);
  }
});

router.post("/attendance-limit-reset-request", async (request, response, next) => {
  try {
    const parsed = attendanceLimitResetSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Enter username/email, password, and a justification of at least 10 characters.");
    const user = await findActiveUserByLogin(parsed.data.login);
    const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!passwordOk) throw httpError(401, "Invalid username/email or password.");
    if (user.role !== "employee" || !user.employee?.id) throw httpError(400, "Attendance limit reset is available only for employee accounts.");
    const month = currentIstMonth();
    const requestCount = await attendanceRequestCount(user.employee.id, month);
    if (requestCount < ATTENDANCE_REQUEST_LIMIT) {
      response.json({ ok: true, message: `Your attendance request count is ${requestCount}/5. Reset is not required.` });
      return;
    }
    const existing = await prisma.attendanceLimitResetRequest.findFirst({
      where: { employeeId: user.employee.id, month, status: "pending" },
      include: limitResetInclude(),
    });
    if (existing) {
      response.json({ ok: true, message: "Your reset request is already pending with Admin.", request: publicLimitResetRequest(existing) });
      return;
    }
    const resetRequest = await prisma.attendanceLimitResetRequest.create({
      data: {
        employeeId: user.employee.id,
        month,
        requestCount,
        justification: parsed.data.justification.trim(),
      },
      include: limitResetInclude(),
    });
    response.status(201).json({ ok: true, message: "Reset request sent to Admin.", request: publicLimitResetRequest(resetRequest) });
  } catch (error) {
    next(error);
  }
});

router.get("/impersonation-targets", requireAuth, requireRole("admin"), async (_request, response, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: "active",
        employee: { isNot: null },
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        employee: {
          select: {
            employeeCode: true,
            fullName: true,
            designation: true,
            department: true,
            status: true,
          },
        },
      },
      orderBy: [{ employee: { fullName: "asc" } }],
    });
    response.json({ users: users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      employee: user.employee,
    })) });
  } catch (error) {
    next(error);
  }
});

router.post("/impersonate", requireAuth, requireRole("admin"), async (request, response, next) => {
  try {
    const parsed = impersonateSchema.safeParse(request.body);
    if (!parsed.success || (!parsed.data.userId && !parsed.data.login)) throw httpError(400, "Select a user profile to switch into.");
    const target = await prisma.user.findFirst({
      where: {
        status: "active",
        ...(parsed.data.userId
          ? { id: parsed.data.userId }
          : {
              OR: [
                { email: parsed.data.login.trim().toLowerCase() },
                { username: { equals: parsed.data.login.trim(), mode: "insensitive" } },
              ],
            }),
      },
      include: userInclude(),
    });
    if (!target) throw httpError(404, "User profile was not found.");
    if (target.id === request.user.id) throw httpError(400, "You are already using this profile.");

    const token = signSession(target, { impersonatedBy: request.user.impersonatedBy || request.user.id });
    setSessionCookie(request, response, token);
    response.json({ token, user: publicUser({ ...target, impersonatedBy: request.user.impersonatedBy || request.user.id }) });
  } catch (error) {
    next(error);
  }
});

router.post("/impersonate/stop", requireAuth, async (request, response, next) => {
  try {
    if (!request.user.impersonatedBy) throw httpError(400, "No admin impersonation session is active.");
    const admin = await prisma.user.findFirst({
      where: { id: request.user.impersonatedBy, role: "admin", status: "active" },
      include: userInclude(),
    });
    if (!admin) throw httpError(403, "Original admin session is no longer available.");

    const token = signSession(admin);
    setSessionCookie(request, response, token);
    response.json({ token, user: publicUser(admin) });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (request, response) => {
  response.clearCookie("hrguru_session", sessionCookieOptions(request));
  response.json({ ok: true });
});

router.get("/me", requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

router.post("/change-password", requireAuth, async (request, response, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Enter current password and a new password of at least 8 characters.");
    const passwordMessage = validatePassword(parsed.data.newPassword);
    if (passwordMessage) throw httpError(400, passwordMessage);
    if (parsed.data.currentPassword === parsed.data.newPassword) throw httpError(400, "New password must be different from current password.");

    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    const currentOk = user ? await bcrypt.compare(parsed.data.currentPassword, user.passwordHash) : false;
    if (!currentOk) throw httpError(401, "Current password is incorrect.");

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: request.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            designation: true,
            department: true,
            managerId: true,
          },
        },
      },
    });
    response.json({ user: publicUser(updated) });
  } catch (error) {
    next(error);
  }
});

router.post("/forgot-password", async (request, response, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Enter your username or email.");
    const normalized = parsed.data.login.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        status: "active",
        OR: [
          { email: normalized },
          { username: { equals: parsed.data.login.trim(), mode: "insensitive" } },
        ],
      },
      include: { employee: { select: { fullName: true } } },
    });

    let delivery = { status: "skipped" };
    let devResetLink = "";
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url");
      const link = resetLink(token);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: resetTokenHash(token),
          passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      delivery = await sendMail({
        to: user.email,
        subject: "Reset your HR Guru HRMS password",
        html: passwordResetHtml(user, link),
      });
      if (process.env.NODE_ENV !== "production" || delivery.deliveryMode?.includes("not_configured")) {
        devResetLink = link;
      }
    }

    response.json({
      ok: true,
      message: "If this account exists, password reset instructions have been sent.",
      delivery,
      resetLink: devResetLink,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", async (request, response, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Reset link is invalid or the new password is too short.");
    const passwordMessage = validatePassword(parsed.data.newPassword);
    if (passwordMessage) throw httpError(400, passwordMessage);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetTokenHash: resetTokenHash(parsed.data.token),
        passwordResetExpiresAt: { gt: new Date() },
        status: "active",
      },
    });
    if (!user) throw httpError(400, "Reset link is invalid or expired.");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
        mustChangePassword: false,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    response.json({ ok: true, message: "Password updated. Please sign in with your new password." });
  } catch (error) {
    next(error);
  }
});

export default router;
