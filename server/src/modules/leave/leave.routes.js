import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { httpError } from "../../lib/http-error.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();

const leaveEntitlements = {
  "Casual Leave": 12,
  "Compensatory Off": 0,
  "Work From Home": 24,
  "Unpaid Leave": 0,
};
const paidLeaveTypes = ["Casual Leave"];

const approvalLabelMap = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const approvalValueMap = {
  Approved: "approved",
  Rejected: "rejected",
};

const leaveSchema = z.object({
  employeeCode: z.string().min(1),
  type: z.enum(["Casual Leave", "Compensatory Off", "Work From Home", "Unpaid Leave"]),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  days: z.union([z.string(), z.number()]).optional().nullable(),
  reason: z.string().optional().nullable(),
});

const holidaySchema = z.object({
  date: z.string().min(1),
  name: z.string().min(1),
  type: z.string().optional().nullable(),
  legalEntity: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const leaveBalanceUpdateSchema = z.object({
  balances: z.array(z.object({
    employeeCode: z.string().min(1),
    casualLeaveBalance: z.union([z.string(), z.number()]).optional().nullable(),
    compOffBalance: z.union([z.string(), z.number()]).optional().nullable(),
  })).min(1),
});

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function dayCount(fromDate, toDateValue) {
  const start = toDate(fromDate);
  const end = toDate(toDateValue);
  return Math.max(Math.round((end - start) / 86400000) + 1, 0);
}

function istToday() {
  const istNow = new Date(Date.now() + 330 * 60000);
  return new Date(`${istNow.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function leaveYearRange(referenceDate = istToday()) {
  const date = referenceDate instanceof Date ? referenceDate : toDate(referenceDate);
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return {
    start: new Date(`${year}-04-01T00:00:00.000Z`),
    end: new Date(`${year + 1}-03-30T00:00:00.000Z`),
  };
}

function casualLeaveEntitlement(employee, referenceDate = istToday()) {
  const { start } = leaveYearRange(referenceDate);
  const todayDate = referenceDate instanceof Date ? referenceDate : toDate(referenceDate);
  const joinDate = employee.joinDate || start;
  const exitDate = employee.exitDate || null;
  let entitlement = 0;
  for (let index = 0; index < 12; index += 1) {
    const accrualDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    if (todayDate < accrualDate || joinDate > accrualDate || (exitDate && exitDate < accrualDate)) continue;
    entitlement += 1;
  }
  return Math.min(entitlement, leaveEntitlements["Casual Leave"]);
}

function leaveDaysWithinRange(request, start, end) {
  if (request.toDate < start || request.fromDate > end) return 0;
  const savedDays = Number(request.days || 0);
  const fullRequestDays = dayCount(toDateString(request.fromDate), toDateString(request.toDate));
  if (savedDays > 0 && request.fromDate >= start && request.toDate <= end) return savedDays;
  if (savedDays > 0 && fullRequestDays === 1) return savedDays;
  const fromDate = request.fromDate < start ? start : request.fromDate;
  const toDateValue = request.toDate > end ? end : request.toDate;
  return dayCount(toDateString(fromDate), toDateString(toDateValue));
}

function balanceNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount)) throw httpError(400, "Leave balance must be numeric.");
  return amount;
}

async function manualBalanceMap(employeeIds) {
  const balances = await prisma.employeeLeaveBalance.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true, leaveType: true, balance: true },
  });
  return new Map(balances.map((balance) => [`${balance.employeeId}:${balance.leaveType}`, Number(balance.balance || 0)]));
}

function selectLeave() {
  return {
    id: true,
    leaveType: true,
    fromDate: true,
    toDate: true,
    days: true,
    reason: true,
    status: true,
    createdAt: true,
    employee: { select: { employeeCode: true, fullName: true, manager: { select: { fullName: true } } } },
    approver: { select: { employee: { select: { fullName: true } }, email: true } },
  };
}

function publicLeave(request) {
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
    approver: request.approver?.employee?.fullName || request.employee.manager?.fullName || "HR",
    createdAt: toDateString(request.createdAt),
  };
}

function publicHoliday(holiday) {
  return {
    id: holiday.id,
    date: toDateString(holiday.holidayDate),
    name: holiday.name,
    type: holiday.type,
    legalEntity: holiday.legalEntity || "",
    location: holiday.location || "",
    isActive: holiday.isActive,
  };
}

async function findEmployee(employeeCode) {
  const employee = await prisma.employee.findUnique({
    where: { employeeCode_legalEntity: { employeeCode, legalEntity: "HRGP" } },
    include: { manager: true },
  }) || await prisma.employee.findFirst({ where: { employeeCode }, include: { manager: true }, orderBy: { legalEntity: "asc" } });
  if (!employee) throw httpError(404, "Employee not found.");
  return employee;
}

async function balanceRows(employeeCode) {
  const employee = await findEmployee(employeeCode);
  const manualBalances = await manualBalanceMap([employee.id]);
  const { start, end } = leaveYearRange();
  const records = await prisma.leaveRequest.findMany({
    where: { employeeId: employee.id },
    select: { leaveType: true, status: true, fromDate: true, toDate: true, days: true },
  });
  return Object.entries(leaveEntitlements).map(([type, entitlement]) => {
    const manualBalance = manualBalances.get(`${employee.id}:${type}`);
    const hasManualBalance = manualBalance !== undefined;
    const relevant = paidLeaveTypes.includes(type)
      ? records.filter((request) => paidLeaveTypes.includes(request.leaveType))
      : records.filter((request) => request.leaveType === type);
    const used = relevant.filter((request) => request.status === "approved").reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
    const pending = relevant.filter((request) => request.status === "pending").reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
    const effectiveEntitlement = hasManualBalance
      ? used + pending + manualBalance
      : type === "Casual Leave" ? casualLeaveEntitlement(employee) : entitlement;
    const rawAvailable = effectiveEntitlement - used - pending;
    return {
      type,
      entitlement: effectiveEntitlement,
      used,
      pending,
      available: type === "Unpaid Leave" ? 999 : hasManualBalance && type === "Casual Leave" ? rawAvailable : Math.max(rawAvailable, 0),
    };
  });
}

function calculateBalanceRowsForEmployee(employee, records, manualBalances) {
  const { start, end } = leaveYearRange();
  return Object.entries(leaveEntitlements).map(([type, entitlement]) => {
    const manualBalance = manualBalances.get(`${employee.id}:${type}`);
    const hasManualBalance = manualBalance !== undefined;
    const relevant = paidLeaveTypes.includes(type)
      ? records.filter((request) => paidLeaveTypes.includes(request.leaveType))
      : records.filter((request) => request.leaveType === type);
    const used = relevant.filter((request) => request.status === "approved").reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
    const pending = relevant.filter((request) => request.status === "pending").reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
    const effectiveEntitlement = hasManualBalance
      ? used + pending + manualBalance
      : type === "Casual Leave" ? casualLeaveEntitlement(employee) : entitlement;
    const rawAvailable = effectiveEntitlement - used - pending;
    return {
      type,
      entitlement: effectiveEntitlement,
      used,
      pending,
      available: type === "Unpaid Leave" ? 999 : hasManualBalance && type === "Casual Leave" ? rawAvailable : Math.max(rawAvailable, 0),
    };
  });
}

async function leaveAvailable(employee, type, excludeRequestId = null) {
  const manualBalances = await manualBalanceMap([employee.id]);
  const manualBalance = manualBalances.get(`${employee.id}:${type}`);
  const { start, end } = leaveYearRange();
  const records = await prisma.leaveRequest.findMany({
    where: { employeeId: employee.id, ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) },
    select: { leaveType: true, status: true, fromDate: true, toDate: true, days: true },
  });
  const relevant = paidLeaveTypes.includes(type)
    ? records.filter((request) => paidLeaveTypes.includes(request.leaveType))
    : records.filter((request) => request.leaveType === type);
  const entitlement = type === "Casual Leave" ? casualLeaveEntitlement(employee) : leaveEntitlements[type] ?? 0;
  const used = relevant.filter((request) => request.status === "approved").reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
  const pending = relevant.filter((request) => request.status === "pending").reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
  if (type === "Unpaid Leave") return 999;
  const baseBalance = manualBalance !== undefined ? manualBalance : entitlement;
  return Math.max(baseBalance - used - pending, 0);
}

function duplicateLeaveWhere(employeeId, leaveType, fromDate, toDateValue, excludeId = null, statuses = ["pending", "approved"]) {
  return {
    employeeId,
    leaveType,
    status: { in: statuses },
    fromDate: { lte: toDateValue },
    toDate: { gte: fromDate },
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
}

router.use(requireAuth);

router.get("/holidays", async (request, response, next) => {
  try {
    const year = Number(request.query.year || new Date().getFullYear());
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year}-12-31T00:00:00.000Z`);
    const holidays = await prisma.holiday.findMany({
      where: { holidayDate: { gte: start, lte: end }, isActive: true },
      orderBy: [{ holidayDate: "asc" }, { name: "asc" }],
    });
    response.json({ holidays: holidays.map(publicHoliday) });
  } catch (error) {
    next(error);
  }
});

