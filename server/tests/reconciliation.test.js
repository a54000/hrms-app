import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkingDayCalendar } from "../src/modules/reconciliation/calendar.js";
import { classifyLeaveRequest } from "../src/modules/reconciliation/leave-reconciliation.js";
import { reconcileEmployeeMonth } from "../src/modules/reconciliation/payroll-reconciliation.js";
import { persistEmployeeMonthReconciliation } from "../src/modules/reconciliation/payroll-reconciliation.js";
import { reconcileAttendanceDay } from "../src/modules/reconciliation/attendance-reconciliation.js";

function date(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

const employee = { id: "emp-1", joinDate: date("2026-06-03"), exitDate: null };

test("calendar classifies weekend, holiday, and saturday rota days from calendar data", () => {
  const calendar = buildWorkingDayCalendar({
    month: "2026-06",
    holidayDates: new Set(["2026-06-15"]),
    saturdayWorkingDates: new Set(["2026-06-06"]),
  });
  const june6 = calendar.find((row) => row.date === "2026-06-06");
  const june7 = calendar.find((row) => row.date === "2026-06-07");
  const june15 = calendar.find((row) => row.date === "2026-06-15");
  assert.equal(june6.kind, "saturday_rota_working");
  assert.equal(june7.kind, "weekend");
  assert.equal(june15.kind, "holiday");
});

test("single-day half-day leave is treated as half-day leave", () => {
  const calendar = buildWorkingDayCalendar({ month: "2026-06", holidayDates: new Set(), saturdayWorkingDates: new Set() });
  const leaveRequest = {
    id: "lr-1",
    leaveType: "Casual Leave",
    fromDate: date("2026-06-10"),
    toDate: date("2026-06-10"),
    days: 0.5,
  };
  const classification = classifyLeaveRequest(leaveRequest, calendar);
  assert.equal(classification.isHalfDay, true);
  assert.equal(classification.mismatch, false);
  assert.deepEqual(classification.days, [{ date: "2026-06-10", days: 0.5 }]);
});

test("multi-day leave with mismatched days flags reconciliation mismatch and keeps whole span", () => {
  const calendar = buildWorkingDayCalendar({
    month: "2026-06",
    holidayDates: new Set(["2026-06-15"]),
    saturdayWorkingDates: new Set(),
  });
  const leaveRequest = {
    id: "lr-2",
    leaveType: "Casual Leave",
    fromDate: date("2026-06-12"),
    toDate: date("2026-06-16"),
    days: 1,
  };
  const classification = classifyLeaveRequest(leaveRequest, calendar);
  assert.equal(classification.mismatch, true);
  assert.equal(classification.days.length, 5);
});

test("attendance reconciliation marks worked, half-day, paid leave, unpaid leave, and absent states", () => {
  const workingDay = { date: "2026-06-10", kind: "working", isWorkingDay: true };
  const present = reconcileAttendanceDay({ calendarDay: workingDay, attendanceRecord: { status: "present" }, leaveDay: null });
  const half = reconcileAttendanceDay({ calendarDay: workingDay, attendanceRecord: { status: "half_day" }, leaveDay: { status: "approved_paid", isHalfDay: true, days: 0.5 } });
  const paidLeave = reconcileAttendanceDay({ calendarDay: workingDay, attendanceRecord: null, leaveDay: { status: "approved_paid", days: 1 } });
  const unpaidLeave = reconcileAttendanceDay({ calendarDay: workingDay, attendanceRecord: null, leaveDay: { status: "approved_unpaid", days: 1 } });
  const absent = reconcileAttendanceDay({ calendarDay: workingDay, attendanceRecord: null, leaveDay: null });
  assert.equal(present.workedDays, 1);
  assert.equal(half.workedDays, 0.5);
  assert.equal(half.reduceLeaveBalance, true);
  assert.equal(paidLeave.paidLeaveDays, 1);
  assert.equal(unpaidLeave.unpaidLeaveDays, 1);
  assert.equal(absent.absentDays, 1);
});

test("month-end reconciliation produces summary and key exceptions", () => {
  const result = reconcileEmployeeMonth({
    month: "2026-06",
    legalEntity: "HRGP",
    employee,
    attendanceRecords: [
      { attendanceDate: date("2026-06-10"), status: "present" },
      { attendanceDate: date("2026-06-11"), status: "half_day" },
    ],
    leaveRequests: [
      { id: "lr-paid", leaveType: "Casual Leave", fromDate: date("2026-06-11"), toDate: date("2026-06-11"), days: 0.5, status: "approved" },
      { id: "lr-unpaid", leaveType: "Unpaid Leave", fromDate: date("2026-06-12"), toDate: date("2026-06-12"), days: 1, status: "approved" },
      { id: "lr-mismatch", leaveType: "Casual Leave", fromDate: date("2026-06-13"), toDate: date("2026-06-15"), days: 1, status: "approved" },
    ],
    leaveBalances: [{ leaveType: "Casual Leave", balance: 5 }],
    balanceTransactions: [{ amount: -1, sourceType: "manual_adjustment" }],
    holidays: [{ holidayDate: date("2026-06-15"), isActive: true }],
    saturdayRotaAssignments: [],
  });
  assert.equal(result.summary.paidLeaveDays >= 0, true);
  assert.ok(result.exceptions.some((row) => row.type === "leave_days_mismatch_calendar"));
  assert.ok(result.exceptions.some((row) => row.type === "leave_applied_on_non_working_day"));
  assert.ok(result.exceptions.some((row) => row.type === "unpaid_leave_counted_as_paid") === false);
});

test("leave spanning month boundary only considers the requested month calendar slice", () => {
  const result = reconcileEmployeeMonth({
    month: "2026-06",
    legalEntity: "HRGP",
    employee,
    attendanceRecords: [],
    leaveRequests: [
      { id: "lr-boundary", leaveType: "Casual Leave", fromDate: date("2026-05-30"), toDate: date("2026-06-02"), days: 2, status: "approved" },
    ],
    leaveBalances: [{ leaveType: "Casual Leave", balance: 5 }],
    balanceTransactions: [],
    holidays: [],
    saturdayRotaAssignments: [],
  });
  assert.equal(result.calendar[0].date, "2026-06-01");
  assert.ok(result.dayRows.some((row) => row.date === "2026-06-01"));
});

test("persistence wrapper upserts once and replaces reconciliation rows idempotently", async () => {
  const calls = { upsert: 0, deleteMany: 0, createMany: 0, create: 0 };
  const db = {
    payrollReconciliation: { upsert: async (args) => { calls.upsert += 1; return { id: "pr-1", ...args.update }; } },
    reconciliationException: { deleteMany: async () => { calls.deleteMany += 1; }, createMany: async () => { calls.createMany += 1; } },
    leaveBalanceTransaction: { deleteMany: async () => { calls.deleteMany += 1; }, create: async () => { calls.create += 1; } },
    $transaction: async (fn) => fn(db),
  };
  await persistEmployeeMonthReconciliation({
    prisma: db,
    month: "2026-06",
    legalEntity: "HRGP",
    employee,
    attendanceRecords: [],
    leaveRequests: [],
    leaveBalances: [{ leaveType: "Casual Leave", balance: 5 }],
    balanceTransactions: [],
    holidays: [],
    saturdayRotaAssignments: [],
    payrollCycleId: "00000000-0000-0000-0000-000000000001",
  });
  assert.equal(calls.upsert, 1);
  assert.equal(calls.create, 0);
  assert.equal(calls.createMany, 0);
  assert.equal(calls.deleteMany, 2);
});
