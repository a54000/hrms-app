import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { httpError } from "../../lib/http-error.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();

const statusMap = {
  Present: "present",
  Remote: "remote",
  Late: "late",
  "Half Day": "half_day",
  Leave: "leave",
  Absent: "absent",
  Weekend: "weekend",
};

const statusLabelMap = Object.fromEntries(Object.entries(statusMap).map(([label, value]) => [value, label]));

const approvalLabelMap = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
const attendanceRequestTypes = ["Forgot to punch", "Working from 2nd Half"];
const attendanceRuleExemptNames = ["Surinder Singh"];
const IST_OFFSET_MINUTES = 330;
const ATTENDANCE_REQUEST_LIMIT = 5;
const ATTENDANCE_GO_LIVE_DATE = "2026-06-01";
const ATTENDANCE_GO_LIVE = new Date(`${ATTENDANCE_GO_LIVE_DATE}T00:00:00.000Z`);
const evidenceDir = new URL("../../../uploads/attendance-evidence/", import.meta.url);
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

const attendanceSchema = z.object({
  employeeCode: z.string().min(1),
  date: z.string().min(1),
  status: z.enum(["Present", "Remote", "Late", "Half Day", "Leave", "Absent", "Weekend"]),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  hours: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const requestSchema = z.object({
  employeeCode: z.string().min(1),
  date: z.string().min(1),
  requestType: z.string().optional().nullable(),
  punchType: z.enum(["Check in", "Checkout"]).optional().nullable(),
  status: z.enum(["Present", "Remote", "Late", "Half Day", "Leave", "Absent", "Weekend"]),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  hours: z.union([z.string(), z.number()]).optional().nullable(),
  reason: z.string().min(1),
  screenshotName: z.string().optional().nullable(),
  screenshotData: z.string().optional().nullable(),
  screenshotMimeType: z.string().optional().nullable(),
});

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function localDateString(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeString(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
  return `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

function minutesSinceMidnight(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function isAttendanceExempt(employee) {
  return attendanceRuleExemptNames.includes(employee.fullName);
}

function statusForHours(status, checkIn, checkOut, hours) {
  const minutes = durationMinutes(checkIn, checkOut, hours);
  if (checkOut && minutes !== null && minutes > 0 && minutes < 180) return "Leave";
  if (checkOut && minutes !== null && minutes >= 180 && minutes < 360) return "Half Day";
  return status;
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function toTime(value) {
  if (!value) return null;
  const [hours, minutes, seconds = "00"] = value.split(":");
  const utcMinutes = ((((Number(hours) * 60) + Number(minutes) - IST_OFFSET_MINUTES) % 1440) + 1440) % 1440;
  const utcHours = String(Math.floor(utcMinutes / 60)).padStart(2, "0");
  const utcMins = String(utcMinutes % 60).padStart(2, "0");
  return new Date(`1970-01-01T${utcHours}:${utcMins}:${seconds}.000Z`);
}

function toTimeString(value) {
  if (!value) return "";
  const utcHours = value.getUTCHours();
  const utcMinutes = value.getUTCMinutes();
  const istMinutes = ((((utcHours * 60) + utcMinutes + IST_OFFSET_MINUTES) % 1440) + 1440) % 1440;
  return `${String(Math.floor(istMinutes / 60)).padStart(2, "0")}:${String(istMinutes % 60).padStart(2, "0")}`;
}

function durationMinutes(checkIn, checkOut, hours) {
  if (hours !== undefined && hours !== null && hours !== "") return Math.round(Number(hours) * 60);
  if (!checkIn || !checkOut) return null;
  return attendanceTimeDifference(checkIn, checkOut);
}

function attendanceTimeDifference(checkIn, checkOut) {
  const [inHours, inMinutes] = checkIn.split(":").map(Number);
  const [outHours, outMinutes] = checkOut.split(":").map(Number);
  return ((outHours * 60) + outMinutes) - ((inHours * 60) + inMinutes);
}

function assertValidAttendanceTimes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return;
  if (attendanceTimeDifference(checkIn, checkOut) <= 0) {
    throw httpError(400, "Checkout time must be later than check-in time.");
  }
}

function durationHours(minutes) {
  if (!minutes) return "0";
  return String(Math.round((minutes / 60) * 100) / 100);
}

function attendanceSelect() {
  return {
    id: true,
    attendanceDate: true,
    status: true,
    checkIn: true,
    checkOut: true,
    durationMinutes: true,
    remarks: true,
    employee: { select: { employeeCode: true, fullName: true } },
  };
}

function requestSelect() {
  return {
    id: true,
    attendanceDate: true,
    requestedStatus: true,
    requestedCheckIn: true,
    requestedCheckOut: true,
    requestedDurationMinutes: true,
    requestType: true,
    reason: true,
    status: true,
    createdAt: true,
    employee: { select: { employeeCode: true, fullName: true } },
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
    status: approvalLabelMap[request.status],
    approver: request.approver?.employee?.fullName || request.approver?.email || "",
    createdAt: request.createdAt?.toISOString().slice(0, 10) || "",
    approvedAt: request.approvedAt?.toISOString() || "",
  };
}

function publicAttendance(record) {
  return {
    id: record.id,
    employeeId: record.employee.employeeCode,
    employee: record.employee.fullName,
    date: toDateString(record.attendanceDate),
    status: statusLabelMap[record.status] || "Present",
    checkIn: toTimeString(record.checkIn),
    checkOut: toTimeString(record.checkOut),
    hours: durationHours(record.durationMinutes),
    notes: record.remarks || "",
  };
}

function publicRequest(request) {
  return {
    id: request.id,
    employeeId: request.employee.employeeCode,
    employee: request.employee.fullName,
    date: toDateString(request.attendanceDate),
    statusValue: statusLabelMap[request.requestedStatus] || "Present",
    checkIn: toTimeString(request.requestedCheckIn),
    checkOut: toTimeString(request.requestedCheckOut),
    hours: durationHours(request.requestedDurationMinutes),
    requestType: request.requestType || "Attendance Correction",
    reason: request.reason,
    status: approvalLabelMap[request.status],
    createdAt: toDateString(request.createdAt),
    evidenceUrl: `/api/attendance/update-requests/${request.id}/evidence`,
  };
}

function regularizationCaseSelect() {
  return {
    id: true,
    attendanceDate: true,
    reason: true,
    status: true,
    resolution: true,
    dueAt: true,
    closedAt: true,
    notes: true,
    employee: { select: { id: true, employeeCode: true, fullName: true, client: true, managerId: true } },
    closedBy: { select: { email: true, employee: { select: { fullName: true } } } },
  };
}

function publicRegularizationCase(regularizationCase) {
  return {
    id: regularizationCase.id,
    employeeId: regularizationCase.employee.employeeCode,
    employee: regularizationCase.employee.fullName,
    client: regularizationCase.employee.client || "",
    date: toDateString(regularizationCase.attendanceDate),
    reason: regularizationCase.reason,
    status: regularizationCase.status,
    resolution: regularizationCase.resolution || "",
    dueAt: regularizationCase.dueAt?.toISOString() || "",
    closedAt: regularizationCase.closedAt?.toISOString() || "",
    closedBy: regularizationCase.closedBy?.employee?.fullName || regularizationCase.closedBy?.email || "",
    notes: regularizationCase.notes || "",
  };
}

function cleanFilePart(value, fallback = "screenshot") {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || fallback;
}

function screenshotExtension(mimeType, originalName) {
  const byMime = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  if (byMime[mimeType]) return byMime[mimeType];
  const ext = path.extname(cleanFilePart(originalName)).toLowerCase();
  return [".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(ext) ? ext : ".png";
}

function buildEvidencePayload(data) {
  if (!data.screenshotData) return null;
  const match = String(data.screenshotData).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw httpError(400, "Screenshot must be an image file.");
  const mimeType = data.screenshotMimeType || match[1];
  if (!mimeType.startsWith("image/")) throw httpError(400, "Screenshot must be an image file.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw httpError(400, "Screenshot file is empty.");
  if (bytes.length > MAX_SCREENSHOT_BYTES) throw httpError(400, "Screenshot must be smaller than 2 MB.");
  const extension = screenshotExtension(mimeType, data.screenshotName);
  return { bytes, extension, mimeType };
}

async function saveRequestEvidence(requestId, data, payload = buildEvidencePayload(data)) {
  if (!payload) return null;
  const fileName = `${requestId}${payload.extension}`;
  const meta = {
    fileName,
    originalName: cleanFilePart(data.screenshotName),
    mimeType: payload.mimeType,
    size: payload.bytes.length,
    uploadedAt: new Date().toISOString(),
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(new URL(fileName, evidenceDir), payload.bytes);
  await fs.writeFile(new URL(`${requestId}.json`, evidenceDir), JSON.stringify(meta, null, 2));
  return meta;
}

async function readRequestEvidenceMeta(requestId) {
  try {
    return JSON.parse(await fs.readFile(new URL(`${requestId}.json`, evidenceDir), "utf8"));
  } catch {
    return null;
  }
}

function publicLeaveDeduction(request) {
  if (!request) return null;
  return {
    id: request.id,
    employeeId: request.employee.employeeCode,
    employee: request.employee.fullName,
    type: request.leaveType,
    fromDate: toDateString(request.fromDate),
    toDate: toDateString(request.toDate),
    days: request.days?.toString() || "0",
    reason: request.reason || "",
    status: approvalLabelMap[request.status],
    approver: "System",
    createdAt: toDateString(request.createdAt),
  };
}

async function findEmployee(employeeCode) {
  const employee = await prisma.employee.findFirst({ where: { employeeCode }, orderBy: { legalEntity: "asc" } });
  if (!employee) throw httpError(404, "Employee not found.");
  return employee;
}

function monthRange(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start, end };
}

async function latestApprovedLimitReset(employeeId, month) {
  return prisma.attendanceLimitResetRequest.findFirst({
    where: { employeeId, month, status: "approved" },
    orderBy: { approvedAt: "desc" },
    select: { approvedAt: true, createdAt: true },
  });
}

async function countedAttendanceRequestCount(employeeId, month) {
  const { start, end } = monthRange(month);
  const latestReset = await latestApprovedLimitReset(employeeId, month);
  const resetAt = latestReset?.approvedAt || latestReset?.createdAt || null;
  return prisma.attendanceUpdateRequest.count({
    where: {
      employeeId,
      attendanceDate: { gte: start, lte: end },
      requestType: { not: "Working from 2nd Half" },
      ...(resetAt ? { createdAt: { gt: resetAt } } : {}),
    },
  });
}

async function latestOpenPriorAttendance(employeeId, beforeDate) {
  return prisma.attendanceRecord.findFirst({
    where: {
      employeeId,
      attendanceDate: { gte: ATTENDANCE_GO_LIVE, lt: beforeDate },
      checkIn: { not: null },
      checkOut: null,
    },
    orderBy: { attendanceDate: "desc" },
  });
}

async function upsertAttendance(input, userId) {
  const employee = await findEmployee(input.employeeCode);
  const checkIn = input.checkIn || "";
  const checkOut = input.checkOut || "";
  assertValidAttendanceTimes(checkIn, checkOut);
  const lateHalfDayCheckIn = !isAttendanceExempt(employee)
    && checkIn
    && minutesSinceMidnight(checkIn) >= minutesSinceMidnight("14:00");
  const finalStatus = lateHalfDayCheckIn ? "Half Day" : input.status;
  const finalNotes = lateHalfDayCheckIn
    ? [input.notes, "Auto half-day: check-in was after 2:00 PM."].filter(Boolean).join(" | ")
    : input.notes;
  const record = await prisma.attendanceRecord.upsert({
    where: {
      employeeId_attendanceDate: {
        employeeId: employee.id,
        attendanceDate: toDate(input.date),
      },
    },
    update: {
      status: statusMap[finalStatus],
      checkIn: toTime(checkIn),
      checkOut: toTime(checkOut),
      durationMinutes: durationMinutes(checkIn, checkOut, input.hours),
      remarks: finalNotes || null,
      updatedById: userId,
    },
    create: {
      employeeId: employee.id,
      attendanceDate: toDate(input.date),
      status: statusMap[finalStatus],
      checkIn: toTime(checkIn),
      checkOut: toTime(checkOut),
      durationMinutes: durationMinutes(checkIn, checkOut, input.hours),
      remarks: finalNotes || null,
      createdById: userId,
      updatedById: userId,
    },
    select: attendanceSelect(),
  });
  return record;
}

export async function applyAttendanceLeaveDeduction(employee, date, minutes, userId, db = prisma) {
  if (minutes === null || minutes <= 0 || minutes >= 360) return null;
  const attendanceDate = toDate(date);
  const days = minutes < 180 ? 1 : 0.5;
  const autoLeaveReasonPrefix = days === 1 ? "Auto full-day Casual Leave" : "Auto half-day Casual Leave";
  const existing = await db.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      leaveType: "Casual Leave",
      fromDate: attendanceDate,
      toDate: attendanceDate,
      reason: { startsWith: autoLeaveReasonPrefix },
      status: { in: ["pending", "approved"] },
    },
    select: { id: true },
  });
  if (existing) {
    const leaveRequest = await db.leaveRequest.findUnique({
      where: { id: existing.id },
      select: {
        id: true,
        leaveType: true,
        fromDate: true,
        toDate: true,
        days: true,
        reason: true,
        status: true,
        createdAt: true,
        employee: { select: { employeeCode: true, fullName: true } },
      },
    });
    const leaveBalance = await db.employeeLeaveBalance.upsert({
      where: { employeeId_leaveType: { employeeId: employee.id, leaveType: "Casual Leave" } },
      update: { balance: { decrement: days }, source: "auto_deduction", updatedById: userId },
      create: { employeeId: employee.id, leaveType: "Casual Leave", balance: -days, source: "auto_deduction", updatedById: userId },
    });
    await db.leaveBalanceTransaction.create({
      data: {
        employeeId: employee.id,
        leaveType: "Casual Leave",
        transactionDate: attendanceDate,
        amount: -days,
        balanceAfter: Number(leaveBalance.balance || 0),
        sourceType: "auto_deduction",
        sourceId: leaveRequest.id,
        notes: `${autoLeaveReasonPrefix} for attendance on ${toDateString(attendanceDate)}; deduction created from ${minutes} minutes worked`,
        createdById: userId,
      },
    });
    return leaveRequest;
  }
  const leaveRequest = await db.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveType: "Casual Leave",
      fromDate: attendanceDate,
      toDate: attendanceDate,
      days,
      reason: `${autoLeaveReasonPrefix}: worked ${days === 1 ? "less than 3 hours" : "less than 6 hours"} (${minutes} minutes)`,
      status: "approved",
      approverId: userId,
      approvedAt: new Date(),
    },
    select: {
      id: true,
      leaveType: true,
      fromDate: true,
      toDate: true,
      days: true,
      reason: true,
      status: true,
      createdAt: true,
      employee: { select: { employeeCode: true, fullName: true } },
    },
  });
  const leaveBalance = await db.employeeLeaveBalance.upsert({
    where: { employeeId_leaveType: { employeeId: employee.id, leaveType: "Casual Leave" } },
    update: { balance: { decrement: days }, source: "auto_deduction", updatedById: userId },
    create: { employeeId: employee.id, leaveType: "Casual Leave", balance: -days, source: "auto_deduction", updatedById: userId },
  });
  await db.leaveBalanceTransaction.create({
    data: {
      employeeId: employee.id,
      leaveType: "Casual Leave",
      transactionDate: attendanceDate,
      amount: -days,
      balanceAfter: Number(leaveBalance.balance || 0),
      sourceType: "auto_deduction",
      sourceId: leaveRequest.id,
      notes: `${autoLeaveReasonPrefix} for attendance on ${toDateString(attendanceDate)}; deduction created from ${minutes} minutes worked`,
      createdById: userId,
    },
  });
  return leaveRequest;
}

async function upsertAttendanceWithDeduction(input, userId) {
  const employee = await findEmployee(input.employeeCode);
  const checkIn = input.checkIn || "";
  const checkOut = input.checkOut || "";
  assertValidAttendanceTimes(checkIn, checkOut);
  const minutes = durationMinutes(checkIn, checkOut, input.hours);
  const autoStatus = minutes !== null && minutes > 0 && minutes < 180 ? "Leave" : "Half Day";
  const finalInput = checkOut && minutes !== null && minutes > 0 && minutes < 360
    ? { ...input, status: autoStatus, hours: String(Math.round((minutes / 60) * 100) / 100) }
    : input;
  const attendance = await upsertAttendance(finalInput, userId);
  const leaveDeduction = checkOut ? await applyAttendanceLeaveDeduction(employee, input.date, minutes, userId) : null;
  return { attendance, leaveDeduction };
}

router.use(requireAuth);

router.get("/", async (request, response, next) => {
  try {
    const month = request.query.month || new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);
    const [records, requests] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { attendanceDate: { gte: start, lte: end } },
        orderBy: [{ attendanceDate: "desc" }],
        select: attendanceSelect(),
      }),
      prisma.attendanceUpdateRequest.findMany({
        where: { attendanceDate: { gte: start, lte: end } },
        orderBy: [{ createdAt: "desc" }],
        select: requestSelect(),
      }),
    ]);
    response.json({ attendance: records.map(publicAttendance), requests: requests.map(publicRequest) });
  } catch (error) {
    next(error);
  }
});

router.get("/monthly", async (request, response, next) => {
  try {
    const month = request.query.month || new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);
    const records = await prisma.attendanceRecord.findMany({
      where: { attendanceDate: { gte: start, lte: end } },
      orderBy: [{ employee: { employeeCode: "asc" } }, { attendanceDate: "asc" }],
      select: attendanceSelect(),
    });
    response.json({ attendance: records.map(publicAttendance) });
  } catch (error) {
    next(error);
  }
});

router.post("/check-in", async (request, response, next) => {
  try {
    const employeeCode = request.user.employee?.employeeCode;
    if (!employeeCode) throw httpError(400, "User is not linked to an employee.");
    const employee = await findEmployee(employeeCode);
    const now = new Date();
    const today = localDateString(now);
    const time = localTimeString(now);
    if (!isAttendanceExempt(employee)) {
      const nowMinutes = minutesSinceMidnight(time);
      if (nowMinutes < minutesSinceMidnight("08:30")) throw httpError(400, "Check-in opens at 8:30 AM.");
      if (nowMinutes > minutesSinceMidnight("10:30")) throw httpError(400, "Check-in is allowed only till 10:30 AM. Raise a Forgot to punch request.");
      const openPrior = await latestOpenPriorAttendance(employee.id, toDate(today));
      if (openPrior) throw httpError(400, `Today's check-in is blocked because checkout is pending for ${toDateString(openPrior.attendanceDate)}. Open Attendance and raise a Forgot to punch checkout request for that date first.`);
    }
    const record = await upsertAttendance({
      employeeCode,
      date: today,
      status: "Present",
      checkIn: time,
      checkOut: "",
      hours: "",
      notes: "Self check-in",
    }, request.user.id);
    response.json({ attendance: publicAttendance(record) });
  } catch (error) {
    next(error);
  }
});

