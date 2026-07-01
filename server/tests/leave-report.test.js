import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { buildLeaveReport } from "../src/modules/reports/leave-report.js";
import { createReportRouter } from "../src/modules/reports/reports.routes.js";

function date(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function createDbStub({ reconciliationRows, attendanceUpdatedAt, leaveUpdatedAt, balanceUpdatedAt, employees, leaveRequests, balances }) {
  return {
    employee: {
      findMany: async () => employees,
      count: async () => employees.length,
    },
    leaveRequest: {
      findMany: async () => leaveRequests,
      aggregate: async () => ({ _max: { updatedAt: leaveUpdatedAt } }),
    },
    employeeLeaveBalance: {
      findMany: async () => balances,
      aggregate: async () => ({ _max: { updatedAt: balanceUpdatedAt } }),
    },
    attendanceRecord: {
      aggregate: async () => ({ _max: { updatedAt: attendanceUpdatedAt } }),
    },
    payrollReconciliation: {
      findMany: async () => reconciliationRows,
    },
  };
}

test("leave report prefers reconciled month-end data when reconciliation is complete and fresh", async () => {
  const employees = [{ id: "emp-1", employeeCode: "HRGP01", fullName: "Asha Nair", department: "HR", designation: "Executive", joinDate: date("2026-01-01"), exitDate: null, legalEntity: "HRGP" }];
  const db = createDbStub({
    employees,
    leaveRequests: [
      { employeeId: "emp-1", leaveType: "Casual Leave", fromDate: date("2026-06-10"), toDate: date("2026-06-10"), days: 1, status: "approved", reason: "Doctor visit" },
      { employeeId: "emp-1", leaveType: "Unpaid Leave", fromDate: date("2026-06-12"), toDate: date("2026-06-12"), days: 1, status: "approved", reason: "Personal" },
    ],
    balances: [{ employeeId: "emp-1", leaveType: "Casual Leave", balance: 4, source: "manual" }],
    reconciliationRows: [{ employeeId: "emp-1", status: "reviewed", updatedAt: date("2026-06-30"), balanceRemaining: 4 }],
    attendanceUpdatedAt: date("2026-06-20"),
    leaveUpdatedAt: date("2026-06-21"),
    balanceUpdatedAt: date("2026-06-01"),
  });

  const report = await buildLeaveReport("2026-06", db);
  assert.equal(report.sourceMode, "reconciled");
  assert.equal(report.sourceLabel, "Reconciled data");
  assert.equal(report.rows[0].monthEndBalanceRemaining, 4);
  assert.equal(report.rows[0].paidLeaveDays, 1);
  assert.equal(report.rows[0].unpaidLeaveDays, 1);
  assert.equal(report.sourceFreshness.finalized, true);
});

test("leave report falls back to live data when reconciliation is missing or stale", async () => {
  const employees = [{ id: "emp-1", employeeCode: "HRGP01", fullName: "Asha Nair", department: "HR", designation: "Executive", joinDate: date("2026-01-01"), exitDate: null, legalEntity: "HRGP" }];
  const db = createDbStub({
    employees,
    leaveRequests: [{ employeeId: "emp-1", leaveType: "Casual Leave", fromDate: date("2026-05-29"), toDate: date("2026-06-02"), days: 3, status: "approved", reason: "Travel" }],
    balances: [{ employeeId: "emp-1", leaveType: "Casual Leave", balance: 4, source: "manual" }],
    reconciliationRows: [],
    attendanceUpdatedAt: date("2026-06-20"),
    leaveUpdatedAt: date("2026-06-21"),
    balanceUpdatedAt: date("2026-06-01"),
  });

  const report = await buildLeaveReport("2026-06", db);
  assert.equal(report.sourceMode, "live");
  assert.equal(report.sourceLabel, "Live / unreconciled data");
  assert.equal(report.rows[0].monthEndBalanceRemaining, null);
  assert.equal(report.rows[0].paidLeaveDays, 2);
});

test("leave report endpoint returns JSON from injected builder", async () => {
  const app = express();
  app.use("/reports", createReportRouter({ leaveReportBuilder: async (month) => ({ month, sourceMode: "live", rows: [] }) }));
  app.use((error, _request, response, _next) => response.status(500).json({ error: { message: error.message } }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/reports/leaves?month=2026-06`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.report.month, "2026-06");
    assert.equal(body.report.sourceMode, "live");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
