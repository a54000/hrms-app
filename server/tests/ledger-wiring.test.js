import test from "node:test";
import assert from "node:assert/strict";
import { recordManualLeaveBalanceAdjustment } from "../src/modules/leave/leave.routes.js";
import { applyAttendanceLeaveDeduction } from "../src/modules/attendance/attendance.routes.js";

test("manual balance update writes a matching ledger row", async () => {
  const writes = [];
  const tx = {
    employeeLeaveBalance: {
      findUnique: async () => ({ balance: 2 }),
      upsert: async ({ update }) => ({ id: "elb-1", balance: update.balance }),
    },
    leaveBalanceTransaction: {
      create: async ({ data }) => { writes.push(data); },
    },
  };
  const updated = await recordManualLeaveBalanceAdjustment(tx, "emp-1", "Casual Leave", 5, "user-1", "manual test");
  assert.equal(updated.balance, 5);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].employeeId, "emp-1");
  assert.equal(writes[0].leaveType, "Casual Leave");
  assert.equal(writes[0].amount, 3);
  assert.equal(writes[0].balanceAfter, 5);
  assert.equal(writes[0].sourceType, "manual_adjustment");
});

test("auto deduction writes a matching ledger row", async () => {
  const writes = [];
  const db = {
    leaveRequest: {
      findFirst: async () => null,
      create: async () => ({ id: "lr-1", leaveType: "Casual Leave", fromDate: new Date("2026-06-10T00:00:00.000Z"), toDate: new Date("2026-06-10T00:00:00.000Z"), days: 1, reason: "Auto full-day Casual Leave", status: "approved", createdAt: new Date(), employee: { employeeCode: "HRGP01", fullName: "Test" } }),
      findUnique: async () => ({ id: "lr-1", leaveType: "Casual Leave", fromDate: new Date("2026-06-10T00:00:00.000Z"), toDate: new Date("2026-06-10T00:00:00.000Z"), days: 1, reason: "Auto full-day Casual Leave", status: "approved", createdAt: new Date(), employee: { employeeCode: "HRGP01", fullName: "Test" } }),
    },
    employeeLeaveBalance: {
      upsert: async ({ update, create }) => ({ id: "elb-1", balance: typeof update.balance === "object" ? -1 : create.balance }),
    },
    leaveBalanceTransaction: {
      create: async ({ data }) => { writes.push(data); },
    },
  };
  const leaveRequest = await applyAttendanceLeaveDeduction({ id: "emp-1" }, "2026-06-10", 120, "user-1", db);
  assert.equal(leaveRequest.id, "lr-1");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].employeeId, "emp-1");
  assert.equal(writes[0].leaveType, "Casual Leave");
  assert.equal(writes[0].amount, -1);
  assert.equal(writes[0].sourceType, "auto_deduction");
  assert.equal(writes[0].sourceId, "lr-1");
});