router.post("/check-out", async (request, response, next) => {
  try {
    const employeeCode = request.user.employee?.employeeCode;
    if (!employeeCode) throw httpError(400, "User is not linked to an employee.");
    const employee = await findEmployee(employeeCode);
    const now = new Date();
    const today = localDateString(now);
    const checkOut = localTimeString(now);
    if (!isAttendanceExempt(employee) && minutesSinceMidnight(checkOut) > minutesSinceMidnight("20:30")) {
      throw httpError(400, "Checkout cannot be marked after 8:30 PM.");
    }
    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_attendanceDate: { employeeId: employee.id, attendanceDate: toDate(today) } },
      select: attendanceSelect(),
    });
    if (!existing?.checkIn) throw httpError(400, "Check in must be marked before check out.");
    if (existing.checkOut) throw httpError(409, "Checkout is already marked for today.");
    const checkIn = toTimeString(existing.checkIn);
    const workedMinutes = durationMinutes(checkIn, checkOut, "");
    if (!isAttendanceExempt(employee) && workedMinutes !== null && workedMinutes < 120) {
      throw httpError(400, "Checkout is available only after 2 hours from check-in.");
    }
    const finalStatus = statusForHours(statusLabelMap[existing.status] || "Present", checkIn, checkOut, "");
    const { attendance, leaveDeduction } = await upsertAttendanceWithDeduction({
      employeeCode,
      date: today,
      status: finalStatus,
      checkIn,
      checkOut,
      hours: "",
      notes: existing.remarks || "Self check-out",
    }, request.user.id);
    response.json({ attendance: publicAttendance(attendance), leaveDeduction: publicLeaveDeduction(leaveDeduction) });
  } catch (error) {
    next(error);
  }
});