router.post("/holidays", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = holidaySchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Holiday details are incomplete.");
    const holiday = await prisma.holiday.create({
      data: {
        holidayDate: toDate(parsed.data.date),
        name: parsed.data.name,
        type: parsed.data.type || "National",
        legalEntity: parsed.data.legalEntity || null,
        location: parsed.data.location || null,
        isActive: parsed.data.isActive ?? true,
      },
    });
    response.status(201).json({ holiday: publicHoliday(holiday) });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Holiday already exists for this date."));
    else next(error);
  }
});

router.patch("/holidays/:id", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = holidaySchema.partial().safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Holiday details are invalid.");
    const data = {};
    if (Object.hasOwn(parsed.data, "date")) data.holidayDate = toDate(parsed.data.date);
    if (Object.hasOwn(parsed.data, "name")) data.name = parsed.data.name;
    if (Object.hasOwn(parsed.data, "type")) data.type = parsed.data.type || "National";
    if (Object.hasOwn(parsed.data, "legalEntity")) data.legalEntity = parsed.data.legalEntity || null;
    if (Object.hasOwn(parsed.data, "location")) data.location = parsed.data.location || null;
    if (Object.hasOwn(parsed.data, "isActive")) data.isActive = parsed.data.isActive;
    const holiday = await prisma.holiday.update({ where: { id: request.params.id }, data });
    response.json({ holiday: publicHoliday(holiday) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Holiday not found."));
    else next(error);
  }
});

