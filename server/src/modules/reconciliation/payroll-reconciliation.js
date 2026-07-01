import { buildWorkingDayCalendar, mapCalendarByDate, monthRange, toDateString } from "./calendar.js";
import { buildLeaveDayMap } from "./leave-reconciliation.js";
import { reconcileAttendanceDay, summarizeAttendance } from "./attendance-reconciliation.js";

function balanceKey(employeeId, leaveType) {
  return `${employeeId}:${leaveType}`;
}

export function reconcileEmployeeMonth({
  month,
  legalEntity,
  employee,
  attendanceRecords = [],
  leaveRequests = [],
  leaveBalances = [],
  balanceTransactions = [],
  holidays = [],
  saturdayRotaAssignments = [],
  allowedNegativeBalance = false,
}) {
  const holidayDates = new Set(holidays.filter((holiday) => holiday.isActive !== false).map((holiday) => toDateString(holiday.holidayDate)));
  const saturdayWorkingDates = new Set(saturdayRotaAssignments.filter((row) => row.isWorking !== false).map((row) => toDateString(row.rotaDate)));
  const calendar = buildWorkingDayCalendar({ month, holidayDates, saturdayWorkingDates });
  const calendarByDate = mapCalendarByDate(calendar);
  const attendanceByDate = new Map(attendanceRecords.map((row) => [toDateString(row.attendanceDate), row]));
  const applicableLeaves = leaveRequests.filter((row) => row.status === "approved");
  const { leaveDayMap, classifications } = buildLeaveDayMap(applicableLeaves, calendar);
  const dayRows = [];
  const exceptions = [];
  for (const { leaveRequest, classification } of classifications) {
    if (classification.mismatch) {
      exceptions.push({
        date: null,
        type: "leave_days_mismatch_calendar",
        severity: "high",
        details: classification.details,
      });
    }
  }
  for (const day of calendar) {
    const attendanceRecord = attendanceByDate.get(day.date) || null;
    const leaveDay = leaveDayMap.get(day.date) || null;
    const row = reconcileAttendanceDay({ calendarDay: day, attendanceRecord, leaveDay });
    dayRows.push(row);
    if (leaveDay && attendanceRecord && ["present", "remote", "late"].includes(attendanceRecord.status)) {
      exceptions.push({ date: day.date, type: "attendance_present_on_approved_leave_day", severity: "medium", details: { attendanceStatus: attendanceRecord.status, leaveType: leaveDay.leaveType } });
    }
    if (leaveDay && leaveDay.status === "approved_unpaid" && row.paidLeaveDays > 0) {
      exceptions.push({ date: day.date, type: "unpaid_leave_counted_as_paid", severity: "high", details: { leaveType: leaveDay.leaveType } });
    }
    if (day.kind !== "working" && leaveDay) {
      exceptions.push({ date: day.date, type: "leave_applied_on_non_working_day", severity: "medium", details: { calendarKind: day.kind, leaveType: leaveDay.leaveType } });
    }
  }
  const summary = summarizeAttendance(dayRows);
  const paidLeaveDays = dayRows.reduce((sum, row) => sum + (row.reduceLeaveBalance ? (row.paidLeaveDays || 0) : 0), 0);
  const currentBalanceTotal = leaveBalances.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const txDelta = balanceTransactions.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const balanceRemaining = currentBalanceTotal + txDelta - paidLeaveDays;
  const leaveApprovalDays = applicableLeaves.reduce((sum, row) => sum + Number(row.days || 0), 0);
  const txReductionDays = balanceTransactions.filter((row) => Number(row.amount || 0) < 0).reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0);
  if (leaveApprovalDays > 0 && paidLeaveDays === 0 && leaveRequests.some((row) => row.leaveType !== "Unpaid Leave")) {
    exceptions.push({ date: null, type: "leave_approved_but_no_balance_reduction", severity: "high", details: { leaveApprovalDays } });
  }
  if (txReductionDays > 0 && !leaveRequests.some((row) => row.status === "approved" && row.leaveType !== "Unpaid Leave")) {
    exceptions.push({ date: null, type: "balance_reduced_without_leave_approval", severity: "high", details: { txReductionDays } });
  }
  if (balanceRemaining < 0 && !allowedNegativeBalance) {
    exceptions.push({ date: null, type: "negative_balance", severity: "high", details: { balanceRemaining } });
  }
  return {
    month,
    legalEntity,
    employeeId: employee.id,
    calendar,
    dayRows,
    summary: {
      workDays: calendar.filter((row) => row.isWorkingDay).length,
      presentDays: summary.presentDays,
      paidLeaveDays: summary.paidLeaveDays,
      unpaidLeaveDays: summary.unpaidLeaveDays,
      absentDays: summary.absentDays,
      balanceConsumed: paidLeaveDays,
      balanceRemaining,
    },
    exceptions,
    ledgerEntries: dayRows
      .filter((row) => row.reduceLeaveBalance)
      .map((row) => ({
        employeeId: employee.id,
        leaveType: row.leaveType || "Casual Leave",
        transactionDate: row.date,
        amount: -1 * (row.paidLeaveDays || 1),
        balanceAfter: balanceRemaining,
        sourceType: "reconciliation",
        sourceId: null,
        notes: `Reconciled from ${month}`,
      })),
  };
}

