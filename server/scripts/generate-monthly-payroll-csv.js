import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

const paidLeaveTypes = new Set(["Casual Leave", "Compensatory Off"]);

function usage() {
  return [
    "Usage: npm run payroll:csv -- --month=YYYY-MM [--entity=HRGP|Taggd|All] [--out=path]",
    "",
    "Examples:",
    "  npm run payroll:csv -- --month=2026-06",
    "  npm run payroll:csv -- --month=2026-06 --entity=HRGP",
    "  npm run payroll:csv -- --month=2026-06 --out=reports/june-payroll.csv",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...valueParts] = arg.slice(2).split("=");
    args[key] = valueParts.length ? valueParts.join("=") : true;
  }
  if (!args.month || !/^\d{4}-\d{2}$/.test(String(args.month))) {
    throw new Error(`Month is required in YYYY-MM format.\n${usage()}`);
  }
  return {
    month: String(args.month),
    entity: args.entity ? String(args.entity) : "All",
    out: args.out ? String(args.out) : "",
  };
}

function monthDates(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const total = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function daysBetween(fromDate, toDate) {
  return Math.max(Math.round((toDate - fromDate) / 86400000) + 1, 0);
}

function leaveDaysWithinRange(request, start, end) {
  if (request.toDate < start || request.fromDate > end) return 0;
  const from = request.fromDate < start ? start : request.fromDate;
  const to = request.toDate > end ? end : request.toDate;
  const requestedDays = Number(request.days || 0);
  const spanDays = daysBetween(request.fromDate, request.toDate);
  if (requestedDays > 0 && request.fromDate >= start && request.toDate <= end) return requestedDays;
  if (requestedDays > 0 && spanDays === 1) return requestedDays;
  const overlapDays = daysBetween(from, to);
  if (requestedDays > 0 && spanDays > 0) return Number(((requestedDays / spanDays) * overlapDays).toFixed(2));
  return overlapDays;
}

function timeToMinutes(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getUTCHours() * 60) + date.getUTCMinutes();
}

function durationHours(record) {
  if (Number.isFinite(Number(record.durationMinutes)) && Number(record.durationMinutes) > 0) {
    return Number((Number(record.durationMinutes) / 60).toFixed(2));
  }
  const start = timeToMinutes(record.checkIn);
  const end = timeToMinutes(record.checkOut);
  if (start === null || end === null || end < start) return 0;
  return Number(((end - start) / 60).toFixed(2));
}

function attendanceStatusLabel(status) {
  const labels = {
    present: "Present",
    remote: "Remote",
    late: "Late",
    half_day: "Half Day",
    leave: "Leave",
    absent: "Absent",
    weekend: "Weekend",
  };
  return labels[status] || status || "";
}