router.delete("/holidays/:id", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const holiday = await prisma.holiday.update({
      where: { id: request.params.id },
      data: { isActive: false },
    });
    response.json({ holiday: publicHoliday(holiday) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Holiday not found."));
    else next(error);
  }
});

router.get("/balances", requireRole("admin", "hr"), async (_request, response, next) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { status: { in: ["active", "probation", "on_leave"] } },
      orderBy: [{ employeeCode: "asc" }],
      select: { id: true, employeeCode: true, fullName: true, client: true, designation: true, joinDate: true, exitDate: true },
    });
    const manualBalances = await manualBalanceMap(employees.map((employee) => employee.id));
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: { employeeId: { in: employees.map((employee) => employee.id) } },
      select: { employeeId: true, leaveType: true, status: true, fromDate: true, toDate: true, days: true },
    });
    const requestsByEmployee = new Map();
    leaveRequests.forEach((leaveRequest) => {
      const rows = requestsByEmployee.get(leaveRequest.employeeId) || [];
      rows.push(leaveRequest);
      requestsByEmployee.set(leaveRequest.employeeId, rows);
    });
    const rows = employees.map((employee) => {
      const balances = calculateBalanceRowsForEmployee(employee, requestsByEmployee.get(employee.id) || [], manualBalances);
      const casual = balances.find((balance) => balance.type === "Casual Leave") || {};
      const compOff = balances.find((balance) => balance.type === "Compensatory Off") || {};
      return {
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        client: employee.client || "",
        designation: employee.designation,
        casualLeaveBalance: manualBalances.get(`${employee.id}:Casual Leave`) ?? casual.available ?? 0,
        casualUsed: casual.used || 0,
        casualPending: casual.pending || 0,
        compOffBalance: manualBalances.get(`${employee.id}:Compensatory Off`) ?? compOff.available ?? 0,
      };
    });
    response.json({ balances: rows });
  } catch (error) {
    next(error);
  }
});

