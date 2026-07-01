import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const RealDate = Date;

function installFixedClock(isoString) {
  const fixed = new RealDate(isoString);
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(fixed);
      return new RealDate(...args);
    }

    static now() {
      return fixed.getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  };
}

function restoreClock() {
  global.Date = RealDate;
}

function readSetCookie(headers) {
  const cookies = headers.getSetCookie?.() || headers.raw?.()["set-cookie"] || [];
  return Array.isArray(cookies) ? cookies.map((cookie) => cookie.split(";")[0]).join("; ") : "";
}

test("login creates a session and check-in must still be done explicitly", async () => {
  const suffix = `${Date.now()}`;
  const employeeCode = `TCHK${suffix.slice(-4)}`;
  const email = `checkin.${suffix}@hrguru.test`;
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);
  const employee = await prisma.employee.create({
    data: {
      employeeCode,
      legalEntity: "HRGP",
      fullName: "Test Checkin",
      email,
      designation: "Executive",
      department: "Operations",
      status: "active",
      joinDate: new RealDate("2026-06-01T00:00:00.000Z"),
      workMode: "Office",
    },
  });
  await prisma.user.create({
    data: {
      email,
      username: `checkin.${suffix}`,
      passwordHash,
      role: "employee",
      employeeId: employee.id,
      status: "active",
    },
  });
  const securitySetting = await prisma.securitySetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  await prisma.securitySetting.update({
    where: { id: "default" },
    data: { loginDeviceRestrictionEnabled: false },
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  installFixedClock("2026-07-01T03:45:00.000Z");

  try {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-HRMS-Device-ID": `device-${suffix}` },
      body: JSON.stringify({ login: email, password, deviceKey: `device-${suffix}`, deviceInfo: { deviceName: "Integration Test Device" } }),
    });
    const loginBody = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.user.email, email);

    const cookie = readSetCookie(loginResponse.headers);
    assert.ok(cookie.includes("hrguru_session="), "Login should issue a session cookie.");

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
      credentials: "include",
    });
    const meBody = await meResponse.json();
    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.email, email);

    const checkInResponse = await fetch(`${baseUrl}/api/attendance/check-in`, {
      method: "POST",
      headers: { Cookie: cookie },
      credentials: "include",
    });
    const checkInBody = await checkInResponse.json();
    assert.equal(checkInResponse.status, 200);
    assert.equal(checkInBody.attendance.status, "Present");
    assert.equal(checkInBody.attendance.date, "2026-07-01");
    assert.ok(checkInBody.attendance.checkIn, "Check-in time should be recorded explicitly after login.");
  } finally {
    restoreClock();
    await prisma.securitySetting.update({
      where: { id: "default" },
      data: { loginDeviceRestrictionEnabled: securitySetting.loginDeviceRestrictionEnabled },
    });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.employee.deleteMany({ where: { id: employee.id } });
    await new Promise((resolve) => server.close(resolve));
  }
});