router.get("/limit-reset-requests", requireRole("admin"), async (request, response, next) => {
  try {
    const month = request.query.month || localDateString().slice(0, 7);
    const requests = await prisma.attendanceLimitResetRequest.findMany({
      where: { month },
      include: limitResetInclude(),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    response.json({ requests: requests.map(publicLimitResetRequest) });
  } catch (error) {
    next(error);
  }
});

router.patch("/limit-reset-requests/:id/approve", requireRole("admin"), async (request, response, next) => {
  try {
    const resetRequest = await prisma.attendanceLimitResetRequest.update({
      where: { id: request.params.id },
      data: { status: "approved", approverId: request.user.id, approvedAt: new Date() },
      include: limitResetInclude(),
    });
    response.json({ request: publicLimitResetRequest(resetRequest) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Limit reset request not found."));
    else next(error);
  }
});

router.patch("/limit-reset-requests/:id/reject", requireRole("admin"), async (request, response, next) => {
  try {
    const resetRequest = await prisma.attendanceLimitResetRequest.update({
      where: { id: request.params.id },
      data: { status: "rejected", approverId: request.user.id, approvedAt: new Date() },
      include: limitResetInclude(),
    });
    response.json({ request: publicLimitResetRequest(resetRequest) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Limit reset request not found."));
    else next(error);
  }
});

router.get("/regularization-cases", async (request, response, next) => {
  try {
    const status = request.query.status || undefined;
    const where = {
      ...(status && status !== "all" ? { status } : {}),
    };
    if (request.user.role === "employee") {
      where.employeeId = request.user.employee?.id || "";
    } else if (request.user.role === "manager") {
      where.employee = { managerId: request.user.employee?.id || "" };
    }
    const cases = await prisma.attendanceRegularizationCase.findMany({
      where,
      orderBy: [{ status: "asc" }, { attendanceDate: "desc" }],
      select: regularizationCaseSelect(),
    });
    response.json({ cases: cases.map(publicRegularizationCase) });
  } catch (error) {
    next(error);
  }
});

router.patch("/regularization-cases/:id/close", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const regularizationCase = await prisma.attendanceRegularizationCase.update({
      where: { id: request.params.id },
      data: {
        status: "regularized",
        resolution: request.body?.resolution || "admin_exception",
        closedAt: new Date(),
        closedById: request.user.id,
        notes: request.body?.notes || "Closed by Admin/HR.",
      },
      select: regularizationCaseSelect(),
    });
    response.json({ case: publicRegularizationCase(regularizationCase) });
  } catch (error) {
    next(error);
  }
});

router.post("/update-requests", async (request, response, next) => {
  try {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Attendance request details are incomplete.");
    const requestType = parsed.data.requestType || "Forgot to punch";
    if (!attendanceRequestTypes.includes(requestType)) throw httpError(400, "Only Forgot to punch and Working from 2nd Half requests are allowed.");
    if (request.user.role === "employee" && parsed.data.employeeCode !== request.user.employee?.employeeCode) {
      throw httpError(403, "Employees can raise attendance requests only for themselves.");
    }
    const employee = await findEmployee(parsed.data.employeeCode);
    if (requestType !== "Working from 2nd Half") {
      const requestCount = await countedAttendanceRequestCount(employee.id, parsed.data.date.slice(0, 7));
      if (requestCount >= ATTENDANCE_REQUEST_LIMIT) throw httpError(400, "Monthly attendance request limit reached: 5/5. Please contact Admin.");
    }
    if (requestType === "Forgot to punch") {
      if (!parsed.data.punchType) throw httpError(400, "Select whether the missed punch was Check in or Checkout.");
      if (parsed.data.punchType === "Check in" && !parsed.data.checkIn) throw httpError(400, "Check-in time is required.");
      if (parsed.data.punchType === "Checkout" && !parsed.data.checkOut) throw httpError(400, "Checkout time is required.");
      const duplicateRequest = await prisma.attendanceUpdateRequest.findFirst({
        where: {
          employeeId: employee.id,
          attendanceDate: toDate(parsed.data.date),
          requestType: `${requestType} - ${parsed.data.punchType}`,
          status: { in: ["pending", "approved"] },
        },
        select: { id: true },
      });
      if (duplicateRequest) {
        throw httpError(409, `A ${parsed.data.punchType.toLowerCase()} punch request for this date was already raised.`);
      }
    }
    const existingAttendance = await prisma.attendanceRecord.findUnique({
      where: { employeeId_attendanceDate: { employeeId: employee.id, attendanceDate: toDate(parsed.data.date) } },
      select: attendanceSelect(),
    });
    const existingCheckIn = existingAttendance ? toTimeString(existingAttendance.checkIn) : "";
    const existingCheckOut = existingAttendance ? toTimeString(existingAttendance.checkOut) : "";
    if (existingCheckIn && existingCheckOut) {
      throw httpError(409, "Attendance is already completed for this date. No further attendance request can be raised.");
    }
    if (requestType === "Working from 2nd Half" && existingAttendance?.checkIn) {
      throw httpError(400, "Working from 2nd Half is not needed after check-in is already marked.");
    }
    if (requestType === "Forgot to punch" && parsed.data.punchType === "Check in" && existingCheckIn) {
      throw httpError(409, "Check-in is already marked for this date.");
    }
    if (requestType === "Forgot to punch" && parsed.data.punchType === "Checkout" && existingCheckOut) {
      throw httpError(409, "Checkout is already marked for this date.");
    }
    const serverCheckIn = request.user.role === "employee" &&
      requestType === "Forgot to punch" &&
      parsed.data.punchType === "Check in" &&
      parsed.data.date === localDateString()
      ? localTimeString()
      : parsed.data.checkIn;
    const checkIn = requestType === "Forgot to punch" && parsed.data.punchType === "Checkout"
      ? (parsed.data.checkIn || existingCheckIn)
      : serverCheckIn;
    const checkOut = requestType === "Forgot to punch" && parsed.data.punchType === "Check in"
      ? ""
      : parsed.data.checkOut;
    assertValidAttendanceTimes(checkIn, checkOut);
    const finalStatus = statusForHours(parsed.data.status, checkIn, checkOut, parsed.data.hours);
    const evidencePayload = buildEvidencePayload(parsed.data);
    const requestRecord = await prisma.attendanceUpdateRequest.create({
      data: {
        employeeId: employee.id,
        attendanceDate: toDate(parsed.data.date),
        requestedStatus: statusMap[finalStatus],
        requestedCheckIn: toTime(checkIn),
        requestedCheckOut: toTime(checkOut),
        requestedDurationMinutes: durationMinutes(checkIn, checkOut, parsed.data.hours),
        requestType: parsed.data.punchType ? `${requestType} - ${parsed.data.punchType}` : requestType,
        reason: parsed.data.reason,
        status: "approved",
        approverId: request.user.id,
        approvedAt: new Date(),
      },
      select: requestSelect(),
    });
    await saveRequestEvidence(requestRecord.id, parsed.data, evidencePayload);
    const result = await upsertAttendanceWithDeduction({
      employeeCode: employee.employeeCode,
      date: parsed.data.date,
      status: finalStatus,
      checkIn,
      checkOut,
      hours: parsed.data.hours,
      notes: `Auto-approved request: ${requestType}${parsed.data.punchType ? ` (${parsed.data.punchType})` : ""}. ${parsed.data.reason}`,
    }, request.user.id);
    response.status(201).json({ request: publicRequest(requestRecord), attendance: publicAttendance(result.attendance), leaveDeduction: publicLeaveDeduction(result.leaveDeduction) });
  } catch (error) {
    next(error);
  }
});

router.get("/update-requests/:id/evidence", requireRole("admin", "hr", "manager"), async (request, response, next) => {
  try {
    const requestRecord = await prisma.attendanceUpdateRequest.findUnique({
      where: { id: request.params.id },
      select: { id: true },
    });
    if (!requestRecord) throw httpError(404, "Attendance request not found.");
    const meta = await readRequestEvidenceMeta(request.params.id);
    if (!meta) throw httpError(404, "Screenshot evidence not found.");
    response.type(meta.mimeType);
    response.sendFile(fileURLToPath(new URL(meta.fileName, evidenceDir)));
  } catch (error) {
    next(error);
  }
});

async function decideRequest(id, status, approverId) {
  const requestRecord = await prisma.attendanceUpdateRequest.findUnique({
    where: { id },
    include: { employee: true },
  });
  if (!requestRecord) throw httpError(404, "Attendance request not found.");

  const updatedRequest = await prisma.attendanceUpdateRequest.update({
    where: { id },
    data: {
      status,
      approverId,
      approvedAt: new Date(),
    },
    select: requestSelect(),
  });

  let attendance = null;
  let leaveDeduction = null;
  if (status === "approved") {
    const result = await upsertAttendanceWithDeduction({
      employeeCode: requestRecord.employee.employeeCode,
      date: toDateString(requestRecord.attendanceDate),
      status: statusLabelMap[requestRecord.requestedStatus] || "Present",
      checkIn: toTimeString(requestRecord.requestedCheckIn),
      checkOut: toTimeString(requestRecord.requestedCheckOut),
      hours: durationHours(requestRecord.requestedDurationMinutes),
      notes: `Approved correction: ${requestRecord.reason}`,
    }, approverId);
    attendance = publicAttendance(result.attendance);
    leaveDeduction = publicLeaveDeduction(result.leaveDeduction);
  }

  return { request: publicRequest(updatedRequest), attendance, leaveDeduction };
}

router.patch("/update-requests/:id/approve", requireRole("admin", "hr", "manager"), async (request, response, next) => {
  try {
    response.json(await decideRequest(request.params.id, "approved", request.user.id));
  } catch (error) {
    next(error);
  }
});

router.patch("/update-requests/:id/reject", requireRole("admin", "hr", "manager"), async (request, response, next) => {
  try {
    response.json(await decideRequest(request.params.id, "rejected", request.user.id));
  } catch (error) {
    next(error);
  }
});

router.patch("/regularize-day", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = z.object({
      employeeCode: z.string().min(1),
      date: z.string().min(1),
      checkIn: z.string().optional().nullable(),
      checkOut: z.string().optional().nullable(),
      hours: z.union([z.string(), z.number()]).optional().nullable(),
      notes: z.string().optional().nullable(),
    }).safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Regularization details are invalid.");

    const employee = await findEmployee(parsed.data.employeeCode);
    const attendanceDate = toDate(parsed.data.date);
    const checkIn = parsed.data.checkIn || "09:30";
    const checkOut = parsed.data.checkOut || "";
    assertValidAttendanceTimes(checkIn, checkOut);
    const duration = durationMinutes(checkIn, checkOut, parsed.data.hours);
    const attendance = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate,
        },
      },
      update: {
        status: "present",
        checkIn: toTime(checkIn),
        checkOut: toTime(checkOut),
        durationMinutes: duration,
        remarks: parsed.data.notes || "Admin regularized attendance; auto CL not applicable",
        updatedById: request.user.id,
      },
      create: {
        employeeId: employee.id,
        attendanceDate,
        status: "present",
        checkIn: toTime(checkIn),
        checkOut: toTime(checkOut),
        durationMinutes: duration,
        source: "admin",
        remarks: parsed.data.notes || "Admin regularized attendance; auto CL not applicable",
        createdById: request.user.id,
        updatedById: request.user.id,
      },
      select: attendanceSelect(),
    });

    const rejectedLeaveRequests = await prisma.leaveRequest.updateMany({
      where: {
        employeeId: employee.id,
        leaveType: "Casual Leave",
        fromDate: attendanceDate,
        toDate: attendanceDate,
        reason: { startsWith: "Auto" },
        status: "approved",
      },
      data: {
        status: "rejected",
        reason: `Admin correction: auto CL not counted for ${parsed.data.date}`,
        updatedAt: new Date(),
      },
    });

    response.json({
      attendance: publicAttendance(attendance),
      rejectedLeaveCount: rejectedLeaveRequests.count,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = attendanceSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Attendance details are invalid.");
    const result = await upsertAttendanceWithDeduction(parsed.data, request.user.id);
    response.json({ attendance: publicAttendance(result.attendance), leaveDeduction: publicLeaveDeduction(result.leaveDeduction) });
  } catch (error) {
    next(error);
  }
});

export default router;