router.put("/balances", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = leaveBalanceUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Leave balance details are invalid.");
    await prisma.$transaction(async (tx) => {
      for (const row of parsed.data.balances) {
        const employee = await tx.employee.findFirst({ where: { employeeCode: row.employeeCode }, select: { id: true } });
        if (!employee) throw httpError(404, `Employee ${row.employeeCode} was not found.`);
        const updates = [
          ["Casual Leave", row.casualLeaveBalance],
          ["Compensatory Off", row.compOffBalance],
        ].filter(([, value]) => value !== undefined && value !== null);
        for (const [leaveType, value] of updates) {
          await tx.employeeLeaveBalance.upsert({
            where: { employeeId_leaveType: { employeeId: employee.id, leaveType } },
            update: { balance: balanceNumber(value), source: "manual", updatedById: request.user.id },
            create: { employeeId: employee.id, leaveType, balance: balanceNumber(value), source: "manual", updatedById: request.user.id },
          });
        }
      }
    });
    response.json({ message: "Leave balances updated." });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_request, response, next) => {
  try {
    const requests = await prisma.leaveRequest.findMany({
      orderBy: { createdAt: "desc" },
      select: selectLeave(),
    });
    response.json({ leaveRequests: requests.map(publicLeave) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const parsed = leaveSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Leave details are incomplete.");
    const employee = await findEmployee(parsed.data.employeeCode);
    const fromDate = toDate(parsed.data.fromDate);
    const toDateValue = toDate(parsed.data.toDate);
    const requestedDays = Number(parsed.data.days || dayCount(parsed.data.fromDate, parsed.data.toDate));
    const requestRecord = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.leaveRequest.findFirst({
        where: duplicateLeaveWhere(employee.id, parsed.data.type, fromDate, toDateValue),
        select: { id: true },
      });
      if (duplicate) throw httpError(409, `A ${parsed.data.type} request already exists for this date.`);
      if (!["Work From Home", "Unpaid Leave"].includes(parsed.data.type)) {
        const available = await leaveAvailable(employee, parsed.data.type);
        if (requestedDays > available) throw httpError(400, `Only ${available} ${parsed.data.type} day${available === 1 ? "" : "s"} available.`);
      }
      return tx.leaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveType: parsed.data.type,
          fromDate,
          toDate: toDateValue,
          days: requestedDays,
          reason: parsed.data.reason || null,
        },
        select: selectLeave(),
      });
    }, { isolationLevel: "Serializable" });
    response.status(201).json({ leaveRequest: publicLeave(requestRecord) });
  } catch (error) {
    if (error.code === "P2034") next(httpError(409, "A duplicate leave request was detected. Please refresh and try again."));
    else next(error);
  }
});

async function assertNoApprovedLeaveOverlap(leaveRequest) {
  const duplicate = await prisma.leaveRequest.findFirst({
    where: duplicateLeaveWhere(leaveRequest.employeeId, leaveRequest.leaveType, leaveRequest.fromDate, leaveRequest.toDate, leaveRequest.id, ["approved"]),
    select: { id: true, fromDate: true, toDate: true },
  });
  if (duplicate) throw httpError(409, "An approved leave request already exists for this employee, leave type, and date range.");
}

router.get("/balances/:employeeId", async (request, response, next) => {
  try {
    response.json({ balances: await balanceRows(request.params.employeeId) });
  } catch (error) {
    next(error);
  }
});

async function decideLeave(id, status, approverId) {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, employeeId: true, leaveType: true, fromDate: true, toDate: true, days: true, employee: true },
  });
  if (!existing) throw httpError(404, "Leave request not found.");
  if (status === approvalValueMap.Approved) {
    await assertNoApprovedLeaveOverlap(existing);
    if (!["Work From Home", "Unpaid Leave"].includes(existing.leaveType)) {
      const requestedDays = Number(existing.days || dayCount(toDateString(existing.fromDate), toDateString(existing.toDate)));
      const available = await leaveAvailable(existing.employee, existing.leaveType, existing.id);
      if (requestedDays > available) throw httpError(400, `Only ${available} ${existing.leaveType} day${available === 1 ? "" : "s"} available.`);
    }
  }
  const leaveRequest = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      approverId,
      approvedAt: new Date(),
    },
    select: selectLeave(),
  });
  return publicLeave(leaveRequest);
}

router.patch("/:id/approve", requireRole("admin", "hr", "manager"), async (request, response, next) => {
  try {
    response.json({ leaveRequest: await decideLeave(request.params.id, approvalValueMap.Approved, request.user.id) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Leave request not found."));
    else next(error);
  }
});

router.patch("/:id/reject", requireRole("admin", "hr", "manager"), async (request, response, next) => {
  try {
    response.json({ leaveRequest: await decideLeave(request.params.id, approvalValueMap.Rejected, request.user.id) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Leave request not found."));
    else next(error);
  }
});

router.patch("/:id/cancel", async (request, response, next) => {
  try {
    const existing = await prisma.leaveRequest.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        employeeId: true,
        status: true,
        employee: { select: { managerId: true } },
      },
    });
    if (!existing) throw httpError(404, "Leave request not found.");
    if (existing.status !== "pending") throw httpError(400, "Only pending leave requests can be cancelled.");
    const isOwner = request.user.employee?.id === existing.employeeId;
    const isManager = request.user.role === "manager" && request.user.employee?.id === existing.employee?.managerId;
    const isAdmin = ["admin", "hr"].includes(request.user.role);
    if (!isOwner && !isManager && !isAdmin) throw httpError(403, "You can cancel only your own or team leave requests.");

    const leaveRequest = await prisma.leaveRequest.update({
      where: { id: request.params.id },
      data: {
        status: "rejected",
        reason: "Cancelled by requester",
        approverId: request.user.id,
        approvedAt: new Date(),
      },
      select: selectLeave(),
    });
    response.json({ leaveRequest: publicLeave(leaveRequest) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Leave request not found."));
    else next(error);
  }
});

export default router;
