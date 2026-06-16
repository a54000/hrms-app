import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { sendMail } from "../lib/mailer.js";
import { prisma } from "../lib/prisma.js";

dotenv.config();

const IST_OFFSET_MINUTES = 330;
const DEFAULT_EXEMPT_EMAILS = [];
const ATTENDANCE_GO_LIVE_DATE = "2026-06-01";

function istDateParts(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
  };
}

function dateStringFromParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultTargetDate() {
  return addDays(dateStringFromParts(istDateParts()), -1);
}

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dueAtForDate(dateString) {
  const dueAt = toDate(dateString);
  dueAt.setUTCDate(dueAt.getUTCDate() + 2);
  dueAt.setUTCHours(4, 30, 0, 0);
  return dueAt;
}

function isSunday(dateString) {
  return toDate(dateString).getUTCDay() === 0;
}

function isSaturday(dateString) {
  return toDate(dateString).getUTCDay() === 6;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowHtml(row) {
  return `<tr><td>${htmlEscape(row.employeeCode)}</td><td>${htmlEscape(row.fullName)}</td><td>${htmlEscape(row.email)}</td><td>${htmlEscape(row.department)}</td><td>${htmlEscape(row.manager || "-")}</td><td>${htmlEscape(row.reason)}</td></tr>`;
}

function adminHtml(targetDate, rows) {
  const body = rows.length
    ? rows.map(rowHtml).join("")
    : `<tr><td colspan="6">No missing attendance found.</td></tr>`;
  return `
    <p>Attendance non-compliance report for <strong>${htmlEscape(targetDate)}</strong>.</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Code</th><th>Employee</th><th>Email</th><th>Department</th><th>Manager</th><th>Reason</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function employeeHtml(employee, targetDate) {
  return `
    <p>Hi ${htmlEscape(employee.fullName)},</p>
    <p>Your attendance was not marked for <strong>${htmlEscape(targetDate)}</strong>.</p>
    <p>Please raise a leave request in HRMS for this day. If this is not regularized within 48 hours, HRMS may auto-regularize the day as Casual Leave, even if it creates a negative leave balance.</p>
  `;
}

function employeeRegularizedHtml(employee, targetDate) {
  return `
    <p>Hi ${htmlEscape(employee.fullName)},</p>
    <p>Your attendance was not marked for <strong>${htmlEscape(targetDate)}</strong>, and the 48-hour regularization window has passed.</p>
    <p>HRMS has auto-regularized this as Casual Leave. This can create a negative Casual Leave balance if your quota is not available.</p>
  `;
}

async function adminRecipients() {
  const configured = (process.env.HRMS_ATTENDANCE_ADMIN_EMAILS || process.env.GOOGLE_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const users = await prisma.user.findMany({
    where: {
      status: "active",
      role: { in: ["admin", "hr"] },
    },
    select: { email: true },
  });
  return Array.from(new Set([...configured, ...users.map((user) => user.email)].filter(Boolean)));
}

async function missingAttendanceRows(targetDate) {
  if (targetDate < ATTENDANCE_GO_LIVE_DATE) return [];
  if (isSunday(targetDate)) return [];
  const date = toDate(targetDate);
  const exemptEmails = new Set(
    (process.env.HRMS_ATTENDANCE_EXEMPT_EMAILS || DEFAULT_EXEMPT_EMAILS.join(","))
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
  const [employees, attendance, leaves, holidays, saturdayRota] = await Promise.all([
    prisma.employee.findMany({
      where: {
        status: { in: ["active", "probation", "on_leave"] },
        user: { status: "active", role: "employee" },
      },
      include: {
        manager: { select: { fullName: true } },
      },
      orderBy: [{ employeeCode: "asc" }],
    }),
    prisma.attendanceRecord.findMany({
      where: { attendanceDate: date },
      select: { employeeId: true, checkIn: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: "approved",
        fromDate: { lte: date },
        toDate: { gte: date },
      },
      select: { employeeId: true },
    }),
    prisma.holiday.findMany({
      where: {
        isActive: true,
        holidayDate: date,
      },
      select: { id: true },
    }),
    prisma.saturdayRotaAssignment.findMany({
      where: {
        isWorking: true,
        rotaDate: date,
      },
      select: { employeeId: true },
    }),
  ]);
  if (holidays.length) return [];

  const attendanceByEmployee = new Map(attendance.map((record) => [record.employeeId, record]));
  const leaveEmployeeIds = new Set(leaves.map((leave) => leave.employeeId));
  const saturdayEmployeeIds = new Set(saturdayRota.map((assignment) => assignment.employeeId));

  return employees
    .filter((employee) => !exemptEmails.has(String(employee.email || "").toLowerCase()))
    .filter((employee) => !isSaturday(targetDate) || saturdayEmployeeIds.has(employee.id))
    .filter((employee) => !leaveEmployeeIds.has(employee.id))
    .filter((employee) => !attendanceByEmployee.get(employee.id)?.checkIn)
    .map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      department: employee.department,
      manager: employee.manager?.fullName || "",
      reason: attendanceByEmployee.has(employee.id) ? "Attendance row exists without check-in" : "No attendance marked",
    }));
}

function isPastRegularizationWindow(targetDate) {
  return targetDate <= addDays(dateStringFromParts(istDateParts()), -2);
}

async function regularizationApproverId() {
  const approver = await prisma.user.findFirst({
    where: { status: "active", role: { in: ["admin", "hr"] } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return approver?.id || null;
}

async function autoRegularizeMissingAttendance(targetDate, rows) {
  if (!isPastRegularizationWindow(targetDate) || !rows.length) return [];
  const date = toDate(targetDate);
  const approverId = await regularizationApproverId();
  const regularized = [];

  for (const row of rows) {
    const [existingAttendance, existingLeave] = await Promise.all([
      prisma.attendanceRecord.findUnique({
        where: { employeeId_attendanceDate: { employeeId: row.id, attendanceDate: date } },
        select: { id: true, checkIn: true },
      }),
      prisma.leaveRequest.findFirst({
        where: {
          employeeId: row.id,
          status: { in: ["pending", "approved"] },
          fromDate: { lte: date },
          toDate: { gte: date },
        },
        select: { id: true },
      }),
    ]);
    if (existingAttendance?.checkIn || existingLeave) continue;

    const { leave } = await prisma.$transaction(async (tx) => {
      const leave = await tx.leaveRequest.create({
        data: {
          employeeId: row.id,
          leaveType: "Casual Leave",
          fromDate: date,
          toDate: date,
          days: 1,
          reason: "Auto regularized after 48 hours: attendance not marked",
          status: "approved",
          approverId,
          approvedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.employeeLeaveBalance.upsert({
        where: {
          employeeId_leaveType: {
            employeeId: row.id,
            leaveType: "Casual Leave",
          },
        },
        update: {
          balance: { decrement: 1 },
          source: "auto_regularization",
          notes: `Reduced by 1 for auto-regularized attendance on ${targetDate}. Leave request ${leave.id}.`,
          updatedById: approverId,
        },
        create: {
          employeeId: row.id,
          leaveType: "Casual Leave",
          balance: -1,
          source: "auto_regularization",
          notes: `Reduced by 1 for auto-regularized attendance on ${targetDate}. Leave request ${leave.id}.`,
          updatedById: approverId,
        },
      });

      await tx.attendanceRegularizationCase.upsert({
        where: {
          employeeId_attendanceDate_reason: {
            employeeId: row.id,
            attendanceDate: date,
            reason: "missing_attendance",
          },
        },
        update: {
          status: "auto_closed",
          resolution: "casual_leave_auto_applied",
          closedAt: new Date(),
          closedById: approverId,
          notes: `Auto-regularized as Casual Leave after 48 hours. Leave request ${leave.id}.`,
        },
        create: {
          employeeId: row.id,
          attendanceDate: date,
          reason: "missing_attendance",
          status: "auto_closed",
          resolution: "casual_leave_auto_applied",
          dueAt: dueAtForDate(targetDate),
          closedAt: new Date(),
          closedById: approverId,
          notes: `Auto-regularized as Casual Leave after 48 hours. Leave request ${leave.id}.`,
        },
      });

      return { leave };
    });
    regularized.push({ ...row, leaveRequestId: leave.id });
  }

  return regularized;
}

async function syncRegularizationCases(targetDate, rows) {
  const date = toDate(targetDate);
  const rowIds = new Set(rows.map((row) => row.id));
  const [approvedLeaves, openCases] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        status: "approved",
        fromDate: { lte: date },
        toDate: { gte: date },
      },
      select: { employeeId: true, id: true },
    }),
    prisma.attendanceRegularizationCase.findMany({
      where: {
        attendanceDate: date,
        reason: "missing_attendance",
        status: { in: ["open", "employee_notified", "admin_notified"] },
      },
      select: { id: true, employeeId: true },
    }),
  ]);
  const leaveByEmployee = new Map(approvedLeaves.map((leave) => [leave.employeeId, leave.id]));

  for (const row of rows) {
    await prisma.attendanceRegularizationCase.upsert({
      where: {
        employeeId_attendanceDate_reason: {
          employeeId: row.id,
          attendanceDate: date,
          reason: "missing_attendance",
        },
      },
      update: {
        status: "employee_notified",
        notes: row.reason,
      },
      create: {
        employeeId: row.id,
        attendanceDate: date,
        reason: "missing_attendance",
        status: "employee_notified",
        dueAt: dueAtForDate(targetDate),
        notes: row.reason,
      },
    });
  }

  for (const regularizationCase of openCases) {
    if (rowIds.has(regularizationCase.employeeId)) continue;
    const leaveId = leaveByEmployee.get(regularizationCase.employeeId);
    if (!leaveId) continue;
    await prisma.attendanceRegularizationCase.update({
      where: { id: regularizationCase.id },
      data: {
        status: "regularized",
        resolution: "leave_applied",
        closedAt: new Date(),
        notes: `Closed because approved leave ${leaveId} covers this date.`,
      },
    });
  }
}

export async function sendAttendanceNonComplianceReport(targetDate = defaultTargetDate()) {
  const rows = await missingAttendanceRows(targetDate);
  await syncRegularizationCases(targetDate, rows);
  const regularizedRows = await autoRegularizeMissingAttendance(targetDate, rows);
  const regularizedIds = new Set(regularizedRows.map((row) => row.id));
  const admins = await adminRecipients();
  const deliveries = [];

  if (admins.length) {
    deliveries.push({
      type: "admin",
      to: admins.join(","),
      result: await sendMail({
        to: admins.join(","),
        subject: `HRMS Attendance Non-compliance - ${targetDate}`,
        html: `${adminHtml(targetDate, rows)}${regularizedRows.length ? `<p><strong>${regularizedRows.length}</strong> missing attendance row(s) were auto-regularized as Casual Leave after the 48-hour window.</p>` : ""}`,
      }),
    });
  }

  for (const employee of rows) {
    deliveries.push({
      type: "employee",
      to: employee.email,
      result: await sendMail({
        to: employee.email,
        subject: regularizedIds.has(employee.id) ? `Attendance auto-regularized for ${targetDate}` : `Attendance not marked for ${targetDate}`,
        html: regularizedIds.has(employee.id) ? employeeRegularizedHtml(employee, targetDate) : employeeHtml(employee, targetDate),
      }),
    });
  }

  return { targetDate, missingCount: rows.length, regularizedCount: regularizedRows.length, admins, employees: rows, regularizedEmployees: regularizedRows, deliveries };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const targetDate = process.argv[2] || defaultTargetDate();
  sendAttendanceNonComplianceReport(targetDate)
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