function isNonWorkingDay(dateString) {
  const day = new Date(`${dateString}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function localDateString(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

function employeeActiveInMonth(employee, monthStart, monthEnd) {
  const joinDate = employee.joinDate || monthStart;
  const exitDate = employee.exitDate || monthEnd;
  return joinDate <= monthEnd && exitDate >= monthStart;
}

function employeeApplicableDates(employee, dates) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const joinDate = toDateString(employee.joinDate) || first;
  const exitDate = toDateString(employee.exitDate) || last;
  return dates.filter((date) => date >= joinDate && date <= exitDate);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows) {
  const columns = [
    ["month", "Payroll Month"],
    ["legalEntity", "Entity"],
    ["employeeCode", "Employee ID"],
    ["employeeName", "Employee Name"],
    ["email", "Email"],
    ["department", "Department"],
    ["designation", "Designation"],
    ["status", "Employee Status"],
    ["joinDate", "Join Date"],
    ["exitDate", "Exit Date"],
    ["workDays", "Month Days"],
    ["applicableDays", "Applicable Days"],
    ["presentDays", "Present Days"],
    ["remoteDays", "Remote Days"],
    ["lateDays", "Late Days"],
    ["halfDays", "Half Days"],
    ["paidLeaveDays", "Paid Leave Days"],
    ["casualLeaveDays", "Casual Leave Days"],
    ["compOffDays", "Comp Off Days"],
    ["unpaidLeaveDays", "Unpaid Leave Days"],
    ["absentOnlyDays", "Absent Days"],
    ["deductibleDays", "Deductible Days"],
    ["paidDays", "Paid Days"],
    ["fullMonthlySalary", "Full Monthly Salary"],
    ["perDay", "Per Day"],
    ["proratedGross", "Prorated Gross Salary"],
    ["deductions", "Deductions"],
    ["netPay", "Net Payable"],
    ["attendanceConflicts", "Attendance/Leave Conflicts"],
    ["notes", "Notes"],
    ["pan", "PAN"],
    ["bankName", "Bank Name"],
    ["bankAccount", "Bank Account"],
    ["ifsc", "IFSC"],
    ["bankBranch", "Bank Branch"],
  ];
  const header = columns.map(([, label]) => csvEscape(label)).join(",");
  const body = rows.map((row) => columns.map(([key]) => csvEscape(row[key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

async function buildPayrollRows({ month, entity }) {
  const dates = monthDates(month);
  const today = localDateString();
  const monthStart = new Date(`${dates[0]}T00:00:00.000Z`);
  const monthEnd = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
  const employeeWhere = {
    joinDate: { lte: monthEnd },
    OR: [{ exitDate: null }, { exitDate: { gte: monthStart } }],
    ...(entity && entity !== "All" ? { legalEntity: entity } : {}),
  };

  const employees = (await prisma.employee.findMany({
    where: employeeWhere,
    orderBy: [{ legalEntity: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      legalEntity: true,
      department: true,
      designation: true,
      status: true,
      joinDate: true,
      exitDate: true,
      monthlySalary: true,
      pan: true,
      bankName: true,
      bankAccount: true,
      ifsc: true,
      bankBranch: true,
    },
  })).filter((employee) => employeeActiveInMonth(employee, monthStart, monthEnd));

  const employeeIds = employees.map((employee) => employee.id);
  const [attendanceRows, leaveRows] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employeeId: { in: employeeIds }, attendanceDate: { gte: monthStart, lte: monthEnd } },
      select: { employeeId: true, attendanceDate: true, status: true, checkIn: true, checkOut: true, durationMinutes: true, remarks: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: "approved",
        fromDate: { lte: monthEnd },
        toDate: { gte: monthStart },
      },
      select: { employeeId: true, leaveType: true, fromDate: true, toDate: true, days: true, reason: true },
    }),
  ]);

  const attendanceByEmployeeDate = new Map(attendanceRows.map((row) => [`${row.employeeId}:${toDateString(row.attendanceDate)}`, row]));
  const leaveByEmployee = new Map();
  for (const leave of leaveRows) {
    const current = leaveByEmployee.get(leave.employeeId) || [];
    current.push(leave);
    leaveByEmployee.set(leave.employeeId, current);
  }

  return employees.map((employee) => {
    const applicableDates = employeeApplicableDates(employee, dates);
    const employeeLeaves = leaveByEmployee.get(employee.id) || [];
    const leaveTotals = { "Casual Leave": 0, "Compensatory Off": 0, "Unpaid Leave": 0, "Work From Home": 0 };
    const leaveDetails = [];
    for (const leave of employeeLeaves) {
      const days = leaveDaysWithinRange(leave, monthStart, monthEnd);
      if (!days) continue;
      leaveTotals[leave.leaveType] = Number(((leaveTotals[leave.leaveType] || 0) + days).toFixed(2));
      leaveDetails.push(`${toDateString(leave.fromDate)} to ${toDateString(leave.toDate)} - ${leave.leaveType} (${days})${leave.reason ? ` - ${leave.reason}` : ""}`);
    }

    let presentDays = 0;
    let remoteDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentOnlyDays = 0;
    let totalHours = 0;
    const conflicts = [];
    const attendanceNotes = [];

    for (const date of applicableDates) {
      const attendance = attendanceByEmployeeDate.get(`${employee.id}:${date}`);
      const leaveOnDate = employeeLeaves.find((leave) => toDateString(leave.fromDate) <= date && toDateString(leave.toDate) >= date);
      if (attendance) {
        const label = attendanceStatusLabel(attendance.status);
        if (["present", "late"].includes(attendance.status)) presentDays += 1;
        if (attendance.status === "remote") remoteDays += 1;
        if (attendance.status === "late") lateDays += 1;
        if (attendance.status === "half_day") halfDays += 1;
        if (attendance.status === "absent") absentOnlyDays += 1;
        totalHours += durationHours(attendance);
        if (attendance.remarks) attendanceNotes.push(`${date}: ${attendance.remarks}`);
        if (leaveOnDate && ["present", "remote", "late", "half_day"].includes(attendance.status)) {
          conflicts.push(`${date}: ${label} attendance with approved ${leaveOnDate.leaveType}`);
        }
      } else if (!leaveOnDate && !isNonWorkingDay(date) && date <= today) {
        absentOnlyDays += 1;
      }
    }

    const casualLeaveDays = leaveTotals["Casual Leave"] || 0;
    const compOffDays = leaveTotals["Compensatory Off"] || 0;
    const unpaidLeaveDays = leaveTotals["Unpaid Leave"] || 0;
    const paidLeaveDays = casualLeaveDays + compOffDays;
    const deductibleDays = Number((absentOnlyDays + unpaidLeaveDays + (halfDays * 0.5)).toFixed(2));
    const fullMonthlySalary = Number(employee.monthlySalary || 0);
    const perDay = dates.length ? fullMonthlySalary / dates.length : 0;
    const proratedGross = Math.round(perDay * applicableDates.length);
    const deductions = Math.round(deductibleDays * perDay);
    const netPay = Math.max(Math.round(proratedGross - deductions), 0);
    const paidDays = Math.max(Number((applicableDates.length - deductibleDays).toFixed(2)), 0);

    return {
      month,
      legalEntity: employee.legalEntity || "HRGP",
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      email: employee.email,
      department: employee.department,
      designation: employee.designation,
      status: employee.status,
      joinDate: toDateString(employee.joinDate),
      exitDate: toDateString(employee.exitDate),
      workDays: dates.length,
      applicableDays: applicableDates.length,
      presentDays,
      remoteDays,
      lateDays,
      halfDays,
      paidLeaveDays,
      casualLeaveDays,
      compOffDays,
      unpaidLeaveDays,
      absentOnlyDays,
      deductibleDays,
      paidDays,
      fullMonthlySalary,
      perDay: Number(perDay.toFixed(2)),
      proratedGross,
      deductions,
      netPay,
      attendanceConflicts: conflicts.join("; "),
      notes: [...leaveDetails, ...attendanceNotes].join(" | "),
      pan: employee.pan || "",
      bankName: employee.bankName || "",
      bankAccount: employee.bankAccount || "",
      ifsc: employee.ifsc || "",
      bankBranch: employee.bankBranch || "",
      totalHours: Number(totalHours.toFixed(2)),
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await buildPayrollRows(args);
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const defaultName = `monthly-payroll-${args.entity === "All" ? "all" : args.entity.toLowerCase()}-${args.month}.csv`;
  const outputPath = path.resolve(serverDir, args.out || path.join("reports", defaultName));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rowsToCsv(rows), "utf8");

  const totals = rows.reduce((summary, row) => {
    summary.proratedGross += row.proratedGross;
    summary.deductions += row.deductions;
    summary.netPay += row.netPay;
    summary.unpaidLeaveDays += row.unpaidLeaveDays;
    summary.deductibleDays += row.deductibleDays;
    return summary;
  }, { proratedGross: 0, deductions: 0, netPay: 0, unpaidLeaveDays: 0, deductibleDays: 0 });

  console.log(JSON.stringify({
    month: args.month,
    entity: args.entity,
    rows: rows.length,
    outputPath,
    totals: {
      proratedGross: Math.round(totals.proratedGross),
      deductions: Math.round(totals.deductions),
      netPay: Math.round(totals.netPay),
      unpaidLeaveDays: Number(totals.unpaidLeaveDays.toFixed(2)),
      deductibleDays: Number(totals.deductibleDays.toFixed(2)),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
