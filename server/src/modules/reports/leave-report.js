import { prisma } from "../../lib/prisma.js";

function monthRange(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start, end };
}

function daysBetween(fromDate, toDate) {
  return Math.max(Math.round((toDate - fromDate) / 86400000) + 1, 0);
}

function leaveDaysWithinMonth(request, start, end) {
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

function sumBy(rows, iteratee) {
  return rows.reduce((sum, row) => sum + Number(iteratee(row) || 0), 0);
}

function groupLeaveTypes(leaveRequests, start, end) {
  const groups = new Map();
  for (const request of leaveRequests) {
    if (request.status !== "approved") continue;
    const days = leaveDaysWithinMonth(request, start, end);
    if (!days) continue;
    const current = groups.get(request.leaveType) || {
      leaveType: request.leaveType,
      days: 0,
      count: 0,
      isPaid: !/unpaid/i.test(request.leaveType),
    };
    current.days += days;
    current.count += 1;
    groups.set(request.leaveType, current);
  }
  return [...groups.values()].sort((a, b) => a.leaveType.localeCompare(b.leaveType));
}

function balanceRowsByType(balanceRows) {
  return [...balanceRows]
    .map((row) => ({ leaveType: row.leaveType, balance: Number(row.balance || 0), source: row.source || "manual" }))
    .sort((a, b) => a.leaveType.localeCompare(b.leaveType));
}

async function reportSourceMode(db, month, employeeIds, start, end) {
  const [reconciliationRows, attendanceMax, leaveMax, balanceMax, employeeCount] = await Promise.all([
    db.payrollReconciliation.findMany({
      where: { month: start, employeeId: { in: employeeIds } },
      select: { employeeId: true, status: true, updatedAt: true, balanceRemaining: true },
    }),
    db.attendanceRecord.aggregate({
      where: { employeeId: { in: employeeIds }, attendanceDate: { gte: start, lte: end } },
      _max: { updatedAt: true },
    }),
    db.leaveRequest.aggregate({
      where: { employeeId: { in: employeeIds }, fromDate: { lte: end }, toDate: { gte: start } },
      _max: { updatedAt: true },
    }),
    db.employeeLeaveBalance.aggregate({
      where: { employeeId: { in: employeeIds } },
      _max: { updatedAt: true },
    }),
    db.employee.count({ where: { id: { in: employeeIds }, status: { in: ["active", "probation", "on_leave"] } } }),
  ]);

  const latestReconciliationUpdate = reconciliationRows.reduce((latest, row) => (latest && latest > row.updatedAt ? latest : row.updatedAt), null);
  const latestSourceUpdate = [attendanceMax._max.updatedAt, leaveMax._max.updatedAt, balanceMax._max.updatedAt]
    .filter(Boolean)
    .reduce((latest, value) => (latest && latest > value ? latest : value), null);
  const finalStatuses = new Set(["reviewed", "locked"]);
  const complete = employeeCount > 0 && reconciliationRows.length === employeeCount;
  const finalized = complete && reconciliationRows.every((row) => finalStatuses.has(row.status));
  const reconciled = Boolean(finalized && latestReconciliationUpdate && (!latestSourceUpdate || latestReconciliationUpdate >= latestSourceUpdate));

  return {
    mode: reconciled ? "reconciled" : "live",
    label: reconciled ? "Reconciled data" : "Live / unreconciled data",
    complete,
    finalized,
    latestReconciliationUpdate: latestReconciliationUpdate ? latestReconciliationUpdate.toISOString() : null,
    latestSourceUpdate: latestSourceUpdate ? latestSourceUpdate.toISOString() : null,
    reconciliationRows,
  };
}

export async function buildLeaveReport(month, db = prisma) {
  const { start, end } = monthRange(month);
  const employees = await db.employee.findMany({
    where: { status: { in: ["active", "probation", "on_leave"] } },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      legalEntity: true,
      department: true,
      designation: true,
      joinDate: true,
      exitDate: true,
    },
    orderBy: [{ fullName: "asc" }, { employeeCode: "asc" }],
  });
  const employeeIds = employees.map((employee) => employee.id);
  const [leaveRequests, balanceRows, source] = await Promise.all([
    db.leaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, fromDate: { lte: end }, toDate: { gte: start } },
      select: { employeeId: true, leaveType: true, fromDate: true, toDate: true, days: true, status: true, reason: true },
    }),
    db.employeeLeaveBalance.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { employeeId: true, leaveType: true, balance: true, source: true },
    }),
    reportSourceMode(db, month, employeeIds, start, end),
  ]);

  const leaveRequestsByEmployee = new Map();
  const balancesByEmployee = new Map();
  for (const request of leaveRequests) {
    const current = leaveRequestsByEmployee.get(request.employeeId) || [];
    current.push(request);
    leaveRequestsByEmployee.set(request.employeeId, current);
  }
  for (const balanceRow of balanceRows) {
    const current = balancesByEmployee.get(balanceRow.employeeId) || [];
    current.push(balanceRow);
    balancesByEmployee.set(balanceRow.employeeId, current);
  }

  const reconciliationByEmployee = new Map(source.reconciliationRows.map((row) => [row.employeeId, row]));
  const leaveTypes = [...new Set([
    ...leaveRequests.map((request) => request.leaveType),
    ...balanceRows.map((row) => row.leaveType),
  ])].sort((a, b) => a.localeCompare(b));

  const rows = employees.map((employee) => {
    const employeeLeaves = leaveRequestsByEmployee.get(employee.id) || [];
    const balances = balancesByEmployee.get(employee.id) || [];
    const leaveByType = groupLeaveTypes(employeeLeaves, start, end);
    const paidLeaveDays = sumBy(leaveByType.filter((row) => row.isPaid), (row) => row.days);
    const unpaidLeaveDays = sumBy(leaveByType.filter((row) => !row.isPaid), (row) => row.days);
    const totalLeaveDays = paidLeaveDays + unpaidLeaveDays;
    const balanceTotal = sumBy(balances, (row) => row.balance);
    const reconciliationRow = reconciliationByEmployee.get(employee.id) || null;

    return {
      employeeId: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department,
      designation: employee.designation,
      leaveDaysByType: leaveByType,
      paidLeaveDays,
      unpaidLeaveDays,
      totalLeaveDays,
      currentBalancesByType: balanceRowsByType(balances),
      currentBalanceTotal: balanceTotal,
      monthEndBalanceRemaining: source.mode === "reconciled" ? Number(reconciliationRow?.balanceRemaining || 0) : null,
      reconciliationStatus: reconciliationRow?.status || "",
      dataSource: source.mode,
    };
  });

  return {
    month,
    sourceMode: source.mode,
    sourceLabel: source.label,
    sourceFreshness: {
      latestReconciliationUpdate: source.latestReconciliationUpdate,
      latestSourceUpdate: source.latestSourceUpdate,
      complete: source.complete,
      finalized: source.finalized,
    },
    leaveTypes,
    rows,
  };
}

