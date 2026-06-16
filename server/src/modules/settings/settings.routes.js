import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { httpError } from "../../lib/http-error.js";
import { getDeviceKey, getRequestIp, getSecuritySetting, publicDevice, publicLoginEvent, deviceFingerprint, deviceMetadata } from "../../lib/login-devices.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();

const policySchema = z.object({
  loginDeviceRestrictionEnabled: z.boolean(),
});

const deviceSchema = z.object({
  deviceKey: z.string().min(12),
  label: z.string().min(1).max(80).optional(),
});

const deviceStatusSchema = z.object({
  isActive: z.boolean(),
});

const userCreateSchema = z.object({
  employeeCode: z.string().min(1),
  email: z.string().email().optional().nullable(),
  username: z.string().min(3).max(80).optional().nullable(),
  role: z.enum(["admin", "hr", "manager", "employee"]).default("employee"),
  status: z.enum(["active", "inactive", "locked"]).default("active"),
  password: z.string().min(8).optional().nullable(),
  mustChangePassword: z.boolean().default(true),
});

const userResetSchema = z.object({
  password: z.string().min(8).optional().nullable(),
  mustChangePassword: z.boolean().default(true),
});

function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "@#$%";
  const required = [
    alphabet[crypto.randomInt(0, 24)],
    alphabet[crypto.randomInt(24, 47)],
    alphabet[crypto.randomInt(47, alphabet.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];
  const rest = Array.from({ length: 8 }, () => (alphabet + symbols)[crypto.randomInt(0, alphabet.length + symbols.length)]);
  return [...required, ...rest].sort(() => crypto.randomInt(0, 3) - 1).join("");
}

function usernameFromEmployee(employee) {
  const emailUser = employee.email?.split("@")[0];
  return (emailUser || employee.fullName || employee.employeeCode)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    || employee.employeeCode.toLowerCase();
}

async function availableUsername(baseUsername) {
  let candidate = baseUsername;
  let suffix = 2;
  while (await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })) {
    candidate = `${baseUsername}.${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function publicUserAdmin(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username || "",
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt?.toISOString() || "",
    createdAt: user.createdAt?.toISOString() || "",
    employee: user.employee ? {
      employeeCode: user.employee.employeeCode,
      fullName: user.employee.fullName,
      email: user.employee.email,
      status: user.employee.status,
      designation: user.employee.designation,
      department: user.employee.department,
    } : null,
  };
}

async function findEmployeeForLogin(value) {
  const query = value.trim();
  const normalized = query.toLowerCase();
  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { employeeCode: { equals: query, mode: "insensitive" } },
        { email: { equals: normalized } },
        { fullName: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      status: true,
      designation: true,
      department: true,
    },
  });
  if (!employee) throw httpError(404, "Employee record not found. Use employee code, employee email, or name from Employee Master.");
  return employee;
}

router.use(requireAuth);
router.use(requireRole("admin", "hr"));

router.get("/roles", (_request, response) => response.status(501).json({ error: { message: "Roles are not implemented yet.", status: 501 } }));
router.patch("/users/:id/role", (_request, response) => response.status(501).json({ error: { message: "Role update is not implemented yet.", status: 501 } }));
router.get("/audit-logs", (_request, response) => response.status(501).json({ error: { message: "Audit logs are not implemented yet.", status: 501 } }));

router.get("/users", async (_request, response, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      include: {
        employee: {
          select: {
            employeeCode: true,
            fullName: true,
            email: true,
            status: true,
            designation: true,
            department: true,
          },
        },
      },
    });
    response.json({ users: users.map(publicUserAdmin) });
  } catch (error) {
    next(error);
  }
});

router.post("/users", async (request, response, next) => {
  try {
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "User details are incomplete.");

    const employee = await findEmployeeForLogin(parsed.data.employeeCode);

    const email = (parsed.data.email || employee.email || "").trim().toLowerCase();
    if (!email) throw httpError(400, "Employee email is required to create a login user.");
    const requestedUsername = parsed.data.username?.trim();
    const username = requestedUsername || await availableUsername(usernameFromEmployee(employee));
    const existingEmailUser = await prisma.user.findUnique({ where: { email }, select: { id: true, employeeId: true } });
    if (existingEmailUser && existingEmailUser.employeeId && existingEmailUser.employeeId !== employee.id) {
      throw httpError(409, "Login email is already used by another employee.");
    }
    if (requestedUsername) {
      const existingUsernameUser = await prisma.user.findUnique({ where: { username }, select: { id: true, employeeId: true } });
      if (existingUsernameUser && existingUsernameUser.employeeId !== employee.id) {
        throw httpError(409, "Username is already used by another login user. Choose a different username.");
      }
    }
    const password = parsed.data.password || randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        employeeId: employee.id,
        username,
        passwordHash,
        role: parsed.data.role,
        status: parsed.data.status,
        mustChangePassword: parsed.data.mustChangePassword,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      create: {
        employeeId: employee.id,
        email,
        username,
        passwordHash,
        role: parsed.data.role,
        status: parsed.data.status,
        mustChangePassword: parsed.data.mustChangePassword,
      },
      include: {
        employee: {
          select: {
            employeeCode: true,
            fullName: true,
            email: true,
            status: true,
            designation: true,
            department: true,
          },
        },
      },
    });
    response.status(201).json({ user: publicUserAdmin(user), temporaryPassword: password });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Email or username is already used by another login user."));
    else next(error);
  }
});

router.patch("/users/:id/password", async (request, response, next) => {
  try {
    const parsed = userResetSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Password reset details are invalid.");
    const password = parsed.data.password || randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { id: request.params.id },
      data: {
        passwordHash,
        mustChangePassword: parsed.data.mustChangePassword,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        status: "active",
      },
      include: {
        employee: {
          select: {
            employeeCode: true,
            fullName: true,
            email: true,
            status: true,
            designation: true,
            department: true,
          },
        },
      },
    });
    response.json({ user: publicUserAdmin(user), temporaryPassword: password });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Login user not found."));
    else next(error);
  }
});

router.delete("/users/:id", async (request, response, next) => {
  try {
    if (request.params.id === request.user.id) throw httpError(400, "You cannot delete your own login user.");
    const user = await prisma.user.delete({
      where: { id: request.params.id },
      select: { id: true, email: true, username: true },
    });
    response.json({ ok: true, user });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Login user not found."));
    else next(error);
  }
});

router.get("/login-devices", async (request, response, next) => {
  try {
    const setting = await getSecuritySetting();
    const currentDeviceKey = getDeviceKey(request);
    const currentFingerprint = currentDeviceKey ? deviceFingerprint(currentDeviceKey) : "";
    const devices = await prisma.loginDevice.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: { approvedBy: { select: { id: true, email: true, username: true } } },
    });
    const loginEvents = await prisma.loginEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        user: {
          select: {
            email: true,
            username: true,
            employee: { select: { fullName: true } },
          },
        },
      },
    });
    const currentDevice = currentFingerprint
      ? devices.find((device) => device.fingerprintHash === currentFingerprint)
      : null;

    response.json({
      policy: { loginDeviceRestrictionEnabled: setting.loginDeviceRestrictionEnabled },
      currentDevice: currentDevice ? publicDevice(currentDevice) : null,
      devices: devices.map(publicDevice),
      loginEvents: loginEvents.map(publicLoginEvent),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/login-devices/policy", async (request, response, next) => {
  try {
    const parsed = policySchema.parse(request.body);
    if (parsed.loginDeviceRestrictionEnabled) {
      const currentDeviceKey = getDeviceKey(request);
      const currentDevice = currentDeviceKey
        ? await prisma.loginDevice.findUnique({ where: { fingerprintHash: deviceFingerprint(currentDeviceKey) } })
        : null;
      if (!currentDevice?.isActive) {
        throw httpError(400, "Approve this machine before enabling login device restriction.");
      }
    }
    const setting = await prisma.securitySetting.upsert({
      where: { id: "default" },
      update: { loginDeviceRestrictionEnabled: parsed.loginDeviceRestrictionEnabled },
      create: { id: "default", loginDeviceRestrictionEnabled: parsed.loginDeviceRestrictionEnabled },
    });
    response.json({ policy: { loginDeviceRestrictionEnabled: setting.loginDeviceRestrictionEnabled } });
  } catch (error) {
    next(error);
  }
});

router.post("/login-devices/current", async (request, response, next) => {
  try {
    const parsed = deviceSchema.parse({
      ...request.body,
      deviceKey: request.body?.deviceKey || getDeviceKey(request),
    });
    const metadata = deviceMetadata(request);
    const fingerprintHash = deviceFingerprint(parsed.deviceKey);
    const device = await prisma.loginDevice.upsert({
      where: { fingerprintHash },
      update: {
        label: parsed.label || "Approved HRMS device",
        deviceKey: parsed.deviceKey,
        isActive: true,
        deviceName: metadata.deviceName,
        deviceType: metadata.deviceType,
        platform: metadata.platform,
        browser: metadata.browser,
        lastSeenAt: new Date(),
        lastIpAddress: getRequestIp(request),
        lastLocation: metadata.location,
        lastUserAgent: metadata.userAgent,
        approvedById: request.user.id,
        approvedAt: new Date(),
      },
      create: {
        label: parsed.label || "Approved HRMS device",
        deviceKey: parsed.deviceKey,
        fingerprintHash,
        isActive: true,
        deviceName: metadata.deviceName,
        deviceType: metadata.deviceType,
        platform: metadata.platform,
        browser: metadata.browser,
        lastSeenAt: new Date(),
        lastIpAddress: getRequestIp(request),
        lastLocation: metadata.location,
        lastUserAgent: metadata.userAgent,
        approvedById: request.user.id,
        approvedAt: new Date(),
      },
      include: { approvedBy: { select: { id: true, email: true, username: true } } },
    });
    response.status(201).json({ device: publicDevice(device) });
  } catch (error) {
    next(error);
  }
});

router.patch("/login-devices/:id", async (request, response, next) => {
  try {
    const parsed = deviceStatusSchema.parse(request.body);
    const device = await prisma.loginDevice.update({
      where: { id: request.params.id },
      data: { isActive: parsed.isActive },
      include: { approvedBy: { select: { id: true, email: true, username: true } } },
    });
    response.json({ device: publicDevice(device) });
  } catch (error) {
    next(error);
  }
});

export default router;
