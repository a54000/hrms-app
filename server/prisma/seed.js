import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

function moneyValue(value) {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function usernameFromName(nameOrEmail) {
  const value = String(nameOrEmail || "").trim();
  if (!value) return "";
  if (value.includes("@")) return value.split("@")[0].toLowerCase();
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.+/g, ".");
}

function loadRealTeamMembers() {
  const cachePath = resolve(__dirname, "team-members-import.json");
  if (existsSync(cachePath)) {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8").replace(/^\uFEFF/, ""));
    return Array.isArray(parsed) ? parsed : [];
  }

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(__dirname, "load-team-members.ps1"),
      "-RootDir",
      rootDir,
    ], { encoding: "utf8", windowsHide: true });
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Team member workbook import skipped: ${error.message}`);
    return [];
  }
}

const employees = [];

const defaultEntity = "HRGP";

const realTeamMembers = loadRealTeamMembers().map((member, index) => ({
  ...member,
  legalEntity: "HRGP",
  status: "active",
  employmentType: "Full-time",
  managerCode: member.username === "Surinder Singh" ? undefined : "HRGP01",
  workMode: "Remote",
  monthlySalary: moneyValue(member.monthlySalary || member.ctc),
  documents: "Imported from team member username/email, salary calculator, and team workbooks",
  lifecycleStage: "Active",
  complianceStatus: member.pan && member.bankAccount ? "Pending HR Verification" : "Incomplete",
}));

employees.splice(0, employees.length, ...realTeamMembers);

const users = [
  ...realTeamMembers.map((employee) => ({ username: employee.username, email: employee.email, employeeCode: employee.employeeCode, role: employee.role || "employee", legalEntity: employee.legalEntity || defaultEntity })),
];

const clients = [
  {
    clientCode: "CL-1001",
    name: "Taggd",
    status: "active",
    industry: "Recruitment / Staffing",
    workingSince: "2024-10-01",
    owner: "Surinder Singh",
    billingAddress: "Plot No. A-10, Infocity, Phase-1, Sector 34, Gurugram, Haryana-122001",
    gstin: "06AAECT4240J1ZE",
    pan: "AAECT4240J1",
    state: "Haryana",
    stateCode: "07",
    buyerPo: "THPO/00525",
    hsnSac: "998512",
    spoc: "Amit Garg",
    pitchdeck: "Taggd pitchdeck.pdf",
    customizedPitch: "Hiring scale-up pitch",
    proposals: "Monthly recruitment support proposal",
    agreements: ["Master service agreement.pdf"],
    invoices: [
      { invoiceNumber: "INV-1001", invoiceMonth: "2026-05", amount: 125000, status: "raised", dueDate: "2026-06-07" },
      { invoiceNumber: "INV-1002", invoiceMonth: "2026-04", amount: 118000, status: "paid", dueDate: "2026-05-07" },
    ],
  },
  {
    clientCode: "CL-EY-HYD",
    name: "Ernst & Young LLP - Hyderabad",
    status: "active",
    industry: "Consulting",
    workingSince: "2025-04-01",
    owner: "Surinder Singh",
    billingAddress: "18th Floor, The Skyview 10, South Lobby, Survey No 83/1, Raidurgam, Hyderabad, Telangana-500032",
    gstin: "36AAEFE1763C1ZT",
    pan: "AAEFE1763C",
    state: "Telangana",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-EY-GGN",
    name: "Ernst & Young LLP - Gurugram",
    status: "active",
    industry: "Consulting",
    workingSince: "2025-04-01",
    owner: "Surinder Singh",
    billingAddress: "Ground Floor, Plot No 67, Institutional Area, Sector-44, Gurugram, Haryana-122003",
    gstin: "06AAEFE1763C1ZW",
    pan: "AAEFE1763C",
    state: "Haryana",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-EY-PUNE",
    name: "Ernst & Young LLP - Pune",
    status: "active",
    industry: "Consulting",
    workingSince: "2025-04-01",
    owner: "Surinder Singh",
    billingAddress: "Ground Floor, Tower C, Tech Park One, Yerwada, Pune, Maharashtra-411006",
    gstin: "27AAEFE1763C1ZS",
    pan: "AAEFE1763C",
    state: "Maharashtra",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-EY-BLR",
    name: "Ernst & Young LLP - Bengaluru",
    status: "active",
    industry: "Consulting",
    workingSince: "2025-04-01",
    owner: "Surinder Singh",
    billingAddress: "UB City Canberra Block, No. 24, Vittal Mallya Road, Bengaluru, Karnataka-560001",
    gstin: "29AAEFE1763C2ZN",
    pan: "AAEFE1763C",
    state: "Karnataka",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-EY-MUM",
    name: "Ernst & Young LLP - Mumbai",
    status: "active",
    industry: "Consulting",
    workingSince: "2025-04-01",
    owner: "Surinder Singh",
    billingAddress: "The Ruby 29, Senapati Bapat Marg, Dadar West, Mumbai-400028, Maharashtra",
    gstin: "27AAEFE1763C1ZS",
    pan: "AAEFE1763C",
    state: "Maharashtra",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-HB",
    name: "HAVER & BOECKER INDIA Pvt. Ltd",
    status: "active",
    industry: "Manufacturing",
    workingSince: "2025-07-01",
    owner: "Surinder Singh",
    billingAddress: "Survey No. 32/4/41 & 42 Khandiwada, Baroda Halol Road, Post Asoj, Vadodara 391510 Gujarat",
    gstin: "24AABCH9243A1Z1",
    pan: "AABCH9243A",
    state: "Gujarat",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-TRIAM",
    name: "TRIAM SECURITY (INDIA) PRIVATE LIMITED",
    status: "active",
    industry: "Security",
    workingSince: "2025-09-01",
    owner: "Surinder Singh",
    billingAddress: "208, Golden Park Society, Ashram Road, Nr. Nav Gujarat College of Computer Application, Usmanpura, Ahmedabad-380013",
    gstin: "24AALCT1625Q1ZW",
    pan: "AALCT1625Q",
    state: "Gujarat",
    hsnSac: "998519",
    spoc: "Client SPOC",
    agreements: [],
    invoices: [],
  },
  {
    clientCode: "CL-1002",
    name: "HR Guru Placement Services",
    status: "active",
    industry: "HR Services",
    workingSince: "2023-04-01",
    owner: "Priya Sharma",
    billingAddress: "",
    gstin: "",
    pan: "",
    state: "Haryana",
    stateCode: "06",
    buyerPo: "",
    hsnSac: "998519",
    spoc: "Priya Sharma",
    pitchdeck: "HRGP services deck.pdf",
    customizedPitch: "Payroll and HR operations pitch",
    proposals: "Retainer proposal",
    agreements: ["Annual agreement.pdf"],
    invoices: [
      { invoiceNumber: "INV-1003", invoiceMonth: "2026-05", amount: 98000, status: "draft", dueDate: "2026-06-10" },
    ],
  },
];

const holidays = [
  { holidayDate: "2026-01-26", name: "Republic Day", type: "National" },
  { holidayDate: "2026-03-04", name: "Holi", type: "National" },
  { holidayDate: "2026-06-15", name: "June Audit Holiday", type: "Company" },
  { holidayDate: "2026-08-15", name: "Independence Day", type: "National" },
  { holidayDate: "2026-10-02", name: "Gandhi Jayanti", type: "National" },
  { holidayDate: "2026-11-08", name: "Diwali", type: "National" },
  { holidayDate: "2026-12-25", name: "Christmas", type: "National" },
];

const juneCoverageFixtures = {
  month: "2026-06",
  holidayDates: new Set(["2026-06-15"]),
  employeePlans: [
    { employeeCode: "HRGP09", attendance: "mostly_present", absences: ["2026-06-11", "2026-06-24"] },
    { employeeCode: "HRGP38", attendance: "mostly_present", paidLeave: [{ fromDate: "2026-06-08", toDate: "2026-06-08", days: 1 }] },
    { employeeCode: "HRGP51", attendance: "mostly_present", unpaidLeave: [{ fromDate: "2026-06-12", toDate: "2026-06-13", days: 2 }] },
    { employeeCode: "HRGP57", attendance: "mostly_present", halfDayLeave: { date: "2026-06-03", leaveType: "Casual Leave", days: 0.5 } },
    { employeeCode: "HRGP71", attendance: "mostly_present", absences: ["2026-06-18"], paidLeave: [{ fromDate: "2026-06-22", toDate: "2026-06-23", days: 2 }] },
    { employeeCode: "HRGP82", attendance: "mostly_present", unpaidLeave: [{ fromDate: "2026-06-09", toDate: "2026-06-09", days: 1 }] },
    { employeeCode: "HRGP84", attendance: "mostly_present", absences: ["2026-06-17"] },
    { employeeCode: "HRGP88", attendance: "mostly_present", paidLeave: [{ fromDate: "2026-06-11", toDate: "2026-06-12", days: 2 }] },
    { employeeCode: "HRGPX24", attendance: "mostly_present", paidLeave: [{ fromDate: "2026-06-03", toDate: "2026-06-03", days: 0.5 }], absences: ["2026-06-19"] },
    { employeeCode: "HRGPMID1", attendance: "mid_month_joiner", joinDate: "2026-06-16", attendanceStart: "2026-06-16", paidLeave: [{ fromDate: "2026-06-24", toDate: "2026-06-25", days: 2 }] },
    { employeeCode: "HRGP82", leaveMismatch: { fromDate: "2026-06-25", toDate: "2026-06-28", days: 2 } },
    { employeeCode: "HRGP88", holidaySpanLeave: { fromDate: "2026-06-14", toDate: "2026-06-16", days: 3 } },
  ],
};

function toDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(`${value}T00:00:00.000Z`);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }
  return null;
}

function monthRange(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start, end };
}

function addDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dayOfWeek(date) {
  return date.getUTCDay();
}

function buildWorkingCalendar({ month, holidayDates = new Set(), saturdayWorkingDates = new Set() }) {
  const { start, end } = monthRange(month);
  const dates = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    const iso = current.toISOString().slice(0, 10);
    const saturday = dayOfWeek(current) === 6;
    const weekend = dayOfWeek(current) === 0 || saturday;
    const holiday = holidayDates.has(iso);
    const saturdayRotaWorkingDay = saturday && saturdayWorkingDates.has(iso);
    const isWorkingDay = !holiday && (!weekend || saturdayRotaWorkingDay);
    dates.push({ date: iso, isWorkingDay, holiday, weekend, saturdayRotaWorkingDay });
  }
  return dates;
}

function dateSetFromRows(rows) {
  return new Set(rows.map((row) => row.date));
}

function workingDatesForEmployee(calendar, employeePlan, saturdayWorkingDates = new Set()) {
  if (employeePlan.attendance === "mid_month_joiner") {
    return calendar.filter((day) => day.isWorkingDay && day.date >= employeePlan.attendanceStart);
  }
  return calendar.filter((day) => day.isWorkingDay);
}

function inferStatusForDate(date, plan) {
  if (plan.halfDayLeave?.date === date) return "Half Day";
  if (plan.absences?.includes(date)) return "Absent";
  if (plan.paidLeave?.some((leave) => date >= leave.fromDate && date <= leave.toDate)) return "Leave";
  if (plan.unpaidLeave?.some((leave) => date >= leave.fromDate && date <= leave.toDate)) return "Leave";
  if (plan.leaveMismatch && date >= plan.leaveMismatch.fromDate && date <= plan.leaveMismatch.toDate) return "Leave";
  if (plan.holidaySpanLeave && date >= plan.holidaySpanLeave.fromDate && date <= plan.holidaySpanLeave.toDate) return "Leave";
  return "Present";
}

function attendancePayload(employee, date, status) {
  const base = {
    employeeId: employee.id,
    attendanceDate: toDate(date),
    status: status.toLowerCase() === "half day" ? "half_day" : status.toLowerCase(),
    source: "seed",
    remarks: "Seeded June 2026 coverage",
  };
  if (status === "Present") return { ...base, status: "present", durationMinutes: 510 };
  if (status === "Absent") return { ...base, status: "absent" };
  if (status === "Leave") return { ...base, status: "leave" };
  return { ...base, status: "half_day", durationMinutes: 240 };
}

async function seedJune2026Coverage() {
  const { start, end } = monthRange(juneCoverageFixtures.month);
  const allEmployees = await prisma.employee.findMany({
    where: { status: { in: ["active", "probation", "on_leave"] } },
    select: { id: true, employeeCode: true, joinDate: true },
  });
  const midMonthJoiner = await prisma.employee.upsert({
    where: { employeeCode_legalEntity: { employeeCode: "HRGPMID1", legalEntity: defaultEntity } },
    update: {
      fullName: "Mid Month Joiner",
      email: "mid.month.joiner@hrguru.in",
      designation: "HR Associate",
      department: "Operations",
      status: "active",
      joinDate: toDate("2026-06-16"),
      monthlySalary: moneyValue(45000),
      workMode: "Office",
      complianceStatus: "Seeded June coverage",
    },
    create: {
      employeeCode: "HRGPMID1",
      legalEntity: defaultEntity,
      fullName: "Mid Month Joiner",
      email: "mid.month.joiner@hrguru.in",
      designation: "HR Associate",
      department: "Operations",
      status: "active",
      joinDate: toDate("2026-06-16"),
      monthlySalary: moneyValue(45000),
      workMode: "Office",
      complianceStatus: "Seeded June coverage",
    },
  });
  const seededMidUser = await prisma.user.findUnique({ where: { email: "mid.month.joiner@hrguru.in" } });
  if (!seededMidUser) {
    const passwordHash = await bcrypt.hash("password123", 10);
    await prisma.user.create({
      data: {
        username: "mid.month.joiner",
        email: "mid.month.joiner@hrguru.in",
        passwordHash,
        role: "employee",
        employeeId: midMonthJoiner.id,
      },
    });
  }
  const employeeByCode = new Map([...allEmployees, midMonthJoiner].map((employee) => [employee.employeeCode, employee]));
  const calendar = buildWorkingCalendar({ month: juneCoverageFixtures.month, holidayDates: juneCoverageFixtures.holidayDates });

  for (const plan of juneCoverageFixtures.employeePlans) {
    const employee = employeeByCode.get(plan.employeeCode);
    if (!employee) continue;
    const workDays = workingDatesForEmployee(calendar, plan);
    const leaveDates = new Set();
    for (const leave of plan.paidLeave || []) {
      const request = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          leaveType: "Casual Leave",
          fromDate: toDate(leave.fromDate),
          toDate: toDate(leave.toDate),
          status: "approved",
        },
      });
      if (!request) {
        await prisma.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveType: "Casual Leave",
            fromDate: toDate(leave.fromDate),
            toDate: toDate(leave.toDate),
            days: leave.days,
            status: "approved",
            approverId: null,
            approvedAt: new Date(),
            createdById: null,
            reason: "Seeded paid leave coverage",
          },
        });
      }
      for (let current = toDate(leave.fromDate); current <= toDate(leave.toDate); current = addDays(current, 1)) {
        leaveDates.add(current.toISOString().slice(0, 10));
      }
    }
    for (const leave of plan.unpaidLeave || []) {
      const request = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          leaveType: "Unpaid Leave",
          fromDate: toDate(leave.fromDate),
          toDate: toDate(leave.toDate),
          status: "approved",
        },
      });
      if (!request) {
        await prisma.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveType: "Unpaid Leave",
            fromDate: toDate(leave.fromDate),
            toDate: toDate(leave.toDate),
            days: leave.days,
            status: "approved",
            approverId: null,
            approvedAt: new Date(),
            createdById: null,
            reason: "Seeded unpaid leave coverage",
          },
        });
      }
      for (let current = toDate(leave.fromDate); current <= toDate(leave.toDate); current = addDays(current, 1)) {
        leaveDates.add(current.toISOString().slice(0, 10));
      }
    }
    if (plan.halfDayLeave) {
      const leave = plan.halfDayLeave;
      const existing = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          leaveType: leave.leaveType,
          fromDate: toDate(leave.date),
          toDate: toDate(leave.date),
          days: 0.5,
          status: "approved",
        },
      });
      if (!existing) {
        await prisma.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveType: leave.leaveType,
            fromDate: toDate(leave.date),
            toDate: toDate(leave.date),
            days: 0.5,
            status: "approved",
            approverId: null,
            approvedAt: new Date(),
            createdById: null,
            reason: "Seeded half-day leave coverage",
          },
        });
      }
      leaveDates.add(leave.date);
    }
    if (plan.leaveMismatch) {
      const leave = plan.leaveMismatch;
      const existing = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          leaveType: "Casual Leave",
          fromDate: toDate(leave.fromDate),
          toDate: toDate(leave.toDate),
          days: leave.days,
          status: "approved",
        },
      });
      if (!existing) {
        await prisma.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveType: "Casual Leave",
            fromDate: toDate(leave.fromDate),
            toDate: toDate(leave.toDate),
            days: leave.days,
            status: "approved",
            approverId: null,
            approvedAt: new Date(),
            createdById: null,
            reason: "Seeded leave mismatch coverage",
          },
        });
      }
      for (let current = toDate(leave.fromDate); current <= toDate(leave.toDate); current = addDays(current, 1)) {
        leaveDates.add(current.toISOString().slice(0, 10));
      }
    }
    if (plan.holidaySpanLeave) {
      const leave = plan.holidaySpanLeave;
      const existing = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          leaveType: "Casual Leave",
          fromDate: toDate(leave.fromDate),
          toDate: toDate(leave.toDate),
          days: leave.days,
          status: "approved",
        },
      });
      if (!existing) {
        await prisma.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveType: "Casual Leave",
            fromDate: toDate(leave.fromDate),
            toDate: toDate(leave.toDate),
            days: leave.days,
            status: "approved",
            approverId: null,
            approvedAt: new Date(),
            createdById: null,
            reason: "Seeded holiday spanning leave coverage",
          },
        });
      }
      for (let current = toDate(leave.fromDate); current <= toDate(leave.toDate); current = addDays(current, 1)) {
        leaveDates.add(current.toISOString().slice(0, 10));
      }
    }
    for (const date of workDays.map((row) => row.date)) {
      const status = inferStatusForDate(date, plan);
      const payload = attendancePayload(employee, date, status);
      const existing = await prisma.attendanceRecord.findFirst({
        where: { employeeId: employee.id, attendanceDate: toDate(date) },
      });
      if (existing) {
        await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await prisma.attendanceRecord.create({ data: payload });
      }
    }
  }
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const byCode = new Map();

  for (const item of employees) {
    const employee = await prisma.employee.upsert({
      where: { employeeCode_legalEntity: { employeeCode: item.employeeCode, legalEntity: item.legalEntity || defaultEntity } },
      update: {
        fullName: item.fullName,
        legalEntity: item.legalEntity || defaultEntity,
        email: item.email,
        phone: item.phone,
        designation: item.designation,
        department: item.department,
        workLocation: item.workLocation,
        employmentType: item.employmentType,
        workMode: item.workMode,
        status: item.status,
        joinDate: toDate(item.joinDate) || toDate("2026-05-01"),
        ctc: item.ctc,
        monthlySalary: moneyValue(item.monthlySalary || item.ctc),
        pan: item.pan,
        bankName: item.bankName,
        bankAccount: item.bankAccount,
        ifsc: item.ifsc,
        bankBranch: item.bankBranch,
        complianceStatus: item.complianceStatus || (item.pan && item.bankAccount ? "Pending HR Verification" : "Incomplete"),
      },
      create: {
        employeeCode: item.employeeCode,
        legalEntity: item.legalEntity || defaultEntity,
        fullName: item.fullName,
        email: item.email,
        phone: item.phone,
        dateOfBirth: toDate(item.dateOfBirth),
        gender: item.gender,
        address: item.address,
        emergencyContact: item.emergencyContact,
        designation: item.designation,
        department: item.department,
        workLocation: item.workLocation,
        employmentType: item.employmentType,
        workMode: item.workMode,
        status: item.status,
        joinDate: toDate(item.joinDate) || toDate("2026-05-01"),
        confirmationDate: toDate(item.confirmationDate),
        salaryBand: item.salaryBand,
        ctc: item.ctc,
        monthlySalary: moneyValue(item.monthlySalary || item.ctc),
        pan: item.pan,
        bankName: item.bankName,
        bankAccount: item.bankAccount,
        ifsc: item.ifsc,
        bankBranch: item.bankBranch,
        complianceStatus: item.complianceStatus || (item.pan && item.bankAccount ? "Pending HR Verification" : "Incomplete"),
        documents: item.documents,
        lifecycleStage: item.lifecycleStage,
      },
    });
    byCode.set(`${item.employeeCode}:${item.legalEntity || defaultEntity}`, employee);
  }

  for (const item of employees) {
    if (!item.managerCode) continue;
    const manager = byCode.get(`${item.managerCode}:${item.legalEntity || defaultEntity}`) || byCode.get(`${item.managerCode}:${defaultEntity}`);
    const employee = byCode.get(`${item.employeeCode}:${item.legalEntity || defaultEntity}`);
    if (manager && employee) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { managerId: manager.id },
      });
    }
  }

  for (const item of users.filter((user) => byCode.has(`${user.employeeCode}:${user.legalEntity || defaultEntity}`))) {
    const employee = byCode.get(`${item.employeeCode}:${item.legalEntity || defaultEntity}`);
    const username = usernameFromName(item.username || item.email);
    const existingEmployeeUser = employee?.id ? await prisma.user.findUnique({ where: { employeeId: employee.id } }) : null;
    if (existingEmployeeUser && existingEmployeeUser.email !== item.email) {
      await prisma.user.update({
        where: { id: existingEmployeeUser.id },
        data: { username, email: item.email, role: item.role, employeeId: employee.id },
      });
    } else {
      await prisma.user.upsert({
        where: { email: item.email },
        update: { username, role: item.role, employeeId: employee?.id },
        create: {
          username,
          email: item.email,
          passwordHash,
          role: item.role,
          employeeId: employee?.id,
        },
      });
    }
  }

  for (const item of clients) {
    const client = await prisma.client.upsert({
      where: { clientCode: item.clientCode },
      update: {
        name: item.name,
        status: item.status,
        industry: item.industry,
        workingSince: toDate(item.workingSince),
        owner: item.owner,
        billingAddress: item.billingAddress,
        gstin: item.gstin,
        pan: item.pan,
        state: item.state,
        stateCode: item.stateCode,
        buyerPo: item.buyerPo,
        hsnSac: item.hsnSac,
        spoc: item.spoc,
        pitchdeck: item.pitchdeck,
        customizedPitch: item.customizedPitch,
        proposals: item.proposals,
      },
      create: {
        clientCode: item.clientCode,
        name: item.name,
        status: item.status,
        industry: item.industry,
        workingSince: toDate(item.workingSince),
        owner: item.owner,
        billingAddress: item.billingAddress,
        gstin: item.gstin,
        pan: item.pan,
        state: item.state,
        stateCode: item.stateCode,
        buyerPo: item.buyerPo,
        hsnSac: item.hsnSac,
        spoc: item.spoc,
        pitchdeck: item.pitchdeck,
        customizedPitch: item.customizedPitch,
        proposals: item.proposals,
      },
    });

    for (const fileName of item.agreements) {
      const existing = await prisma.clientAgreement.findFirst({ where: { clientId: client.id, fileName } });
      if (!existing) await prisma.clientAgreement.create({ data: { clientId: client.id, fileName } });
    }

    for (const invoice of item.invoices) {
      await prisma.clientInvoice.upsert({
        where: { clientId_invoiceNumber: { clientId: client.id, invoiceNumber: invoice.invoiceNumber } },
        update: {
          invoiceMonth: invoice.invoiceMonth,
          amount: invoice.amount,
          dueDate: toDate(invoice.dueDate),
          status: invoice.status,
        },
        create: {
          clientId: client.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceMonth: invoice.invoiceMonth,
          amount: invoice.amount,
          dueDate: toDate(invoice.dueDate),
          status: invoice.status,
        },
      });
    }
  }

  for (const item of holidays) {
    const existing = await prisma.holiday.findFirst({
      where: {
        holidayDate: toDate(item.holidayDate),
        name: item.name,
        legalEntity: item.legalEntity || null,
        location: item.location || null,
      },
    });
    if (existing) {
      await prisma.holiday.update({
        where: { id: existing.id },
        data: {
          type: item.type,
          legalEntity: item.legalEntity || null,
          location: item.location || null,
          isActive: true,
        },
      });
    } else {
      await prisma.holiday.create({
        data: {
          holidayDate: toDate(item.holidayDate),
          name: item.name,
          type: item.type,
          legalEntity: item.legalEntity || null,
          location: item.location || null,
        },
      });
    }
  }

  await seedJune2026Coverage();

  console.log(`Seeded ${employees.length} employees, ${users.length} users, ${clients.length} clients, and ${holidays.length} holidays.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