export async function buildLeavePayrollReport(month, db = prisma) {
  const { start, end } = monthRange(month);
  const leaveTypes = ["Casual Leave", "Compensatory Off", "Work From Home", "Unpaid Leave"];
  const employees = await db.employee.findMany({
    where: {
      joinDate: { lte: end },
      OR: [{ exitDate: null }, { exitDate: { gte: start } }],
    },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      legalEntity: true,
      department: true,
      designation: true,
      client: true,
      status: true,
    },
    orderBy: [{ legalEntity: "asc" }, { employeeCode: "asc" }],
  });
  const employeeIds = employees.map((employee) => employee.id);
  const leaveRequests = await db.leaveRequest.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: "approved",
      fromDate: { lte: end },
      toDate: { gte: start },
    },
    select: { employeeId: true, leaveType: true, fromDate: true, toDate: true, days: true, reason: true },
    orderBy: [{ employeeId: "asc" }, { fromDate: "asc" }],
  });

  const leaveRequestsByEmployee = new Map();
  for (const request of leaveRequests) {
    const current = leaveRequestsByEmployee.get(request.employeeId) || [];
    current.push(request);
    leaveRequestsByEmployee.set(request.employeeId, current);
  }

  const rows = employees.map((employee) => {
    const totals = Object.fromEntries(leaveTypes.map((type) => [type, 0]));
    const details = [];
    const employeeLeaves = leaveRequestsByEmployee.get(employee.id) || [];

    for (const request of employeeLeaves) {
      const days = leaveDaysWithinMonth(request, start, end);
      if (!days) continue;
      totals[request.leaveType] = Number(((totals[request.leaveType] || 0) + days).toFixed(2));
      details.push(`${request.fromDate.toISOString().slice(0, 10)} to ${request.toDate.toISOString().slice(0, 10)} - ${request.leaveType} (${days})${request.reason ? ` - ${request.reason}` : ""}`);
    }

    const totalLeaveDays = leaveTypes.reduce((sum, type) => sum + Number(totals[type] || 0), 0);
    return {
      month,
      entity: employee.legalEntity || "HRGP",
      employeeId: employee.employeeCode,
      employeeName: employee.fullName,
      email: employee.email,
      department: employee.department,
      designation: employee.designation,
      client: employee.client || "",
      status: employee.status,
      casualLeave: totals["Casual Leave"] || 0,
      compOff: totals["Compensatory Off"] || 0,
      workFromHome: totals["Work From Home"] || 0,
      unpaidLeave: totals["Unpaid Leave"] || 0,
      totalLeaveDays: Number(totalLeaveDays.toFixed(2)),
      details: details.join("; "),
    };
  });

  return {
    month,
    sourceMode: "live",
    sourceLabel: `Monthly leave payroll report - ${month}`,
    rows,
  };
}