export function reconcilePayrollMonth(input) {
  return reconcileEmployeeMonth(input);
}

export async function persistEmployeeMonthReconciliation({
  prisma,
  month,
  legalEntity,
  employee,
  attendanceRecords = [],
  leaveRequests = [],
  leaveBalances = [],
  balanceTransactions = [],
  holidays = [],
  saturdayRotaAssignments = [],
  allowedNegativeBalance = false,
  payrollCycleId,
  status = "draft",
  createdById = null,
}) {
  // Idempotency strategy:
  // upsert the employee-month reconciliation row, then replace all reconciliation-generated
  // exceptions and ledger rows for that employee/month before recreating them from the latest
  // pure calculation result. This keeps the run repeatable without double-counting.
  const result = reconcileEmployeeMonth({
    month,
    legalEntity,
    employee,
    attendanceRecords,
    leaveRequests,
    leaveBalances,
    balanceTransactions,
    holidays,
    saturdayRotaAssignments,
    allowedNegativeBalance,
  });
  const monthDate = new Date(`${month}-01T00:00:00.000Z`);
  const reconciliation = await prisma.$transaction(async (tx) => {
    const row = await tx.payrollReconciliation.upsert({
      where: {
        payrollCycleId_employeeId_month: {
          payrollCycleId,
          employeeId: employee.id,
          month: monthDate,
        },
      },
      update: {
        workDays: result.summary.workDays,
        presentDays: result.summary.presentDays,
        paidLeaveDays: result.summary.paidLeaveDays,
        unpaidLeaveDays: result.summary.unpaidLeaveDays,
        absentDays: result.summary.absentDays,
        balanceConsumed: result.summary.balanceConsumed,
        balanceRemaining: result.summary.balanceRemaining,
        status,
      },
      create: {
        payrollCycleId,
        employeeId: employee.id,
        month: monthDate,
        workDays: result.summary.workDays,
        presentDays: result.summary.presentDays,
        paidLeaveDays: result.summary.paidLeaveDays,
        unpaidLeaveDays: result.summary.unpaidLeaveDays,
        absentDays: result.summary.absentDays,
        balanceConsumed: result.summary.balanceConsumed,
        balanceRemaining: result.summary.balanceRemaining,
        status,
      },
    });
    await tx.reconciliationException.deleteMany({ where: { payrollReconciliationId: row.id } });
    await tx.leaveBalanceTransaction.deleteMany({
      where: {
        employeeId: employee.id,
        sourceType: "reconciliation",
        transactionDate: { gte: monthDate, lte: new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)) },
      },
    });
    if (result.exceptions.length) {
      await tx.reconciliationException.createMany({
        data: result.exceptions.map((exception) => ({
          payrollReconciliationId: row.id,
          employeeId: employee.id,
          date: exception.date ? new Date(`${exception.date}T00:00:00.000Z`) : null,
          exceptionType: exception.type,
          severity: exception.severity,
          details: exception.details,
        })),
      });
    }
    let runningBalance = Number(leaveBalances.reduce((sum, row) => sum + Number(row.balance || 0), 0));
    for (const ledgerEntry of result.ledgerEntries) {
      runningBalance += Number(ledgerEntry.amount || 0);
      await tx.leaveBalanceTransaction.create({
        data: {
          employeeId: employee.id,
          leaveType: ledgerEntry.leaveType,
          transactionDate: new Date(`${ledgerEntry.transactionDate}T00:00:00.000Z`),
          amount: ledgerEntry.amount,
          balanceAfter: runningBalance,
          sourceType: "reconciliation",
          sourceId: row.id,
          notes: ledgerEntry.notes,
          createdById,
        },
      });
    }
    return row;
  });
  return { reconciliation, result };
}

export async function persistPayrollMonthReconciliation(options) {
  return persistEmployeeMonthReconciliation(options);
}
