import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Download,
  Edit3,
  FileText,
  Gauge,
  IndianRupee,
  LayoutDashboard,
  Link,
  LogOut,
  Mail,
  Paperclip,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  Upload,
  X,
} from "lucide-react";
import casualLeaveImport from "./casualLeaveBalances.json";
import "./styles.css";

const modules = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "my-profile", label: "My Profile", icon: UserCheck },
  { id: "client-management", label: "Client Management", icon: BriefcaseBusiness },
  { id: "employees", label: "Employees", icon: Users },
  { id: "attendance", label: "Attendance", icon: Clock3 },
  { id: "saturday-rota", label: "Saturday Rota", icon: CalendarCheck },
  { id: "leave", label: "Leave", icon: CalendarCheck },
  { id: "payroll", label: "Payroll", icon: IndianRupee },
  { id: "communication", label: "Communication", icon: Mail },
  { id: "recruitment", label: "Recruitment", icon: BriefcaseBusiness },
  { id: "performance", label: "Performance", icon: Star },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

const rolePermissions = {
  admin: { hiddenModules: ["my-profile"], canManageEmployees: true, canApproveLeave: true, canManagePayroll: true, canManageAttendance: true, canManageClients: true, canManageRota: true },
  hr: { hiddenModules: ["my-profile"], canManageEmployees: true, canApproveLeave: true, canManagePayroll: true, canManageAttendance: true, canManageClients: true, canManageRota: true },
  manager: { hiddenModules: ["my-profile", "client-management", "communication", "recruitment", "reports", "settings"], canManageEmployees: false, canApproveLeave: true, canManagePayroll: false, canManageAttendance: false, canManageClients: false, canManageRota: true },
  employee: { hiddenModules: ["client-management", "employees", "communication", "recruitment", "reports", "settings"], canManageEmployees: false, canApproveLeave: false, canManagePayroll: false, canManageAttendance: true, canManageClients: false, canManageRota: false },
};

const roleProfiles = {
  admin: {
    label: "Admin / HR",
    name: "Surinder Singh",
    headline: "Full HR operations access",
    access: ["Add and manage employees", "Approve leave", "Track attendance", "Manage candidates", "Generate payroll reports"],
  },
  hr: {
    label: "HR",
    name: "Priya Sharma",
    headline: "Employee operations and approvals",
    access: ["Add and manage employees", "Approve leave", "Track attendance", "Manage candidates", "Generate payroll reports"],
  },
  manager: {
    label: "Manager",
    name: "Rhea Mehta",
    headline: "Team approvals and performance",
    access: ["View team", "Approve leave", "Give performance feedback"],
  },
  employee: {
    label: "Employee",
    name: "Amit Rao",
    headline: "Self-service workspace",
    access: ["View profile", "Apply for leave", "View attendance", "Download payslip"],
  },
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SESSION_STORAGE_KEY = "hrguru_hrms_session_v1";
const AUTH_TOKEN_STORAGE_KEY = "hrguru_hrms_auth_token_v1";
const CLIENT_STORAGE_KEY = "hrguru_hrms_clients_v1";
const DEVICE_STORAGE_KEY = "hrguru_hrms_device_key_v1";

let googleIdentityScriptPromise;

function getDeviceKey() {
  let deviceKey = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!deviceKey) {
    deviceKey = window.crypto?.randomUUID?.() || `hrms-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceKey);
  }
  return deviceKey;
}

function deviceLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "This machine";
  return `${platform} - ${navigator.language || "browser"}`;
}

function browserName() {
  const userAgent = navigator.userAgent || "";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "Browser";
}

function deviceType() {
  const userAgent = navigator.userAgent || "";
  if (/ipad|tablet/i.test(userAgent)) return "Tablet";
  if (/android|iphone|ipod|mobile/i.test(userAgent)) return "Mobile";
  return "Desktop";
}

function loginDeviceInfo() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Unknown platform";
  const browser = browserName();
  return {
    deviceName: `${platform} - ${browser}`,
    deviceType: deviceType(),
    platform,
    browser,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    language: navigator.language || "",
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
  };
}

function loadGoogleIdentityScript() {
  if (!GOOGLE_CLIENT_ID) return Promise.resolve(false);
  if (window.google?.accounts) return Promise.resolve(true);
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;
  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector("script[src='https://accounts.google.com/gsi/client']");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google login could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Google login could not be loaded."));
    document.head.appendChild(script);
  });
  return googleIdentityScriptPromise;
}

async function requestGoogleMailAccessToken() {
  if (!GOOGLE_CLIENT_ID) return "";
  await loadGoogleIdentityScript();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_GMAIL_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || "Google mail permission was not granted."));
          return;
        }
        resolve(response.access_token || "");
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

const emptyEmployee = {
  employeeId: "",
  name: "",
  email: "",
  phone: "",
  dob: "",
  gender: "",
  address: "",
  emergencyContact: "",
  role: "",
  dept: "Engineering",
  client: "",
  clientStartDate: "2026-01-01",
  manager: "",
  location: "Pune",
  status: "Active",
  employmentType: "Full-time",
  legalEntity: "HRGP",
  joinDate: "",
  workMode: "Office",
  salaryBand: "",
  ctc: "",
  monthlySalary: "",
  payrollStatus: "Ready",
  pan: "",
  bankName: "",
  bankAccount: "",
  ifsc: "",
  bankBranch: "",
  uan: "",
  aadhaarNumber: "",
  complianceStatus: "Missing",
  attendance: "Present",
  documents: "Offer letter, ID proof",
  preJoiningDocuments: "",
  kycDocuments: "",
  pfDeclaration: "",
  onboardingStatus: "Not sent",
  lifecycleStage: "Active",
  confirmationDate: "",
  exitDate: "",
};

const initialClients = [
  {
    id: "CL-1001",
    name: "Taggd",
    status: "Active",
    industry: "Recruitment / Staffing",
    workingSince: "2024-10-01",
    owner: "Surinder Singh",
    agreements: ["Master service agreement.pdf"],
    bdTools: {
      pitchdeck: "Taggd pitchdeck.pdf",
      customizedPitch: "Hiring scale-up pitch",
      proposals: "Monthly recruitment support proposal",
    },
    invoices: [
      { id: "INV-1001", month: "2026-05", amount: "125000", status: "Raised", dueDate: "2026-06-07" },
      { id: "INV-1002", month: "2026-04", amount: "118000", status: "Paid", dueDate: "2026-05-07" },
    ],
  },
  {
    id: "CL-1002",
    name: "HR Guru Placement Services",
    status: "Active",
    industry: "HR Services",
    workingSince: "2023-04-01",
    owner: "Priya Sharma",
    agreements: ["Annual agreement.pdf"],
    bdTools: {
      pitchdeck: "HRGP services deck.pdf",
      customizedPitch: "Payroll and HR operations pitch",
      proposals: "Retainer proposal",
    },
    invoices: [
      { id: "INV-1003", month: "2026-05", amount: "98000", status: "Draft", dueDate: "2026-06-10" },
    ],
  },
];

const taggdDefaultServiceItems = [
  { description: "Recruiters Salaries", count: 41, rate: 34540.66, amount: 1416167 },
  { description: "Seats Cost (Recruiters)", count: 20, rate: 4500, amount: 90000 },
  { description: "Manager Salary", count: 1, rate: 50000, amount: 50000 },
  { description: "Seats Cost (Manager)", count: 1, rate: 4500, amount: 4500 },
  { description: "Partial Laptop Cost Payment - 2/6", count: 2, rate: 3333, amount: 6666 },
  { description: "Partial Laptop Cost Payment - 3/6", count: 2, rate: 3333, amount: 6666 },
  { description: "Mark-up Charges", count: 15, rate: 15606.67, amount: 234100.05 },
];

function loadStoredClients() {
  try {
    const stored = window.localStorage.getItem(CLIENT_STORAGE_KEY);
    if (!stored) return initialClients;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed : initialClients;
  } catch {
    return initialClients;
  }
}

function complianceStatusFor(employee) {
  const requiredFields = ["pan", "uan", "aadhaarNumber", "bankName", "bankAccount", "ifsc"];
  if (requiredFields.every((field) => Boolean(String(employee?.[field] || "").trim()))) return employee?.complianceStatus || "Pending HR Verification";
  if (requiredFields.some((field) => Boolean(String(employee?.[field] || "").trim()))) return "Incomplete";
  return "Missing";
}

function maskLast(value, visible = 4) {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text) return "";
  if (text.length <= visible) return text;
  return `${"X".repeat(Math.max(text.length - visible, 0))}${text.slice(-visible)}`;
}

const initialEmployees = [];

const EMPLOYEE_STORAGE_KEY = "hrguru_hrms_employees_v1";
const employeeCsvColumns = [
  ["legalEntity", "Entity"],
  ["employeeId", "Employee ID"],
  ["name", "Full Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["dob", "Date of Birth"],
  ["gender", "Gender"],
  ["address", "Address"],
  ["emergencyContact", "Emergency Contact"],
  ["role", "Job Title"],
  ["dept", "Department"],
  ["client", "Client"],
  ["clientStartDate", "Client Start Date"],
  ["manager", "Manager"],
  ["location", "Location"],
  ["status", "Status"],
  ["employmentType", "Employment Type"],
  ["joinDate", "Join Date"],
  ["workMode", "Work Mode"],
  ["salaryBand", "Salary Band"],
  ["ctc", "CTC"],
  ["monthlySalary", "Monthly Salary"],
  ["payrollStatus", "Payroll Status"],
  ["pan", "PAN"],
  ["uan", "UAN"],
  ["aadhaarNumber", "Aadhaar"],
  ["bankName", "Bank Name"],
  ["bankAccount", "Bank Account"],
  ["ifsc", "IFSC"],
  ["bankBranch", "Bank Branch"],
  ["complianceStatus", "Compliance Status"],
  ["documents", "Documents"],
  ["lifecycleStage", "Lifecycle Stage"],
  ["confirmationDate", "Confirmation Date"],
  ["exitDate", "Exit Date"],
];

function loadStoredEmployees() {
  try {
    const stored = window.localStorage.getItem(EMPLOYEE_STORAGE_KEY);
    if (!stored) return initialEmployees;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length ? parsed.filter((employee) => !String(employee.employeeId || "").startsWith("HG-")).map((employee) => {
      return {
        ...emptyEmployee,
        ...employee,
        pan: employee.pan || "",
        uan: employee.uan || "",
        aadhaarNumber: employee.aadhaarNumber || "",
        bankName: employee.bankName || "",
        bankAccount: employee.bankAccount || "",
        ifsc: employee.ifsc || "",
        bankBranch: employee.bankBranch || "",
        complianceStatus: employee.complianceStatus || complianceStatusFor(employee),
      };
    }) : initialEmployees;
  } catch {
    return initialEmployees;
  }
}

const statusToApi = {
  Active: "active",
  Probation: "probation",
  "On Leave": "on_leave",
  Inactive: "inactive",
  Exited: "exited",
};

const statusFromApi = {
  active: "Active",
  probation: "Probation",
  on_leave: "On Leave",
  inactive: "Inactive",
  exited: "Exited",
};

function employeeFromApi(employee) {
  return {
    ...emptyEmployee,
    id: employee.id,
    employeeId: employee.employeeCode,
    legalEntity: employee.legalEntity || "HRGP",
    name: employee.fullName,
    email: employee.email,
    phone: employee.phone || "",
    dob: employee.dateOfBirth || "",
    gender: employee.gender || "",
    address: employee.address || "",
    emergencyContact: employee.emergencyContact || "",
    role: employee.designation,
    dept: employee.department,
    client: employee.client || "",
    clientStartDate: employee.clientStartDate || "2026-01-01",
    manager: employee.managerName || "",
    managerEmployeeCode: employee.managerEmployeeCode || "",
    location: employee.workLocation || "",
    status: statusFromApi[employee.status] || "Active",
    employmentType: employee.employmentType || "Full-time",
    joinDate: employee.joinDate || "",
    workMode: employee.workMode || "Office",
    salaryBand: employee.salaryBand || "",
    ctc: employee.ctc || "",
    monthlySalary: employee.monthlySalary || "",
    pan: employee.pan || "",
    uan: employee.uan || "",
    aadhaarNumber: employee.aadhaarNumber || "",
    bankName: employee.bankName || "",
    bankAccount: employee.bankAccount || "",
    ifsc: employee.ifsc || "",
    bankBranch: employee.bankBranch || "",
    complianceStatus: employee.complianceStatus || complianceStatusFor(employee),
    documents: employee.documents || "",
    preJoiningDocuments: employee.preJoiningDocuments || "",
    kycDocuments: employee.kycDocuments || "",
    pfDeclaration: employee.pfDeclaration || "",
    onboardingStatus: employee.onboardingStatus || "",
    lifecycleStage: employee.lifecycleStage || "",
    confirmationDate: employee.confirmationDate || "",
    exitDate: employee.exitDate || "",
  };
}

function employeeToApi(employee) {
  return {
    employeeCode: employee.employeeId,
    legalEntity: employee.legalEntity || "HRGP",
    fullName: employee.name,
    email: employee.email,
    phone: employee.phone,
    dateOfBirth: employee.dob,
    gender: employee.gender,
    address: employee.address,
    emergencyContact: employee.emergencyContact,
    designation: employee.role,
    department: employee.dept,
    client: employee.client,
    clientStartDate: employee.clientStartDate || "2026-01-01",
    managerEmployeeCode: employee.managerEmployeeCode || "",
    workLocation: employee.location,
    employmentType: employee.employmentType,
    workMode: employee.workMode,
    status: statusToApi[employee.status] || "active",
    joinDate: employee.joinDate || new Date().toISOString().slice(0, 10),
    confirmationDate: employee.confirmationDate,
    exitDate: employee.exitDate,
    salaryBand: employee.salaryBand,
    ctc: employee.ctc,
    monthlySalary: String(employee.monthlySalary || 0).replace(/[^0-9.-]/g, "") || 0,
    pan: employee.pan,
    uan: employee.uan,
    aadhaarNumber: employee.aadhaarNumber,
    bankName: employee.bankName,
    bankAccount: employee.bankAccount,
    ifsc: employee.ifsc,
    bankBranch: employee.bankBranch,
    complianceStatus: employee.complianceStatus || complianceStatusFor(employee),
    documents: employee.documents,
    lifecycleStage: employee.lifecycleStage,
  };
}

function employeeKey(employee) {
  return employee.id || `${employee.employeeId}-${employee.legalEntity || "HRGP"}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function employeesToCsv(rows) {
  const header = employeeCsvColumns.map(([, label]) => csvEscape(label)).join(",");
  const body = rows.map((employee) => employeeCsvColumns.map(([key]) => csvEscape(employee[key])).join(",")).join("\n");
  return [header, body].filter(Boolean).join("\n");
}

function allocationRowsToCsv(rows) {
  const headers = ["Employee ID", "Employee", "Department", "Role", "Client", "Client Start Date", "Since", "Status", "Manager", "Location", "Work Mode", "Entity", "Email"];
  const body = rows.map((employee) => [
    employee.employeeId,
    employee.name,
    employee.dept,
    employee.role,
    employee.client || "Unassigned",
    employee.clientStartDate || "",
    monthsSince(employee.clientStartDate || "2026-01-01"),
    employee.status,
    employee.manager || "",
    employee.location || "",
    employee.workMode || "",
    employee.legalEntity || "HRGP",
    employee.email || "",
  ]);
  return [headers, ...body].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const csvHeaderMap = Object.fromEntries(employeeCsvColumns.flatMap(([key, label]) => [
  [normalizeHeader(label), key],
  [normalizeHeader(key), key],
]));

function buildImportPreview(text, existingEmployees) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], summary: { added: 0, updated: 0, skipped: 0 } };
  const headers = rows[0].map((header) => csvHeaderMap[normalizeHeader(header)] || "");
  const existingIds = new Set(existingEmployees.map((employee) => employee.employeeId));
  const previewRows = rows.slice(1).map((cells, index) => {
    const employee = { ...emptyEmployee };
    headers.forEach((key, cellIndex) => {
      if (key) employee[key] = (cells[cellIndex] || "").trim();
    });
    const errors = [];
    if (!employee.employeeId.trim()) errors.push("Employee ID missing");
    if (!employee.name.trim()) errors.push("Full name missing");
    if (!employee.email.trim()) errors.push("Email missing");
    if (!employee.role.trim()) errors.push("Job title missing");
    const action = errors.length ? "Skip" : existingIds.has(employee.employeeId) ? "Update" : "Add";
    return { rowNumber: index + 2, employee, errors, action };
  });
  return {
    rows: previewRows,
    summary: {
      added: previewRows.filter((row) => row.action === "Add").length,
      updated: previewRows.filter((row) => row.action === "Update").length,
      skipped: previewRows.filter((row) => row.action === "Skip").length,
    },
  };
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const LEAVE_DEDUCTION_ACK_STORAGE_KEY = "hrguru_hrms_leave_deduction_ack_v1";
const ATTENDANCE_AFTER_CUTOFF_STORAGE_KEY = "hrguru_hrms_allow_attendance_after_cutoff_v1";
const ATTENDANCE_GO_LIVE_DATE = "2026-06-01";

const defaultLeaveSettings = {
  annualCasualLeaves: 12,
  compOffBalances: {},
  casualLeaveBalances: casualLeaveImport.balances || {},
};
const leaveBalanceCorrectionVersion = "2026-06-03-akansh-vaishnavi-negative-cl";
const leaveBalanceCorrections = {
  HRGP09: -1,
  HRGP51: -1,
};

const initialHolidays = [
  { id: "HOL-2026-01", date: "2026-01-26", name: "Republic Day", type: "National", legalEntity: "HRGP", location: "India", isActive: true },
  { id: "HOL-2026-02", date: "2026-03-04", name: "Holi", type: "National", legalEntity: "HRGP", location: "India", isActive: true },
  { id: "HOL-2026-03", date: "2026-08-15", name: "Independence Day", type: "National", legalEntity: "HRGP", location: "India", isActive: true },
  { id: "HOL-2026-04", date: "2026-10-02", name: "Gandhi Jayanti", type: "National", legalEntity: "HRGP", location: "India", isActive: true },
  { id: "HOL-2026-05", date: "2026-11-08", name: "Diwali", type: "National", legalEntity: "HRGP", location: "India", isActive: true },
  { id: "HOL-2026-06", date: "2026-12-25", name: "Christmas", type: "National", legalEntity: "HRGP", location: "India", isActive: true },
];

const casualLeaveReasons = ["Sick Leave", "Planned Leave", "Family Vacation", "Exam", "Study", "Personal Work", "Emergency"];
const leaveTypes = ["Casual Leave", "Compensatory Off", "Work From Home", "Unpaid Leave"];
const paidLeaveTypes = ["Casual Leave"];

function leaveDays(fromDate, toDate) {
  if (!fromDate || !toDate) return 0;
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

function requestedLeaveDays(draft) {
  if (draft.duration === "Half Day") return draft.fromDate ? 0.5 : 0;
  return leaveDays(draft.fromDate, draft.toDate);
}

function formatDateRange(fromDate, toDate) {
  if (!fromDate && !toDate) return "-";
  if (fromDate === toDate) return fromDate;
  return `${fromDate} to ${toDate}`;
}

const fixedLeaveEntitlements = {
  "Work From Home": 24,
  "Unpaid Leave": 0,
};

function leaveYearRange(referenceDate = new Date()) {
  const date = typeof referenceDate === "string" ? new Date(`${referenceDate}T00:00:00`) : referenceDate;
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: `${year}-04-01`,
    end: `${year + 1}-03-30`,
    previousStart: `${year - 1}-04-01`,
    previousEnd: `${year}-03-30`,
  };
}

function casualLeaveEarned(settings, referenceDate = new Date()) {
  const { start } = leaveYearRange(referenceDate);
  const startDate = new Date(`${start}T00:00:00`);
  const todayDate = typeof referenceDate === "string" ? new Date(`${referenceDate}T00:00:00`) : referenceDate;
  let earned = 0;
  for (let index = 0; index < 12; index += 1) {
    const accrualDate = new Date(startDate);
    accrualDate.setMonth(startDate.getMonth() + index);
    accrualDate.setDate(1);
    if (todayDate >= accrualDate) earned += 1;
  }
  return Math.min(earned, Number(settings.annualCasualLeaves || defaultLeaveSettings.annualCasualLeaves));
}

function authHeaders(extra = {}) {
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function leaveDaysWithinRange(request, start, end) {
  if (request.toDate < start || request.fromDate > end) return 0;
  const savedDays = Number(request.days || 0);
  const fullRequestDays = leaveDays(request.fromDate, request.toDate);
  if (savedDays > 0 && request.fromDate >= start && request.toDate <= end) return savedDays;
  if (savedDays > 0 && fullRequestDays === 1) return savedDays;
  const fromDate = request.fromDate < start ? start : request.fromDate;
  const toDate = request.toDate > end ? end : request.toDate;
  return leaveDays(fromDate, toDate);
}

function usedLeaveDays(employeeId, records, type, start, end, statuses = ["Approved", "Pending"]) {
  return records
    .filter((request) => request.employeeId === employeeId && request.type === type && statuses.includes(request.status))
    .reduce((sum, request) => sum + leaveDaysWithinRange(request, start, end), 0);
}

function isLeaveCreatedAfterImportCutoff(request, cutoffDate = casualLeaveImport.balanceCutoffDate) {
  if (!cutoffDate) return true;
  const createdAt = request.createdAt || request.fromDate;
  return Boolean(createdAt && createdAt > cutoffDate);
}

function casualCarryForward(employeeId, records, settings) {
  const { previousStart, previousEnd } = leaveYearRange();
  const previousUsed = paidLeaveTypes.reduce((sum, type) => sum + usedLeaveDays(employeeId, records, type, previousStart, previousEnd, ["Approved"]), 0);
  const previousUnused = Math.max(Number(settings.annualCasualLeaves || 12) - previousUsed, 0);
  return Math.min(previousUnused, 3);
}

function casualLeaveEntitlement(employeeId, employee, attendanceRecords = [], referenceDate = new Date()) {
  const { start } = leaveYearRange(referenceDate);
  const leaveStart = new Date(`${start}T00:00:00`);
  const todayDate = typeof referenceDate === "string" ? new Date(`${referenceDate}T00:00:00`) : referenceDate;
  const joinDate = employee?.joinDate ? new Date(`${employee.joinDate}T00:00:00`) : leaveStart;
  const exitDate = employee?.exitDate ? new Date(`${employee.exitDate}T00:00:00`) : null;
  let entitlement = 0;
  for (let index = 0; index < 12; index += 1) {
    const accrualDate = new Date(leaveStart);
    accrualDate.setMonth(leaveStart.getMonth() + index);
    accrualDate.setDate(1);
    if (todayDate < accrualDate || joinDate > accrualDate || (exitDate && exitDate < accrualDate)) continue;
    entitlement += 1;
  }
  return entitlement;
}

function leaveBalanceValue(value, fallback = 0) {
  if (value && typeof value === "object" && Object.hasOwn(value, "balance")) return Number(value.balance || 0);
  if (value === null || value === undefined || value === "") return fallback;
  return Number(value || 0);
}

function leaveBalanceRows(employeeId, records, settings = defaultLeaveSettings, employee = null, attendanceRecords = []) {
  const { start, end } = leaveYearRange();
  const casualEarned = employee ? casualLeaveEntitlement(employeeId, employee, attendanceRecords) : casualLeaveEarned(settings);
  const casualCarry = 0;
  const paidLeaveUsed = paidLeaveTypes.reduce((sum, type) => sum + usedLeaveDays(employeeId, records, type, start, end, ["Approved"]), 0);
  const paidLeavePending = paidLeaveTypes.reduce((sum, type) => sum + usedLeaveDays(employeeId, records, type, start, end, ["Pending"]), 0);
  const hasManualCasualBalance = Object.prototype.hasOwnProperty.call(settings.casualLeaveBalances || {}, employeeId);
  const manualCasualAvailable = leaveBalanceValue(settings.casualLeaveBalances?.[employeeId]);
  const compOffEntitlement = leaveBalanceValue(settings.compOffBalances?.[employeeId]);
  const paidLeaveEntitlement = hasManualCasualBalance ? paidLeaveUsed + paidLeavePending + manualCasualAvailable : casualEarned + casualCarry;
  const entitlements = {
    ...fixedLeaveEntitlements,
    "Casual Leave": paidLeaveEntitlement,
    "Compensatory Off": compOffEntitlement,
  };
  return leaveTypes.map((type) => {
    const entitlement = Number(entitlements[type] || 0);
    const used = paidLeaveTypes.includes(type) ? paidLeaveUsed : usedLeaveDays(employeeId, records, type, start, end, ["Approved"]);
    const pending = paidLeaveTypes.includes(type) ? paidLeavePending : usedLeaveDays(employeeId, records, type, start, end, ["Pending"]);
    const rawAvailable = entitlement - used - pending;
    const available = type === "Unpaid Leave" ? 999 : type === "Casual Leave" && hasManualCasualBalance ? rawAvailable : Math.max(rawAvailable, 0);
    return { type, entitlement, used, pending, available, carryForward: paidLeaveTypes.includes(type) ? casualCarry : 0, bucket: paidLeaveTypes.includes(type) ? "Paid Leave" : type };
  });
}

function leaveToApi(request) {
  return {
    employeeCode: request.employeeId,
    type: request.type,
    fromDate: request.fromDate,
    toDate: request.toDate,
    days: request.days,
    reason: request.reason || "",
    overrideAttendanceConflict: Boolean(request.overrideAttendanceConflict),
  };
}

const ATTENDANCE_STORAGE_KEY = "hrguru_hrms_attendance_v1";
const ATTENDANCE_REQUEST_STORAGE_KEY = "hrguru_hrms_attendance_requests_v1";
const SATURDAY_ROTA_STORAGE_KEY = "hrguru_hrms_saturday_rota_v1";

function loadStoredAttendance() {
  try {
    const stored = window.localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadStoredAttendanceRequests() {
  try {
    const stored = window.localStorage.getItem(ATTENDANCE_REQUEST_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadStoredSaturdayRota() {
  try {
    const stored = window.localStorage.getItem(SATURDAY_ROTA_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saturdaysForMonth(month) {
  return monthDates(month).filter((date) => new Date(`${date}T00:00:00`).getDay() === 6);
}

function attendanceToApi(record) {
  return {
    employeeCode: record.employeeId,
    date: record.date,
    status: record.status,
    checkIn: record.checkIn || "",
    checkOut: record.checkOut || "",
    hours: record.hours || "",
    notes: record.notes || "",
  };
}

function attendanceRequestToApi(request) {
  return {
    employeeCode: request.employeeId,
    date: request.date,
    requestType: request.requestType || "Attendance Correction",
    punchType: request.punchType || "",
    status: request.statusValue,
    checkIn: request.checkIn || "",
    checkOut: request.checkOut || "",
    hours: request.hours || "",
    reason: request.reason,
    screenshotName: request.screenshotName || "",
    screenshotData: request.screenshotData || "",
    screenshotMimeType: request.screenshotMimeType || "",
  };
}

function isActiveEmployee(employee) {
  return ["Active", "Probation", "On Leave"].includes(employee.status);
}

function approvedLeaveForDate(employeeId, date, leaveRecords) {
  return leaveRecords.find((request) => (
    request.employeeId === employeeId &&
    request.status === "Approved" &&
    request.fromDate <= date &&
    request.toDate >= date
  ));
}

function isNonWorkingDay(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function defaultAttendanceFor(employee, date, leaveRecords) {
  const leave = approvedLeaveForDate(employee.employeeId, date, leaveRecords);
  const status = leave ? (leave.type === "Work From Home" ? "Remote" : "Leave") : isNonWorkingDay(date) ? "Weekend" : "Present";
  return {
    employeeId: employee.employeeId,
    employee: employee.name,
    date,
    status,
    checkIn: status === "Present" ? "09:30" : "",
    checkOut: status === "Present" ? "18:30" : "",
    hours: status === "Present" ? "9.0" : "0",
    notes: leave ? leave.type : status === "Weekend" ? "Non-working day" : "",
  };
}

const PAYROLL_STORAGE_KEY = "hrguru_hrms_payroll_status_v1";

function loadStoredPayrollStatus() {
  try {
    const stored = window.localStorage.getItem(PAYROLL_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function currentPayrollMonth() {
  return new Date().toISOString().slice(0, 7);
}

function previousPayrollMonth() {
  return shiftMonth(currentPayrollMonth(), -1);
}

function previousCalendarMonthIst() {
  const istNow = new Date(Date.now() + 330 * 60000);
  return shiftMonth(istNow.toISOString().slice(0, 7), -1);
}

function shiftMonth(month, offset) {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftDate(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function durationHoursBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const [inHours, inMinutes] = checkIn.split(":").map(Number);
  const [outHours, outMinutes] = checkOut.split(":").map(Number);
  return Math.max((((outHours * 60) + outMinutes) - ((inHours * 60) + inMinutes)) / 60, 0);
}

function monthName(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function monthDates(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const total = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: total }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function payrollApplicableDates(employee, month) {
  const dates = monthDates(month);
  const joinDate = employee.joinDate || dates[0];
  const exitDate = employee.exitDate || dates[dates.length - 1];
  return dates.filter((date) => date >= joinDate && date <= exitDate);
}

function payrollForEmployee(employee, month, attendanceRecords, leaveRecords, payrollStatus) {
  const dates = monthDates(month);
  const applicableDates = payrollApplicableDates(employee, month);
  const today = todayLocalDate();
  const rows = applicableDates.map((date) => {
    const leave = approvedLeaveForDate(employee.employeeId, date, leaveRecords);
    const attendance = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === date);
    if (leave && attendance) {
      return {
        ...attendance,
        leaveType: leave.type,
        leaveDays: Number(leave.days || 1),
        leaveConflict: true,
        notes: [attendance.notes, `Conflict: approved ${leave.type} also exists`].filter(Boolean).join(" | "),
      };
    }
    if (leave) return { ...defaultAttendanceFor(employee, date, leaveRecords), leaveType: leave.type, leaveDays: Number(leave.days || 1) };
    if (attendance) return { ...attendance, leaveType: "" };
    if (isNonWorkingDay(date)) return { ...defaultAttendanceFor(employee, date, leaveRecords), leaveType: "" };
    if (date > today) return { ...defaultAttendanceFor(employee, date, leaveRecords), leaveType: "" };
    return {
      employeeId: employee.employeeId,
      employee: employee.name,
      date,
      status: "Absent",
      checkIn: "",
      checkOut: "",
      hours: "0",
      notes: "Attendance not marked",
      leaveType: "",
    };
  });
  const presentDays = rows.filter((row) => ["Present", "Remote", "Late"].includes(row.status)).length;
  const halfDays = rows.filter((row) => row.status === "Half Day").length;
  const paidLeaveDays = rows.filter((row) => row.status === "Leave" && row.leaveType !== "Unpaid Leave").reduce((sum, row) => sum + Number(row.leaveDays || 1), 0);
  const unpaidLeaveDays = rows.filter((row) => row.status === "Leave" && row.leaveType === "Unpaid Leave").reduce((sum, row) => sum + Number(row.leaveDays || 1), 0);
  const absentDays = rows.filter((row) => row.status === "Absent").length + unpaidLeaveDays + (halfDays * 0.5);
  const paidDays = presentDays + paidLeaveDays;
  const monthlySalary = Number(String(employee.monthlySalary || "0").replace(/[^0-9.]/g, "")) || 0;
  const perDay = dates.length ? monthlySalary / dates.length : 0;
  const deductions = Math.round(absentDays * perDay);
  const netPay = Math.max(Math.round(monthlySalary - deductions), 0);
  const key = `${month}:${employee.employeeId}:${employee.legalEntity || "HRGP"}`;
  const leaveConflicts = rows.filter((row) => row.leaveConflict).map((row) => `${row.date}: ${row.leaveType}`);
  return {
    key,
    employee,
    workDays: dates.length,
    applicableDays: applicableDates.length,
    presentDays,
    halfDays,
    paidLeaveDays,
    unpaidLeaveDays,
    absentDays,
    paidDays,
    monthlySalary,
    deductions,
    netPay,
    leaveConflicts,
    status: payrollStatus[key] || "Draft",
  };
}

function attendanceRowsForEmployee(employee, month, attendanceRecords, leaveRecords) {
  return monthDates(month).map((date) => {
    const explicitRecord = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === date);
    return explicitRecord || defaultAttendanceFor(employee, date, leaveRecords);
  });
}

function approvedLeaveDaysInMonth(employeeId, month, leaveRecords, type) {
  return leaveRecords
    .filter((request) => request.employeeId === employeeId && request.status === "Approved" && (!type || request.type === type))
    .reduce((total, request) => {
      const days = monthDates(month).filter((date) => request.fromDate <= date && request.toDate >= date).length;
      return total + days;
    }, 0);
}

function attendanceSummaryForEmployee(employee, month, attendanceRecords, leaveRecords) {
  const rows = attendanceRowsForEmployee(employee, month, attendanceRecords, leaveRecords);
  const explicitDates = new Set(attendanceRecords.filter((record) => record.employeeId === employee.employeeId).map((record) => record.date));
  return {
    employee,
    present: rows.filter((row) => ["Present", "Remote"].includes(row.status)).length,
    halfDay: rows.filter((row) => row.status === "Half Day").length,
    onLeave: rows.filter((row) => row.status === "Leave").length,
    unpaidLeave: approvedLeaveDaysInMonth(employee.employeeId, month, leaveRecords, "Unpaid Leave"),
    shiftIssues: rows.filter((row) => row.status === "Late").length,
    openRequests: leaveRecords.filter((request) => request.employeeId === employee.employeeId && request.status === "Pending").length,
    noData: rows.filter((row) => !explicitDates.has(row.date) && !approvedLeaveForDate(employee.employeeId, row.date, leaveRecords) && !isNonWorkingDay(row.date)).length,
  };
}

function liveAttendanceSummaryForEmployee(employee, month, attendanceRecords, leaveRecords) {
  const rows = attendanceRecords.filter((record) => record.employeeId === employee.employeeId && record.date?.slice(0, 7) === month);
  return {
    employee,
    present: rows.filter((row) => ["Present", "Remote"].includes(row.status)).length,
    halfDay: rows.filter((row) => row.status === "Half Day").length,
    absent: rows.filter((row) => row.status === "Absent").length,
    late: rows.filter((row) => row.status === "Late").length,
    remote: rows.filter((row) => row.status === "Remote").length,
    onLeave: rows.filter((row) => row.status === "Leave").length,
    unpaidLeave: approvedLeaveDaysInMonth(employee.employeeId, month, leaveRecords, "Unpaid Leave"),
    openRequests: leaveRecords.filter((request) => request.employeeId === employee.employeeId && request.status === "Pending").length,
    recordedDays: rows.length,
  };
}

function attendanceSummaryToCsv(month, rows) {
  const columns = [
    ["month", "Payroll Month"],
    ["employeeId", "Employee ID"],
    ["name", "Employee Name"],
    ["present", "Present"],
    ["halfDay", "Half Day"],
    ["onLeave", "On Leave"],
    ["unpaidLeave", "Unpaid Leave"],
    ["shiftIssues", "Shift Issues"],
    ["openRequests", "Open Requests"],
    ["noData", "No Data"],
  ];
  const exportRows = rows.map((row) => ({
    month,
    employeeId: row.employee.employeeId,
    name: row.employee.name,
    present: row.present,
    halfDay: row.halfDay,
    onLeave: row.onLeave,
    unpaidLeave: row.unpaidLeave,
    shiftIssues: row.shiftIssues,
    openRequests: row.openRequests,
    noData: row.noData,
  }));
  const header = columns.map(([, label]) => csvEscape(label)).join(",");
  const body = exportRows.map((row) => columns.map(([key]) => csvEscape(row[key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

function payrollRowsToCsv(month, rows) {
  const columns = [
    ["month", "Payroll Month"],
    ["legalEntity", "Entity"],
    ["employeeId", "Employee ID"],
    ["name", "Employee Name"],
    ["department", "Department"],
    ["designation", "Designation"],
    ["workDays", "Work Days"],
    ["presentDays", "Present Days"],
    ["paidLeaveDays", "Paid Leave Days"],
    ["absentDays", "Absent Days"],
    ["gross", "Gross Salary"],
    ["deductions", "Deductions"],
    ["netPay", "Net Payable"],
    ["leaveConflicts", "Attendance/Leave Conflicts"],
    ["status", "Payroll Status"],
    ["pan", "PAN"],
    ["bankName", "Bank Name"],
    ["bankAccount", "Bank Account"],
    ["ifsc", "IFSC"],
    ["bankBranch", "Bank Branch"],
  ];
  const exportRows = rows.map((row) => ({
    month,
    legalEntity: row.employee.legalEntity || "HRGP",
    employeeId: row.employee.employeeId,
    name: row.employee.name,
    department: row.employee.dept,
    designation: row.employee.role,
    workDays: row.workDays,
    presentDays: row.presentDays,
    paidLeaveDays: row.paidLeaveDays,
    absentDays: row.absentDays,
    gross: row.monthlySalary,
    deductions: row.deductions,
    netPay: row.netPay,
    leaveConflicts: row.leaveConflicts?.join("; ") || "",
    status: row.status,
    pan: row.employee.pan,
    bankName: row.employee.bankName,
    bankAccount: row.employee.bankAccount,
    ifsc: row.employee.ifsc,
    bankBranch: row.employee.bankBranch,
  }));
  const header = columns.map(([, label]) => csvEscape(label)).join(",");
  const body = exportRows.map((row) => columns.map(([key]) => csvEscape(row[key])).join(",")).join("\n");
  return [header, body].filter(Boolean).join("\n");
}

const RECRUITMENT_STORAGE_KEY = "hrguru_hrms_recruitment_v1";
const initialCandidates = [];

function loadStoredCandidates() {
  try {
    const stored = window.localStorage.getItem(RECRUITMENT_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : initialCandidates;
    return Array.isArray(parsed) && parsed.length ? parsed : initialCandidates;
  } catch {
    return initialCandidates;
  }
}

const PERFORMANCE_STORAGE_KEY = "hrguru_hrms_performance_v1";
const monthlySelectionTargets = [
  { account: "Birla Opus", resource: "Poonam Sharma", target: 6 },
  { account: "Birla Opus", resource: "Yashi Sharma", target: 6 },
  { account: "Birla Opus", resource: "Ankita Burman", target: 5 },
  { account: "HPE", resource: "Ikram Khan", target: 1 },
  { account: "HPE", resource: "Pooja Vishwakarma", target: 2 },
  { account: "HPE", resource: "Priyanka Salgare", target: 1 },
  { account: "Hyundai", resource: "Princy", target: 3 },
  { account: "Hyundai", resource: "Tanu", target: 4 },
  { account: "M&M", resource: "Ankita Thakur", target: 4 },
  { account: "M&M", resource: "Anshul Saran", target: 4 },
  { account: "M&M", resource: "Deepak Jena", target: 4 },
  { account: "M&M", resource: "Harshita Arora", target: 5 },
  { account: "M&M", resource: "Nandhini", target: 5 },
  { account: "M&M", resource: "Pallavi", target: 5 },
  { account: "M&M", resource: "Payal Thakur", target: 4 },
  { account: "M&M", resource: "Sapna", target: 4 },
  { account: "M&M", resource: "Vaishnavi", target: 4 },
  { account: "M&M", resource: "Vidhi Kapoor", target: 4 },
  { account: "M&M", resource: "Vipul Sharma", target: 4 },
  { account: "M&M", resource: "Yogesh", target: 4 },
  { account: "M&M", resource: "Aniket", target: 5 },
  { account: "Neosoft", resource: "Pooja Chouhan", target: 1 },
  { account: "Pidilite", resource: "Harshita P", target: 6 },
  { account: "Pidilite", resource: "Parul Yadav", target: 8 },
  { account: "RE", resource: "Akansh Pal", target: 3 },
  { account: "RE", resource: "Megha Singh", target: 3 },
  { account: "Saint Gobain", resource: "Janvi", target: 3 },
  { account: "Saint Gobain", resource: "Priyanka Kadam", target: 2 },
  { account: "Saint Gobain", resource: "Radhika Kela", target: 3 },
  { account: "Saint Gobain", resource: "Sushant Singh", target: 3 },
  { account: "Saint Gobain", resource: "Divya", target: 3 },
  { account: "Saint Gobain", resource: "Sandhiya", target: 3 },
  { account: "Schaeffler", resource: "Hemlata", target: 3 },
  { account: "Siemens", resource: "Pankhuri", target: 2 },
  { account: "Siemens", resource: "Priya Sonkar", target: 2 },
  { account: "Siemens", resource: "Tadreesa", target: 2 },
  { account: "Siemens", resource: "Prithra", target: 2 },
  { account: "TCPL", resource: "Deepti Beedi", target: 5 },
];
const monthlySelectionTargetAliases = {
  "Ankita Burman": "Ankita",
  "Divya": "Divya S",
  "Harshita P": "Harshita Pruthi",
  "Priya Sonkar": "Priya",
  "Radhika Kela": "Radhika",
  "Sushant Singh": "Sushant",
  "Tadreesa": "Tadreesa Khatoon",
  "Tanu": "Tanu Rajput",
  "Vaishnavi": "Vaishnavi Sinha",
};
const performanceHistoryMonths = [
  { label: "Sep", key: "2025-09", source: "migrated" },
  { label: "Oct", key: "2025-10", source: "migrated" },
  { label: "Nov", key: "2025-11", source: "migrated" },
  { label: "Dec", key: "2025-12", source: "migrated" },
  { label: "Jan", key: "2026-01", source: "migrated" },
  { label: "Feb", key: "2026-02", source: "migrated" },
  { label: "Mar", key: "2026-03", source: "migrated" },
  { label: "Apr", key: "2026-04", source: "ats" },
  { label: "May", key: "2026-05", source: "ats" },
];
const performanceSelectionHistory = [
  { name: "Poonam Sharma", client: "Birla Opus", data: [null, null, 6, 3, 8, 2, 6, 7, 6] },
  { name: "Yashi Sharma", client: "Birla Opus", data: [null, 0, 2, 2, 2, 6, 4, 4, 6] },
  { name: "Pooja Vishwakarma", client: "HPE", data: [null, null, null, 0, 1, 4, 3, 3, 2] },
  { name: "Priyanka Salgare", client: "HPE", data: [null, null, null, 0, 2, 3, 0, 2, 1] },
  { name: "Ikram Khan", client: "HPE", data: [null, null, null, null, null, null, null, 2, 1] },
  { name: "Tanu Rajput", client: "Hyundai", data: [7, 6, 2, 2, 2, 10, 7, 4, 2] },
  { name: "Princy", client: "Hyundai", data: [1, 3, 0, 3, 2, 2, 2, 5, 3] },
  { name: "Aniket", client: "M&M", data: [6, 1, 3, 0, 6, 11, 5, 3, 1] },
  { name: "Harshita Arora", client: "M&M", data: [null, 0, 3, 6, 4, 6, 7, 3, 5] },
  { name: "Pallavi", client: "M&M", data: [5, 11, 5, 5, 2, 3, 4, 3, 5] },
  { name: "Payal Thakur", client: "M&M", data: [3, 7, 5, 3, 5, 4, 4, 4, 5] },
  { name: "Vidhi Kapoor", client: "M&M", data: [17, 3, 5, 5, 3, 2, 5, 11, 4] },
  { name: "Nandhini", client: "M&M", data: [null, 0, 3, 8, 5, 5, 5, 8, 5] },
  { name: "Yogesh", client: "M&M", data: [3, 4, 7, 4, 0, 2, 4, 3, 4] },
  { name: "Deepak Jena", client: "M&M", data: [null, null, null, null, null, 0, 3, 4, 4] },
  { name: "Vaishnavi", client: "M&M", data: [2, 1, 2, 0, 1, 3, 4, 4, 7] },
  { name: "Rachna Jain", client: "M&M", data: [null, null, null, null, null, null, 1, 6, 2] },
  { name: "Ankita Thakur", client: "M&M", data: [null, null, null, null, null, null, null, 4, 6] },
  { name: "Sapna", client: "M&M", data: [null, null, null, null, null, null, null, 4, 5] },
  { name: "Anshul Saran", client: "M&M", data: [4, 4, 6, 3, 2, 5, 3, 2, 3] },
  { name: "Vipul Sharma", client: "M&M", data: [null, null, null, null, null, null, null, 1, 3] },
  { name: "Heena Khatri", client: "M&M", data: [5, 4, 6, 2, 0, 2, 5, 1, 0] },
  { name: "Pooja Chouhan", client: "Neosoft", data: [null, null, null, null, null, null, null, 0, 0] },
  { name: "Harshita Pruthi", client: "Pidilite", data: [2, 4, 0, 1, 0, 16, 11, 7, 3] },
  { name: "Parul Yadav", client: "Pidilite", data: [null, 2, 2, 3, 8, 8, 6, 5, 4] },
  { name: "Drishti", client: "Pidilite", data: [null, null, null, null, null, 0, 0, 2, 0] },
  { name: "Deepti Beedi", client: "TCPL", data: [null, 3, 3, 4, 2, 7, 3, 4, 11] },
  { name: "Akansh", client: "RE", data: [2, 1, 0, 4, 3, 1, 3, 4, 1] },
  { name: "Megha Singh", client: "RE", data: [3, 2, 6, 2, 2, 4, 2, 3, 4] },
  { name: "Sushant", client: "Saint Gobain", data: [null, null, null, null, null, null, 0, 1, 0] },
  { name: "Kadam", client: "Saint Gobain", data: [null, null, null, null, null, null, 0, 0, 0] },
  { name: "Radhika Kela", client: "Saint Gobain", data: [null, 1, 0, 2, 2, 14, 6, 0, 0] },
  { name: "Divya S", client: "Saint Gobain", data: [null, null, null, null, null, null, null, null, 0] },
  { name: "Janvi", client: "Saint Gobain", data: [null, null, null, null, null, null, 0, 0, 0] },
  { name: "Ankita Burman", client: "Birla Opus", data: [null, 3, 5, 7, 11, 17, 17, 17, 0] },
  { name: "Shivani", client: "Saint Gobain", data: [null, null, 1, 6, 7, 8, 7, 11, 0] },
  { name: "Sandhiya", client: "Saint Gobain", data: [null, null, null, null, null, null, null, null, null] },
  { name: "Hemlata", client: "Schaeffler", data: [null, null, null, null, null, 0, 3, 3, 5] },
  { name: "Pankhuri", client: "Siemens", data: [0, 0, 0, 1, 1, 3, 2, 1, 2] },
  { name: "Tadreesa", client: "Siemens", data: [null, null, null, null, null, 0, 2, 1, 1] },
];
const performanceHistoryNameAliases = {
  Akansh: "Akansh Pal",
  "Divya S": "Divya",
  Kadam: "Priyanka Kadam",
  Radhika: "Radhika Kela",
  Sushant: "Sushant Singh",
  Tanu: "Tanu Rajput",
};
const initialPerformanceReviews = [];

function loadStoredPerformanceReviews() {
  try {
    const stored = window.localStorage.getItem(PERFORMANCE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : initialPerformanceReviews;
    return Array.isArray(parsed) && parsed.length ? parsed : initialPerformanceReviews;
  } catch {
    return initialPerformanceReviews;
  }
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function performanceTargetName(resource) {
  return monthlySelectionTargetAliases[resource] || resource;
}

function buildMonthlySelectionReviews(employees, reviews = []) {
  const reviewByEmployeeId = new Map(reviews.map((review) => [review.employeeId, review]));
  const employeeByName = new Map(employees.map((employee) => [normalizeName(employee.name), employee]));
  return monthlySelectionTargets.flatMap((target, index) => {
    const employee = employeeByName.get(normalizeName(performanceTargetName(target.resource)));
    if (!employee || ["Inactive", "Exited"].includes(employee.status) || employee.name === "Surinder Singh") return [];
    const existing = reviewByEmployeeId.get(employee.employeeId) || {};
    return [{
      id: existing.id || `MST-${employee.employeeId}-${index + 1}`,
      employeeId: employee.employeeId,
      employee: employee.name,
      manager: employee.manager || "HR",
      account: target.account,
      cycle: "Monthly Selection Target",
      goal: `Monthly selection target: ${target.target}`,
      monthlySelectionTarget: target.target,
      monthlySelections: Number(existing.monthlySelections || 0),
      progress: existing.progress ?? 0,
      selfReview: existing.selfReview || "",
      managerFeedback: existing.managerFeedback || "",
      rating: existing.rating || "Not rated",
      status: existing.status || "Goal Setting",
    }];
  });
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function performanceNameVariants(name) {
  const alias = performanceHistoryNameAliases[name] || monthlySelectionTargetAliases[name];
  return [name, alias].filter(Boolean).map(normalizeName);
}

function performanceHistoryTargetFor(row) {
  const rowNames = new Set(performanceNameVariants(row.name));
  const target = monthlySelectionTargets.find((item) => {
    const targetNames = new Set(performanceNameVariants(performanceTargetName(item.resource)));
    targetNames.add(normalizeName(item.resource));
    return item.account === row.client && [...rowNames].some((name) => targetNames.has(name));
  });
  return Number(target?.target || 0);
}

function buildPerformanceDashboardRows(employees, scopedReviews, atsRows = []) {
  const reviewByName = new Map(scopedReviews.map((review) => [normalizeName(review.employee), review]));
  const employeeByName = new Map(employees.map((employee) => [normalizeName(employee.name), employee]));
  const atsByName = new Map(atsRows.map((row) => [normalizeName(row.recruiterName), row]));
  const atsByEmail = new Map(atsRows.map((row) => [String(row.recruiterEmail || "").toLowerCase(), row]));
  const limitedScope = scopedReviews.length > 0 && scopedReviews.length < 20;

  return performanceSelectionHistory.flatMap((historyRow) => {
    const variants = performanceNameVariants(historyRow.name);
    const employee = variants.map((name) => employeeByName.get(name)).find(Boolean);
    if (!employee && limitedScope) return [];
    const isScoped = !employee || scopedReviews.some((review) => review.employeeId === employee.employeeId || variants.includes(normalizeName(review.employee)));
    if (!isScoped || employee?.status === "Inactive" || employee?.status === "Exited") return [];
    const review = employee ? reviewByName.get(normalizeName(employee.name)) : variants.map((name) => reviewByName.get(name)).find(Boolean);
    const atsRow = employee ? atsByEmail.get(String(employee.email || "").toLowerCase()) || atsByName.get(normalizeName(employee.name)) : variants.map((name) => atsByName.get(name)).find(Boolean);
    const data = [...historyRow.data];
    const mayIndex = performanceHistoryMonths.findIndex((month) => month.key === "2026-05");
    if (mayIndex >= 0 && atsRow && Number.isFinite(Number(atsRow.offeredCount))) {
      data[mayIndex] = Number(atsRow.offeredCount || 0);
    }
    const target = Number(review?.monthlySelectionTarget || performanceHistoryTargetFor(historyRow) || 0);
    return [{
      ...historyRow,
      employeeId: employee?.employeeId || "",
      employeeName: employee?.name || historyRow.name,
      target,
      data,
      atsCandidates: atsRow?.candidates || [],
    }];
  });
}

function valueForPerformanceMonth(row, monthKey) {
  if (monthKey === "all") return row.data.reduce((sum, value) => sum + Number(value || 0), 0);
  const index = performanceHistoryMonths.findIndex((month) => month.key === monthKey);
  return index >= 0 ? Number(row.data[index] || 0) : 0;
}

function activePerformanceMonthCount(row, monthKey) {
  if (monthKey !== "all") return 1;
  const count = row.data.filter((value) => value !== null && value !== undefined).length;
  return Math.max(count, 1);
}

function performanceTargetTone(value, target, monthCount = 1) {
  const effectiveTarget = Number(target || 0) * Math.max(monthCount, 1);
  if (!effectiveTarget) return "blue";
  if (value >= effectiveTarget) return "green";
  if (value >= effectiveTarget * 0.7) return "amber";
  return "red";
}

function performanceTargetLabel(tone) {
  if (tone === "green") return "On target";
  if (tone === "amber") return "Near";
  if (tone === "red") return "Below";
  return "No target";
}

function performanceTargetForEmployee(employee) {
  if (!employee) return null;
  const employeeNames = new Set(performanceNameVariants(employee.name));
  employeeNames.add(normalizeName(employee.name));
  return monthlySelectionTargets.find((target) => {
    const targetNames = new Set(performanceNameVariants(performanceTargetName(target.resource)));
    targetNames.add(normalizeName(target.resource));
    return [...employeeNames].some((name) => targetNames.has(name));
  }) || null;
}

function previousMonthPerformanceForEmployee(employee, month, atsRows = []) {
  const target = performanceTargetForEmployee(employee);
  if (!employee || !target) return null;
  const employeeNames = new Set(performanceNameVariants(employee.name));
  employeeNames.add(normalizeName(employee.name));
  const atsRow = (atsRows || []).find((row) => (
    String(row.recruiterEmail || "").toLowerCase() === String(employee.email || "").toLowerCase() ||
    employeeNames.has(normalizeName(row.recruiterName))
  ));
  const historyIndex = performanceHistoryMonths.findIndex((item) => item.key === month);
  const historyRow = performanceSelectionHistory.find((row) => {
    const historyNames = new Set(performanceNameVariants(row.name));
    historyNames.add(normalizeName(row.name));
    return [...employeeNames].some((name) => historyNames.has(name));
  });
  const historyValue = historyIndex >= 0 && historyRow ? historyRow.data[historyIndex] : null;
  const selections = atsRow && Number.isFinite(Number(atsRow.offeredCount))
    ? Number(atsRow.offeredCount || 0)
    : historyValue === null || historyValue === undefined ? null : Number(historyValue || 0);
  if (selections === null || selections === undefined || !Number.isFinite(selections)) return null;
  const monthlyTarget = Number(target.target || 0);
  if (!monthlyTarget) return null;
  const achievement = selections / monthlyTarget;
  const status = achievement >= 1.25 ? "Exceeding Expectations" : achievement >= 1 ? "Meeting Expectations" : "Below Expectations";
  const tone = achievement >= 1.25 ? "green" : achievement >= 1 ? "blue" : "amber";
  return {
    account: target.account,
    month,
    selections,
    target: monthlyTarget,
    achievement,
    status,
    tone,
    source: atsRow ? "ATS" : "history",
  };
}

function App() {
  const [activeModule, setActiveModule] = useState("dashboard");
  const [sessionUser, setSessionUser] = useState(() => {
    try {
      const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [sessionLoading, setSessionLoading] = useState(Boolean(sessionUser));
  const [employeeRecords, setEmployeeRecords] = useState(loadStoredEmployees);
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [leaveSettings, setLeaveSettings] = useState({
    ...defaultLeaveSettings,
    casualLeaveBalances: { ...defaultLeaveSettings.casualLeaveBalances, ...leaveBalanceCorrections },
    balanceCorrectionVersion: leaveBalanceCorrectionVersion,
  });
  const [holidayRecords, setHolidayRecords] = useState(initialHolidays);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceRequests, setAttendanceRequests] = useState([]);
  const [saturdayRota, setSaturdayRota] = useState(loadStoredSaturdayRota);
  const [candidateRecords, setCandidateRecords] = useState(loadStoredCandidates);
  const [clientRecords, setClientRecords] = useState(loadStoredClients);
  const [performanceReviews, setPerformanceReviews] = useState(loadStoredPerformanceReviews);
  const [payrollStatus, setPayrollStatus] = useState(loadStoredPayrollStatus);
  const [payrollCycles, setPayrollCycles] = useState({});
  const [query, setQuery] = useState("");
  const [employeeEntity, setEmployeeEntity] = useState("HRGP");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [switchProfileOpen, setSwitchProfileOpen] = useState(false);
  const [employeeSyncStatus, setEmployeeSyncStatus] = useState("Local data");
  const [clientSyncStatus, setClientSyncStatus] = useState("Local data");
  const [attendanceSyncStatus, setAttendanceSyncStatus] = useState("Not loaded");
  const [attendanceHydrated, setAttendanceHydrated] = useState(false);
  const [leaveSyncStatus, setLeaveSyncStatus] = useState("Not loaded");
  const role = sessionUser?.role || "admin";
  const baseProfile = roleProfiles[role] || roleProfiles.employee;
  const profile = {
    ...baseProfile,
    name: sessionUser?.employee?.fullName || baseProfile.name,
    label: role === "hr" ? "HR" : baseProfile.label,
    headline: sessionUser?.employee?.designation || baseProfile.headline,
  };
  const permissions = rolePermissions[role];
  const visibleModules = modules.filter((item) => !permissions.hiddenModules.includes(item.id));
  const loggedInEmployee = employeeRecords.find((employee) => employee.name === profile.name);
  const scopedEmployeeIdsForRole = new Set(employeeRecords
    .filter((employee) => {
      if (role === "employee") return employee.name === profile.name;
      if (role === "manager") return employee.manager === profile.name;
      return true;
    })
    .map((employee) => employee.employeeId));
  const pendingAttendanceRequestCount = role === "employee" ? 0 : attendanceRequests.filter((request) => request.status === "Pending" && scopedEmployeeIdsForRole.has(request.employeeId)).length;
  const attendancePromptEmployee = role === "employee" ? loggedInEmployee : null;

  useEffect(() => {
    if (permissions.hiddenModules.includes(activeModule)) setActiveModule("dashboard");
  }, [activeModule, permissions.hiddenModules]);

  useEffect(() => {
    window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employeeRecords));
  }, [employeeRecords]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) {
      setEmployeeSyncStatus("Local data");
      return;
    }

    setEmployeeSyncStatus("Loading from database...");
    fetch(`${API_BASE_URL}/api/employees`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load employee data.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setEmployeeRecords(data.employees.map(employeeFromApi));
        setEmployeeSyncStatus("Database connected");
      })
      .catch(() => {
        if (!cancelled) setEmployeeSyncStatus("Using local data");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) {
      setLeaveRecords([]);
      setLeaveSyncStatus("Not loaded");
      return;
    }

    setLeaveSyncStatus("Loading from database...");
    fetch(`${API_BASE_URL}/api/leave`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load leave data.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setLeaveRecords(data.leaveRequests || []);
        setLeaveSyncStatus("Database connected");
      })
      .catch(() => {
        if (!cancelled) {
          setLeaveRecords([]);
          setLeaveSyncStatus("Database unavailable - leave cannot be applied");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser || !employeeRecords.length) return;

    const applyBalances = (rows = []) => {
      if (cancelled || !rows.length) return;
      const casualLeaveBalances = {};
      const compOffBalances = {};
      rows.forEach((row) => {
        casualLeaveBalances[row.employeeCode] = Number(row.casualLeaveBalance ?? row.available ?? 0);
        compOffBalances[row.employeeCode] = Number(row.compOffBalance ?? 0);
      });
      setLeaveSettings((current) => ({
        ...current,
        casualLeaveBalances: {
          ...(current.casualLeaveBalances || {}),
          ...casualLeaveBalances,
        },
        compOffBalances: {
          ...(current.compOffBalances || {}),
          ...compOffBalances,
        },
      }));
    };

    const loadBalances = async () => {
      if (role === "admin" || role === "hr") {
        const response = await fetch(`${API_BASE_URL}/api/leave/balances`, {
          headers: authHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load leave balances.");
        applyBalances(data.balances || []);
        return;
      }
      const employeeCode = loggedInEmployee?.employeeId || sessionUser.employee?.employeeCode;
      if (!employeeCode) return;
      const response = await fetch(`${API_BASE_URL}/api/leave/balances/${employeeCode}`, {
        headers: authHeaders(),
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Unable to load leave balance.");
      const casual = (data.balances || []).find((balance) => balance.type === "Casual Leave") || {};
      const compOff = (data.balances || []).find((balance) => balance.type === "Compensatory Off") || {};
      applyBalances([{ employeeCode, casualLeaveBalance: casual.available ?? 0, compOffBalance: compOff.available ?? 0 }]);
    };

    loadBalances().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [employeeRecords, loggedInEmployee?.employeeId, role, sessionUser]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) return;

    const year = new Date().getFullYear();
    fetch(`${API_BASE_URL}/api/leave/holidays?year=${year}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load holidays.");
        return data;
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data.holidays)) setHolidayRecords(data.holidays);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    window.localStorage.setItem(SATURDAY_ROTA_STORAGE_KEY, JSON.stringify(saturdayRota));
  }, [saturdayRota]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) {
      setAttendanceRecords([]);
      setAttendanceRequests([]);
      setAttendanceSyncStatus("Not loaded");
      setAttendanceHydrated(false);
      return;
    }

    const month = new Date().toISOString().slice(0, 7);
    setAttendanceSyncStatus("Loading from database...");
    setAttendanceHydrated(false);
    fetch(`${API_BASE_URL}/api/attendance?month=${month}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load attendance data.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const fetchedAttendance = data.attendance || [];
        setAttendanceRecords(fetchedAttendance);
        setAttendanceRequests(data.requests || []);
        setAttendanceSyncStatus("Database connected");
        setAttendanceHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAttendanceRecords([]);
          setAttendanceRequests([]);
          setAttendanceSyncStatus("Database unavailable - attendance cannot be marked");
          setAttendanceHydrated(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    window.localStorage.setItem(RECRUITMENT_STORAGE_KEY, JSON.stringify(candidateRecords));
  }, [candidateRecords]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) return;

    async function loadRecruitmentCandidates() {
      const localCandidates = loadStoredCandidates();
      const response = await fetch(`${API_BASE_URL}/api/recruitment/candidates`, {
        credentials: "include",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Unable to load recruitment candidates.");

      let databaseCandidates = data.candidates || [];
      const databaseIds = new Set(databaseCandidates.map((candidate) => candidate.id));
      const localOnlyCandidates = localCandidates.filter((candidate) => candidate.id && !databaseIds.has(candidate.id));

      if (localOnlyCandidates.length) {
        const savedCandidates = await Promise.all(localOnlyCandidates.map(async (candidate) => {
          const saveResponse = await fetch(`${API_BASE_URL}/api/recruitment/candidates`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(candidate),
          });
          const saveData = await saveResponse.json().catch(() => ({}));
          if (!saveResponse.ok) throw new Error(saveData.error?.message || "Unable to save local recruitment candidate.");
          return saveData.candidate;
        }));
        databaseCandidates = [...savedCandidates, ...databaseCandidates];
        window.localStorage.setItem(`${RECRUITMENT_STORAGE_KEY}_migrated_at`, new Date().toISOString());
        window.alert(`${savedCandidates.length} recruitment candidate${savedCandidates.length === 1 ? "" : "s"} saved to the database.`);
      }

      if (!cancelled) setCandidateRecords(databaseCandidates);
    }

    loadRecruitmentCandidates().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  useEffect(() => {
    window.localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(clientRecords));
  }, [clientRecords]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) {
      setClientSyncStatus("Local data");
      return;
    }
    if (activeModule !== "client-management") return;

    setClientSyncStatus("Loading from database...");
    fetch(`${API_BASE_URL}/api/clients`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load client data.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.clients)) setClientRecords(data.clients);
        setClientSyncStatus("Database connected");
      })
      .catch(() => {
        if (!cancelled) setClientSyncStatus("Using local data");
      });

    return () => {
      cancelled = true;
    };
  }, [activeModule, sessionUser]);

  useEffect(() => {
    window.localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(performanceReviews));
  }, [performanceReviews]);

  useEffect(() => {
    window.localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(payrollStatus));
  }, [payrollStatus]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) return;
    if (activeModule !== "payroll") return;

    const month = currentPayrollMonth();
    fetch(`${API_BASE_URL}/api/payroll?month=${month}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load payroll status.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setPayrollStatus((current) => {
          const next = { ...current };
          (data.payslips || []).forEach((payslip) => {
            next[payslip.key] = payslip.status;
            next[`${payslip.key}:id`] = payslip.id;
          });
          return next;
        });
        setPayrollCycles((current) => {
          const next = { ...current };
          (data.cycles || []).forEach((cycle) => {
            next[cycle.key] = cycle;
          });
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeModule, sessionUser]);

  const filteredEmployees = useMemo(() => {
    const text = query.trim().toLowerCase();
    return employeeRecords.filter((employee) => {
      const entityMatches = (employee.legalEntity || "HRGP") === employeeEntity;
      const textMatches = !text || Object.values(employee).join(" ").toLowerCase().includes(text);
      return entityMatches && textMatches;
    });
  }, [employeeEntity, employeeRecords, query]);

  const employeeEntityOptions = Array.from(new Set(["HRGP", "Taggd", ...employeeRecords.map((employee) => employee.legalEntity || "HRGP")]));

  useEffect(() => {
    let cancelled = false;
    if (!sessionUser) {
      setSessionLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSessionUser(data.user);
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.user));
      })
      .catch(() => {
        if (cancelled) return;
        setSessionUser(null);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleLogin(user, token = "") {
    setSessionUser(user);
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    if (token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    setActiveModule("dashboard");
  }

  function handleLogout() {
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setProfileMenuOpen(false);
    setProfileModalOpen(false);
    setSessionUser(null);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    setActiveModule("dashboard");
  }

  function openMyProfile() {
    setProfileMenuOpen(false);
    setProfileModalOpen(true);
  }

  function openChangePassword() {
    setProfileMenuOpen(false);
    setPasswordModalOpen(true);
  }

  async function stopImpersonation() {
    setProfileMenuOpen(false);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/impersonate/stop`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not return to admin profile.");
      setSessionUser(data.user);
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.user));
      if (data.token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
      setActiveModule("dashboard");
    } catch (error) {
      window.alert(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
    }
  }

  function mergeAttendanceRecord(record) {
    setAttendanceRecords((records) => {
      const withoutCurrent = records.filter((item) => !(item.employeeId === record.employeeId && item.date === record.date));
      return [record, ...withoutCurrent];
    });
  }

  if (sessionLoading) {
    return (
      <main className="login-page">
        <section className="login-card" aria-label="Loading session">
          <div className="login-brand compact">
            <div className="brand-mark">HG</div>
            <div>
              <strong>HR Guru</strong>
              <span>Opening your workspace</span>
            </div>
          </div>
          <div className="form-note">Checking your session...</div>
        </section>
      </main>
    );
  }

  if (!sessionUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (sessionUser.mustChangePassword) {
    return <ForcedPasswordChange user={sessionUser} onChanged={handleLogin} onLogout={handleLogout} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">HG</div>
          <div>
            <strong>HR Guru</strong>
            <span>HRMS</span>
          </div>
        </div>

        <nav className="nav">
          {visibleModules.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} aria-label={`Open ${item.label}`} className={activeModule === item.id ? "active" : ""} onClick={() => setActiveModule(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === "attendance" && pendingAttendanceRequestCount > 0 && <span className="nav-badge">{pendingAttendanceRequestCount}</span>}
              </button>
            );
          })}
        </nav>

        <div className="role-card">
          <span>Current role</span>
          <strong>{profile.label}</strong>
          <p>{profile.headline}</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{modules.find((item) => item.id === activeModule)?.label}</h1>
          </div>
          <div className="top-actions">
            <div className="profile-menu">
              <button className="profile-trigger" aria-label="Open profile menu" onClick={() => setProfileMenuOpen((current) => !current)}>
                <span className="avatar">{initials(profile.name)}</span>
              </button>
              {profileMenuOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="profile-menu-head">
                    <strong>{profile.name}</strong>
                    <span>{profile.label}</span>
                  </div>
                  {(role === "admin" || sessionUser.impersonatedBy) && (
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (sessionUser.impersonatedBy) stopImpersonation();
                        else setSwitchProfileOpen(true);
                      }}
                      role="menuitem"
                    >
                      <Users size={16} /> {sessionUser.impersonatedBy ? "Return to admin" : "Switch profile"}
                    </button>
                  )}
                  <button onClick={openMyProfile} role="menuitem"><UserCheck size={16} /> Profile</button>
                  {!sessionUser.impersonatedBy && <button onClick={openChangePassword} role="menuitem"><ShieldCheck size={16} /> Change password</button>}
                  <button onClick={handleLogout} role="menuitem"><LogOut size={16} /> Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeModule === "dashboard" && <Dashboard role={role} profile={profile} employees={employeeRecords} clients={clientRecords} leaveRecords={leaveRecords} leaveSettings={leaveSettings} attendanceRecords={attendanceRecords} attendanceRequests={attendanceRequests} payrollStatus={payrollStatus} performanceReviews={performanceReviews} setActiveModule={setActiveModule} />}
        {activeModule === "my-profile" && <MyProfilePage employee={loggedInEmployee} profile={profile} setEmployees={setEmployeeRecords} />}
        {activeModule === "client-management" && <ClientManagement clients={clientRecords} setClients={setClientRecords} syncStatus={clientSyncStatus} />}
        {activeModule === "employees" && <Employees rows={filteredEmployees} allEmployees={employeeRecords} setEmployees={setEmployeeRecords} entityOptions={employeeEntityOptions} query={query} setQuery={setQuery} employeeEntity={employeeEntity} setEmployeeEntity={setEmployeeEntity} canManage={permissions.canManageEmployees} syncStatus={employeeSyncStatus} attendanceRecords={attendanceRecords} leaveRecords={leaveRecords} payrollStatus={payrollStatus} />}
        {activeModule === "attendance" && <Attendance role={role} profile={profile} employees={employeeRecords} leaveRecords={leaveRecords} setLeaveRecords={setLeaveRecords} attendanceRecords={attendanceRecords} setAttendanceRecords={setAttendanceRecords} attendanceRequests={attendanceRequests} setAttendanceRequests={setAttendanceRequests} canManage={permissions.canManageAttendance} syncStatus={attendanceSyncStatus} />}
        {activeModule === "saturday-rota" && <SaturdayRota role={role} profile={profile} employees={employeeRecords} rota={saturdayRota} setRota={setSaturdayRota} canManage={permissions.canManageRota} />}
        {activeModule === "leave" && <Leave role={role} profile={profile} employees={employeeRecords} leaveRecords={leaveRecords} setLeaveRecords={setLeaveRecords} leaveSettings={leaveSettings} setLeaveSettings={setLeaveSettings} holidays={holidayRecords} setHolidays={setHolidayRecords} attendanceRecords={attendanceRecords} canApprove={permissions.canApproveLeave} syncStatus={leaveSyncStatus} />}
        {activeModule === "payroll" && <Payroll role={role} profile={profile} employees={employeeRecords} leaveRecords={leaveRecords} attendanceRecords={attendanceRecords} payrollStatus={payrollStatus} setPayrollStatus={setPayrollStatus} payrollCycles={payrollCycles} setPayrollCycles={setPayrollCycles} canManage={permissions.canManagePayroll} />}
        {activeModule === "communication" && <Communication />}
        {activeModule === "recruitment" && <Recruitment candidates={candidateRecords} setCandidates={setCandidateRecords} employees={employeeRecords} setEmployees={setEmployeeRecords} />}
        {activeModule === "performance" && <Performance role={role} profile={profile} employees={employeeRecords} reviews={performanceReviews} setReviews={setPerformanceReviews} />}
        {activeModule === "reports" && <Reports employees={employeeRecords} leaveRecords={leaveRecords} attendanceRecords={attendanceRecords} setAttendanceRecords={setAttendanceRecords} payrollStatus={payrollStatus} />}
        {activeModule === "settings" && <SettingsModule profile={profile} />}
      </main>
      {profileModalOpen && <MyProfileModal profile={profile} onClose={() => setProfileModalOpen(false)} />}
      {passwordModalOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordModalOpen(false)}
          onChanged={(user) => {
            setSessionUser(user);
            window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
            setPasswordModalOpen(false);
          }}
        />
      )}
      {switchProfileOpen && (
        <SwitchProfileModal
          currentUserId={sessionUser.id}
          onClose={() => setSwitchProfileOpen(false)}
          onSwitched={(user, token) => {
            setSessionUser(user);
            window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
            if (token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
            setSwitchProfileOpen(false);
            setActiveModule("dashboard");
          }}
        />
      )}
      {attendancePromptEmployee && attendanceHydrated && attendanceSyncStatus === "Database connected" && (
        <PostLoginAttendancePrompt
          employee={attendancePromptEmployee}
          attendanceRecords={attendanceRecords}
          attendanceRequests={attendanceRequests}
          onAttendance={mergeAttendanceRecord}
          onRequest={(request) => setAttendanceRequests((requests) => [request, ...requests])}
          onLogout={handleLogout}
        />
      )}
      {attendancePromptEmployee && attendanceHydrated && attendanceSyncStatus === "Database connected" && (
        <LeaveDeductionNotice
          employee={attendancePromptEmployee}
          leaveRecords={leaveRecords}
          attendanceRecords={attendanceRecords}
        />
      )}
    </div>
  );
}

function MyProfileModal({ profile, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card profile-modal" role="dialog" aria-modal="true" aria-label="My profile">
        <div className="modal-head">
          <div>
            <h2>My Profile</h2>
            <p>{profile.label}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close profile"><X size={18} /></button>
        </div>
        <div className="profile-modal-body">
          <div className="profile-head">
            <div className="avatar large">{initials(profile.name)}</div>
            <div>
              <h3>{profile.name}</h3>
              <p>{profile.headline}</p>
            </div>
          </div>
          <div className="check-list">
            {profile.access.map((item) => (
              <div className="check-row" key={item}><CheckCircle2 size={17} /><span>{item}</span></div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function todayLocalDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function localDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function currentLocalTime() {
  return new Date().toTimeString().slice(0, 5);
}

function currentIstTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function timeMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function PostLoginAttendancePrompt({ employee, attendanceRecords, attendanceRequests, onAttendance, onRequest, onLogout }) {
  const [clockTick, setClockTick] = useState(Date.now());
  const today = todayLocalDate();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [missedCheckInTime, setMissedCheckInTime] = useState("09:30");
  const todayRecord = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === today);
  const isAttendanceExempt = employee.name === "Surinder Singh";
  const previousOpenRecord = attendanceRecords
    .filter((record) => record.employeeId === employee.employeeId && record.date >= ATTENDANCE_GO_LIVE_DATE && record.date < today && record.checkIn && !record.checkOut)
    .sort((first, second) => second.date.localeCompare(first.date))[0];
  const previousOpenDate = previousOpenRecord?.date || "";
  const previousCheckoutMissing = !isAttendanceExempt && Boolean(previousOpenRecord);
  const shouldShow = !dismissed && (previousCheckoutMissing || !todayRecord?.checkIn);
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const currentPromptTime = currentIstTime(new Date(clockTick));
  const currentMinutes = timeMinutes(currentPromptTime);
  const beforeLoginWindow = currentMinutes < timeMinutes("08:30");
  const afterLoginWindow = currentMinutes >= timeMinutes("20:00");
  const outsideLoginWindow = beforeLoginWindow || afterLoginWindow;
  const afterCutoff = !isAttendanceExempt && currentMinutes > timeMinutes("10:30");
  const lateMissedCheckIn = !isAttendanceExempt && currentMinutes >= timeMinutes("18:00");
  const duplicateCheckInRequest = attendanceRequests.some((request) => (
    request.employeeId === employee.employeeId &&
    request.date === today &&
    request.status !== "Rejected" &&
    (request.punchType === "Check in" || request.requestType === "Forgot to punch - Check in")
  ));
  const duplicateCheckoutRequest = attendanceRequests.some((request) => (
    request.employeeId === employee.employeeId &&
    request.date === previousOpenDate &&
    request.status !== "Rejected" &&
    (request.punchType === "Checkout" || request.requestType === "Forgot to punch - Checkout")
  ));

  if (!shouldShow) return null;

  async function checkInNow() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/check-in`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Check-in could not be saved.");
      if (data.attendance) onAttendance(data.attendance);
      setDismissed(true);
    } catch (error) {
      setError(error.message === "Failed to fetch" ? "Backend server is not reachable. Please try again." : error.message);
    } finally {
      setSaving(false);
    }
  }

  async function raiseCheckInRequest() {
    setSaving(true);
    setError("");
    if (duplicateCheckInRequest) {
      setError("A check in punch request for today was already raised.");
      setSaving(false);
      return;
    }
    const request = {
      employeeId: employee.employeeId,
      employee: employee.name,
      date: today,
      requestType: "Forgot to punch",
      statusValue: "Present",
      punchType: "Check in",
      checkIn: lateMissedCheckIn ? missedCheckInTime : currentPromptTime,
      checkOut: "",
      hours: "",
      reason: lateMissedCheckIn ? "Forgot to punch" : "Check in",
      status: "Approved",
      createdAt: today,
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/update-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(attendanceRequestToApi(request)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Attendance request could not be submitted.");
      if (data.request) onRequest(data.request);
      if (data.attendance) onAttendance(data.attendance);
      setDismissed(true);
    } catch (error) {
      setError(error.message === "Failed to fetch" ? "Backend server is not reachable. Please open Attendance and try again." : error.message);
    } finally {
      setSaving(false);
    }
  }

  async function raisePreviousCheckoutRequest() {
    setSaving(true);
    setError("");
    if (duplicateCheckoutRequest) {
      setError(`A checkout punch request for ${previousOpenDate} was already raised.`);
      setSaving(false);
      return;
    }
    const request = {
      employeeId: employee.employeeId,
      employee: employee.name,
      date: previousOpenDate,
      requestType: "Forgot to punch",
      statusValue: "Present",
      punchType: "Checkout",
      checkIn: previousOpenRecord?.checkIn || "",
      checkOut: "18:30",
      hours: "",
      reason: "Checkout",
      status: "Approved",
      createdAt: today,
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/update-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(attendanceRequestToApi(request)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Checkout request could not be submitted.");
      if (data.request) onRequest(data.request);
      if (data.attendance) onAttendance(data.attendance);
      setDismissed(true);
    } catch (error) {
      setError(error.message === "Failed to fetch" ? "Backend server is not reachable. Please open Attendance and try again." : error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card attendance-nudge-modal" role="dialog" aria-modal="true" aria-label="Check in reminder">
        <div className="modal-head">
          <div>
            <h2>{previousCheckoutMissing ? "Checkout pending from previous workday" : outsideLoginWindow ? "Check-in window closed" : afterCutoff ? "Check-in request needed" : "Mark your check-in"}</h2>
            <p>
              {previousCheckoutMissing
                ? "You cannot check in today because your last attendance entry is still open."
                : outsideLoginWindow
                ? beforeLoginWindow
                  ? "Check-in is available after 8:30 AM."
                  : "Check-in is not available after 8:00 PM."
                  : lateMissedCheckIn
                    ? "This looks like a missed morning check-in. Please confirm your actual start time and raise a Forgot to punch request."
                  : afterCutoff
                    ? "It is past 10:30 AM, so direct check-in is closed. Raise a punch request with the correct check-in time."
                  : "Please check in before continuing with HRMS."}
            </p>
          </div>
          {outsideLoginWindow && <button className="icon-btn" onClick={onLogout} aria-label="Exit to login"><X size={18} /></button>}
        </div>
        <div className="check-list">
          <div className="check-row">
            <Clock3 size={17} />
            <span>
              {previousCheckoutMissing
                ? `Why: checkout is missing for ${previousOpenDate}. Check-in was recorded at ${previousOpenRecord?.checkIn || "the saved time"}.`
                : outsideLoginWindow
                ? "Please contact Admin if you need attendance support outside access hours."
                  : lateMissedCheckIn
                    ? "Use the time you actually started work, not the current late-evening access time."
                  : afterCutoff
                    ? "Raise a Forgot to punch request to continue."
                  : "Your check-in will be recorded for today."}
            </span>
          </div>
          {previousCheckoutMissing && (
            <div className="check-row">
              <AlertCircle size={17} />
              <span>What next: click Raise checkout request, confirm the correct checkout time for {previousOpenDate}, and submit it. Once the request is saved, today&apos;s check-in will be available.</span>
            </div>
          )}
          {!previousCheckoutMissing && !outsideLoginWindow && afterCutoff && (
            <label className="field">
              <span>Actual check-in time</span>
              <input type="time" value={lateMissedCheckIn ? missedCheckInTime : currentPromptTime} disabled={!lateMissedCheckIn} onInput={(event) => setMissedCheckInTime(event.target.value)} onChange={(event) => setMissedCheckInTime(event.target.value)} />
            </label>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          {previousCheckoutMissing ? (
            <button className="primary-btn" disabled={saving} onClick={raisePreviousCheckoutRequest}>
              {saving ? "Saving..." : `Raise checkout request for ${previousOpenDate}`}
            </button>
          ) : outsideLoginWindow ? (
            <button className="secondary-btn" onClick={onLogout}>Exit to login</button>
          ) : (
            <button className="primary-btn" disabled={saving} onClick={afterCutoff ? raiseCheckInRequest : checkInNow}>
              {saving ? "Saving..." : afterCutoff ? "Raise check-in request" : "Check in now"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function loadAcknowledgedLeaveDeductions() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEAVE_DEDUCTION_ACK_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function LeaveDeductionNotice({ employee, leaveRecords, attendanceRecords }) {
  const [acknowledged, setAcknowledged] = useState(loadAcknowledgedLeaveDeductions);
  const todayRecord = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === todayLocalDate());
  if (!todayRecord?.checkIn) return null;
  const deduction = leaveRecords.find((request) => (
    request.employeeId === employee.employeeId &&
    request.type === "Casual Leave" &&
    request.status === "Approved" &&
    (String(request.reason || "").startsWith("Auto half-day Casual Leave") || String(request.reason || "").startsWith("Auto full-day Casual Leave")) &&
    !acknowledged[request.id]
  ));

  if (!deduction) return null;

  function acknowledge() {
    const next = { ...acknowledged, [deduction.id]: true };
    setAcknowledged(next);
    window.localStorage.setItem(LEAVE_DEDUCTION_ACK_STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card attendance-nudge-modal" role="dialog" aria-modal="true" aria-label="Casual leave deduction notice">
        <div className="modal-head">
          <div>
            <h2>Casual Leave Updated</h2>
            <p>Your Casual Leave quota was reduced due to attendance rules.</p>
          </div>
        </div>
        <div className="check-list">
          <div className="check-row"><CalendarCheck size={17} /><span>{deduction.days} day Casual Leave was marked for {deduction.fromDate}. Reason: {deduction.reason}</span></div>
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={acknowledge}>I understand</button>
        </div>
      </section>
    </div>
  );
}

function ForcedPasswordChange({ user, onChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitChange(event) {
    event.preventDefault();
    setMessage("");
    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Password could not be updated.");
      onChanged(data.user);
    } catch (error) {
      setMessage(error.message === "Failed to fetch" ? "Backend server is not reachable. Please try again." : error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" aria-label="Change password" onSubmit={submitChange}>
        <div className="login-copy">
          <div className="login-brand compact">
            <div className="brand-mark">HG</div>
            <div>
              <strong>HR Guru</strong>
              <span>Secure your HRMS account</span>
            </div>
          </div>
          <h1>Change your password</h1>
          <p className="form-note login-note">Hi {user.employee?.fullName || user.username || user.email}, please set a new password before opening HRMS.</p>
        </div>
        <label className="field login-field">
          <span>Current password</span>
          <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Enter current password" />
        </label>
        <label className="field login-field">
          <span>New password</span>
          <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 8 characters" />
        </label>
        <label className="field login-field">
          <span>Confirm new password</span>
          <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Re-enter new password" />
        </label>
        {message && <div className="form-error login-note">{message}</div>}
        <button className="primary-btn login-submit" type="submit" disabled={saving}>{saving ? "Updating..." : "Update password"}</button>
        <button className="secondary-btn login-submit" type="button" onClick={onLogout}>Logout</button>
      </form>
    </main>
  );
}

function ChangePasswordModal({ onChanged, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitChange(event) {
    event.preventDefault();
    setMessage("");
    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Password could not be updated.");
      onChanged(data.user);
    } catch (error) {
      setMessage(error.message === "Failed to fetch" ? "Backend server is not reachable. Please try again." : error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card" role="dialog" aria-modal="true" aria-label="Change password" onSubmit={submitChange}>
        <div className="modal-head">
          <div>
            <h2>Change Password</h2>
            <p>Update your HRMS login password.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close change password"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Current password</span>
            <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New password</span>
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" />
          </label>
        </div>
        {message && <div className="form-error">{message}</div>}
        <div className="modal-actions">
          <span className="form-note">Use at least 8 characters. Your new password must be different from the current password.</span>
          <button className="secondary-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-btn" type="submit" disabled={saving}>{saving ? "Updating..." : "Update password"}</button>
        </div>
      </form>
    </div>
  );
}

function SwitchProfileModal({ currentUserId, onClose, onSwitched }) {
  const [targets, setTargets] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState("");
  const [error, setError] = useState("");
  const filteredTargets = targets.filter((user) => {
    const text = `${user.employee?.fullName || ""} ${user.email || ""} ${user.username || ""} ${user.role || ""}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API_BASE_URL}/api/auth/impersonation-targets`, {
      headers: authHeaders(),
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Could not load user profiles.");
        if (!cancelled) setTargets(data.users || []);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchTo(user) {
    setSwitchingId(user.id);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/impersonate`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not switch profile.");
      onSwitched(data.user, data.token);
    } catch (error) {
      setError(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
    } finally {
      setSwitchingId("");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card switch-profile-modal" role="dialog" aria-modal="true" aria-label="Switch user profile">
        <div className="modal-head">
          <div>
            <h2>Switch Profile</h2>
            <p>Temporarily view HRMS as another active user. Use Return to admin when done.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close switch profile"><X size={18} /></button>
        </div>
        <div className="profile-modal-body">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, username, role" />
          </label>
          {!loading && !error && <div className="form-note">Showing {filteredTargets.length} of {targets.length} active profiles.</div>}
          {error && <div className="form-error">{error}</div>}
          {loading ? (
            <div className="empty-state">Loading active profiles...</div>
          ) : !filteredTargets.length ? (
            <div className="empty-state">{targets.length ? "No active profile matches your search." : "No active employee profiles are available to switch into."}</div>
          ) : (
            <div className="switch-profile-list">
              {filteredTargets.map((user) => (
                <button className="switch-profile-row" key={user.id} onClick={() => switchTo(user)} disabled={switchingId === user.id || user.id === currentUserId}>
                  <Person name={user.employee?.fullName || user.email} detail={`${user.employee?.employeeCode || "-"} · ${user.username || user.email} · ${user.role}`} />
                  <Badge tone={user.id === currentUserId ? "blue" : user.role === "admin" ? "amber" : "green"}>{user.id === currentUserId ? "Current" : user.role}</Badge>
                </button>
              ))}
              {!filteredTargets.length && <div className="empty-state">No matching active profiles found.</div>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const resetToken = new URLSearchParams(window.location.search).get("resetToken") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [adminGoogleAvailable, setAdminGoogleAvailable] = useState(false);
  const [attendanceLimitBlock, setAttendanceLimitBlock] = useState(null);
  const [limitJustification, setLimitJustification] = useState("");
  const [limitResetMessage, setLimitResetMessage] = useState("");
  const googleButtonRef = useRef(null);

  async function submitLogin(event) {
    event.preventDefault();
    setSubmitting(true);
    setLoginError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: email, email, password, deviceKey: getDeviceKey(), deviceInfo: loginDeviceInfo() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.error?.code === "attendance_limit_reached") {
          setAttendanceLimitBlock(data.error);
          setLimitResetMessage("");
          return;
        }
        throw new Error(data.error?.message || "Login failed.");
      }
      onLogin(data.user, data.token);
    } catch (error) {
      setLoginError(error.message === "Failed to fetch" ? "Backend server is not running. Start it and try again." : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgotPassword() {
    setResetMessage("");
    setResetLink("");
    if (!email.trim()) {
      setResetMessage("Enter your username or email first.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Password reset could not be started.");
      setResetMessage(data.message || "If this account exists, password reset instructions have been sent.");
      setResetLink(data.resetLink || "");
    } catch (error) {
      setResetMessage(error.message === "Failed to fetch" ? "Backend server is not reachable. Please try again." : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAttendanceLimitReset() {
    setLimitResetMessage("");
    if (limitJustification.trim().length < 10) {
      setLimitResetMessage("Enter a short justification for Admin.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/attendance-limit-reset-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: email, password, justification: limitJustification }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Reset request could not be submitted.");
      setLimitResetMessage(data.message || "Reset request sent to Admin.");
    } catch (error) {
      setLimitResetMessage(error.message === "Failed to fetch" ? "Backend server is not reachable. Please try again." : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitResetPassword(event) {
    event.preventDefault();
    setLoginError("");
    if (newPassword !== confirmPassword) {
      setLoginError("New password and confirmation do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Password could not be reset.");
      window.history.replaceState({}, "", window.location.pathname);
      setResetRequested(false);
      setResetMessage(data.message || "Password updated. Please sign in with your new password.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setLoginError(error.message === "Failed to fetch" ? "Backend server is not reachable. Please try again." : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitGoogleCredential(credential) {
    setSubmitting(true);
    setLoginError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential, deviceKey: getDeviceKey(), deviceInfo: loginDeviceInfo() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Google sign-in failed.");
      onLogin(data.user, data.token);
    } catch (error) {
      setLoginError(error.message === "Failed to fetch" ? "Backend server is not running. Start it and try again." : error.message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    const login = email.trim();
    if (!login) {
      setAdminGoogleAvailable(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`${API_BASE_URL}/api/auth/google-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error?.message || "Could not check Google sign-in access.");
          if (!cancelled) setAdminGoogleAvailable(Boolean(data.available));
        })
        .catch(() => {
          if (!cancelled) setAdminGoogleAvailable(false);
        })
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !adminGoogleAvailable || !googleButtonRef.current) return undefined;
    let cancelled = false;
    loadGoogleIdentityScript()
      .then((loaded) => {
        if (!loaded || cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => submitGoogleCredential(response.credential),
        });
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          width: 462,
        });
      })
      .catch((error) => setLoginError(error.message));
    return () => {
      cancelled = true;
    };
  }, [adminGoogleAvailable]);

  if (resetToken) {
    return (
      <main className="login-page">
        <form className="login-card" aria-label="Reset password" onSubmit={submitResetPassword}>
          <div className="login-copy">
            <div className="login-brand compact">
              <div className="brand-mark">HG</div>
              <div>
                <strong>HR Guru</strong>
                <span>Reset your HRMS password</span>
              </div>
            </div>
            <h1>Set a new password</h1>
          </div>
          <label className="field login-field">
            <span>New password</span>
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 8 characters" />
          </label>
          <label className="field login-field">
            <span>Confirm new password</span>
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Re-enter new password" />
          </label>
          {loginError && <div className="form-error login-note">{loginError}</div>}
          <button className="primary-btn login-submit" type="submit" disabled={submitting}>{submitting ? "Updating..." : "Update password"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" aria-label="Login" onSubmit={submitLogin}>
        <div className="login-copy">
          <div className="login-brand compact">
            <div className="brand-mark">HG</div>
            <div>
              <strong>HR Guru</strong>
              <span>Human Resource Management</span>
            </div>
          </div>
          <h1>Sign in to HR Guru</h1>
        </div>

        <label className="field login-field">
          <span>Username or Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Username or Email" autoComplete="username" placeholder="first.last or gmail address" />
        </label>

        <label className="field login-field">
          <span className="password-label">Password <button type="button" onClick={() => setResetRequested((current) => !current)}>Forgot Password?</button></span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" aria-label="Password" autoComplete="current-password" placeholder="Enter your password" />
        </label>
        {resetRequested && (
          <div className="login-reset-panel">
            <button className="secondary-btn login-submit" type="button" disabled={submitting} onClick={submitForgotPassword}>
              {submitting ? "Sending..." : "Send password reset link"}
            </button>
            {resetMessage && <div className="form-note login-note">{resetMessage}</div>}
            {resetLink && <a className="form-note login-note reset-link" href={resetLink}>Open reset link</a>}
          </div>
        )}
        {loginError && <div className="form-error login-note">{loginError}</div>}
        {attendanceLimitBlock && (
          <div className="login-reset-panel">
            <div className="form-error login-note">{attendanceLimitBlock.message}</div>
            <label className="field login-field">
              <span>Justification for Admin</span>
              <input value={limitJustification} onChange={(event) => setLimitJustification(event.target.value)} placeholder="Explain why reset is needed" />
            </label>
            <button className="secondary-btn login-submit" type="button" disabled={submitting} onClick={submitAttendanceLimitReset}>
              {submitting ? "Sending..." : "Send request to Admin"}
            </button>
            {limitResetMessage && <div className="form-note login-note">{limitResetMessage}</div>}
          </div>
        )}

        <button className="primary-btn login-submit" type="submit" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
        {GOOGLE_CLIENT_ID && adminGoogleAvailable && (
          <div className="admin-google-login">
            <span>Admin Google sign-in</span>
            <div ref={googleButtonRef} />
          </div>
        )}
      </form>
    </main>
  );
}

function Dashboard({ role, profile, employees, clients, leaveRecords, leaveSettings, attendanceRecords, attendanceRequests, payrollStatus, performanceReviews, setActiveModule }) {
  const [clockTick, setClockTick] = useState(Date.now());
  const previousPerformanceMonth = previousCalendarMonthIst();
  const [dashboardAtsPerformance, setDashboardAtsPerformance] = useState({ status: "Loading", rows: [], month: previousPerformanceMonth });
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const reportMonth = currentPayrollMonth();
  const scopedEmployees = employees.filter((employee) => {
    if (!isActiveEmployee(employee)) return false;
    if (!shouldShowInAttendance(employee)) return false;
    if (role === "employee") return employee.name === profile.name;
    if (role === "manager") return employee.manager === profile.name;
    return true;
  });
  const scopedEmployeeIds = new Set(scopedEmployees.map((employee) => employee.employeeId));
  const scopedLeave = leaveRecords.filter((request) => scopedEmployeeIds.has(request.employeeId));
  const scopedAttendance = attendanceRecords.filter((record) => scopedEmployeeIds.has(record.employeeId));
  const pendingAttendanceRequests = attendanceRequests.filter((request) => request.status === "Pending" && scopedEmployeeIds.has(request.employeeId)).length;
  const scopedPayrollRows = scopedEmployees.map((employee) => payrollForEmployee(employee, reportMonth, attendanceRecords, leaveRecords, payrollStatus));
  const pendingLeave = scopedLeave.filter((request) => request.status === "Pending").length;
  const presentToday = scopedAttendance.filter((record) => record.date === today && ["Present", "Remote", "Late"].includes(record.status)).length;
  const todayAttendanceByEmployee = new Map(scopedAttendance.filter((record) => record.date === today).map((record) => [record.employeeId, record]));
  const leaveTodayRows = scopedEmployees
    .map((employee) => ({ employee, leave: approvedLeaveForDate(employee.employeeId, today, scopedLeave) }))
    .filter((row) => row.leave);
  const absentTodayRows = scopedEmployees
    .map((employee) => ({ employee, attendance: todayAttendanceByEmployee.get(employee.employeeId), leave: approvedLeaveForDate(employee.employeeId, today, scopedLeave) }))
    .filter((row) => !row.leave && (!row.attendance || row.attendance.status === "Absent"));
  const ownAttendance = scopedAttendance.find((record) => record.date === today);
  const pendingSelfLeave = scopedLeave.filter((request) => request.status === "Pending").reduce((sum, request) => sum + Number(request.days || 0), 0);
  const payrollNeedsReview = scopedPayrollRows.filter((row) => row.status === "Draft" || !row.monthlySalary || !row.employee.bankAccount || row.absentDays > 0).length;
  const probationCount = scopedEmployees.filter((employee) => employee.status === "Probation").length;
  const missingPayrollDetails = scopedEmployees.filter((employee) => !employee.monthlySalary || !employee.bankAccount).length;
  const recentLeave = [...scopedLeave].slice(0, 3);
  const ownEmployee = role === "employee" ? scopedEmployees[0] : null;
  const ownRequestCount = ownEmployee ? attendanceRequests.filter((request) => request.employeeId === ownEmployee.employeeId && request.createdAt?.slice(0, 7) === reportMonth).length : 0;
  const upcomingLeaves = scopedLeave
    .filter((request) => request.toDate >= today && ["Approved", "Pending"].includes(request.status))
    .sort((first, second) => first.fromDate.localeCompare(second.fromDate))
    .slice(0, 4);
  const missingMasterDetails = ownEmployee ? [
    ["Phone", ownEmployee.phone],
    ["Date of birth", ownEmployee.dob],
    ["Address", ownEmployee.address],
    ["Emergency contact", ownEmployee.emergencyContact],
    ["Gender", ownEmployee.gender],
    ["Work location", ownEmployee.location],
    ["Bank account", ownEmployee.bankAccount],
    ["PAN", ownEmployee.pan],
    ["UAN", ownEmployee.uan],
    ["Aadhaar", ownEmployee.aadhaarNumber],
  ].filter(([, value]) => !String(value || "").trim()) : [];
  const employeeAlerts = role === "employee" ? [
    { label: ownAttendance?.checkIn ? "Attendance marked today" : "Mark attendance today", value: ownAttendance?.checkIn ? "Done" : "Open", tone: ownAttendance?.checkIn ? "green" : "amber", module: "attendance" },
    { label: "Attendance requests used", value: `${ownRequestCount}/5`, tone: ownRequestCount >= 5 ? "red" : ownRequestCount >= 3 ? "amber" : "green", module: "attendance" },
    { label: "Pending leave requests", value: scopedLeave.filter((request) => request.status === "Pending").length, tone: pendingLeave ? "amber" : "green", module: "leave" },
    { label: "Missing employee-master details", value: missingMasterDetails.length, tone: missingMasterDetails.length ? "red" : "green", module: "my-profile" },
  ] : [];
  const ownLeaveBalances = ownEmployee ? leaveBalanceRows(ownEmployee.employeeId, leaveRecords, leaveSettings, ownEmployee, attendanceRecords) : [];
  const paidLeaveBalance = ownLeaveBalances.find((balance) => balance.type === "Casual Leave") || { available: 0, entitlement: 0, used: 0, pending: 0 };
  useEffect(() => {
    if (role === "employee") return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/dashboard/summary`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load dashboard summary.");
        if (!cancelled) setDashboardSummary(data);
      })
      .catch(() => {
        if (!cancelled) setDashboardSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);
  useEffect(() => {
    if (role !== "employee") return undefined;
    const timer = window.setInterval(() => setClockTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [role]);

  useEffect(() => {
    if (role !== "employee") return undefined;
    let cancelled = false;
    setDashboardAtsPerformance({ status: "Loading", rows: [], month: previousPerformanceMonth });
    fetch(`${API_BASE_URL}/api/performance/offered-candidates?month=${previousPerformanceMonth}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load ATS performance.");
        if (!cancelled) setDashboardAtsPerformance({ status: "ATS", rows: data.rows || [], month: previousPerformanceMonth });
      })
      .catch(() => {
        if (!cancelled) setDashboardAtsPerformance({ status: "History", rows: [], month: previousPerformanceMonth });
      });
    return () => {
      cancelled = true;
    };
  }, [role, previousPerformanceMonth]);

  const ownMonthlySummary = ownEmployee ? liveAttendanceSummaryForEmployee(ownEmployee, reportMonth, attendanceRecords, leaveRecords) : null;
  const liveCheckOut = ownAttendance?.checkOut || (ownAttendance?.checkIn ? currentIstTime(new Date(clockTick)) : "");
  const todayHours = ownAttendance?.checkIn ? durationHoursBetween(ownAttendance.checkIn, liveCheckOut) : Number(ownAttendance?.hours || 0);
  const todayHoursLabel = todayHours ? `${Math.floor(todayHours)}h ${Math.round((todayHours % 1) * 60)}m` : "0h 0m";
  const ownPerformanceSummary = ownEmployee ? previousMonthPerformanceForEmployee(ownEmployee, previousPerformanceMonth, dashboardAtsPerformance.rows) : null;
  const summaryAbsentRows = dashboardSummary?.absentToday?.map((row) => ({
    employee: { employeeId: row.employeeId, name: row.employee, client: row.client },
    attendance: row.status === "Not checked in" ? null : { status: row.status },
  }));
  const summaryLeaveRows = dashboardSummary?.onLeaveToday?.map((row) => ({
    employee: { employeeId: row.employeeId, name: row.employee },
    leave: { type: row.type, fromDate: row.fromDate, toDate: row.toDate, status: row.status },
  }));
  const displayAbsentTodayRows = summaryAbsentRows || absentTodayRows;
  const displayLeaveTodayRows = summaryLeaveRows || leaveTodayRows;
  const payrollDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const nextPayslipLabel = payrollDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  const scheduleMode = ownEmployee?.workMode || "Hybrid";
  const scheduleRows = [
    ["Shift", "General (9-6)"],
    ["Work location", scheduleMode],
    ["WFH days/week", scheduleMode === "Remote" ? "5" : scheduleMode === "Hybrid" ? "2" : "0"],
  ];
  const upcomingSchedule = [
    { date: shiftDate(today, 1), mode: ownEmployee?.workMode === "Office" ? "Office" : "WFH" },
    { date: shiftDate(today, 3), mode: "Office" },
  ];
  const metricCards = role === "employee"
    ? [
      { label: "Attendance", value: ownAttendance?.status || "Not marked", note: today },
      { label: "Requests used", value: `${ownRequestCount}/5`, note: `${reportMonth} attendance` },
      { label: "Upcoming leaves", value: upcomingLeaves.length, note: "Approved or pending" },
      { label: "Missing details", value: missingMasterDetails.length, note: "Employee master" },
    ]
    : role === "manager"
      ? [
        { label: "Team members", value: dashboardSummary?.employeeCount ?? scopedEmployees.length, note: `${dashboardSummary?.probationCount ?? probationCount} probation` },
        { label: "Present today", value: dashboardSummary?.presentToday ?? presentToday, note: dashboardSummary?.today || today },
        { label: "Attendance requests", value: dashboardSummary?.pendingAttendanceRequests ?? pendingAttendanceRequests, note: "Pending approval" },
      ]
      : [
        { label: "Employees", value: dashboardSummary?.employeeCount ?? scopedEmployees.length, note: `${dashboardSummary?.probationCount ?? probationCount} probation` },
        { label: "Present today", value: dashboardSummary?.presentToday ?? presentToday, note: dashboardSummary?.today || today },
        { label: "Open items", value: dashboardSummary ? dashboardSummary.pendingLeave + dashboardSummary.pendingAttendanceRequests + dashboardSummary.missingPayrollDetails : pendingLeave + pendingAttendanceRequests + payrollNeedsReview + missingPayrollDetails, note: `${reportMonth} cycle` },
      ];
  const queueItems = role === "employee"
    ? [
      { label: "Mark attendance", value: ownAttendance ? 0 : 1, tone: ownAttendance ? "green" : "amber" },
      { label: "Pending leave days", value: pendingSelfLeave, tone: "blue" },
      { label: "Payslip status", value: scopedPayrollRows[0]?.status || "Draft", tone: "green" },
    ]
    : role === "manager"
      ? [
        { label: "Team leave approvals", value: pendingLeave, tone: "amber" },
        { label: "Attendance update requests", value: pendingAttendanceRequests, tone: pendingAttendanceRequests ? "amber" : "green" },
        { label: "Team on probation", value: probationCount, tone: "blue" },
      ]
      : [
        { label: "Leave approvals", value: pendingLeave, tone: "amber" },
        { label: "Attendance update requests", value: pendingAttendanceRequests, tone: pendingAttendanceRequests ? "amber" : "green" },
        { label: "Payroll review", value: payrollNeedsReview, tone: "blue" },
      ];

  if (role === "employee") {
    const ownPayroll = scopedPayrollRows[0] || {};
    const employeeSummary = [
      ownEmployee?.role || profile.headline,
      ownEmployee?.employeeId,
      ownEmployee?.dept,
    ].filter(Boolean).join(" · ");
    const assignmentSummary = [
      ownEmployee?.client || "Client not assigned",
    ].filter(Boolean).join(" · ");
    const complianceRows = [
      { label: "Phone number", complete: Boolean(ownEmployee?.phone) },
      { label: "Emergency contact", complete: Boolean(ownEmployee?.emergencyContact) },
      { label: "Bank details", complete: Boolean(ownEmployee?.bankAccount && ownEmployee?.ifsc) },
      { label: "PAN", complete: Boolean(ownEmployee?.pan) },
      { label: "UAN", complete: Boolean(ownEmployee?.uan) },
      { label: "Aadhaar", complete: Boolean(ownEmployee?.aadhaarNumber) },
    ];
    const noticeItems = [
      { title: "Check-in window", detail: "Direct check-in is available from 8:30 AM to 10:30 AM. After that, raise a check-in request.", tone: "green" },
      { title: "Request limit", detail: "Forgot to punch requests count toward the 5-request monthly limit.", tone: ownRequestCount >= 5 ? "red" : "amber" },
      { title: "Leave policy", detail: "Casual Leave can be applied only when quota is available.", tone: "blue" },
    ];

    return (
      <div className="stack employee-dashboard">
        <section className="employee-hero">
          <div className="employee-hero-avatar">{initials(profile.name)}</div>
          <div>
            <span className="eyebrow">My dashboard</span>
            <h2>Good morning, {profile.name}</h2>
            <p>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
            <div className="employee-hero-meta">
              <span>{employeeSummary}</span>
              <Badge tone={ownEmployee?.status === "Active" ? "green" : "amber"}>{ownEmployee?.status || "Active"}</Badge>
            </div>
          </div>
          <div className="employee-assignment">
            <span>Current assignment</span>
            <strong>{assignmentSummary}</strong>
          </div>
          <button className="secondary-btn" onClick={() => setActiveModule("my-profile")}>View profile</button>
        </section>

        <SectionLabel>Quick actions</SectionLabel>
        <div className="employee-action-grid">
          <button onClick={() => setActiveModule("leave")}><CalendarCheck size={20} /><span>Apply leave</span></button>
          <button onClick={() => setActiveModule("attendance")}><Clock3 size={20} /><span>Log attendance</span></button>
          <button onClick={() => setActiveModule("payroll")}><Download size={20} /><span>View payslip</span></button>
          <button onClick={() => setActiveModule("my-profile")}><Upload size={20} /><span>Update profile</span></button>
        </div>

        <SectionLabel>Top summary</SectionLabel>
        <div className="employee-kpi-grid">
          <EmployeeKpi icon={Clock3} label="Today's hours" value={todayHoursLabel} note={ownAttendance?.checkIn ? ownAttendance.checkOut ? `${ownAttendance.checkIn} to ${ownAttendance.checkOut}` : `Live since ${ownAttendance.checkIn}` : "Check-in not marked"} />
          <EmployeeKpi icon={CalendarCheck} label="Casual Leave" value={`${paidLeaveBalance.available} days`} note={`${paidLeaveBalance.pending} pending approval`} />
          <EmployeeKpi icon={Gauge} label="Requests used" value={`${ownRequestCount}/5`} note={ownRequestCount >= 5 ? "Contact Admin" : `${Math.max(5 - ownRequestCount, 0)} left this month`} />
          {ownPerformanceSummary && <EmployeeKpi icon={Star} label="Performance" value={ownPerformanceSummary.status} note={`${monthName(ownPerformanceSummary.month)}: ${ownPerformanceSummary.selections}/${ownPerformanceSummary.target} offered`} />}
        </div>

        <div className="employee-dashboard-grid two">
          <article className="employee-card-panel">
            <div className="employee-card-title">
              <h3><CalendarCheck size={18} /> Work & attendance</h3>
              <button className="link-button" onClick={() => setActiveModule("attendance")}>Open</button>
            </div>
            {[
              ["Days present", ownMonthlySummary?.present || 0],
              ["Days absent", ownMonthlySummary?.absent || 0],
              ["Late check-ins", ownMonthlySummary?.late || 0],
              ["WFH days", ownMonthlySummary?.remote || 0],
              ["Recorded days", ownMonthlySummary?.recordedDays || 0],
              ["Requests used", `${ownRequestCount}/5`],
            ].map(([label, value]) => <InfoLine key={label} label={label} value={value} />)}
          </article>

          <article className="employee-card-panel">
            <div className="employee-card-title">
              <h3><CalendarCheck size={18} /> Leave balance</h3>
              <button className="link-button" onClick={() => setActiveModule("leave")}>Apply</button>
            </div>
            <LeaveProgress label="Casual leave" used={paidLeaveBalance.used} total={paidLeaveBalance.entitlement} tone="green" />
            <LeaveProgress label="Pending approval" used={paidLeaveBalance.pending} total={paidLeaveBalance.entitlement} tone="amber" />
            <div className="employee-mini-list">
              {upcomingLeaves.length ? upcomingLeaves.slice(0, 2).map((request) => (
                <div className="employee-list-row" key={request.id}>
                  <span>{formatDateRange(request.fromDate, request.toDate)}</span>
                  <Badge tone={request.status === "Approved" ? "green" : "amber"}>{request.status}</Badge>
                </div>
              )) : <div className="empty-state">No upcoming leaves scheduled.</div>}
            </div>
          </article>
        </div>

        <div className="employee-dashboard-grid three">
          <article className="employee-card-panel">
            <div className="employee-card-title">
              <h3><IndianRupee size={18} /> Payslip</h3>
              <button className="link-button" onClick={() => setActiveModule("payroll")}>View</button>
            </div>
            <div className="employee-pay-summary">
              <span>{monthName(reportMonth)}</span>
              <strong>{ownPayroll.status || "Draft"}</strong>
              <small>Next payroll date: {nextPayslipLabel}</small>
            </div>
            <InfoLine label="Paid days" value={ownPayroll.paidDays ?? "-"} />
            <InfoLine label="Absent days" value={ownPayroll.absentDays ?? "-"} />
          </article>

          <article className="employee-card-panel">
            <div className="employee-card-title">
              <h3><ShieldCheck size={18} /> Compliance</h3>
              <button className="link-button" onClick={() => setActiveModule("my-profile")}>Update</button>
            </div>
            <div className="employee-checklist">
              {complianceRows.map((item) => (
                <div className="employee-check-row" key={item.label}>
                  <CheckCircle2 size={16} />
                  <span>{item.label}</span>
                  <Badge tone={item.complete ? "green" : "amber"}>{item.complete ? "Done" : "Pending"}</Badge>
                </div>
              ))}
            </div>
          </article>

          <article className="employee-card-panel">
            <div className="employee-card-title">
              <h3><Bell size={18} /> Notices</h3>
            </div>
            <div className="employee-notice-list">
              {noticeItems.map((item) => (
                <div className="employee-notice-row" key={item.title}>
                  <i className={item.tone} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Today</span>
          <h2>Good morning, {profile.name}</h2>
        </div>
      </section>

      <div className={role === "admin" || role === "hr" ? "module-grid management-tiles" : "module-grid single management-tiles"}>
        {(role === "admin" || role === "hr" || role === "manager") && (
          <button className="management-tile" onClick={() => setActiveModule("employees")}>
            <Users size={22} />
            <strong>{role === "manager" ? "Team Directory" : "Employee Management"}</strong>
            <span>{role === "manager" ? "View your team records and employee context" : "Manage employee master, attendance, leave, payroll, and reporting"}</span>
          </button>
        )}
        {(role === "admin" || role === "hr") && (
          <button className="management-tile" onClick={() => setActiveModule("client-management")}>
            <BriefcaseBusiness size={22} />
            <strong>Client Management</strong>
            <span>{clients.length} clients Â· invoices, agreements, BD tools, and invoice handoff</span>
          </button>
        )}
        {role === "employee" && (
          <button className="management-tile" onClick={() => setActiveModule("my-profile")}>
            <UserCheck size={22} />
            <strong>Self Management</strong>
            <span>Profile, attendance, leave, and payslip self-service</span>
          </button>
        )}
      </div>

      <div className="metrics compact-dashboard">
        {metricCards.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} note={metric.note} />)}
      </div>

      {(role === "admin" || role === "hr" || role === "manager") && (
        <div className="two-col">
          <Panel title="Absent / Not Checked In Today" meta={`${displayAbsentTodayRows.length} employee${displayAbsentTodayRows.length === 1 ? "" : "s"}`}>
            <div className="activity-list">
              {displayAbsentTodayRows.length ? displayAbsentTodayRows.map(({ employee, attendance }) => (
                <div className="activity-row" key={`${employee.employeeId}-absent-today`}>
                  <Person name={employee.name} detail={`${employee.employeeId} · ${employee.client || employee.dept || "No client"}`} />
                  <Badge tone={attendance?.status === "Absent" ? "red" : "amber"}>{attendance?.status === "Absent" ? "Absent" : "Not checked in"}</Badge>
                </div>
              )) : <div className="empty-state">No active employee is absent or pending check-in today.</div>}
            </div>
          </Panel>
          <Panel title="On Leave Today" meta={`${displayLeaveTodayRows.length} employee${displayLeaveTodayRows.length === 1 ? "" : "s"}`}>
            <div className="activity-list">
              {displayLeaveTodayRows.length ? displayLeaveTodayRows.map(({ employee, leave }) => (
                <div className="activity-row" key={`${employee.employeeId}-leave-today`}>
                  <Person name={employee.name} detail={`${leave.type} · ${formatDateRange(leave.fromDate, leave.toDate)}`} />
                  <Badge tone={leave.type === "Work From Home" ? "blue" : "green"}>{leave.type}</Badge>
                </div>
              )) : <div className="empty-state">No approved leave scheduled for today.</div>}
            </div>
          </Panel>
        </div>
      )}

      <div className="two-col">
        <Panel title={role === "employee" ? "My Actions" : role === "manager" ? "Team Snapshot" : "Needs Attention"} meta="Live">
          <div className="queue">
            {queueItems.map((item) => <QueueItem key={item.label} label={item.label} value={item.value} tone={item.tone} />)}
          </div>
        </Panel>
        <Panel title={role === "employee" ? "My Leave" : role === "manager" ? "Team Leave" : "Recent Leave"} meta="Latest">
          <div className="activity-list">
            {recentLeave.length ? recentLeave.map((request) => (
              <div className="activity-row" key={request.id}>
                <div>
                  <strong>{request.employee}</strong>
                  <span>{request.type} Â· {formatDateRange(request.fromDate, request.toDate)}</span>
                </div>
                <Badge tone={request.status === "Approved" ? "green" : request.status === "Rejected" ? "red" : "amber"}>{request.status}</Badge>
              </div>
            )) : <div className="empty-state">No leave activity yet.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <h3 className="dashboard-section-label">{children}</h3>;
}

function DashboardStat({ icon: Icon, label, value, note }) {
  return (
    <article className="dashboard-stat">
      <span><Icon size={16} /> {label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function EmployeeKpi({ icon: Icon, label, value, note }) {
  return (
    <article className="employee-kpi">
      <span><Icon size={16} /> {label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function InfoLine({ label, value }) {
  return <div className="info-line"><span>{label}</span><strong>{value}</strong></div>;
}

function LeaveProgress({ label, used, total, tone }) {
  const percent = total ? Math.min((Number(used || 0) / Number(total)) * 100, 100) : 0;
  const left = Math.max(Number(total || 0) - Number(used || 0), 0);
  return (
    <div className="leave-progress">
      <div><span>{label} (used {used}/{total})</span><strong>{left} left</strong></div>
      <span className="progress-track"><i className={tone} style={{ width: `${percent}%` }} /></span>
    </div>
  );
}

function Employees({ rows, allEmployees, setEmployees, entityOptions, query, setQuery, employeeEntity, setEmployeeEntity, canManage, syncStatus, attendanceRecords, leaveRecords, payrollStatus }) {
  const employeesPerPage = 15;
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [formMode, setFormMode] = useState("add");
  const [saveError, setSaveError] = useState("");
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [viewMode, setViewMode] = useState("cards");
  const [selectedAllocationClient, setSelectedAllocationClient] = useState("All Clients");
  const [employeePage, setEmployeePage] = useState(1);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const sortedRows = useMemo(() => {
    const sortValue = (employee) => {
      if (sortBy === "employeeId") return employee.employeeId || "";
      if (sortBy === "entity") return employee.legalEntity || "HRGP";
      if (sortBy === "status") return employee.status || "";
      if (sortBy === "joinDate") return employee.joinDate || "";
      return employee.name || "";
    };
    return [...rows].sort((first, second) => String(sortValue(first)).localeCompare(String(sortValue(second)), undefined, { numeric: true, sensitivity: "base" }));
  }, [rows, sortBy]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / employeesPerPage));
  const currentPage = Math.min(employeePage, pageCount);
  const pageStart = (currentPage - 1) * employeesPerPage;
  const pagedRows = sortedRows.slice(pageStart, pageStart + employeesPerPage);
  const pageMeta = sortedRows.length ? `Page ${currentPage} of ${pageCount} Â· ${pageStart + 1}-${pageStart + pagedRows.length} of ${sortedRows.length}` : `Page 1 of 1 Â· 0 employees`;
  const allocationRows = allEmployees.filter((employee) => isActiveEmployee(employee) && shouldShowInAttendance(employee));
  const allocationClients = ["All Clients", ...Array.from(new Set(allocationRows.map((employee) => employee.client || "Unassigned"))).sort((first, second) => {
    if (first === "Unassigned") return 1;
    if (second === "Unassigned") return -1;
    return first.localeCompare(second);
  })];
  const selectedAllocationRows = allocationRows
    .filter((employee) => selectedAllocationClient === "All Clients" || (employee.client || "Unassigned") === selectedAllocationClient)
    .sort((first, second) => String(first.client || "Unassigned").localeCompare(String(second.client || "Unassigned")) || String(first.name).localeCompare(String(second.name)));
  const allocationExportName = selectedAllocationClient === "All Clients" ? "all-clients" : selectedAllocationClient.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unassigned";
  const panelTitle = viewMode === "allocation" ? "Team Allocation" : "Employee Directory";
  const panelMeta = viewMode === "allocation" ? `${allocationRows.length} active employees` : pageMeta;

  useEffect(() => {
    setEmployeePage(1);
  }, [employeeEntity, query, sortBy, rows.length]);

  useEffect(() => {
    if (employeePage > pageCount) setEmployeePage(pageCount);
  }, [employeePage, pageCount]);

  useEffect(() => {
    if (!viewingEmployee) return;
    const freshSelection = allEmployees.find((employee) => employeeKey(employee) === employeeKey(viewingEmployee));
    if (freshSelection) {
      setViewingEmployee(freshSelection);
    } else {
      setViewingEmployee(null);
    }
  }, [allEmployees, viewingEmployee]);

  function openAddEmployee() {
    const maxNumber = allEmployees.reduce((max, employee) => {
      const match = String(employee.employeeId).match(/(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 1000);
    setFormMode("add");
    setSaveError("");
    setEditingEmployee({ ...emptyEmployee, employeeId: `HG-${String(maxNumber + 1).padStart(4, "0")}`, joinDate: new Date().toISOString().slice(0, 10) });
  }

  function openEditEmployee(employee) {
    setFormMode("edit");
    setSaveError("");
    setEditingEmployee(employee);
  }

  async function saveEmployee(employee) {
    if (!employee.name.trim() || !employee.email.trim() || !employee.role.trim()) return;
    setSavingEmployee(true);
    setSaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees${formMode === "edit" ? `/${employee.id || employee.employeeId}` : ""}`, {
        method: formMode === "edit" ? "PATCH" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(employeeToApi(employee)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Employee could not be saved.");
      const savedEmployee = employeeFromApi(data.employee);
      if (formMode === "edit") {
        setEmployees((current) => current.map((item) => employeeKey(item) === employeeKey(employee) ? savedEmployee : item));
        setViewingEmployee(savedEmployee);
      } else {
        setEmployees((current) => [savedEmployee, ...current]);
        setViewingEmployee(savedEmployee);
        setQuery("");
        setEmployeeEntity(savedEmployee.legalEntity || "HRGP");
      }
      setEditingEmployee(null);
    } catch (error) {
      setSaveError(error.message === "Failed to fetch" ? "Backend server is not running. Employee was not saved to database." : error.message);
    } finally {
      setSavingEmployee(false);
    }
  }

  async function dismissEmployee(employee) {
    const exitDate = window.prompt(`Enter exit date for ${employee.name}`, new Date().toISOString().slice(0, 10));
    if (!exitDate) return;
    setSaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees/${employee.id || employee.employeeId}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          status: "exited",
          lifecycleStage: "Exited",
          exitDate,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Employee could not be dismissed.");
      const dismissedEmployee = employeeFromApi(data.employee);
      setEmployees((current) => current.map((item) => employeeKey(item) === employeeKey(employee) ? dismissedEmployee : item));
      setViewingEmployee((current) => current && employeeKey(current) === employeeKey(employee) ? dismissedEmployee : current);
    } catch (error) {
      setSaveError(error.message === "Failed to fetch" ? "Backend server is not running. Employee was not dismissed." : error.message);
    }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Delete ${employee.name} from employee master? This cannot be undone.`)) return;
    setSaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees/${employee.id || employee.employeeId}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Employee could not be deleted.");
      setEmployees((current) => current.filter((item) => employeeKey(item) !== employeeKey(employee)));
      setViewingEmployee((current) => current && employeeKey(current) === employeeKey(employee) ? null : current);
    } catch (error) {
      setSaveError(error.message === "Failed to fetch" ? "Backend server is not running. Employee was not deleted." : error.message);
    }
  }

  function exportEmployees() {
    downloadCsv("hrguru-employee-master.csv", employeesToCsv(allEmployees));
  }

  function exportAllocation() {
    downloadCsv(`hrguru-team-allocation-${allocationExportName}.csv`, allocationRowsToCsv(selectedAllocationRows));
  }

  function downloadTemplate() {
    const templateRow = { ...emptyEmployee, employeeId: "HG-1007", name: "Sample Employee", email: "sample.employee@company.com", role: "Job Title" };
    downloadCsv("hrguru-employee-template.csv", employeesToCsv([templateRow]));
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportPreview(buildImportPreview(String(reader.result || ""), allEmployees));
    reader.readAsText(file);
  }

  function applyImport() {
    const validRows = importPreview.rows.filter((row) => row.action !== "Skip");
    if (!validRows.length) return;
    setEmployees((current) => {
      const byId = new Map(current.map((employee) => [employeeKey(employee), employee]));
      validRows.forEach((row) => {
        byId.set(employeeKey(row.employee), { ...emptyEmployee, ...(byId.get(employeeKey(row.employee)) || {}), ...row.employee });
      });
      return Array.from(byId.values());
    });
    setViewingEmployee(validRows[0].employee);
    setQuery("");
    setEmployeeEntity(validRows[0].employee.legalEntity || "HRGP");
    setImportPreview(null);
  }

  return (
    <div className="stack">
      <div className="employee-layout full">
        <Panel title={panelTitle} meta={panelMeta}>
          <div className="toolbar">
            {viewMode !== "allocation" && (
              <div className="search-box">
                <Search size={16} />
                <input value={query} onInput={(event) => setQuery(event.target.value)} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code, email, client, role" aria-label="Search employees" />
              </div>
            )}
            {viewMode !== "allocation" && <select value={employeeEntity} onChange={(event) => setEmployeeEntity(event.target.value)} aria-label="Employee entity">
              {entityOptions.map((entity) => <option key={entity}>{entity}</option>)}
            </select>}
            {viewMode !== "allocation" && <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort employees">
              <option value="name">Sort: Name</option>
              <option value="employeeId">Sort: Employee ID</option>
              <option value="entity">Sort: Entity</option>
              <option value="status">Sort: Status</option>
              <option value="joinDate">Sort: Join Date</option>
            </select>}
            <div className="segmented-control" aria-label="Employee view">
              <button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>Cards</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
              {canManage && <button className={viewMode === "allocation" ? "active" : ""} onClick={() => setViewMode("allocation")}>Allocation</button>}
            </div>
            {viewMode === "allocation" && <button className="secondary-btn" disabled={!selectedAllocationRows.length} onClick={exportAllocation}><Download size={16} /> Export CSV</button>}
            {canManage && <button className="primary-btn" onClick={openAddEmployee}><UserCheck size={17} /> Add employee</button>}
          </div>
          {saveError && <div className="form-error employee-action-error">{saveError}</div>}
          {viewMode === "allocation" ? (
            <TeamAllocationView
              employees={allocationRows}
              clients={allocationClients}
              selectedClient={selectedAllocationClient}
              setSelectedClient={setSelectedAllocationClient}
              selectedRows={selectedAllocationRows}
              onEdit={openEditEmployee}
            />
          ) : viewMode === "cards" ? (
          <div className="employee-card-grid">
            {pagedRows.map((employee) => (
              <article className="employee-card" key={employeeKey(employee)}>
                <div className="employee-card-head">
                  <div className="person">
                    <div className="avatar">{initials(employee.name)}</div>
                    <div>
                      <button className="name-link" onClick={() => setViewingEmployee(employee)}>{employee.name}</button>
                      <span>{employee.employeeId} Â· {employee.role}</span>
                    </div>
                  </div>
                  {canManage && <button className="mini-btn" onClick={() => openEditEmployee(employee)} aria-label={`Edit ${employee.name}`}><Edit3 size={15} /></button>}
                  <Badge tone={employee.status === "Active" ? "green" : employee.status === "Probation" ? "blue" : employee.status === "On Leave" ? "amber" : "red"}>{employee.status}</Badge>
                </div>
                <div className="employee-card-meta">
                  <span>Client: {employee.client || "-"}</span>
                  <span>{employee.location} Â· {employee.workMode}</span>
                  <span>Manager: {employee.manager || "-"}</span>
                </div>
                <div className="employee-card-actions">
                  {canManage && employee.status !== "Exited" && <button className="secondary-btn" onClick={() => dismissEmployee(employee)}><UserMinus size={16} /> Dismiss</button>}
                  {canManage && <button className="secondary-btn danger-btn" onClick={() => deleteEmployee(employee)}><Trash2 size={16} /> Delete</button>}
                </div>
              </article>
            ))}
          </div>
          ) : (
            <DataTable
              columns={["Employee", "Entity", "Client", "Role", "Location", "Manager", "Status", "Actions"]}
              rows={pagedRows.map((employee) => [
                <Person key={`${employeeKey(employee)}-person`} name={employee.name} detail={`${employee.employeeId} Â· ${employee.dept}`} />,
                employee.legalEntity || "HRGP",
                employee.client || "-",
                employee.role,
                `${employee.location || "-"} Â· ${employee.workMode || "-"}`,
                employee.manager || "-",
                <Badge key={`${employeeKey(employee)}-status`} tone={employee.status === "Active" ? "green" : employee.status === "Probation" ? "blue" : employee.status === "On Leave" ? "amber" : "red"}>{employee.status}</Badge>,
                <div className="row-actions employee-list-actions" key={`${employeeKey(employee)}-actions`}>
                  <button className="mini-btn text-mini" onClick={() => setViewingEmployee(employee)}>View</button>
                  {canManage && <button className="mini-btn text-mini" onClick={() => openEditEmployee(employee)}>Edit</button>}
                  {canManage && employee.status !== "Exited" && <button className="mini-btn text-mini" onClick={() => dismissEmployee(employee)}>Dismiss</button>}
                  {canManage && <button className="mini-btn text-mini danger-mini" onClick={() => deleteEmployee(employee)}>Delete</button>}
                </div>,
              ])}
            />
          )}
          {viewMode !== "allocation" && <div className="pager">
            <span>{syncStatus}</span>
            <div className="pager-actions">
              <button className="secondary-btn" disabled={currentPage === 1} onClick={() => setEmployeePage((page) => Math.max(1, page - 1))}>Previous</button>
              <strong>{currentPage} / {pageCount}</strong>
              <button className="secondary-btn" disabled={currentPage === pageCount} onClick={() => setEmployeePage((page) => Math.min(pageCount, page + 1))}>Next</button>
            </div>
          </div>}
        </Panel>
        {canManage && <DocumentGenerationBox employees={allEmployees} canManage={canManage} onGenerate={() => setDocumentModalOpen(true)} />}
      </div>

      {documentModalOpen && (
        <DocumentGenerationModal
          employees={allEmployees}
          attendanceRecords={attendanceRecords}
          leaveRecords={leaveRecords}
          payrollStatus={payrollStatus}
          onClose={() => setDocumentModalOpen(false)}
        />
      )}

      {viewingEmployee && (
        <EmployeeProfileModal
          employee={viewingEmployee}
          onClose={() => setViewingEmployee(null)}
          onEdit={openEditEmployee}
          canManage={canManage}
        />
      )}

      {editingEmployee && (
        <EmployeeForm
          mode={formMode}
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSave={saveEmployee}
          saveError={saveError}
          saving={savingEmployee}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onClose={() => setImportPreview(null)}
          onApply={applyImport}
        />
      )}
    </div>
  );
}

function formatShortDate(date) {
  if (!date) return "01 Jan 2026";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function monthsSince(date) {
  if (!date) return "New";
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "New";
  const today = new Date();
  const months = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth());
  if (months < 1) return "This month";
  if (months === 1) return "1 month";
  return `${months} months`;
}

function TeamAllocationView({ employees, clients, selectedClient, setSelectedClient, selectedRows, onEdit }) {
  const clientCounts = clients.map((client) => ({
    client,
    count: client === "All Clients" ? employees.length : employees.filter((employee) => (employee.client || "Unassigned") === client).length,
  }));
  const assignedCount = employees.filter((employee) => employee.client).length;
  const unassignedCount = employees.length - assignedCount;
  const clientsCovered = clients.filter((client) => client !== "All Clients" && client !== "Unassigned").length;
  const newThisMonth = employees.filter((employee) => String(employee.clientStartDate || "").slice(0, 7) === currentPayrollMonth()).length;

  return (
    <div className="allocation-view">
      <div className="allocation-summary-grid">
        <div className="allocation-summary-card">
          <span>Active team members</span>
          <strong>{employees.length}</strong>
          <small>{assignedCount} assigned</small>
        </div>
        <div className="allocation-summary-card">
          <span>Clients covered</span>
          <strong>{clientsCovered}</strong>
          <small>active allocation groups</small>
        </div>
        <div className="allocation-summary-card">
          <span>Unassigned</span>
          <strong>{unassignedCount}</strong>
          <small>{unassignedCount ? "needs mapping" : "all mapped"}</small>
        </div>
        <div className="allocation-summary-card">
          <span>New this month</span>
          <strong>{newThisMonth}</strong>
          <small>client start dates</small>
        </div>
      </div>

      <div className="allocation-board">
        <aside className="allocation-client-list" aria-label="Client allocation list">
          <div className="allocation-side-head">
            <strong>Clients</strong>
            <span>{clientsCovered} active</span>
          </div>
          {clientCounts.map(({ client, count }) => (
            <button key={client} className={selectedClient === client ? "active" : ""} onClick={() => setSelectedClient(client)}>
              <span>{client}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </aside>

        <section className="allocation-detail">
          <div className="allocation-detail-head">
            <div>
              <h3>{selectedClient}</h3>
              <p>{selectedRows.length} team member{selectedRows.length === 1 ? "" : "s"} shown</p>
            </div>
            <div className="top-actions">
              <Badge tone={unassignedCount ? "amber" : "green"}>{unassignedCount ? `${unassignedCount} unassigned` : "All mapped"}</Badge>
            </div>
          </div>
          <DataTable
            columns={["Employee", "Role", "Client", "Start Date", "Since", "Status", "Action"]}
            rows={selectedRows.map((employee) => [
              <Person key={`${employee.employeeId}-allocation-person`} name={employee.name} detail={`${employee.employeeId} · ${employee.dept}`} />,
              employee.role,
              employee.client || "Unassigned",
              formatShortDate(employee.clientStartDate || "2026-01-01"),
              monthsSince(employee.clientStartDate || "2026-01-01"),
              <Badge key={`${employee.employeeId}-allocation-status`} tone={employee.status === "Active" ? "green" : employee.status === "Probation" ? "blue" : "amber"}>{employee.status}</Badge>,
              <button key={`${employee.employeeId}-allocation-edit`} className="mini-btn text-mini" onClick={() => onEdit(employee)}>Edit</button>,
            ])}
          />
        </section>
      </div>
    </div>
  );
}

function DocumentGenerationBox({ employees, canManage, onGenerate }) {
  return (
    <Panel title="Generate Documents" meta={`${employees.length} employees`}>
      <div className="document-action-box">
        <FileText size={22} />
        <strong>Standard employee documents</strong>
        <span>Offer letter, relieving letter, and last 3 months salary slips using employee master data and manager/admin inputs.</span>
        <button className="primary-btn" disabled={!canManage} onClick={onGenerate}><FileText size={17} /> Generate document</button>
      </div>
    </Panel>
  );
}

function DocumentGenerationModal({ employees, attendanceRecords, leaveRecords, payrollStatus, onClose }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.employeeId || "");
  const [documentType, setDocumentType] = useState("Offer Letter");
  const [documentNotice, setDocumentNotice] = useState("");
  const [sendingDocument, setSendingDocument] = useState(false);
  const [draft, setDraft] = useState({
    offerDate: new Date().toISOString().slice(0, 10),
    joiningDate: new Date().toISOString().slice(0, 10),
    offeredCtc: "",
    reportingManager: "",
    exitDate: new Date().toISOString().slice(0, 10),
    lastWorkingDate: new Date().toISOString().slice(0, 10),
    signatory: "HR Guru Placement Services",
    exitMonth: currentPayrollMonth(),
  });
  const employee = employees.find((item) => item.employeeId === employeeId) || employees[0];
  const salarySlipMonths = [draft.exitMonth, shiftMonth(draft.exitMonth, -1), shiftMonth(draft.exitMonth, -2)];
  const salarySlipRows = salarySlipMonths.map((month) => payrollForEmployee(employee, month, attendanceRecords, leaveRecords, payrollStatus));

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function documentSubject() {
    if (!employee) return documentType;
    if (documentType === "Offer Letter") return `Offer letter - ${employee.name}`;
    if (documentType === "Relieving Letter") return `Relieving letter - ${employee.name}`;
    return `Salary slips - ${employee.name}`;
  }

  function documentEmailText() {
    if (!employee) return "";
    if (documentType === "Offer Letter") {
      return [
        `Dear ${employee.name},`,
        "",
        `Please find your offer letter details attached for the position of ${employee.role}.`,
        `Joining date: ${draft.joiningDate}`,
        `Reporting manager: ${draft.reportingManager || employee.manager || "Assigned manager"}`,
        "",
        "Regards,",
        draft.signatory,
      ].join("\n");
    }
    if (documentType === "Relieving Letter") {
      return [
        `Dear ${employee.name},`,
        "",
        "Please find your relieving letter details attached.",
        `Last working date: ${draft.lastWorkingDate}`,
        "",
        "Regards,",
        draft.signatory,
      ].join("\n");
    }
    return [
      `Dear ${employee.name},`,
      "",
      `Please find your salary slips for ${salarySlipMonths.join(", ")} attached.`,
      "",
      "Regards,",
      draft.signatory,
    ].join("\n");
  }

function documentEmailHtml() {
    return `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">${documentEmailText().split("\n").map((line) => line.trim() ? `<p>${line}</p>` : "<br>").join("")}</div>`;
  }

  function documentAttachmentHtml() {
    if (!employee) return "";
    if (documentType === "Offer Letter") {
      return offerLetterHtml(employee, draft);
    }
    if (documentType === "Relieving Letter") {
      return relievingLetterHtml(employee, draft);
    }
    return salarySlipRows.map((row) => salarySlipHtml(row, row.month)).join("<hr style=\"page-break-after:always;border:0\">");
  }

  function saveDocumentPdf() {
    const html = documentAttachmentHtml();
    if (!html) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!printWindow) {
      setDocumentNotice("Please allow popups to save the PDF.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  async function sendDocumentEmail() {
    if (!employee) return;
    setSendingDocument(true);
    setDocumentNotice("Preparing document email...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/communication/documents/send`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          employeeCode: employee.employeeId,
          documentType,
          subject: documentSubject(),
          text: documentEmailText(),
          html: documentEmailHtml(),
          documentHtml: documentAttachmentHtml(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Document email could not be sent.");
      setDocumentNotice(data.message || "Document email sent.");
    } catch (error) {
      setDocumentNotice(error.message === "Failed to fetch" ? "Backend server is not running. Document email was not sent." : error.message);
    } finally {
      setSendingDocument(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card document-modal" role="dialog" aria-modal="true" aria-label="Generate employee document">
        <div className="modal-head">
          <div>
            <h2>Generate Employee Document</h2>
            <p>Template values are filled from employee master and the fields below.</p>
          </div>
          <div className="document-head-actions print-hide">
            <button className="secondary-btn" onClick={sendDocumentEmail} disabled={!employee || sendingDocument}><Mail size={17} /> {sendingDocument ? "Sending..." : "Send email"}</button>
            <button className="primary-btn" onClick={saveDocumentPdf}><Download size={17} /> Save PDF</button>
            <button className="icon-btn" onClick={onClose} aria-label="Close document generator"><X size={18} /></button>
          </div>
        </div>
        {documentNotice && <div className="document-notice print-hide">{documentNotice}</div>}

        <div className="form-grid print-hide">
          <SelectField label="Employee" value={employeeId} onChange={setEmployeeId} options={employees.map((item) => item.employeeId)} />
          <SelectField label="Document" value={documentType} onChange={setDocumentType} options={["Offer Letter", "Relieving Letter", "Salary Slips - Last 3 Months"]} />
          {documentType === "Offer Letter" && (
            <>
              <Field label="Offer date" type="date" value={draft.offerDate} onChange={(value) => update("offerDate", value)} />
              <Field label="Joining date" type="date" value={draft.joiningDate} onChange={(value) => update("joiningDate", value)} />
              <Field label="Offered CTC" value={draft.offeredCtc || employee.ctc} onChange={(value) => update("offeredCtc", value)} />
              <Field label="Reporting manager" value={draft.reportingManager || employee.manager} onChange={(value) => update("reportingManager", value)} />
            </>
          )}
          {documentType === "Relieving Letter" && (
            <>
              <Field label="Exit date" type="date" value={draft.exitDate} onChange={(value) => update("exitDate", value)} />
              <Field label="Last working date" type="date" value={draft.lastWorkingDate} onChange={(value) => update("lastWorkingDate", value)} />
            </>
          )}
          {documentType === "Salary Slips - Last 3 Months" && (
            <Field label="Exit month" type="month" value={draft.exitMonth} onChange={(value) => update("exitMonth", value)} />
          )}
          <Field label="Signatory" value={draft.signatory} onChange={(value) => update("signatory", value)} />
        </div>

        <div className="document-preview">
          {documentType === "Offer Letter" && <OfferLetterDocument employee={employee} draft={draft} />}
          {documentType === "Relieving Letter" && <RelievingLetterDocument employee={employee} draft={draft} />}
          {documentType === "Salary Slips - Last 3 Months" && (
            <div className="bulk-payslip-pack">
              {salarySlipRows.map((row) => <SalarySlip key={row.key} payroll={row} month={row.month} />)}
            </div>
          )}
        </div>

        <div className="modal-actions print-hide">
          <span className="form-note">Save PDF opens the browser print dialog. Send email sends this document content to the employee email on record.</span>
          <button className="secondary-btn" onClick={onClose}>Close</button>
          <button className="secondary-btn" onClick={sendDocumentEmail} disabled={!employee || sendingDocument}><Mail size={17} /> {sendingDocument ? "Sending..." : "Send email"}</button>
          <button className="primary-btn" onClick={saveDocumentPdf}><Download size={17} /> Save PDF</button>
        </div>
      </section>
    </div>
  );
}

function htmlEscapeClient(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function documentShellHtml(title, body) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title> </title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
          .document-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 20mm; line-height: 1.55; }
          h2 { text-align: center; margin: 0 0 16px; font-size: 22px; }
          p { margin: 0 0 12px; font-size: 14px; }
          .signature { margin-top: 34px; }
          .signature-line { width: 260px; height: 48px; border-bottom: 1px solid #111; margin: 14px 0 10px; color: #555; font-size: 12px; display: flex; align-items: flex-end; }
        </style>
      </head>
      <body>
        <section class="document-page">
          <h2>${htmlEscapeClient(title)}</h2>
          ${body}
        </section>
      </body>
    </html>
  `;
}

function signatureHtml(signatory) {
  return `
    <div class="signature" style="margin-top:34px">
      <p>Regards,</p>
      <div class="signature-line" style="width:260px;height:48px;border-bottom:1px solid #111;margin:14px 0 10px;color:#6b7280;font-size:12px;display:flex;align-items:flex-end">Authorized Signatory</div>
      <strong>${htmlEscapeClient(signatory || "HR Guru Placement Services")}</strong>
      <p style="margin-top:4px">For HR Guru Placement Services</p>
    </div>
  `;
}

function offerLetterHtml(employee, draft) {
  return documentShellHtml("Offer Letter", `
    <p style="text-align:right">Date: ${htmlEscapeClient(draft.offerDate)}</p>
    <p>Dear ${htmlEscapeClient(employee.name)},</p>
    <p>We are pleased to offer you the position of <strong>${htmlEscapeClient(employee.role)}</strong> with <strong>${htmlEscapeClient(employee.legalEntity || "HRGP")}</strong>. Your joining date will be <strong>${htmlEscapeClient(draft.joiningDate)}</strong>.</p>
    <p>Your offered compensation is <strong>${htmlEscapeClient(draft.offeredCtc || employee.ctc || `INR ${Number(employee.monthlySalary || 0).toLocaleString("en-IN")} per month`)}</strong>. You will report to <strong>${htmlEscapeClient(draft.reportingManager || employee.manager || "the assigned manager")}</strong>.</p>
    <p>This offer is subject to successful completion of background verification and submission of personal details, bank details, KYC documents, and PF declaration.</p>
    ${signatureHtml(draft.signatory)}
  `);
}

function relievingLetterHtml(employee, draft) {
  return documentShellHtml("Relieving Letter", `
    <p style="text-align:right">Date: ${htmlEscapeClient(draft.exitDate)}</p>
    <p>To whom it may concern,</p>
    <p>This is to certify that <strong>${htmlEscapeClient(employee.name)}</strong>, employee code <strong>${htmlEscapeClient(employee.employeeId)}</strong>, worked with <strong>${htmlEscapeClient(employee.legalEntity || "HRGP")}</strong> as <strong>${htmlEscapeClient(employee.role)}</strong>.</p>
    <p>The employee has been relieved from services at the close of business on <strong>${htmlEscapeClient(draft.lastWorkingDate)}</strong>, subject to completion of exit formalities and handover.</p>
    <p>We wish ${htmlEscapeClient(employee.name)} success in future assignments.</p>
    ${signatureHtml(draft.signatory)}
  `);
}

function salarySlipHtml(payroll, month) {
  return documentShellHtml(`Salary Slip - ${month}`, `
    <p><strong>Employee:</strong> ${htmlEscapeClient(payroll.employee.name)} (${htmlEscapeClient(payroll.employee.employeeId)})</p>
    <p><strong>Gross Pay:</strong> INR ${Number(payroll.monthlySalary || 0).toLocaleString("en-IN")}</p>
    <p><strong>Deductions:</strong> INR ${Number(payroll.deductions || 0).toLocaleString("en-IN")}</p>
    <p><strong>Net Payable:</strong> INR ${Number(payroll.netPay || 0).toLocaleString("en-IN")}</p>
  `);
}

function OfferLetterDocument({ employee, draft }) {
  return (
    <article className="letter-page">
      <h2>Offer Letter</h2>
      <p className="letter-date">Date: {draft.offerDate}</p>
      <p>Dear {employee.name},</p>
      <p>We are pleased to offer you the position of <strong>{employee.role}</strong> with <strong>{employee.legalEntity || "HRGP"}</strong>. Your joining date will be <strong>{draft.joiningDate}</strong>.</p>
      <p>Your offered compensation is <strong>{draft.offeredCtc || employee.ctc || `INR ${Number(employee.monthlySalary || 0).toLocaleString("en-IN")} per month`}</strong>. You will report to <strong>{draft.reportingManager || employee.manager || "the assigned manager"}</strong>.</p>
      <p>This offer is subject to successful completion of background verification and submission of personal details, bank details, KYC documents, and PF declaration.</p>
      <DocumentSignature signatory={draft.signatory} />
    </article>
  );
}

function RelievingLetterDocument({ employee, draft }) {
  return (
    <article className="letter-page">
      <h2>Relieving Letter</h2>
      <p className="letter-date">Date: {draft.exitDate}</p>
      <p>To whom it may concern,</p>
      <p>This is to certify that <strong>{employee.name}</strong>, employee code <strong>{employee.employeeId}</strong>, worked with <strong>{employee.legalEntity || "HRGP"}</strong> as <strong>{employee.role}</strong>.</p>
      <p>The employee has been relieved from services at the close of business on <strong>{draft.lastWorkingDate}</strong>, subject to completion of exit formalities and handover.</p>
      <p>We wish {employee.name} success in future assignments.</p>
      <DocumentSignature signatory={draft.signatory} />
    </article>
  );
}

function DocumentSignature({ signatory }) {
  return (
    <div className="document-signature">
      <p>Regards,</p>
      <div className="signature-space">Authorized Signatory</div>
      <strong>{signatory || "HR Guru Placement Services"}</strong>
      <span>For HR Guru Placement Services</span>
    </div>
  );
}

function EmployeeProfileModal({ employee, onClose, onEdit, canManage }) {
  const [showDetails, setShowDetails] = useState(false);
  const canViewSensitivePayroll = canManage;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card employee-profile-modal" role="dialog" aria-modal="true" aria-label="Employee profile">
        <div className="modal-head">
          <div>
            <h2>Employee Profile</h2>
            <p>{employee.employeeId}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close employee profile"><X size={18} /></button>
        </div>

        <div className="profile-card modal-profile-card">
        <div className="profile-head">
          <div className="avatar large">{initials(employee.name)}</div>
          <div>
            <h3>{employee.name}</h3>
            <p>{employee.role}</p>
          </div>
          {canManage && <button className="mini-btn" onClick={() => onEdit(employee)} aria-label={`Edit ${employee.name}`}><Edit3 size={15} /></button>}
        </div>

        <div className="profile-summary">
          <Badge tone={employee.status === "Active" ? "green" : employee.status === "Probation" ? "blue" : employee.status === "On Leave" ? "amber" : "red"}>{employee.status}</Badge>
          <span>{employee.dept}</span>
          <span>{employee.location} Â· {employee.workMode}</span>
        </div>

        <div className="profile-grid">
          <Info label="Email" value={employee.email} wide />
          <Info label="Entity" value={employee.legalEntity || "HRGP"} />
          <Info label="Phone" value={employee.phone} />
          <Info label="Client" value={employee.client} />
          <Info label="Manager" value={employee.manager} />
          <Info label="Join date" value={employee.joinDate} />
          <Info label="Employment" value={employee.employmentType} />
        </div>

        <button className="secondary-btn profile-toggle" onClick={() => setShowDetails((current) => !current)}>
          {showDetails ? "Hide details" : "Show details"}
        </button>

        {showDetails && (
          <div className="profile-grid">
            <Info label="Date of birth" value={employee.dob} />
            <Info label="Gender" value={employee.gender} />
            <Info label="Address" value={employee.address} wide />
            <Info label="Emergency contact" value={employee.emergencyContact} wide />
            {canViewSensitivePayroll && (
              <>
                <Info label="Salary band" value={employee.salaryBand} />
                <Info label="CTC" value={employee.ctc} />
                <Info label="Monthly salary" value={employee.monthlySalary ? `INR ${employee.monthlySalary}` : ""} />
                <Info label="Payroll status" value={employee.payrollStatus} />
                <Info label="PAN" value={employee.pan} />
                <Info label="UAN" value={employee.uan} />
                <Info label="Aadhaar" value={maskLast(employee.aadhaarNumber, 4)} />
                <Info label="Bank name" value={employee.bankName} />
                <Info label="Bank account" value={employee.bankAccount} wide />
                <Info label="IFSC" value={employee.ifsc} />
                <Info label="Bank branch" value={employee.bankBranch} />
                <Info label="Compliance status" value={employee.complianceStatus || complianceStatusFor(employee)} />
              </>
            )}
            <Info label="Documents on file" value={employee.documents} wide />
            <Info label="Pre-joining documents" value={employee.preJoiningDocuments} wide />
            <Info label="KYC documents" value={employee.kycDocuments} wide />
            <Info label="PF declaration" value={employee.pfDeclaration} />
            <Info label="Onboarding status" value={employee.onboardingStatus} />
            <Info label="Current stage" value={employee.lifecycleStage} />
            <Info label="Confirmation date" value={employee.confirmationDate} />
            <Info label="Exit date" value={employee.exitDate} />
            <Info label="Next action" value={employee.status === "Probation" ? "Confirmation review" : employee.status === "Inactive" ? "Exit closure" : "No immediate action"} />
          </div>
        )}
        </div>
      </section>
    </div>
  );
}

function MyProfilePage({ employee, profile, setEmployees }) {
  const [draft, setDraft] = useState(() => employee || emptyEmployee);
  const [editingCompliance, setEditingCompliance] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (employee) setDraft(employee);
  }, [employee]);

  if (!employee) {
    return (
      <Panel title="My Profile" meta={profile.label}>
        <div className="empty-state">Profile record is not linked yet.</div>
      </Panel>
    );
  }

  const complianceStatus = complianceStatusFor(employee);
  const complianceTone = complianceStatus === "Verified" ? "green" : complianceStatus === "Missing" || complianceStatus === "Incomplete" ? "red" : "amber";
  const complianceItems = [
    ["PAN", employee.pan, maskLast(employee.pan, 4)],
    ["UAN", employee.uan, maskLast(employee.uan, 4)],
    ["Aadhaar", employee.aadhaarNumber, maskLast(employee.aadhaarNumber, 4)],
    ["Bank account", employee.bankAccount, maskLast(employee.bankAccount, 4)],
    ["IFSC", employee.ifsc, employee.ifsc],
  ];

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function mergeEmployee(nextEmployee) {
    setEmployees((current) => current.map((item) => employeeKey(item) === employeeKey(nextEmployee) || item.employeeId === nextEmployee.employeeId ? nextEmployee : item));
  }

  async function saveCompliance() {
    const nextEmployee = {
      ...employee,
      pan: draft.pan.toUpperCase(),
      uan: draft.uan,
      aadhaarNumber: draft.aadhaarNumber,
      bankName: draft.bankName,
      bankAccount: draft.bankAccount,
      ifsc: draft.ifsc.toUpperCase(),
      bankBranch: draft.bankBranch,
      complianceStatus: "Pending HR Verification",
    };
    setSaveStatus("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees/me/compliance`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          pan: nextEmployee.pan,
          uan: nextEmployee.uan,
          aadhaarNumber: nextEmployee.aadhaarNumber,
          bankName: nextEmployee.bankName,
          bankAccount: nextEmployee.bankAccount,
          ifsc: nextEmployee.ifsc,
          bankBranch: nextEmployee.bankBranch,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Compliance details could not be saved.");
      mergeEmployee(employeeFromApi(data.employee));
      setSaveStatus("Details submitted for HR verification.");
    } catch (error) {
      mergeEmployee(nextEmployee);
      setSaveStatus(error.message === "Failed to fetch" ? "Backend server is not running. Details saved locally for now." : error.message);
    } finally {
      setEditingCompliance(false);
    }
  }

  return (
    <div className="stack">
      <Panel title="My Profile" meta={employee.employeeId}>
        <div className="profile-card">
          <div className="profile-head">
            <div className="avatar large">{initials(employee.name)}</div>
            <div>
              <h3>{employee.name}</h3>
              <p>{employee.role}</p>
            </div>
          </div>

          <div className="profile-summary">
            <Badge tone={employee.status === "Active" ? "green" : employee.status === "Probation" ? "blue" : employee.status === "On Leave" ? "amber" : "red"}>{employee.status}</Badge>
            <span>{employee.dept}</span>
            <span>{employee.location} Â· {employee.workMode}</span>
          </div>

          <div className="profile-grid">
            <Info label="Email" value={employee.email} />
            <Info label="Phone" value={employee.phone} />
            <Info label="Manager" value={employee.manager} />
            <Info label="Employment type" value={employee.employmentType} />
            <Info label="Join date" value={employee.joinDate} />
            <Info label="Work mode" value={employee.workMode} />
            <Info label="Address" value={employee.address} wide />
            <Info label="Emergency contact" value={employee.emergencyContact} wide />
            <Info label="Documents" value={employee.documents} wide />
          </div>
        </div>
      </Panel>

      <Panel title="Compliance & Payroll Details" meta="Employee self-service">
        <div className="compliance-card">
          <div className="compliance-head">
            <div>
              <h3>Bank, PAN, UAN & Aadhaar</h3>
              <p>These details are used for payroll and statutory compliance after HR verification.</p>
            </div>
            <Badge tone={complianceTone}>{complianceStatus}</Badge>
          </div>

          {saveStatus && <div className={saveStatus.includes("could not") ? "form-error" : "payroll-notice"}>{saveStatus}</div>}

          {!editingCompliance ? (
            <>
              <div className="compliance-grid">
                {complianceItems.map(([label, rawValue, displayValue]) => (
                  <div className="compliance-item" key={label}>
                    <span>{label}</span>
                    <strong>{rawValue ? displayValue : "Missing"}</strong>
                    <Badge tone={rawValue ? "green" : "red"}>{rawValue ? "Added" : "Required"}</Badge>
                  </div>
                ))}
                <div className="compliance-item">
                  <span>Bank name</span>
                  <strong>{employee.bankName || "Missing"}</strong>
                  <Badge tone={employee.bankName ? "green" : "red"}>{employee.bankName ? "Added" : "Required"}</Badge>
                </div>
                <div className="compliance-item">
                  <span>Branch</span>
                  <strong>{employee.bankBranch || "-"}</strong>
                  <Badge tone={employee.bankBranch ? "blue" : "amber"}>{employee.bankBranch ? "Added" : "Optional"}</Badge>
                </div>
              </div>
              <div className="compliance-actions">
                <span>Submitted changes move to Pending HR Verification.</span>
                <button className="primary-btn" onClick={() => setEditingCompliance(true)}><Edit3 size={17} /> Update details</button>
              </div>
            </>
          ) : (
            <>
              <div className="form-grid compliance-form">
                <Field label="PAN" value={draft.pan} onChange={(value) => updateDraft("pan", value.toUpperCase())} />
                <Field label="UAN" value={draft.uan} onChange={(value) => updateDraft("uan", value.replace(/\D/g, "").slice(0, 12))} />
                <Field label="Aadhaar" value={draft.aadhaarNumber} onChange={(value) => updateDraft("aadhaarNumber", value.replace(/\D/g, "").slice(0, 12))} />
                <Field label="Bank name" value={draft.bankName} onChange={(value) => updateDraft("bankName", value)} />
                <Field label="Bank account" value={draft.bankAccount} onChange={(value) => updateDraft("bankAccount", value.replace(/\s/g, ""))} />
                <Field label="IFSC" value={draft.ifsc} onChange={(value) => updateDraft("ifsc", value.toUpperCase())} />
                <Field label="Bank branch" value={draft.bankBranch} onChange={(value) => updateDraft("bankBranch", value)} />
              </div>
              <div className="compliance-actions">
                <span>Values are masked after saving and must be verified by HR.</span>
                <button className="secondary-btn" onClick={() => { setDraft(employee); setEditingCompliance(false); }}>Cancel</button>
                <button className="primary-btn" onClick={saveCompliance}><CheckCircle2 size={17} /> Submit for verification</button>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ImportPreviewModal({ preview, onClose, onApply }) {
  const validCount = preview.rows.filter((row) => row.action !== "Skip").length;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-label="Import preview">
        <div className="modal-head">
          <div>
            <h2>Import Preview</h2>
            <p>Review CSV rows before adding or updating employee records.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close import preview"><X size={18} /></button>
        </div>

        <div className="import-summary">
          <Metric label="Add" value={preview.summary.added} note="New records" />
          <Metric label="Update" value={preview.summary.updated} note="Existing IDs" />
          <Metric label="Skip" value={preview.summary.skipped} note="Invalid rows" />
        </div>

        <div className="import-table">
          <DataTable columns={["Row", "Employee", "Email", "Job Title", "Action", "Validation"]} rows={preview.rows.map((row) => [
            row.rowNumber,
            <Person key={`${row.rowNumber}-person`} name={row.employee.name || "Unnamed"} detail={row.employee.employeeId || "No employee ID"} />,
            row.employee.email || "-",
            row.employee.role || "-",
            <Badge key={`${row.rowNumber}-action`} tone={row.action === "Skip" ? "red" : row.action === "Update" ? "blue" : "green"}>{row.action}</Badge>,
            row.errors.length ? row.errors.join(", ") : "Ready",
          ])} />
        </div>

        <div className="modal-actions">
          <span className="form-note">{validCount} valid row{validCount === 1 ? "" : "s"} will be imported.</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!validCount} onClick={onApply}><CheckCircle2 size={17} /> Import valid rows</button>
        </div>
      </section>
    </div>
  );
}

function ClientManagement({ clients, setClients, syncStatus }) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id || "");
  const [viewMode, setViewMode] = useState("cards");
  const [activeClientSection, setActiveClientSection] = useState("clients");
  const [editingClient, setEditingClient] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [invoiceImport, setInvoiceImport] = useState({ loading: false, saving: false, rows: [], clients: [], error: "", notice: "" });
  const [clientNotice, setClientNotice] = useState("");
  const activeInvoiceClients = useMemo(() => clients.filter((client) => client.status === "Active"), [clients]);
  const clientSelectorOptions = activeClientSection === "invoices" ? activeInvoiceClients : clients;
  const selectedClient = clients.find((client) => client.id === selectedClientId) || clients[0];
  const selectedInvoiceClient = activeInvoiceClients.find((client) => client.id === selectedClientId) || activeInvoiceClients[0];
  const selectedClientForSection = activeClientSection === "invoices" ? selectedInvoiceClient : selectedClient;
  const invoices = selectedClientForSection?.invoices || [];
  const allInvoices = clients.flatMap((client) => (client.invoices || []).map((invoice) => ({ ...invoice, clientId: client.id, clientName: client.name })));
  const invoiceMisRows = allInvoices.map((invoice) => {
    const client = clients.find((item) => item.id === invoice.clientId) || {};
    const amount = Number(invoice.amount || 0);
    const tds = Number(invoice.details?.tds || 0);
    return {
      clientName: invoice.clientName,
      gstin: client.gstin || "",
      invoiceNumber: invoice.invoiceNumber || invoice.id,
      invoiceMonth: invoice.month,
      invoiceDate: invoice.details?.invoiceDate || "",
      amount,
      billValue: Number(invoice.details?.billValue || invoice.details?.billValue === 0 ? invoice.details.billValue : invoice.details?.source === "hrms_native" ? invoice.details.billValue : 0),
      cgst: Number(invoice.details?.cgst || 0),
      sgst: Number(invoice.details?.sgst || 0),
      igst: Number(invoice.details?.igst || 0),
      tdsPercent: Number(invoice.details?.tdsPercent || 2),
      tds,
      netPayout: amount - tds,
      status: invoice.status,
      source: invoice.details?.source === "historical_pdf_import" ? "Historical PDF" : invoice.details?.source === "hrms_native" ? "HRMS Native" : "Manual",
      reference: invoice.details?.candidateName || invoice.details?.sourceFileName || invoice.externalRef || "",
    };
  }).sort((a, b) => String(a.invoiceNumber).localeCompare(String(b.invoiceNumber), undefined, { numeric: true, sensitivity: "base" }));
  const openInvoiceCount = allInvoices.filter((invoice) => invoice.status !== "Paid" && invoice.status !== "Cancelled").length;
  const pendingInvoiceValue = allInvoices
    .filter((invoice) => invoice.status !== "Paid" && invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

  useEffect(() => {
    const availableClients = activeClientSection === "invoices" ? activeInvoiceClients : clients;
    if (!availableClients.length) {
      setSelectedClientId("");
      return;
    }
    if (!availableClients.some((client) => client.id === selectedClientId)) setSelectedClientId(availableClients[0].id);
  }, [activeClientSection, activeInvoiceClients, clients, selectedClientId]);

  function upsertClient(client) {
    setClients((current) => current.some((item) => item.id === client.id) ? current.map((item) => item.id === client.id ? client : item) : [client, ...current]);
    setSelectedClientId(client.id);
  }

  async function refreshClients(selectedId = selectedClientId) {
    const response = await fetch(`${API_BASE_URL}/api/clients`, {
      headers: authHeaders(),
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "Unable to refresh client list.");
    if (Array.isArray(data.clients)) setClients(data.clients);
    if (selectedId && data.clients?.some((client) => client.id === selectedId)) setSelectedClientId(selectedId);
    return data.clients || [];
  }

  async function saveClient(draft) {
    if (!draft.name.trim()) return;
    const payload = {
      clientCode: draft.clientCode,
      name: draft.name,
      status: String(draft.status || "Active").toLowerCase(),
      industry: draft.industry,
      workingSince: draft.workingSince,
      owner: draft.owner,
      billingAddress: draft.billingAddress,
      gstin: draft.gstin,
      pan: draft.pan,
      state: draft.state,
      stateCode: draft.stateCode,
      buyerPo: draft.buyerPo,
      hsnSac: draft.hsnSac,
      spoc: draft.spoc,
      pitchdeck: draft.bdTools?.pitchdeck,
      customizedPitch: draft.bdTools?.customizedPitch,
      proposals: draft.bdTools?.proposals,
    };
    setClientNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients${draft.id ? `/${draft.id}` : ""}`, {
        method: draft.id ? "PATCH" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Client could not be saved.");
      upsertClient(data.client);
      await refreshClients(data.client.id);
      setEditingClient(null);
      setClientNotice("Client saved.");
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? "Backend is not reachable. Client was not saved." : error.message);
    }
  }

  async function handleAgreementUpload(client, event) {
    const files = Array.from(event.target.files || []).map((file) => file.name);
    event.target.value = "";
    if (!files.length) return;
    setClientNotice("");
    const nextAgreementNames = [...(client.agreements || []).map((agreement) => typeof agreement === "string" ? agreement : agreement.fileName), ...files];
    setClients((current) => current.map((item) => item.id === client.id ? { ...item, agreements: nextAgreementNames.map((fileName) => ({ fileName })) } : item));
    try {
      await Promise.all(files.map((fileName) => fetch(`${API_BASE_URL}/api/clients/${client.id}/agreements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileName }),
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Agreement could not be saved.");
        return data;
      })));
      const refreshed = await fetch(`${API_BASE_URL}/api/clients`, { credentials: "include" }).then((response) => response.json());
      if (Array.isArray(refreshed.clients)) setClients(refreshed.clients);
      setClientNotice("Agreement attached.");
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? "Backend is not running. Agreement name saved locally." : error.message);
    }
  }

  async function raiseInvoice(client) {
    if (!client) return;
    setClientNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${client.id}/raise-invoice`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Invoice handoff could not be prepared.");
      setClientNotice(data.message || `Invoice handoff prepared for ${client.name}.`);
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? `Invoice app/API handoff is ready for ${client.name}; backend is not running.` : error.message);
    }
  }

  function openNativeInvoice(client) {
    if (!client) return;
    const invoiceType = client.name?.toLowerCase().includes("taggd") ? "taggd" : "non_taggd";
    setSelectedClientId(client.id);
    setActiveClientSection("invoices");
    setInvoiceDraft({
      invoiceType,
      candidateName: "",
      role: "",
      ctc: "",
      joiningDate: new Date().toISOString().slice(0, 10),
      invoiceDate: new Date().toISOString().slice(0, 10),
      feeRate: "0.0833",
      reference: "",
      serviceItems: invoiceType === "taggd" ? taggdDefaultServiceItems : [],
    });
  }

  async function createNativeInvoice() {
    if (!selectedInvoiceClient || !invoiceDraft) return;
    setClientNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${selectedInvoiceClient.id}/native-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(invoiceDraft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Native invoice could not be created.");
      if (data.client) upsertClient(data.client);
      setInvoiceDraft(null);
      setClientNotice(data.message || "Native HRMS invoice created.");
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? "Backend is not running. Native invoice was not created." : error.message);
    }
  }

  function updateImportRow(rowId, field, value) {
    setInvoiceImport((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = { ...row, [field]: value };
        if (field === "tdsPercent" || field === "billValue") {
          const percent = Math.min(10, Math.max(1, Number(field === "tdsPercent" ? value : next.tdsPercent || 2)));
          const billValue = Number(field === "billValue" ? value : next.billValue || next.amount || 0);
          next.tdsPercent = percent;
          next.tds = Number.isFinite(billValue * percent / 100) ? Math.round(billValue * percent) / 100 : 0;
        }
        return next;
      }),
    }));
  }

  async function previewHistoricalInvoices(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setInvoiceImport({ loading: true, saving: false, rows: [], clients: [], error: "", notice: "" });
    try {
      const payloadFiles = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ fileName: file.name, dataUrl: reader.result });
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      })));
      const response = await fetch(`${API_BASE_URL}/api/clients/invoices/import-preview`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ files: payloadFiles }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Historical invoices could not be parsed.");
      setInvoiceImport({ loading: false, saving: false, rows: data.rows || [], clients: data.clients || [], error: "", notice: data.message || "Preview ready." });
    } catch (error) {
      setInvoiceImport({ loading: false, saving: false, rows: [], clients: [], error: error.message === "Failed to fetch" ? "Backend is not reachable." : error.message, notice: "" });
    }
  }

  async function saveHistoricalInvoices() {
    setInvoiceImport((current) => ({ ...current, saving: true, error: "", notice: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/invoices/import-save`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ rows: invoiceImport.rows }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Historical invoices could not be saved.");
      if (Array.isArray(data.clients)) setClients(data.clients);
      setInvoiceImport((current) => ({ ...current, saving: false, rows: [], clients: [], error: "", notice: data.message || "Historical invoices saved." }));
    } catch (error) {
      setInvoiceImport((current) => ({ ...current, saving: false, error: error.message === "Failed to fetch" ? "Backend is not reachable." : error.message }));
    }
  }

  async function saveInvoiceEdit(draft) {
    setClientNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${draft.clientId}/invoices/${draft.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          invoiceNumber: draft.invoiceNumber,
          invoiceMonth: draft.month,
          amount: draft.amount,
          dueDate: draft.dueDate,
          status: String(draft.status || "Raised").toLowerCase(),
          details: {
            ...(draft.details || {}),
            invoiceDate: draft.invoiceDate || draft.details?.invoiceDate || "",
            modeOfPayment: draft.modeOfPayment || draft.details?.modeOfPayment || "",
            billValue: draft.billValue,
            cgst: draft.cgst,
            sgst: draft.sgst,
            igst: draft.igst,
            tdsPercent: draft.tdsPercent,
            tds: draft.tds,
            gross: draft.amount,
            gstType: draft.gstType || draft.details?.gstType || "",
            candidateName: draft.candidateName || draft.details?.candidateName || "",
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Invoice could not be updated.");
      if (data.client) upsertClient(data.client);
      setEditingInvoice(null);
      setClientNotice(data.message || "Invoice updated.");
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? "Backend is not reachable." : error.message);
    }
  }

  async function attachInvoicePdf(invoice, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const clientId = invoice.clientId || selectedClient?.id;
    if (!clientId) return;
    setClientNotice("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/invoices/${invoice.id}/original-pdf`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ fileName: file.name, dataUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Invoice PDF could not be attached.");
      if (data.client) upsertClient(data.client);
      setClientNotice(data.message || "Invoice PDF attached.");
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? "Backend is not reachable." : error.message);
    }
  }

  async function deleteInvoice(invoice) {
    const clientId = invoice.clientId || selectedClient?.id;
    if (!clientId) return;
    const invoiceNumber = invoice.invoiceNumber || invoice.id;
    if (!window.confirm(`Delete invoice ${invoiceNumber}? This will remove it from HRMS.`)) return;
    setClientNotice("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/invoices/${invoice.id}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Invoice could not be deleted.");
      if (data.client) upsertClient(data.client);
      setClientNotice(data.message || "Invoice deleted.");
    } catch (error) {
      setClientNotice(error.message === "Failed to fetch" ? "Backend is not reachable." : error.message);
    }
  }

  function exportInvoiceMis() {
    const headers = ["Client", "GSTIN", "Invoice Number", "Invoice Month", "Invoice Date", "Bill Value", "CGST", "SGST", "IGST", "TDS %", "TDS", "Gross Amount", "Net Payout", "Status", "Source", "Reference"];
    const rows = invoiceMisRows.map((row) => [
      row.clientName,
      row.gstin,
      row.invoiceNumber,
      row.invoiceMonth,
      row.invoiceDate,
      row.billValue,
      row.cgst,
      row.sgst,
      row.igst,
      row.tdsPercent,
      row.tds,
      row.amount,
      row.netPayout,
      row.status,
      row.source,
      row.reference,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `HRMS_Invoice_MIS_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="toolbar report-toolbar">
        <div className="segmented-control" aria-label="Client management sections">
          <button className={activeClientSection === "clients" ? "active" : ""} onClick={() => setActiveClientSection("clients")}>Clients</button>
          <button className={activeClientSection === "invoices" ? "active" : ""} onClick={() => setActiveClientSection("invoices")}>Invoices</button>
          <button className={activeClientSection === "agreements" ? "active" : ""} onClick={() => setActiveClientSection("agreements")}>Agreements</button>
        </div>
        <select value={selectedClientForSection?.id || ""} onChange={(event) => setSelectedClientId(event.target.value)} aria-label="Selected client">
          {clientSelectorOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </div>

      {clientNotice && <div className="payroll-notice">{clientNotice}</div>}

      {activeClientSection === "clients" && (
        <Panel title="Client Directory" meta={`${clients.length} client${clients.length === 1 ? "" : "s"} · ${syncStatus}`}>
          <div className="toolbar payroll-toolbar">
            <div className="segmented-control" aria-label="Client view">
              <button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>Cards</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button>
            </div>
            <button className="secondary-btn" onClick={() => setEditingClient({
              name: "",
              status: "Active",
              industry: "",
              workingSince: new Date().toISOString().slice(0, 10),
              owner: "",
              billingAddress: "",
              gstin: "",
              pan: "",
              state: "",
              stateCode: "",
              buyerPo: "",
              hsnSac: "998519",
              spoc: "",
              bdTools: { pitchdeck: "", customizedPitch: "", proposals: "" },
              invoices: [],
              agreements: [],
            })}><UserCheck size={17} /> Add client</button>
            {selectedClient && <button className="secondary-btn" onClick={() => setEditingClient(selectedClient)}><Edit3 size={17} /> Edit client</button>}
            <button className="primary-btn" onClick={() => openNativeInvoice(selectedClient)} disabled={!selectedClient}><FileText size={17} /> Create invoice</button>
          </div>

          {viewMode === "cards" ? (
            <div className="client-card-grid">
              {clients.map((client) => (
                <article className={`client-card ${selectedClient?.id === client.id ? "active" : ""}`} key={client.id}>
                  <div className="client-card-head">
                    <button className="name-link" onClick={() => setSelectedClientId(client.id)}>{client.name}</button>
                    <Badge tone={client.status === "Active" ? "green" : client.status === "Paused" ? "amber" : "red"}>{client.status}</Badge>
                  </div>
                  <div className="employee-card-meta">
                    <span>{client.industry}</span>
                    <span>Working since: {client.workingSince || "-"}</span>
                    <span>Owner: {client.owner || "-"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <DataTable
              columns={["Client", "Status", "Industry / Domain", "Working Since", "Owner"]}
              rows={clients.map((client) => [
                <button className="link-button" onClick={() => setSelectedClientId(client.id)}>{client.name}</button>,
                <Badge tone={client.status === "Active" ? "green" : client.status === "Paused" ? "amber" : "red"}>{client.status}</Badge>,
                client.industry,
                client.workingSince,
                client.owner,
              ])}
            />
          )}
        </Panel>
      )}

      {activeClientSection === "invoices" && !selectedInvoiceClient && (
        <Panel title="Invoices" meta="No active clients">
          <div className="empty-state">Mark at least one client as Active before creating or importing invoices.</div>
        </Panel>
      )}

      {activeClientSection === "invoices" && selectedInvoiceClient && (
        <div className="stack">
          <div className="metrics compact-dashboard">
            <Metric label="Invoices" value={allInvoices.length} note="Tracked in HRMS" />
            <Metric label="Open invoices" value={openInvoiceCount} note="Draft / raised" />
            <Metric label="Pending value" value={`INR ${pendingInvoiceValue.toLocaleString("en-IN")}`} note="Excludes paid/cancelled" />
          </div>
          <Panel title="Invoices" meta={`${selectedInvoiceClient.name} · Active clients only for new invoices`}>
            <div className="toolbar">
              <button className="primary-btn" onClick={() => openNativeInvoice(selectedInvoiceClient)}><FileText size={17} /> Create native invoice</button>
              <label className="secondary-btn file-btn">
                <Upload size={16} /> Upload historical PDFs
                <input type="file" accept="application/pdf" multiple onChange={previewHistoricalInvoices} />
              </label>
              <button className="secondary-btn" onClick={() => raiseInvoice(selectedInvoiceClient)}><Link size={17} /> Legacy handoff</button>
              <span className="form-note">Choose Taggd service billing or Non-Taggd placement billing. HRMS calculates GST, TDS, due date, and invoice numbering.</span>
            </div>
            {invoiceImport.notice && <div className="payroll-notice">{invoiceImport.notice}</div>}
            {invoiceImport.error && <div className="form-error">{invoiceImport.error}</div>}
            {invoiceImport.loading && <div className="empty-state">Parsing uploaded invoice PDFs...</div>}
            {invoiceImport.rows.length > 0 && (
              <div className="invoice-import-preview">
                <div className="toolbar">
                  <strong>Preview imported invoice mappings</strong>
                  <span className="form-note">Review client, invoice number, month, date, amount, and status before saving.</span>
                  <button className="primary-btn" disabled={invoiceImport.saving || !invoiceImport.rows.some((row) => row.selected)} onClick={saveHistoricalInvoices}>
                    <CheckCircle2 size={16} /> {invoiceImport.saving ? "Saving..." : "Save selected"}
                  </button>
                </div>
                <DataTable
                  columns={["Save", "PDF", "Client", "Invoice", "Month", "Date", "Payment", "Bill Value", "CGST", "SGST", "IGST", "TDS %", "TDS", "Gross", "Status", "Warnings"]}
                  rows={invoiceImport.rows.map((row) => [
                    <input type="checkbox" checked={Boolean(row.selected)} onChange={(event) => updateImportRow(row.rowId, "selected", event.target.checked)} />,
                    row.sourceFileName,
                    <select value={row.clientId || ""} onChange={(event) => updateImportRow(row.rowId, "clientId", event.target.value)}>
                      <option value="">Select client</option>
                      {(invoiceImport.clients.length ? invoiceImport.clients : activeInvoiceClients).filter((client) => client.status === "Active" || !client.status).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>,
                    <input value={row.invoiceNumber || ""} onInput={(event) => updateImportRow(row.rowId, "invoiceNumber", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "invoiceNumber", event.target.value)} />,
                    <input value={row.invoiceMonth || ""} onInput={(event) => updateImportRow(row.rowId, "invoiceMonth", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "invoiceMonth", event.target.value)} />,
                    <input type="date" value={row.invoiceDate || ""} onInput={(event) => updateImportRow(row.rowId, "invoiceDate", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "invoiceDate", event.target.value)} />,
                    <input value={row.modeOfPayment || ""} onInput={(event) => updateImportRow(row.rowId, "modeOfPayment", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "modeOfPayment", event.target.value)} />,
                    <input type="number" value={row.billValue || ""} onInput={(event) => updateImportRow(row.rowId, "billValue", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "billValue", event.target.value)} />,
                    <input type="number" value={row.cgst || ""} onInput={(event) => updateImportRow(row.rowId, "cgst", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "cgst", event.target.value)} />,
                    <input type="number" value={row.sgst || ""} onInput={(event) => updateImportRow(row.rowId, "sgst", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "sgst", event.target.value)} />,
                    <input type="number" value={row.igst || ""} onInput={(event) => updateImportRow(row.rowId, "igst", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "igst", event.target.value)} />,
                    <input type="number" min="1" max="10" value={row.tdsPercent || 2} onInput={(event) => updateImportRow(row.rowId, "tdsPercent", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "tdsPercent", event.target.value)} />,
                    <input type="number" value={row.tds || ""} onInput={(event) => updateImportRow(row.rowId, "tds", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "tds", event.target.value)} />,
                    <input type="number" value={row.amount || ""} onInput={(event) => updateImportRow(row.rowId, "amount", event.target.value)} onChange={(event) => updateImportRow(row.rowId, "amount", event.target.value)} />,
                    <select value={row.status || "raised"} onChange={(event) => updateImportRow(row.rowId, "status", event.target.value)}>
                      <option value="draft">Draft</option>
                      <option value="raised">Raised</option>
                      <option value="paid">Paid</option>
                      <option value="cancelled">Cancelled</option>
                    </select>,
                    row.warnings?.length ? row.warnings.join(", ") : "Ready",
                  ])}
                />
              </div>
            )}
            <DataTable
              columns={["Client", "GSTIN", "Invoice", "Type", "Month", "Amount", "TDS", "Due Date", "Status", "Details", "PDF", "Action"]}
              rows={(selectedClientId === "all" ? allInvoices : invoices.map((invoice) => ({ ...invoice, clientName: selectedInvoiceClient.name }))).map((invoice) => [
                invoice.clientName,
                (clients.find((client) => client.id === (invoice.clientId || selectedInvoiceClient.id)) || selectedInvoiceClient)?.gstin || "-",
                invoice.invoiceNumber || invoice.id,
                invoice.details?.source === "historical_pdf_import" ? "Historical" : invoice.details?.invoiceType === "taggd" ? "Taggd" : invoice.details?.source === "hrms_native" ? "Non-Taggd" : "-",
                invoice.month,
                `INR ${Number(invoice.amount || 0).toLocaleString("en-IN")}`,
                `INR ${Number(invoice.details?.tds || 0).toLocaleString("en-IN")}`,
                invoice.dueDate || "-",
                <Badge tone={invoice.status === "Paid" ? "green" : invoice.status === "Raised" ? "blue" : invoice.status === "Cancelled" ? "red" : "amber"}>{invoice.status}</Badge>,
                invoice.details?.source === "hrms_native" ? `${invoice.details.candidateName} · ${invoice.details.gstType}` : invoice.details?.source === "historical_pdf_import" ? `${invoice.details.sourceFileName || "Imported PDF"} · ${invoice.details.gstType || "mapped"}` : invoice.externalRef || "-",
                invoice.details?.source === "hrms_native" ? (
                  <a className="link-button" href={`${API_BASE_URL}/api/clients/${invoice.clientId || selectedInvoiceClient.id}/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">Generated PDF</a>
                ) : invoice.details?.pdfPath ? (
                  <a className="link-button" href={`${API_BASE_URL}/api/clients/${invoice.clientId || selectedInvoiceClient.id}/invoices/${invoice.id}/original-pdf`} target="_blank" rel="noreferrer">Original PDF</a>
                ) : (
                  <label className="link-button file-link">
                    Attach PDF
                    <input type="file" accept="application/pdf" onChange={(event) => attachInvoicePdf(invoice, event)} />
                  </label>
                ),
                <div className="row-actions">
                  <button className="link-button" onClick={() => setEditingInvoice({ ...invoice, clientId: invoice.clientId || selectedInvoiceClient.id })}>Edit</button>
                  <button className="link-button danger-link" onClick={() => deleteInvoice(invoice)}>Delete</button>
                </div>,
              ])}
            />
          </Panel>
          <Panel title="MIS Report" meta={`${invoiceMisRows.length} invoice rows`}>
            <div className="toolbar">
              <button className="secondary-btn" onClick={exportInvoiceMis}><Download size={16} /> Export CSV</button>
              <span className="form-note">Invoice register with GSTIN, GST split, TDS, source, and status.</span>
            </div>
            <DataTable
              columns={["Client", "GSTIN", "Invoice", "Month", "Bill Value", "CGST", "SGST", "IGST", "TDS %", "TDS", "Gross", "Net Payout", "Status", "Source"]}
              rows={invoiceMisRows.map((row) => [
                row.clientName,
                row.gstin || "-",
                row.invoiceNumber,
                row.invoiceMonth,
                `INR ${row.billValue.toLocaleString("en-IN")}`,
                `INR ${row.cgst.toLocaleString("en-IN")}`,
                `INR ${row.sgst.toLocaleString("en-IN")}`,
                `INR ${row.igst.toLocaleString("en-IN")}`,
                `${row.tdsPercent}%`,
                `INR ${row.tds.toLocaleString("en-IN")}`,
                `INR ${row.amount.toLocaleString("en-IN")}`,
                `INR ${row.netPayout.toLocaleString("en-IN")}`,
                row.status,
                row.source,
              ])}
            />
          </Panel>
        </div>
      )}

      {activeClientSection === "agreements" && selectedClient && (
        <div className="two-col">
          <Panel title="BD Tools & Agreements" meta="Client master">
            <div className="client-detail-stack">
              <Info label="Pitchdeck" value={selectedClient.bdTools?.pitchdeck} />
              <Info label="Customized pitch" value={selectedClient.bdTools?.customizedPitch} />
              <Info label="Proposals" value={selectedClient.bdTools?.proposals} />
              <div className="agreement-box">
                <strong>Signed agreements</strong>
                {(selectedClient.agreements || []).map((agreement) => {
                  const fileName = typeof agreement === "string" ? agreement : agreement.fileName;
                  return <span key={fileName}><Paperclip size={14} /> {fileName}</span>;
                })}
                <label className="secondary-btn file-btn">
                  <Upload size={16} /> Attach agreement
                  <input type="file" multiple onChange={(event) => handleAgreementUpload(selectedClient, event)} />
                </label>
              </div>
            </div>
          </Panel>
        </div>
      )}
      {editingClient && <ClientForm client={editingClient} onSave={saveClient} onClose={() => setEditingClient(null)} />}
      {invoiceDraft && <NativeInvoiceModal draft={invoiceDraft} client={selectedInvoiceClient} onUpdate={(field, value) => setInvoiceDraft((current) => ({ ...current, [field]: value }))} onClose={() => setInvoiceDraft(null)} onSave={createNativeInvoice} />}
      {editingInvoice && <InvoiceEditModal invoice={editingInvoice} onClose={() => setEditingInvoice(null)} onSave={saveInvoiceEdit} />}
    </div>
  );
}

function InvoiceEditModal({ invoice, onClose, onSave }) {
  const [draft, setDraft] = useState({
    ...invoice,
    invoiceDate: invoice.details?.invoiceDate || "",
    modeOfPayment: invoice.details?.modeOfPayment || "",
    billValue: invoice.details?.billValue || "",
    cgst: invoice.details?.cgst || "",
    sgst: invoice.details?.sgst || "",
    igst: invoice.details?.igst || "",
    tdsPercent: invoice.details?.tdsPercent || 2,
    tds: invoice.details?.tds || "",
    gstType: invoice.details?.gstType || "",
    candidateName: invoice.details?.candidateName || "",
  });
  function update(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "tdsPercent" || field === "billValue") {
        const percent = Math.min(10, Math.max(1, Number(field === "tdsPercent" ? value : next.tdsPercent || 2)));
        const billValue = Number(field === "billValue" ? value : next.billValue || next.amount || 0);
        next.tdsPercent = percent;
        next.tds = Number.isFinite(billValue * percent / 100) ? Math.round(billValue * percent) / 100 : 0;
      }
      return next;
    });
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Edit invoice">
        <div className="modal-head">
          <div>
            <h2>Edit Invoice</h2>
            <p>{invoice.clientName} · {invoice.invoiceNumber}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close invoice editor"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <Field label="Invoice number" value={draft.invoiceNumber || ""} onChange={(value) => update("invoiceNumber", value)} required />
          <Field label="Invoice month" value={draft.month || ""} onChange={(value) => update("month", value)} required />
          <Field label="Invoice date" type="date" value={draft.invoiceDate || ""} onChange={(value) => update("invoiceDate", value)} />
          <Field label="Due date" type="date" value={draft.dueDate || ""} onChange={(value) => update("dueDate", value)} />
          <Field label="Payment mode" value={draft.modeOfPayment || ""} onChange={(value) => update("modeOfPayment", value)} />
          <Field label="Bill value" type="number" value={draft.billValue || ""} onChange={(value) => update("billValue", value)} />
          <Field label="CGST" type="number" value={draft.cgst || ""} onChange={(value) => update("cgst", value)} />
          <Field label="SGST" type="number" value={draft.sgst || ""} onChange={(value) => update("sgst", value)} />
          <Field label="IGST" type="number" value={draft.igst || ""} onChange={(value) => update("igst", value)} />
          <Field label="TDS %" type="number" value={draft.tdsPercent || 2} onChange={(value) => update("tdsPercent", value)} />
          <Field label="TDS" type="number" value={draft.tds || ""} onChange={(value) => update("tds", value)} />
          <Field label="Gross / invoice amount" type="number" value={draft.amount || ""} onChange={(value) => update("amount", value)} required />
          <Field label="GST type" value={draft.gstType || ""} onChange={(value) => update("gstType", value)} />
          <Field label="Candidate / reference" value={draft.candidateName || ""} onChange={(value) => update("candidateName", value)} />
          <SelectField label="Status" value={draft.status || "Raised"} onChange={(value) => update("status", value)} options={["Draft", "Raised", "Paid", "Cancelled"]} />
        </div>
        <div className="modal-actions">
          <span className="form-note">Use this for correcting imported historical invoice fields.</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={() => onSave(draft)}>Save invoice</button>
        </div>
      </section>
    </div>
  );
}

function NativeInvoiceModal({ draft, client, onUpdate, onClose, onSave }) {
  const invoiceType = draft.invoiceType === "taggd" ? "taggd" : "non_taggd";
  const serviceItems = draft.serviceItems || [];
  const calculatedServiceItem = (item) => {
    const count = Number(item.count || 0);
    const rate = Number(item.rate || 0);
    const amount = count * rate;
    return {
      ...item,
      amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0,
    };
  };
  const serviceTotal = serviceItems.reduce((sum, item) => {
    const amount = calculatedServiceItem(item).amount;
    return sum + amount;
  }, 0);
  const ctc = invoiceType === "taggd" ? serviceTotal : Number(draft.ctc || 0);
  const feeRate = Number(draft.feeRate || 0);
  const billValue = invoiceType === "taggd" ? serviceTotal : Number.isFinite(ctc * feeRate) ? ctc * feeRate : 0;
  const gst = billValue * 0.18;
  const gross = billValue + gst;
  const tds = invoiceType === "taggd" ? 0 : billValue * 0.10;
  const canSave = invoiceType === "taggd"
    ? serviceItems.some((item) => {
      const rowAmount = calculatedServiceItem(item).amount;
      return item.description?.trim() && rowAmount > 0;
    })
    : draft.candidateName.trim() && draft.role.trim() && ctc > 0 && draft.joiningDate;
  function setInvoiceType(nextType) {
    onUpdate("invoiceType", nextType);
    if (nextType === "taggd" && !serviceItems.length) onUpdate("serviceItems", taggdDefaultServiceItems);
  }
  function updateServiceItem(index, field, value) {
    onUpdate("serviceItems", serviceItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return calculatedServiceItem({ ...item, [field]: value });
    }));
  }
  function addServiceItem() {
    onUpdate("serviceItems", [...serviceItems, { description: "", count: 1, rate: 0, amount: 0 }]);
  }
  function removeServiceItem(index) {
    onUpdate("serviceItems", serviceItems.filter((_item, itemIndex) => itemIndex !== index));
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Create native invoice">
        <div className="modal-head">
          <div>
            <h2>Create Native Invoice</h2>
            <p>{client?.name || "Client"} · {invoiceType === "taggd" ? "Taggd service invoice" : "Non-Taggd placement invoice"}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close invoice form"><X size={18} /></button>
        </div>
        <div className="segmented-control invoice-type-control" aria-label="Invoice type">
          <button className={invoiceType === "non_taggd" ? "active" : ""} onClick={() => setInvoiceType("non_taggd")}>Non-Taggd</button>
          <button className={invoiceType === "taggd" ? "active" : ""} onClick={() => setInvoiceType("taggd")}>Taggd</button>
        </div>
        <div className="form-grid">
          {invoiceType === "non_taggd" && (
            <>
              <Field label="Candidate name" value={draft.candidateName} onChange={(value) => onUpdate("candidateName", value)} required />
              <Field label="Role / position" value={draft.role} onChange={(value) => onUpdate("role", value)} required />
              <Field label="Offered CTC" type="number" value={draft.ctc} onChange={(value) => onUpdate("ctc", value)} required />
              <Field label="Joining date" type="date" value={draft.joiningDate} onChange={(value) => onUpdate("joiningDate", value)} required />
              <Field label="Fee rate" type="number" value={draft.feeRate} onChange={(value) => onUpdate("feeRate", value)} />
            </>
          )}
          <Field label="Invoice date" type="date" value={draft.invoiceDate} onChange={(value) => onUpdate("invoiceDate", value)} />
          <Field label="Reference / SPOC" value={draft.reference} onChange={(value) => onUpdate("reference", value)} />
        </div>
        {invoiceType === "taggd" && (
          <div className="taggd-service-editor">
            <div className="toolbar">
              <strong>Taggd service details</strong>
              <button className="secondary-btn" onClick={addServiceItem}>Add row</button>
            </div>
            {serviceItems.map((item, index) => (
              <div className="taggd-service-row" key={`${item.description}-${index}`}>
                <Field label="Description" value={item.description} onChange={(value) => updateServiceItem(index, "description", value)} />
                <Field label="Units" type="number" value={item.count} onChange={(value) => updateServiceItem(index, "count", value)} />
                <Field label="Rate" type="number" value={item.rate} onChange={(value) => updateServiceItem(index, "rate", value)} />
                <Field label="Total value" type="number" value={calculatedServiceItem(item).amount} onChange={() => {}} disabled />
                <button className="secondary-btn danger-btn" onClick={() => removeServiceItem(index)}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="import-summary">
          <Metric label="Bill value" value={`INR ${Math.round(billValue).toLocaleString("en-IN")}`} note={invoiceType === "taggd" ? "Service subtotal" : `${(feeRate * 100).toFixed(2)}% of CTC`} />
          <Metric label="GST estimate" value={`INR ${Math.round(gst).toLocaleString("en-IN")}`} note="Current estimate" />
          <Metric label="Amount TBR" value={`INR ${Math.round(gross - tds).toLocaleString("en-IN")}`} note="Gross less TDS" />
        </div>
        <div className="modal-actions">
          <span className="form-note">This creates the invoice record in HRMS. PDF generation will be added in the next slice.</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!canSave} onClick={onSave}>Create invoice</button>
        </div>
      </section>
    </div>
  );
}

function ClientForm({ client, onSave, onClose }) {
  const [draft, setDraft] = useState(client);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateBdTool(field, value) {
    setDraft((current) => ({ ...current, bdTools: { ...(current.bdTools || {}), [field]: value } }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Client details">
        <div className="modal-head">
          <div>
            <h2>{draft.id ? "Edit Client" : "Add Client"}</h2>
            <p>{draft.clientCode || "Create client master record."}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close client form"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <Field label="Client name" value={draft.name} onChange={(value) => update("name", value)} required />
          <SelectField label="Status" value={draft.status || "Active"} onChange={(value) => update("status", value)} options={["Active", "Paused", "Inactive"]} />
          <Field label="Industry / Domain" value={draft.industry} onChange={(value) => update("industry", value)} />
          <Field label="Working since" type="date" value={draft.workingSince} onChange={(value) => update("workingSince", value)} />
          <Field label="Owner" value={draft.owner} onChange={(value) => update("owner", value)} />
          <Field label="Billing address" value={draft.billingAddress || ""} onChange={(value) => update("billingAddress", value)} />
          <Field label="GSTIN" value={draft.gstin || ""} onChange={(value) => update("gstin", value)} />
          <Field label="PAN" value={draft.pan || ""} onChange={(value) => update("pan", value)} />
          <Field label="State" value={draft.state || ""} onChange={(value) => update("state", value)} />
          <Field label="State code" value={draft.stateCode || ""} onChange={(value) => update("stateCode", value)} />
          <Field label="Buyer PO" value={draft.buyerPo || ""} onChange={(value) => update("buyerPo", value)} />
          <Field label="HSN/SAC" value={draft.hsnSac || "998519"} onChange={(value) => update("hsnSac", value)} />
          <Field label="SPOC" value={draft.spoc || ""} onChange={(value) => update("spoc", value)} />
          <Field label="Pitchdeck" value={draft.bdTools?.pitchdeck || ""} onChange={(value) => updateBdTool("pitchdeck", value)} />
          <Field label="Customized pitch" value={draft.bdTools?.customizedPitch || ""} onChange={(value) => updateBdTool("customizedPitch", value)} />
          <Field label="Proposals" value={draft.bdTools?.proposals || ""} onChange={(value) => updateBdTool("proposals", value)} />
        </div>
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!draft.name?.trim()} onClick={() => onSave(draft)}>Save client</button>
        </div>
      </section>
    </div>
  );
}

function EmployeeForm({ mode, employee, onClose, onSave, saveError = "", saving = false }) {
  const [draft, setDraft] = useState(employee);
  const [activeFormTab, setActiveFormTab] = useState("personal");
  const canSave = draft.name.trim() && draft.email.trim() && draft.role.trim();
  const formTabs = [
    { id: "personal", label: "Personal" },
    { id: "job", label: "Job" },
    { id: "compensation", label: "Compensation" },
    { id: "documents", label: "Documents" },
    { id: "lifecycle", label: "Lifecycle" },
  ];

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Edit employee" : "Add employee"}>
        <div className="modal-head">
          <div>
            <h2>{mode === "edit" ? "Edit Employee" : "Add Employee"}</h2>
            <p>{mode === "edit" ? draft.employeeId : "Create the employee master record."}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="form-tabs">
          {formTabs.map((tab) => (
            <button key={tab.id} aria-label={`Form ${tab.label}`} className={activeFormTab === tab.id ? "active" : ""} onClick={() => setActiveFormTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="form-content">
          {activeFormTab === "personal" && (
            <div className="form-grid">
              <Field label="Employee ID" value={draft.employeeId} onChange={(value) => update("employeeId", value)} disabled={mode === "edit"} />
              <SelectField label="Entity" value={draft.legalEntity || "HRGP"} onChange={(value) => update("legalEntity", value)} options={["HRGP", "Taggd"]} />
              <Field label="Full name" value={draft.name} onChange={(value) => update("name", value)} required />
              <Field label="Email" value={draft.email} onChange={(value) => update("email", value)} required />
              <Field label="Phone" value={draft.phone} onChange={(value) => update("phone", value)} />
              <Field label="Date of birth" type="date" value={draft.dob} onChange={(value) => update("dob", value)} />
              <SelectField label="Gender" value={draft.gender} onChange={(value) => update("gender", value)} options={["", "Female", "Male", "Non-binary", "Prefer not to say"]} />
              <Field label="Address" value={draft.address} onChange={(value) => update("address", value)} />
              <Field label="Emergency contact" value={draft.emergencyContact} onChange={(value) => update("emergencyContact", value)} />
            </div>
          )}

          {activeFormTab === "job" && (
            <div className="form-grid">
              <Field label="Job title" value={draft.role} onChange={(value) => update("role", value)} required />
              <SelectField label="Department" value={draft.dept} onChange={(value) => update("dept", value)} options={["Engineering", "Finance", "Human Resources", "Operations", "Recruitment", "Sales"]} />
              <Field label="Client" value={draft.client} onChange={(value) => update("client", value)} />
              <Field label="Client start date" type="date" value={draft.clientStartDate || "2026-01-01"} onChange={(value) => update("clientStartDate", value)} />
              <Field label="Manager" value={draft.manager} onChange={(value) => update("manager", value)} />
              <SelectField label="Location" value={draft.location} onChange={(value) => update("location", value)} options={["Pune", "Mumbai", "Bengaluru", "Delhi", "Hyderabad", "Chennai"]} />
              <SelectField label="Status" value={draft.status} onChange={(value) => update("status", value)} options={["Active", "Probation", "On Leave", "Inactive", "Exited"]} />
              <SelectField label="Employment type" value={draft.employmentType} onChange={(value) => update("employmentType", value)} options={["Full-time", "Contract", "Intern", "Consultant"]} />
              <Field label="Join date" type="date" value={draft.joinDate} onChange={(value) => update("joinDate", value)} />
              <SelectField label="Work mode" value={draft.workMode} onChange={(value) => update("workMode", value)} options={["Office", "Hybrid", "Remote"]} />
            </div>
          )}

          {activeFormTab === "compensation" && (
            <div className="form-grid">
              <Field label="Salary band" value={draft.salaryBand} onChange={(value) => update("salaryBand", value)} />
              <Field label="CTC" value={draft.ctc} onChange={(value) => update("ctc", value)} />
              <Field label="Monthly salary" value={draft.monthlySalary} onChange={(value) => update("monthlySalary", value)} />
              <SelectField label="Payroll status" value={draft.payrollStatus} onChange={(value) => update("payrollStatus", value)} options={["Ready", "Pending confirmation", "Hold", "Not applicable"]} />
              <Field label="PAN" value={draft.pan} onChange={(value) => update("pan", value.toUpperCase())} />
              <Field label="UAN" value={draft.uan} onChange={(value) => update("uan", value.replace(/\D/g, "").slice(0, 12))} />
              <Field label="Aadhaar" value={draft.aadhaarNumber} onChange={(value) => update("aadhaarNumber", value.replace(/\D/g, "").slice(0, 12))} />
              <Field label="Bank name" value={draft.bankName} onChange={(value) => update("bankName", value)} />
              <Field label="Bank account" value={draft.bankAccount} onChange={(value) => update("bankAccount", value)} />
              <Field label="IFSC" value={draft.ifsc} onChange={(value) => update("ifsc", value.toUpperCase())} />
              <Field label="Bank branch" value={draft.bankBranch} onChange={(value) => update("bankBranch", value)} />
              <SelectField label="Compliance status" value={draft.complianceStatus || complianceStatusFor(draft)} onChange={(value) => update("complianceStatus", value)} options={["Missing", "Incomplete", "Pending HR Verification", "Verified", "Rejected"]} />
            </div>
          )}

          {activeFormTab === "documents" && (
            <div className="form-grid">
              <Field label="Documents" value={draft.documents} onChange={(value) => update("documents", value)} />
              <Field label="Pre-joining documents" value={draft.preJoiningDocuments} onChange={(value) => update("preJoiningDocuments", value)} />
              <Field label="KYC documents" value={draft.kycDocuments} onChange={(value) => update("kycDocuments", value)} />
              <SelectField label="PF declaration" value={draft.pfDeclaration} onChange={(value) => update("pfDeclaration", value)} options={["", "Pending", "Submitted", "Not applicable"]} />
              <SelectField label="Onboarding status" value={draft.onboardingStatus} onChange={(value) => update("onboardingStatus", value)} options={["Not sent", "Email sent", "Details received", "Completed"]} />
            </div>
          )}

          {activeFormTab === "lifecycle" && (
            <div className="form-grid">
              <SelectField label="Lifecycle stage" value={draft.lifecycleStage} onChange={(value) => update("lifecycleStage", value)} options={["Probation", "Confirmed", "Contract Active", "Transferred", "Notice Period", "Exited", "Active"]} />
              <Field label="Confirmation date" type="date" value={draft.confirmationDate} onChange={(value) => update("confirmationDate", value)} />
              <Field label="Exit date" type="date" value={draft.exitDate} onChange={(value) => update("exitDate", value)} />
            </div>
          )}
        </div>

        <div className="modal-actions">
          <span className={saveError ? "form-error" : "form-note"}>{saveError || "Required: Full name, email, and job title."}</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!canSave || saving} onClick={() => onSave(draft)}><CheckCircle2 size={17} /> {saving ? "Saving..." : "Save employee"}</button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false, disabled = false }) {
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
      <input type={type} value={value} disabled={disabled} onInput={(event) => onChange(event.target.value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const optionValue = typeof option === "object" ? option.value : option;
          const optionLabel = typeof option === "object" ? option.label : option;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </label>
  );
}

function Info({ label, value, wide = false }) {
  return <div className={`info ${wide ? "wide" : ""}`}><span>{label}</span><strong>{value || "-"}</strong></div>;
}

function shouldShowInAttendance(employee) {
  return employee.employeeId !== "HRGP01" && employee.name !== "Surinder Singh";
}

function Attendance({ role, profile, employees, leaveRecords, setLeaveRecords, attendanceRecords, setAttendanceRecords, attendanceRequests, setAttendanceRequests, canManage, syncStatus }) {
  const [selectedDate, setSelectedDate] = useState(todayLocalDate());
  const [statusFilter, setStatusFilter] = useState("All");
  const [requestDraft, setRequestDraft] = useState(null);
  const [attendanceError, setAttendanceError] = useState("");
  const [duplicateRequestNotice, setDuplicateRequestNotice] = useState(null);
  const [earlyCheckoutConfirm, setEarlyCheckoutConfirm] = useState(null);
  const earlyCheckoutApprovedRef = useRef(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [limitResetRequests, setLimitResetRequests] = useState([]);
  const [regularizationCases, setRegularizationCases] = useState([]);
  const [allowAfterCutoff, setAllowAfterCutoff] = useState(() => window.localStorage.getItem(ATTENDANCE_AFTER_CUTOFF_STORAGE_KEY) === "true");
  const today = todayLocalDate();
  const currentMonth = today.slice(0, 7);
  const requestMinDate = `${currentMonth}-01`;
  const requestMaxDate = localDateOffset(-1);
  const attendanceRequestTypes = ["Forgot to punch", "Working from 2nd Half"];
  const scopedEmployees = employees.filter((employee) => {
    if (!shouldShowInAttendance(employee)) return false;
    if (!isActiveEmployee(employee)) return false;
    if (role === "employee") return employee.name === profile.name;
    if (role === "manager") return employee.name === profile.name || employee.manager === profile.name;
    return true;
  });

  const dailyRows = scopedEmployees.map((employee) => {
    const leave = approvedLeaveForDate(employee.employeeId, selectedDate, leaveRecords);
    if (leave) return defaultAttendanceFor(employee, selectedDate, leaveRecords);
    const savedRecord = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === selectedDate);
    if (savedRecord) return savedRecord;
    const fallback = defaultAttendanceFor(employee, selectedDate, leaveRecords);
    return role === "employee" ? { ...fallback, status: "Absent", checkIn: "", checkOut: "", hours: "0" } : fallback;
  });
  const filteredRows = dailyRows.filter((row) => statusFilter === "All" || row.status === statusFilter);
  const counts = {
    Present: dailyRows.filter((row) => row.status === "Present").length,
    Remote: dailyRows.filter((row) => row.status === "Remote").length,
    Leave: dailyRows.filter((row) => row.status === "Leave").length,
    Absent: dailyRows.filter((row) => row.status === "Absent").length,
    Late: dailyRows.filter((row) => row.status === "Late").length,
  };
  const canUseSelfAttendance = role === "employee" || role === "manager";
  const attendanceDbConnected = syncStatus === "Database connected";
  const ownEmployee = canUseSelfAttendance ? scopedEmployees.find((employee) => employee.name === profile.name) : null;
  const ownTodayRecord = ownEmployee ? attendanceRecords.find((record) => record.employeeId === ownEmployee.employeeId && record.date === today) : null;
  const isTodayAttendanceComplete = Boolean(ownTodayRecord?.checkIn && ownTodayRecord?.checkOut);
  const todayWorkedHours = isTodayAttendanceComplete ? hoursBetween(ownTodayRecord.checkIn, ownTodayRecord.checkOut) : 0;
  const canRaiseSecondHalfRequest = !isTodayAttendanceComplete && !ownTodayRecord?.checkIn;
  const isAttendanceExempt = Boolean(ownEmployee && ownEmployee.name === "Surinder Singh");
  const ownPreviousOpenRecord = ownEmployee ? attendanceRecords
    .filter((record) => record.employeeId === ownEmployee.employeeId && record.date >= ATTENDANCE_GO_LIVE_DATE && record.date < today && record.checkIn && !record.checkOut)
    .sort((first, second) => second.date.localeCompare(first.date))[0] : null;
  const previousOpenDate = ownPreviousOpenRecord?.date || "";
  const previousCheckoutMissing = !isAttendanceExempt && Boolean(ownPreviousOpenRecord);
  const employeeAttendanceHistory = ownEmployee ? monthDates(currentMonth)
    .filter((date) => date < today)
    .map((date) => {
      const leave = approvedLeaveForDate(ownEmployee.employeeId, date, leaveRecords);
      const savedRecord = attendanceRecords.find((record) => record.employeeId === ownEmployee.employeeId && record.date === date);
      if (leave) return { ...defaultAttendanceFor(ownEmployee, date, leaveRecords), leaveType: leave.type, notes: leave.reason || leave.type };
      if (savedRecord) return savedRecord;
      if (isNonWorkingDay(date)) return defaultAttendanceFor(ownEmployee, date, leaveRecords);
      return {
        employeeId: ownEmployee.employeeId,
        employee: ownEmployee.name,
        date,
        status: "Absent",
        checkIn: "",
        checkOut: "",
        hours: "0",
        notes: "Attendance not marked",
      };
    })
    .sort((first, second) => second.date.localeCompare(first.date)) : [];
  const pendingAttendanceRequests = attendanceRequests.filter((request) => {
    if (request.status !== "Pending") return false;
    if (role === "manager") return scopedEmployees.some((employee) => employee.employeeId === request.employeeId);
    return role === "admin";
  });

  useEffect(() => {
    window.localStorage.setItem(ATTENDANCE_AFTER_CUTOFF_STORAGE_KEY, String(allowAfterCutoff));
  }, [allowAfterCutoff]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/attendance/regularization-cases?status=all`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Could not load regularization cases.");
        if (!cancelled) setRegularizationCases(data.cases || []);
      })
      .catch(() => {
        if (!cancelled) setRegularizationCases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (role !== "admin") return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/attendance/limit-reset-requests?month=${currentMonth}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Could not load reset requests.");
        if (!cancelled) setLimitResetRequests(data.requests || []);
      })
      .catch(() => {
        if (!cancelled) setLimitResetRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [role, currentMonth]);

  function currentTimeValue() {
    return currentIstTime();
  }

  function minutesSinceMidnight(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return (hours * 60) + minutes;
  }

  function canCheckInNow() {
    const now = minutesSinceMidnight(currentTimeValue());
    if (isAttendanceExempt) return !ownTodayRecord?.checkIn;
    return now >= minutesSinceMidnight("08:30") && (allowAfterCutoff || now <= minutesSinceMidnight("10:30")) && !previousCheckoutMissing;
  }

  function minutesWorkedToday() {
    if (!ownTodayRecord?.checkIn) return 0;
    return Math.max(minutesSinceMidnight(currentTimeValue()) - minutesSinceMidnight(ownTodayRecord.checkIn), 0);
  }

  function checkOutBlockMessage() {
    if (!ownTodayRecord?.checkIn) return "Check in first to enable checkout.";
    if (ownTodayRecord?.checkOut) return "Checkout is already marked.";
    if (!isAttendanceExempt && minutesWorkedToday() < 120) return "Checkout will be available 2 hours after check-in.";
    if (!isAttendanceExempt && minutesSinceMidnight(currentTimeValue()) > minutesSinceMidnight("20:30")) return "Checkout cannot be marked after 8:30 PM.";
    return "";
  }

  function canCheckOutNow() {
    if (!ownTodayRecord?.checkIn || ownTodayRecord?.checkOut) return false;
    if (isAttendanceExempt) return true;
    return minutesWorkedToday() >= 120 && minutesSinceMidnight(currentTimeValue()) <= minutesSinceMidnight("20:30");
  }

  function monthlyRequestCount(employeeId) {
    return attendanceRequests.filter((request) => (
      request.employeeId === employeeId &&
      request.createdAt?.slice(0, 7) === currentMonth &&
      request.requestType !== "Working from 2nd Half"
    )).length;
  }

  function canOpenAttendanceRequest(employeeId) {
    return monthlyRequestCount(employeeId) < 5;
  }

  function isAttendanceComplete(employeeId, date) {
    const record = attendanceRecords.find((item) => item.employeeId === employeeId && item.date === date);
    return Boolean(record?.checkIn && record?.checkOut);
  }

  function requestLimitMessage(employeeId) {
    return `Monthly attendance request limit reached: ${monthlyRequestCount(employeeId)}/5. Please contact Admin.`;
  }

  async function decideLimitReset(id, status) {
    setAttendanceError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/limit-reset-requests/${id}/${status === "Approved" ? "approve" : "reject"}`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Reset request could not be updated.");
      setLimitResetRequests((requests) => requests.map((request) => request.id === id ? data.request : request));
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
    }
  }

  async function closeRegularizationCase(id) {
    setAttendanceError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/regularization-cases/${id}/close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolution: "admin_exception", notes: "Closed as Admin/HR exception." }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Regularization case could not be closed.");
      setRegularizationCases((cases) => cases.map((item) => item.id === id ? data.case : item));
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
    }
  }

  function existingPunchRequest(employeeId, date, punchType) {
    return attendanceRequests.find((request) => (
      request.employeeId === employeeId &&
      request.date === date &&
      request.status !== "Rejected" &&
      (
        request.punchType === punchType ||
        request.requestType === `Forgot to punch - ${punchType}`
      )
    ));
  }

  function duplicatePunchMessage(punchType, date) {
    return `${punchType} punch request for ${date} was already raised. Please wait for it to reflect in attendance or contact Admin.`;
  }

  function autoCasualLeave(employee, date, days, reason) {
    const id = `AUTO-CL-${employee.employeeId}-${date}-${Date.now()}`;
    const request = {
      id,
      employeeId: employee.employeeId,
      employee: employee.name,
      type: "Casual Leave",
      fromDate: date,
      toDate: date,
      days,
      reason,
      status: "Approved",
      approver: "System",
      createdAt: today,
    };
    setLeaveRecords((records) => records.some((item) => item.id === id || (item.employeeId === employee.employeeId && item.fromDate === date && item.reason === reason)) ? records : [request, ...records]);
  }

  function hoursBetween(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const minutes = Math.max(minutesSinceMidnight(checkOut) - minutesSinceMidnight(checkIn), 0);
    return Math.round((minutes / 60) * 100) / 100;
  }

  function shortShiftCount(employeeId, month) {
    return attendanceRecords.filter((record) => {
      if (record.employeeId !== employeeId || record.date?.slice(0, 7) !== month) return false;
      const hours = Number(record.hours || hoursBetween(record.checkIn, record.checkOut));
      return hours >= 6 && hours < 8;
    }).length;
  }

  function applyHoursRules(employee, record) {
    const hours = Number(record.hours || hoursBetween(record.checkIn, record.checkOut));
    if (!hours || !record.checkOut) return record;
    if (hours < 3) {
      autoCasualLeave(employee, record.date, 1, "Auto full-day Casual Leave: worked less than 3 hours");
      return { ...record, status: "Leave", notes: "Less than 3 hours. Full-day Casual Leave applied." };
    }
    if (hours < 6) {
      autoCasualLeave(employee, record.date, 0.5, "Auto half-day Casual Leave: worked less than 6 hours");
      return { ...record, status: "Half Day", notes: "Less than 6 hours. Half-day Casual Leave applied." };
    }
    if (hours < 8) {
      const occurrence = shortShiftCount(employee.employeeId, record.date.slice(0, 7)) + 1;
      if (occurrence > 3) {
        autoCasualLeave(employee, record.date, 0.5, "Auto half-day Casual Leave: short shift beyond 3 monthly occurrences");
        window.alert(`Email notice queued for ${employee.name}: short shift occurrence ${occurrence}; half-day Casual Leave applied.`);
        return { ...record, status: "Half Day", notes: `Short shift occurrence ${occurrence}. Half-day Casual Leave applied.` };
      }
    }
    return record;
  }

  function openAttendanceRequest(type, sourceRecord = {}) {
    if (!attendanceDbConnected) {
      setAttendanceError("Database not connected; attendance cannot be marked.");
      return;
    }
    if (!previousCheckoutMissing && isTodayAttendanceComplete) {
      setAttendanceError("Attendance is already completed for today. No further checkout or attendance request is needed.");
      return;
    }
    if (type === "Working from 2nd Half" && sourceRecord.checkIn) {
      setAttendanceError("Working from 2nd Half is not needed after check-in is already marked.");
      return;
    }
    const doesCountAgainstLimit = type !== "Working from 2nd Half";
    if (!ownEmployee || (doesCountAgainstLimit && !canOpenAttendanceRequest(ownEmployee.employeeId))) {
      setAttendanceError(ownEmployee ? requestLimitMessage(ownEmployee.employeeId) : "No employee profile found.");
      return;
    }
    const date = previousCheckoutMissing ? previousOpenDate : (sourceRecord.date || today);
    if (isAttendanceComplete(ownEmployee.employeeId, date)) {
      setAttendanceError(`Attendance is already completed for ${date}. No further request can be raised.`);
      return;
    }
    const isSecondHalf = type === "Working from 2nd Half";
    const isPreviousCheckoutFix = previousCheckoutMissing && sourceRecord.date === previousOpenDate;
    const hasCheckIn = Boolean(sourceRecord.checkIn);
    const punchType = isPreviousCheckoutFix || (type === "Forgot to punch" && hasCheckIn) ? "Checkout" : "Check in";
    const lateMissedCheckIn = punchType === "Check in" && minutesSinceMidnight(currentTimeValue()) >= minutesSinceMidnight("18:00");
    const defaultCheckInTime = lateMissedCheckIn ? "09:30" : currentTimeValue();
    if (type === "Forgot to punch" && existingPunchRequest(ownEmployee.employeeId, date, punchType)) {
      setDuplicateRequestNotice(duplicatePunchMessage(punchType, date));
      return;
    }
    setRequestDraft({
      employeeId: ownEmployee.employeeId,
      employee: ownEmployee.name,
      date,
      requestType: type,
      punchType,
      statusValue: isSecondHalf ? "Half Day" : (sourceRecord.status || "Present"),
      checkIn: punchType === "Check in" ? (sourceRecord.checkIn || (isSecondHalf ? "14:00" : defaultCheckInTime)) : (sourceRecord.checkIn || ""),
      checkOut: punchType === "Checkout" ? (sourceRecord.checkOut || (isPreviousCheckoutFix ? "18:30" : currentTimeValue())) : (sourceRecord.checkOut || ""),
      hours: sourceRecord.hours || (isSecondHalf ? "" : ""),
      reason: isSecondHalf ? "" : punchType === "Check in" ? (lateMissedCheckIn ? "Forgot to punch" : "Running late") : "Checkout",
      screenshotName: "",
      screenshotData: "",
      screenshotMimeType: "",
      autoApprove: true,
    });
  }

  function canRequestAttendanceUpdate(date) {
    return date >= requestMinDate && date <= requestMaxDate && date.slice(0, 7) === currentMonth;
  }

  function mergeAttendance(record) {
    setAttendanceRecords((records) => {
      const withoutCurrent = records.filter((item) => !(item.employeeId === record.employeeId && item.date === record.date));
      return [record, ...withoutCurrent];
    });
  }

  function mergeLeaveDeduction(leaveDeduction) {
    if (!leaveDeduction) return;
    setLeaveRecords((records) => [
      leaveDeduction,
      ...records.filter((item) => item.id !== leaveDeduction.id),
    ]);
  }

  async function markOwnAttendance(field) {
    if (!ownEmployee) return;
    if (!attendanceDbConnected) {
      setAttendanceError("Database not connected; attendance cannot be marked.");
      return;
    }
    const now = currentTimeValue();
    const current = attendanceRecords.find((record) => record.employeeId === ownEmployee.employeeId && record.date === today) || {
      ...defaultAttendanceFor(ownEmployee, today, leaveRecords),
      checkIn: "",
      checkOut: "",
      hours: "",
      notes: "",
    };
    const next = { ...current, status: current.status === "Absent" ? "Present" : current.status };
    if (field === "checkIn") {
      if (previousCheckoutMissing) {
        openAttendanceRequest("Forgot to punch", ownPreviousOpenRecord);
        return;
      }
      if (next.checkIn) return;
      if (!isAttendanceExempt && !allowAfterCutoff && minutesSinceMidnight(now) > minutesSinceMidnight("10:30")) {
        openAttendanceRequest("Forgot to punch", next);
        return;
      }
      if (!isAttendanceExempt && minutesSinceMidnight(now) < minutesSinceMidnight("08:30")) {
        setAttendanceError("Check-in opens at 8:30 AM.");
        return;
      }
      next.checkIn = now;
      next.checkOut = "";
      next.hours = "";
    }
    if (field === "checkOut") {
      if (!next.checkIn || next.checkOut) return;
      if (!earlyCheckoutApprovedRef.current && minutesSinceMidnight(now) < minutesSinceMidnight("18:00")) {
        setEarlyCheckoutConfirm({
          employee: ownEmployee.name,
          checkOutTime: now,
        });
        return;
      }
      if (!canCheckOutNow()) {
        setAttendanceError(checkOutBlockMessage());
        return;
      }
      next.checkOut = now;
      next.hours = String(hoursBetween(next.checkIn, next.checkOut));
    }
    const finalRecord = applyHoursRules(ownEmployee, next);
    setAttendanceError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/${field === "checkIn" ? "check-in" : "check-out"}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Attendance could not be saved.");
      mergeAttendance(applyHoursRules(ownEmployee, data.attendance));
      mergeLeaveDeduction(data.leaveDeduction);
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Backend server is not running. Attendance was not saved. Please try again." : error.message);
    } finally {
      if (field === "checkOut") earlyCheckoutApprovedRef.current = false;
    }
  }

  function confirmEarlyCheckout() {
    setEarlyCheckoutConfirm(null);
    earlyCheckoutApprovedRef.current = true;
    markOwnAttendance("checkOut");
  }

  async function saveAttendanceRecord(record) {
    const response = await fetch(`${API_BASE_URL}/api/attendance/${record.id || `${record.employeeId}-${record.date}`}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(attendanceToApi(record)),
    });
    const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Attendance could not be saved.");
      mergeLeaveDeduction(data.leaveDeduction);
      return data.attendance;
  }

  async function updateAttendance(employee, field, value) {
    if (!attendanceDbConnected) {
      setAttendanceError("Database not connected; attendance cannot be marked.");
      return;
    }
    const current = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === selectedDate) ||
      defaultAttendanceFor(employee, selectedDate, leaveRecords);
    let next = { ...current, [field]: value };
    if (field === "status") {
      next.checkIn = ["Present", "Late", "Remote"].includes(value) ? (next.checkIn || "09:30") : "";
      next.checkOut = ["Present", "Late", "Remote"].includes(value) ? (next.checkOut || "18:30") : "";
      next.hours = ["Present", "Late", "Remote"].includes(value) ? (next.hours || "9.0") : "0";
    }
    if (field === "checkIn" || field === "checkOut") next.hours = String(hoursBetween(next.checkIn, next.checkOut) || next.hours || "");
    if (next.checkIn && next.checkOut) next = applyHoursRules(employee, next);
    setAttendanceError("");
    try {
      const saved = await saveAttendanceRecord(next);
      mergeAttendance(saved);
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Database not connected; attendance cannot be marked." : error.message);
    }
  }

  async function saveDefaults() {
    if (!attendanceDbConnected) {
      setAttendanceError("Database not connected; attendance cannot be marked.");
      return;
    }
    const explicitKeys = new Set(attendanceRecords.filter((record) => record.date === selectedDate).map((record) => record.employeeId));
    const defaults = scopedEmployees
      .filter((employee) => !explicitKeys.has(employee.employeeId))
      .map((employee) => defaultAttendanceFor(employee, selectedDate, leaveRecords));
    if (!defaults.length) return;
    setAttendanceError("");
    try {
      const savedRows = await Promise.all(defaults.map(saveAttendanceRecord));
      setAttendanceRecords((records) => {
        const savedKeys = new Set(savedRows.map((record) => `${record.employeeId}-${record.date}`));
        return [...savedRows, ...records.filter((record) => !savedKeys.has(`${record.employeeId}-${record.date}`))];
      });
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Database not connected; attendance cannot be marked." : error.message);
    }
  }

  async function regularizeAttendanceDay(employee, row) {
    if (!employee) return;
    const checkIn = row.checkIn || "09:30";
    const checkOut = row.checkOut || "";
    const hours = checkOut ? String(hoursBetween(checkIn, checkOut) || row.hours || "") : "";
    setAttendanceError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/regularize-day`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          employeeCode: employee.employeeId,
          date: row.date || selectedDate,
          checkIn,
          checkOut,
          hours,
          notes: "Admin regularized attendance; auto CL not applicable",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Attendance could not be regularized.");
      mergeAttendance(data.attendance);
      setLeaveRecords((records) => records.map((request) => (
        request.employeeId === employee.employeeId &&
        request.fromDate === (row.date || selectedDate) &&
        request.toDate === (row.date || selectedDate) &&
        request.type === "Casual Leave" &&
        String(request.reason || "").startsWith("Auto") &&
        request.status === "Approved"
          ? { ...request, status: "Rejected", reason: `Admin correction: auto CL not counted for ${row.date || selectedDate}` }
          : request
      )));
      setAttendanceError(data.rejectedLeaveCount ? `Attendance regularized. ${data.rejectedLeaveCount} auto CL deduction removed.` : "Attendance regularized.");
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Backend server is not running. Attendance was not regularized." : error.message);
    }
  }

  async function submitAttendanceRequest() {
    if (!requestDraft?.employeeId || !requestDraft?.date) return;
    if (isAttendanceComplete(requestDraft.employeeId, requestDraft.date)) {
      setAttendanceError(`Attendance is already completed for ${requestDraft.date}. No further request can be raised.`);
      setRequestDraft(null);
      return;
    }
    const reasonBase = requestDraft.requestType === "Forgot to punch" ? (requestDraft.reason?.trim() || requestDraft.punchType || "Missed / late punch") : requestDraft.reason.trim();
    const reason = requestDraft.reason === "System issue" && requestDraft.screenshotName ? `${reasonBase} - Screenshot: ${requestDraft.screenshotName}` : reasonBase;
    if (requestDraft.requestType !== "Forgot to punch" && !reason) return;
    if (requestDraft.requestType !== "Working from 2nd Half" && !canOpenAttendanceRequest(requestDraft.employeeId)) {
      setAttendanceError(requestLimitMessage(requestDraft.employeeId));
      return;
    }
    if (!attendanceRequestTypes.includes(requestDraft.requestType)) return;
    if (requestDraft.requestType === "Forgot to punch" && existingPunchRequest(requestDraft.employeeId, requestDraft.date, requestDraft.punchType)) {
      setRequestDraft(null);
      setDuplicateRequestNotice(duplicatePunchMessage(requestDraft.punchType, requestDraft.date));
      return;
    }
    const employee = employees.find((item) => item.employeeId === requestDraft.employeeId);
    const normalizedCheckIn = requestDraft.requestType === "Forgot to punch" && requestDraft.punchType === "Checkout" && !requestDraft.checkIn
      ? (attendanceRecords.find((record) => record.employeeId === requestDraft.employeeId && record.date === requestDraft.date)?.checkIn || "")
      : requestDraft.checkIn;
    const normalizedCheckOut = requestDraft.requestType === "Forgot to punch" && requestDraft.punchType === "Check in"
      ? ""
      : requestDraft.checkOut;
    const hours = requestDraft.hours || String(hoursBetween(normalizedCheckIn, normalizedCheckOut) || "");
    const request = {
      id: `AR-${Date.now()}`,
      employeeId: requestDraft.employeeId,
      employee: employee?.name || requestDraft.employee,
      date: requestDraft.date,
      requestType: requestDraft.requestType,
      statusValue: requestDraft.statusValue,
      punchType: requestDraft.punchType || "",
      checkIn: normalizedCheckIn,
      checkOut: normalizedCheckOut,
      hours,
      reason,
      screenshotName: requestDraft.screenshotName || "",
      screenshotData: requestDraft.screenshotData || "",
      screenshotMimeType: requestDraft.screenshotMimeType || "",
      status: "Approved",
      createdAt: today,
    };
    let next = {
      employeeId: request.employeeId,
      employee: request.employee,
      date: request.date,
      status: request.statusValue,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      hours: request.hours,
      notes: `Auto-approved request: ${request.requestType}. ${request.reason}`,
    };
    if (employee) next = applyHoursRules(employee, next);
    mergeAttendance(next);
    setAttendanceError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/update-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(attendanceRequestToApi(request)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Attendance request could not be submitted.");
      setAttendanceRequests((requests) => [data.request, ...requests]);
      if (data.attendance) mergeAttendance(data.attendance);
      mergeLeaveDeduction(data.leaveDeduction);
      setRequestDraft(null);
    } catch (error) {
      const message = error.message === "Failed to fetch" ? "Backend server is not running. Request stayed local." : error.message;
      if (message.toLowerCase().includes("already raised")) {
        setDuplicateRequestNotice(message);
        setRequestDraft(null);
        return;
      } else {
        setAttendanceError(message);
      }
      setAttendanceRequests((requests) => [request, ...requests]);
      setRequestDraft(null);
    }
  }

  async function updateAttendanceRequest(id, status) {
    const request = attendanceRequests.find((item) => item.id === id);
    if (!request) return;
    setAttendanceError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance/update-requests/${id}/${status === "Approved" ? "approve" : "reject"}`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Attendance request could not be updated.");
      setAttendanceRequests((requests) => requests.map((item) => item.id === id ? data.request : item));
      if (data.attendance) mergeAttendance(data.attendance);
      mergeLeaveDeduction(data.leaveDeduction);
    } catch (error) {
      setAttendanceError(error.message === "Failed to fetch" ? "Database not connected; attendance request was not updated." : error.message);
    }
  }

  return (
    <div className="stack">
      <Panel title={role === "employee" ? "My Attendance" : role === "manager" ? "Team Attendance" : "Daily Attendance"} meta={`${filteredRows.length} shown Â· ${syncStatus}`}>
        {!attendanceDbConnected && <div className="form-error attendance-error">Database not connected; attendance cannot be marked.</div>}
        {attendanceError && <div className="form-error attendance-error">{attendanceError}</div>}
        {canUseSelfAttendance && ownEmployee && (
          <div className="attendance-actions">
            <div>
              <strong>Today</strong>
          <span>{isAttendanceExempt ? "Attendance timing restrictions are not applied to your role." : `Check in is allowed from 8:30 AM${allowAfterCutoff ? " with admin after-cutoff override enabled" : " to 10:30 AM"}. Check out is available after check in and closes at 8:30 PM. Requests used this month: ${monthlyRequestCount(ownEmployee.employeeId)}/5.`}</span>
              {previousCheckoutMissing && (
                <span className="attendance-warning-text">
                  Check-in is blocked because checkout is missing for {previousOpenDate}. Open Select request and choose Missed checkout to regularize that date first.
                </span>
              )}
            </div>
            {!ownTodayRecord?.checkIn && <button className="primary-btn" disabled={!attendanceDbConnected} onClick={() => markOwnAttendance("checkIn")}>Check in</button>}
            <button className="secondary-btn" disabled={!attendanceDbConnected || !canCheckOutNow()} title={attendanceDbConnected ? checkOutBlockMessage() : "Database not connected; attendance cannot be marked."} onClick={() => markOwnAttendance("checkOut")}>Check out</button>
            {isTodayAttendanceComplete ? (
              <span className="form-note">Good job, you&apos;re done for the day. You worked for {todayWorkedHours} hour{todayWorkedHours === 1 ? "" : "s"} today.</span>
            ) : (
              <label className="action-select-wrap">
                <select value="" disabled={!attendanceDbConnected} onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  const sourceRecord = value === "Forgot to punch" && previousCheckoutMissing ? ownPreviousOpenRecord : ownTodayRecord || {};
                  openAttendanceRequest(value, sourceRecord);
                  event.target.value = "";
                }} aria-label="Open attendance request">
                  <option value="">Select request</option>
                  <option value="Forgot to punch" disabled={!canOpenAttendanceRequest(ownEmployee.employeeId)}>
                    {previousCheckoutMissing || ownTodayRecord?.checkIn ? "Missed checkout" : "Missed / Late check-in"}
                  </option>
                  {canRaiseSecondHalfRequest && <option value="Working from 2nd Half">Working from 2nd Half</option>}
                </select>
              </label>
            )}
          </div>
        )}
        <div className="toolbar payroll-toolbar">
          <button className="secondary-btn" onClick={() => setRulesOpen(true)}><ShieldCheck size={17} /> Attendance rules</button>
          {role === "admin" && (
            <label className="toggle-row attendance-override-toggle">
              <input type="checkbox" checked={allowAfterCutoff} onChange={(event) => setAllowAfterCutoff(event.target.checked)} />
              <span>Allow check-in after 10:30 AM</span>
            </label>
          )}
          {role !== "employee" && (
            <label className="field compact-field">
              <span>Date</span>
              <input type="date" value={selectedDate} onInput={(event) => setSelectedDate(event.target.value)} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
          )}
          {role === "admin" && <button className="secondary-btn" disabled={!attendanceDbConnected} onClick={saveDefaults}><CheckCircle2 size={17} /> Fill day sheet</button>}
        </div>

        <DataTable columns={["Employee", "Status", "Check-in", "Check-out", "Hours", ...(role === "admin" || role === "hr" ? ["Action"] : [])]} rows={filteredRows.map((row) => {
          const employee = employees.find((item) => item.employeeId === row.employeeId);
          const leaveLocked = Boolean(approvedLeaveForDate(row.employeeId, selectedDate, leaveRecords));
          const readOnly = role === "employee" || !canManage || leaveLocked || !attendanceDbConnected;
          const timeReadOnly = readOnly || ["Leave", "Absent"].includes(row.status);
          const cells = [
            <Person key={`${row.employeeId}-person`} name={row.employee} detail={`${row.employeeId} Â· ${employee?.dept || ""}`} />,
            <select key={`${row.employeeId}-status`} value={row.status} disabled={readOnly} onChange={(event) => updateAttendance(employee, "status", event.target.value)} aria-label={`Attendance status ${row.employee}`}>
              <option>Present</option>
              <option>Remote</option>
              <option>Leave</option>
              <option>Absent</option>
              <option>Late</option>
            </select>,
            <input key={`${row.employeeId}-in`} value={row.checkIn} disabled={timeReadOnly} onChange={(event) => updateAttendance(employee, "checkIn", event.target.value)} aria-label={`Check-in ${row.employee}`} />,
            <input key={`${row.employeeId}-out`} value={row.checkOut} disabled={timeReadOnly} onChange={(event) => updateAttendance(employee, "checkOut", event.target.value)} aria-label={`Check-out ${row.employee}`} />,
            <input key={`${row.employeeId}-hours`} value={row.hours} disabled={timeReadOnly} onChange={(event) => updateAttendance(employee, "hours", event.target.value)} aria-label={`Hours ${row.employee}`} />,
          ];
          if (role === "admin" || role === "hr") {
            cells.push(
              <button key={`${row.employeeId}-regularize`} className="secondary-btn" onClick={() => regularizeAttendanceDay(employee, row)}>
                Regularize
              </button>
            );
          }
          return cells;
        })} />
        {canUseSelfAttendance && (
          <div className="attendance-history-panel">
            <div className="section-head">
              <div>
                <h3>Previous Attendance</h3>
                <p>Read-only view of your attendance for earlier days this month.</p>
              </div>
            </div>
            <DataTable
              columns={["Date", "Status", "Check-in", "Check-out", "Hours", "Notes"]}
              rows={employeeAttendanceHistory.length ? employeeAttendanceHistory.map((row) => [
                row.date,
                <Badge key={`${row.date}-status`} tone={row.status === "Present" || row.status === "Remote" ? "green" : row.status === "Leave" ? "blue" : row.status === "Half Day" ? "amber" : "red"}>{row.status}</Badge>,
                row.checkIn || "-",
                row.checkOut || "-",
                row.hours || "0",
                row.notes || row.leaveType || "-",
              ]) : [["No previous attendance records for this month.", "-", "-", "-", "-", "-"]]}
            />
          </div>
        )}
      </Panel>
      {role === "admin" && (
        <Panel title="Attendance Limit Reset Requests" meta={`${limitResetRequests.filter((request) => request.status === "Pending").length} pending`}>
          <DataTable
            columns={["Employee", "Month", "Count", "Justification", "Status", "Action"]}
            rows={limitResetRequests.length ? limitResetRequests.map((request) => [
              <Person key={`${request.id}-person`} name={request.employee} detail={request.employeeId} />,
              request.month,
              request.requestCount,
              request.justification,
              <Badge tone={request.status === "Approved" ? "green" : request.status === "Rejected" ? "red" : "amber"}>{request.status}</Badge>,
              request.status === "Pending" ? (
                <div className="row-actions">
                  <button className="secondary-btn" onClick={() => decideLimitReset(request.id, "Approved")}>Reset</button>
                  <button className="secondary-btn" onClick={() => decideLimitReset(request.id, "Rejected")}>Reject</button>
                </div>
              ) : request.approver || "-",
            ]) : [["No limit reset requests for this month.", "-", "-", "-", "-", "-"]]}
          />
        </Panel>
      )}
      {(role === "admin" || role === "manager") && (
        <Panel title="Attendance Update Requests" meta={`${pendingAttendanceRequests.length} pending`}>
          <DataTable
            columns={["Employee", "Date", "Requested", "Reason", "Evidence", "Action"]}
            rows={pendingAttendanceRequests.map((request) => [
              <Person name={request.employee} detail={request.employeeId} />,
              request.date,
              `${request.requestType || "Attendance correction"}${request.punchType ? ` (${request.punchType})` : ""} Â· ${request.statusValue} Â· ${request.checkIn || "-"} to ${request.checkOut || "-"}`,
              request.reason,
              request.reason?.includes("Screenshot:") && request.evidenceUrl ? (
                <a className="link-button" href={`${API_BASE_URL}${request.evidenceUrl}`} target="_blank" rel="noreferrer">Open screenshot</a>
              ) : "-",
              <div className="row-actions">
                <button className="secondary-btn" onClick={() => updateAttendanceRequest(request.id, "Approved")}>Approve</button>
                <button className="secondary-btn" onClick={() => updateAttendanceRequest(request.id, "Rejected")}>Reject</button>
              </div>,
            ])}
          />
        </Panel>
      )}
      {(role === "admin" || role === "hr" || role === "manager" || role === "employee") && (
        <Panel title={role === "employee" ? "My Attendance Items Needing Action" : "Attendance Regularization Cases"} meta={`${regularizationCases.filter((item) => ["open", "employee_notified", "admin_notified"].includes(item.status)).length} open`}>
          <DataTable
            columns={canUseSelfAttendance ? ["Date", "Why", "Status", "What next"] : ["Employee", "Date", "Why", "Status", "Due", "Action"]}
            rows={(canUseSelfAttendance ? regularizationCases.filter((item) => item.employeeId === ownEmployee?.employeeId) : regularizationCases).length ? (canUseSelfAttendance ? regularizationCases.filter((item) => item.employeeId === ownEmployee?.employeeId) : regularizationCases).map((item) => {
              const isOpen = ["open", "employee_notified", "admin_notified"].includes(item.status);
              const nextStep = isOpen ? "Apply leave or raise the correct attendance request before the due date." : item.resolution || "Closed";
              if (canUseSelfAttendance) {
                return [
                  item.date,
                  item.reason === "missing_attendance" ? "Attendance was not marked" : item.reason,
                  <Badge tone={isOpen ? "amber" : "green"}>{item.status.replaceAll("_", " ")}</Badge>,
                  nextStep,
                ];
              }
              return [
                <Person name={item.employee} detail={`${item.employeeId}${item.client ? ` · ${item.client}` : ""}`} />,
                item.date,
                item.reason === "missing_attendance" ? "Attendance was not marked" : item.reason,
                <Badge tone={isOpen ? "amber" : "green"}>{item.status.replaceAll("_", " ")}</Badge>,
                item.dueAt ? item.dueAt.slice(0, 10) : "-",
                (role === "admin" || role === "hr") && isOpen ? <button className="secondary-btn" onClick={() => closeRegularizationCase(item.id)}>Close exception</button> : nextStep,
              ];
            }) : [[canUseSelfAttendance ? "No attendance action items." : "No regularization cases found.", "-", "-", canUseSelfAttendance ? "-" : "-", canUseSelfAttendance ? undefined : "-", canUseSelfAttendance ? undefined : "-"].filter((value) => value !== undefined)]}
          />
        </Panel>
      )}
      {requestDraft && (
        <AttendanceRequestModal
          draft={requestDraft}
          minDate={requestMinDate}
          maxDate={requestMaxDate}
          dateAllowed={canRequestAttendanceUpdate(requestDraft.date)}
          onUpdate={(field, value) => setRequestDraft((current) => ({ ...current, [field]: value }))}
          onClose={() => setRequestDraft(null)}
          onSubmit={submitAttendanceRequest}
        />
      )}
      {duplicateRequestNotice && (
        <DuplicateRequestModal
          message={duplicateRequestNotice}
          onClose={() => setDuplicateRequestNotice(null)}
        />
      )}
      {earlyCheckoutConfirm && (
        <EarlyCheckoutConfirmModal
          employee={earlyCheckoutConfirm.employee}
          checkOutTime={earlyCheckoutConfirm.checkOutTime}
          onCancel={() => setEarlyCheckoutConfirm(null)}
          onConfirm={confirmEarlyCheckout}
        />
      )}
      {rulesOpen && <AttendanceRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}

function EarlyCheckoutConfirmModal({ employee, checkOutTime, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card attendance-nudge-modal" role="dialog" aria-modal="true" aria-label="Confirm early checkout">
        <div className="modal-head">
          <div>
            <h2>Confirm early checkout</h2>
            <p>{employee}, you are checking out at {checkOutTime}, which is before 18:00.</p>
          </div>
        </div>
        <div className="check-list">
          <div className="check-row"><Clock3 size={17} /><span>Please confirm only if you really want to checkout now.</span></div>
        </div>
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onCancel}>Cancel</button>
          <button className="primary-btn" onClick={onConfirm}>Yes, check out</button>
        </div>
      </section>
    </div>
  );
}

function DuplicateRequestModal({ message, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card attendance-nudge-modal" role="dialog" aria-modal="true" aria-label="Duplicate attendance request">
        <div className="modal-head">
          <div>
            <h2>Request already raised</h2>
            <p>{message}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>OK</button>
        </div>
      </section>
    </div>
  );
}

function AttendanceRulesModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card policy-modal" role="dialog" aria-modal="true" aria-label="Attendance rules">
        <div className="modal-head">
          <div>
            <h2>Attendance Rules</h2>
            <p>Reference for all team members</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close attendance rules"><X size={18} /></button>
        </div>
        <div className="policy-list">
          <Info label="Check-in" value="Check in as soon as work starts. Direct check-in is allowed till 10:30 AM." wide />
          <Info label="Attendance access" value="HRMS access is available any time on approved laptop/device only." wide />
          <Info label="Checkout" value="After check-in, use Check out at the end of the workday. Missing checkout may block next day check-in." wide />
          <Info label="Missed / late punch" value="After 10:30 AM, raise Missed / Late check-in and select the correct reason, such as Running late. If checkout is missed, raise Missed checkout." wide />
          <Info label="Working from 2nd Half" value="Raise Working from 2nd Half if starting from second half." wide />
          <Info label="Request limit" value="Maximum 5 attendance correction requests are allowed per month. Missed / late punch requests count toward this limit. Working from 2nd Half does not count. Contact Admin after the limit is reached." wide />
          <Info label="Do not" value="Do not log in from mobile/tablet, do not use another person's device, and do not wait to regularize attendance." wide />
        </div>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function AttendanceRequestModal({ draft, minDate, maxDate, dateAllowed, onUpdate, onClose, onSubmit }) {
  const isForgotPunch = draft.requestType === "Forgot to punch";
  const punchTime = draft.punchType === "Checkout" ? draft.checkOut : draft.checkIn;
  const needsScreenshot = isForgotPunch && draft.punchType === "Check in" && draft.reason === "System issue";
  const reasonRequired = !isForgotPunch || draft.punchType === "Check in";
  const canSubmit = draft.date && draft.statusValue && (dateAllowed || draft.autoApprove) && (isForgotPunch ? draft.punchType && punchTime && (!reasonRequired || draft.reason?.trim()) && (!needsScreenshot || draft.screenshotData) : draft.reason.trim());
  const requestTypeOptions = [
    { value: "Forgot to punch", label: "Missed / Late punch" },
    { value: "Working from 2nd Half", label: "Working from 2nd Half" },
  ];
  const punchTypeOptions = [
    { value: "Check in", label: "Check-in" },
    { value: "Checkout", label: "Checkout" },
  ];
  const checkInReasons = ["Running late", "Forgot to punch", "System issue", "Client call / work started outside HRMS"];

  function clearScreenshot() {
    onUpdate("screenshotName", "");
    onUpdate("screenshotData", "");
    onUpdate("screenshotMimeType", "");
  }

  function attachScreenshot(file) {
    if (!file) {
      clearScreenshot();
      return;
    }
    if (!file.type.startsWith("image/")) {
      clearScreenshot();
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      clearScreenshot();
      window.alert("Screenshot must be smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate("screenshotName", file.name);
      onUpdate("screenshotMimeType", file.type || "image/png");
      onUpdate("screenshotData", String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Attendance update request">
        <div className="modal-head">
          <div>
            <h2>Request Attendance Update</h2>
            <p>{draft.employee} Â· {draft.date}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close attendance request"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <SelectField label="Request type" value={draft.requestType || "Forgot to punch"} onChange={(value) => {
            onUpdate("requestType", value);
            if (value === "Working from 2nd Half") {
              onUpdate("statusValue", "Half Day");
              onUpdate("punchType", "");
              onUpdate("checkIn", "14:00");
              onUpdate("checkOut", "");
              onUpdate("hours", "");
            } else {
              onUpdate("statusValue", "Present");
              onUpdate("punchType", draft.punchType || "Check in");
              onUpdate("reason", draft.reason || "Running late");
            }
          }} options={requestTypeOptions} />
          {isForgotPunch && (
            <SelectField label="Missed punch" value={draft.punchType || "Check in"} onChange={(value) => {
              onUpdate("punchType", value);
              if (value === "Check in") {
                onUpdate("checkIn", draft.checkIn || currentLocalTime());
                onUpdate("checkOut", "");
                onUpdate("hours", "");
                onUpdate("reason", draft.reason || "Running late");
              } else {
                onUpdate("checkOut", draft.checkOut || "18:30");
                onUpdate("reason", "Checkout");
              }
            }} options={punchTypeOptions} />
          )}
          <label className="field">
            <span>Date</span>
            <input type="date" min={minDate} max={maxDate} value={draft.date} onInput={(event) => onUpdate("date", event.target.value)} onChange={(event) => onUpdate("date", event.target.value)} />
          </label>
          <SelectField label="Correct status" value={draft.statusValue} onChange={(value) => onUpdate("statusValue", value)} options={["Present", "Half Day"]} />
          {(!isForgotPunch || draft.punchType === "Check in") && <Field label="Check in time" type="time" value={draft.checkIn} onChange={(value) => onUpdate("checkIn", value)} />}
          {(!isForgotPunch || draft.punchType === "Checkout") && <Field label="Checkout time" type="time" value={draft.checkOut} onChange={(value) => onUpdate("checkOut", value)} />}
          {!isForgotPunch && <Field label="Hours" value={draft.hours} onChange={(value) => onUpdate("hours", value)} />}
          {isForgotPunch && draft.punchType === "Check in" && <SelectField label="Reason" value={draft.reason || "Running late"} onChange={(value) => {
            onUpdate("reason", value);
            if (value !== "System issue") clearScreenshot();
          }} options={checkInReasons} />}
          {needsScreenshot && (
            <label className="field">
              <span>Issue screenshot *</span>
              <input type="file" accept="image/*" onChange={(event) => attachScreenshot(event.target.files?.[0])} />
              <small>{draft.screenshotName ? `Attached: ${draft.screenshotName}` : "Attach a screenshot of the login/attendance issue. Max size: 2 MB."}</small>
            </label>
          )}
          {!isForgotPunch && <Field label="Reason" value={draft.reason} onChange={(value) => onUpdate("reason", value)} required />}
        </div>
        <div className="modal-actions">
          <span className="form-note">{needsScreenshot && !draft.screenshotData ? "System issue requires a screenshot before submitting." : draft.requestType === "Working from 2nd Half" ? "This request is auto-approved and does not count toward the monthly limit." : "Missed / late punch requests are auto-approved and count toward the 5-request monthly limit."}</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!canSubmit} onClick={onSubmit}>Submit request</button>
        </div>
      </section>
    </div>
  );
}

function SaturdayRota({ role, profile, employees, rota, setRota, canManage }) {
  const rowsPerPage = 15;
  const [selectedMonth, setSelectedMonth] = useState(currentPayrollMonth());
  const [clientFilter, setClientFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [syncStatus, setSyncStatus] = useState("Loading rota...");
  const saturdays = saturdaysForMonth(selectedMonth);
  const hrgpEmployees = employees.filter((employee) => (employee.legalEntity || "HRGP") === "HRGP" && employee.status === "Active");
  const rotaEmployees = role === "employee"
    ? hrgpEmployees.filter((employee) => employee.name === profile.name)
    : hrgpEmployees;
  const clientOptions = Array.from(new Set(rotaEmployees.map((employee) => employee.client || "Unassigned"))).sort((a, b) => a.localeCompare(b));
  const visibleEmployees = clientFilter === "All"
    ? rotaEmployees
    : rotaEmployees.filter((employee) => (employee.client || "Unassigned") === clientFilter);
  const pageCount = Math.max(1, Math.ceil(visibleEmployees.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * rowsPerPage;
  const pagedEmployees = visibleEmployees.slice(pageStart, pageStart + rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth, role, profile.name, clientFilter]);

  useEffect(() => {
    if (clientFilter !== "All" && !clientOptions.includes(clientFilter)) setClientFilter("All");
  }, [clientFilter, clientOptions]);

  useEffect(() => {
    let cancelled = false;
    setSyncStatus("Loading rota...");
    fetch(`${API_BASE_URL}/api/saturday-rota?month=${selectedMonth}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load Saturday rota.");
        if (cancelled) return;
        setRota((current) => {
          const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${selectedMonth}:`)));
          (data.assignments || []).forEach((assignment) => {
            next[`${selectedMonth}:${assignment.employeeId}:${assignment.date}`] = Boolean(assignment.isWorking);
          });
          return next;
        });
        setSyncStatus("Database connected");
      })
      .catch((error) => {
        if (!cancelled) setSyncStatus(error.message === "Failed to fetch" ? "Using local rota" : error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, setRota]);

  function rotaKey(employeeId, date) {
    return `${selectedMonth}:${employeeId}:${date}`;
  }

  function isChecked(employeeId, date) {
    return Boolean(rota[rotaKey(employeeId, date)]);
  }

  function toggleRota(employeeId, date) {
    if (!canManage) return;
    setRota((current) => {
      const key = rotaKey(employeeId, date);
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
    setNotice("");
  }

  async function saveRota() {
    const assignments = saturdays.flatMap((date) => rotaEmployees
      .filter((employee) => isChecked(employee.employeeId, date))
      .map((employee) => ({ employeeCode: employee.employeeId, date, isWorking: true })));
    setNotice("");
    setSyncStatus("Saving rota...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/saturday-rota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month: selectedMonth, assignments }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Saturday rota could not be saved.");
      setRota((current) => {
        const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${selectedMonth}:`)));
        (data.assignments || []).forEach((assignment) => {
          next[`${selectedMonth}:${assignment.employeeId}:${assignment.date}`] = Boolean(assignment.isWorking);
        });
        return next;
      });
      setSyncStatus("Database connected");
      setNotice(`Saturday rota saved for ${monthName(selectedMonth)}.`);
    } catch (error) {
      window.localStorage.setItem(SATURDAY_ROTA_STORAGE_KEY, JSON.stringify(rota));
      setSyncStatus("Using local rota");
      setNotice(error.message === "Failed to fetch" ? "Backend is not reachable. Rota saved locally." : error.message);
    }
  }

  return (
    <div className="stack">
      <Panel title="Saturday Rota" meta={`${monthName(selectedMonth)} · ${visibleEmployees.length}${clientFilter === "All" ? "" : ` of ${rotaEmployees.length}`} active HRGP employee${visibleEmployees.length === 1 ? "" : "s"} · ${syncStatus}`}>
        <div className="toolbar attendance-toolbar">
          <label className="field compact-field">
            <span>Month</span>
            <input type="month" value={selectedMonth} onInput={(event) => setSelectedMonth(event.target.value)} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
          <label className="field compact-field">
            <span>Client</span>
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="All">All clients</option>
              {clientOptions.map((client) => <option key={client} value={client}>{client}</option>)}
            </select>
          </label>
          {canManage && <button className="primary-btn" onClick={saveRota}><CheckCircle2 size={17} /> Save rota</button>}
        </div>
        {notice && <div className="payroll-notice">{notice}</div>}
        {!saturdays.length ? (
          <div className="empty-state">No Saturdays found for this month.</div>
        ) : !visibleEmployees.length ? (
          <div className="empty-state">No active HRGP employees found for this client.</div>
        ) : (
          <>
            <DataTable
              columns={["Employee", ...saturdays.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }))]}
              rows={pagedEmployees.map((employee) => [
                <Person key={`${employee.employeeId}-person`} name={employee.name} detail={`${employee.employeeId} Â· ${employee.role}`} />,
                ...saturdays.map((date) => (
                  <label className="rota-check" key={`${employee.employeeId}-${date}`}>
                    <input
                      type="checkbox"
                      checked={isChecked(employee.employeeId, date)}
                      disabled={!canManage}
                      onChange={() => toggleRota(employee.employeeId, date)}
                      aria-label={`${employee.name} rota ${date}`}
                    />
                    <span>{isChecked(employee.employeeId, date) ? "Working" : "Off"}</span>
                  </label>
                )),
              ])}
            />
            <div className="pager">
              <span>{pageStart + 1}-{pageStart + pagedEmployees.length} of {visibleEmployees.length}</span>
              <div className="pager-actions">
                <button className="secondary-btn" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                <strong>{currentPage} / {pageCount}</strong>
                <button className="secondary-btn" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function Leave({ role, profile, employees, leaveRecords, setLeaveRecords, leaveSettings, setLeaveSettings, holidays, setHolidays, attendanceRecords, canApprove, syncStatus }) {
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [leaveError, setLeaveError] = useState("");
  const canManageHolidays = role === "admin" || role === "hr";
  const canOverrideAttendanceConflict = role === "admin" || role === "hr";
  const leaveDbConnected = syncStatus === "Database connected";
  const scopedEmployees = employees.filter((employee) => {
    if (role === "employee") return employee.name === profile.name;
    if (role === "manager") return employee.name === profile.name || employee.manager === profile.name;
    return true;
  });
  const [draft, setDraft] = useState({
    employeeId: scopedEmployees[0]?.employeeId || "",
    type: "Casual Leave",
    duration: "Full Day",
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    reason: casualLeaveReasons[0],
  });

  useEffect(() => {
    if (!scopedEmployees.some((employee) => employee.employeeId === draft.employeeId)) {
      setDraft((current) => ({ ...current, employeeId: scopedEmployees[0]?.employeeId || "" }));
    }
  }, [draft.employeeId, scopedEmployees]);

  const scopedEmployeeIds = new Set(scopedEmployees.map((employee) => employee.employeeId));
  const scopedRequests = leaveRecords.filter((request) => scopedEmployeeIds.has(request.employeeId));
  const filteredRequests = scopedRequests.filter((request) => {
    const statusMatches = statusFilter === "All" || request.status === statusFilter;
    const typeMatches = typeFilter === "All" || request.type === typeFilter;
    return statusMatches && typeMatches;
  });
  const requestedDays = requestedLeaveDays(draft);
  const selectedEmployee = scopedEmployees.find((employee) => employee.employeeId === draft.employeeId);
  const selectedBalances = leaveBalanceRows(draft.employeeId, leaveRecords, leaveSettings, selectedEmployee, attendanceRecords);
  const selectedTypeBalance = selectedBalances.find((balance) => balance.type === draft.type);
  const isBalanceTracked = !["Work From Home", "Unpaid Leave"].includes(draft.type);
  const exceedsBalance = isBalanceTracked && requestedDays > Number(selectedTypeBalance?.available || 0);
  const hasReason = draft.type !== "Casual Leave" || Boolean(draft.reason);
  const balanceMessage = exceedsBalance
    ? draft.type === "Compensatory Off"
      ? "Compensatory off cannot be applied because no balance is available."
      : `Only ${selectedTypeBalance?.available || 0} ${draft.type} day${Number(selectedTypeBalance?.available || 0) === 1 ? "" : "s"} available.`
    : "";
  const requestedToDate = draft.duration === "Half Day" ? draft.fromDate : draft.toDate;
  const duplicateLeaveRequest = leaveRecords.find((request) => (
    request.employeeId === draft.employeeId &&
    request.type === draft.type &&
    request.status !== "Rejected" &&
    request.fromDate <= requestedToDate &&
    request.toDate >= draft.fromDate
  ));
  const duplicateLeaveMessage = duplicateLeaveRequest ? `A ${draft.type} request already exists for this date.` : "";
  const canSubmit = draft.employeeId && draft.type && requestedDays > 0 && hasReason && !exceedsBalance && !duplicateLeaveRequest;

  function updateDraft(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "type") {
        next.reason = value === "Casual Leave" ? casualLeaveReasons[0] : "";
      }
      if (field === "duration" && value === "Half Day") {
        next.toDate = next.fromDate;
      }
      if (field === "fromDate" && current.duration === "Half Day") {
        next.toDate = value;
      }
      return next;
    });
  }

  function addCompOff(employeeId, days) {
    const numericDays = Math.max(0, Number(days || 0));
    setLeaveSettings((current) => ({
      ...current,
      compOffBalances: {
        ...(current.compOffBalances || {}),
        [employeeId]: numericDays,
      },
    }));
  }

  function saveLeaveBalances(nextBalances) {
    setLeaveSettings((current) => ({
      ...current,
      casualLeaveBalances: {
        ...(current.casualLeaveBalances || {}),
        ...(nextBalances.casualLeaveBalances || {}),
      },
      compOffBalances: {
        ...(current.compOffBalances || {}),
        ...(nextBalances.compOffBalances || {}),
      },
    }));
  }

  async function submitLeave() {
    if (!leaveDbConnected) {
      setLeaveError("Database not connected; leave cannot be applied.");
      return;
    }
    if (!canSubmit) {
      if (exceedsBalance) setLeaveError(balanceMessage);
      else if (duplicateLeaveRequest) setLeaveError(duplicateLeaveMessage);
      return;
    }
    const employee = scopedEmployees.find((item) => item.employeeId === draft.employeeId);
    const nextRequest = {
      id: `LR-${Date.now().toString().slice(-6)}`,
      employeeId: draft.employeeId,
      employee: employee?.name || "Employee",
      type: draft.type,
      fromDate: draft.fromDate,
      toDate: draft.duration === "Half Day" ? draft.fromDate : draft.toDate,
      days: requestedDays,
      reason: draft.reason,
      status: "Pending",
      approver: employee?.manager || "HR",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setLeaveError("");
    try {
      const saveRequest = async (overrideAttendanceConflict = false) => fetch(`${API_BASE_URL}/api/leave`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(leaveToApi({ ...nextRequest, overrideAttendanceConflict })),
      });
      let response = await saveRequest(false);
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status === 409 && canOverrideAttendanceConflict && window.confirm(`${data.error?.message || "Attendance already exists for this date."}\n\nCreate this leave anyway with admin override?`)) {
        response = await saveRequest(true);
        const overrideData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(overrideData.error?.message || "Leave request could not be submitted.");
        setLeaveRecords((current) => [overrideData.leaveRequest, ...current]);
        setShowApplyForm(false);
        return;
      }
      if (!response.ok) throw new Error(data.error?.message || "Leave request could not be submitted.");
      setLeaveRecords((current) => [data.leaveRequest, ...current]);
      setShowApplyForm(false);
    } catch (error) {
      if (error.message === "Failed to fetch") {
        setLeaveError("Database not connected; leave cannot be applied.");
      } else {
        setLeaveError(error.message);
      }
    }
  }

  async function updateStatus(id, status) {
    if (!leaveDbConnected) {
      setLeaveError("Database not connected; leave request cannot be updated.");
      return;
    }
    setLeaveError("");
    try {
      const saveStatus = async (overrideAttendanceConflict = false) => fetch(`${API_BASE_URL}/api/leave/${id}/${status === "Approved" ? "approve" : "reject"}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ overrideAttendanceConflict }),
      });
      let response = await saveStatus(false);
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status === 409 && status === "Approved" && canOverrideAttendanceConflict && window.confirm(`${data.error?.message || "Attendance already exists for this date."}\n\nApprove this leave anyway with admin override?`)) {
        response = await saveStatus(true);
        const overrideData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(overrideData.error?.message || "Leave request could not be updated.");
        setLeaveRecords((current) => current.map((request) => request.id === id ? overrideData.leaveRequest : request));
        return;
      }
      if (!response.ok) throw new Error(data.error?.message || "Leave request could not be updated.");
      setLeaveRecords((current) => current.map((request) => request.id === id ? data.leaveRequest : request));
    } catch (error) {
      setLeaveError(error.message === "Failed to fetch" ? "Backend server is not running. Leave approval was not saved." : error.message);
    }
  }

  async function cancelLeave(id) {
    if (!leaveDbConnected) {
      setLeaveError("Database not connected; leave request cannot be cancelled.");
      return;
    }
    setLeaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/leave/${id}/cancel`, {
        method: "PATCH",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Leave request could not be cancelled.");
      setLeaveRecords((current) => current.map((request) => request.id === id ? data.leaveRequest : request));
    } catch (error) {
      setLeaveError(error.message === "Failed to fetch" ? "Backend server is not running. Leave cancellation was not saved." : error.message);
    }
  }

  async function createHoliday(draft) {
    if (!leaveDbConnected) {
      setLeaveError("Database not connected; holiday cannot be saved.");
      return;
    }
    const nextHoliday = {
      id: `HOL-${Date.now().toString().slice(-6)}`,
      date: draft.date,
      name: draft.name,
      type: draft.type || "National",
      legalEntity: draft.legalEntity || "HRGP",
      location: draft.location || "India",
      isActive: true,
    };
    setLeaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/leave/holidays`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(nextHoliday),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Holiday could not be saved.");
      setHolidays((current) => [data.holiday, ...current.filter((holiday) => holiday.id !== data.holiday.id)]);
    } catch (error) {
      setLeaveError(error.message === "Failed to fetch" ? "Database not connected; holiday cannot be saved." : error.message);
    }
  }

  async function archiveHoliday(id) {
    if (!leaveDbConnected) {
      setLeaveError("Database not connected; holiday cannot be archived.");
      return;
    }
    setLeaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/leave/holidays/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Holiday could not be archived.");
      setHolidays((current) => current.filter((holiday) => holiday.id !== data.holiday?.id));
    } catch (error) {
      setLeaveError(error.message === "Failed to fetch" ? "Database not connected; holiday cannot be archived." : error.message);
    }
  }

  return (
    <div className="stack">
      <div className="leave-layout full">
        <Panel title={role === "employee" ? "My Leave" : role === "manager" ? "Team Leave" : "Leave Requests"} meta={`${filteredRequests.length} shown Â· ${syncStatus}`}>
          {!leaveDbConnected && <div className="form-error attendance-error">Database not connected; leave cannot be applied.</div>}
          {leaveError && <div className="form-error attendance-error">{leaveError}</div>}
          {showApplyForm && duplicateLeaveMessage && <div className="form-error attendance-error">{duplicateLeaveMessage}</div>}
          <div className="toolbar">
            <button className="primary-btn" disabled={!leaveDbConnected} onClick={() => setShowApplyForm(true)}><CalendarCheck size={17} /> Apply leave</button>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Leave status filter">
              <option>All</option>
              <option>Pending</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Leave type filter">
              <option>All</option>
              {leaveTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <button className="secondary-btn" onClick={() => setPolicyOpen(true)}><FileText size={17} /> Policy</button>
            {canApprove && <button className="secondary-btn" disabled={!leaveDbConnected} onClick={() => setSettingsOpen(true)}><Settings size={17} /> Leave settings</button>}
          </div>

          {role === "employee" && <LeaveBalancePanel employee={selectedEmployee} balances={selectedBalances} compact />}
          <NationalHolidayCalendar holidays={holidays} canManage={canManageHolidays && leaveDbConnected} onCreate={createHoliday} onArchive={archiveHoliday} />

          <div className="leave-card-grid">
            {filteredRequests.length ? filteredRequests.map((request) => (
              <article className="leave-card" key={request.id}>
                <div className="leave-card-head">
                  <Person name={request.employee} detail={`${request.employeeId} Â· ${request.type}`} />
                  <Badge tone={request.status === "Approved" ? "green" : request.status === "Rejected" ? "red" : "amber"}>{request.status}</Badge>
                </div>
                <div className="leave-card-meta">
                  <span>{formatDateRange(request.fromDate, request.toDate)}</span>
                  <span>{request.days} day{Number(request.days) === 1 ? "" : "s"}</span>
                  <span>Approver: {request.approver}</span>
                  <span>Reason: {request.reason || "-"}</span>
                </div>
                {canApprove && (
                  <div className="leave-card-actions">
                    <button className="secondary-btn" disabled={!leaveDbConnected || request.status !== "Pending"} onClick={() => updateStatus(request.id, "Approved")}>Approve</button>
                    <button className="secondary-btn" disabled={!leaveDbConnected || request.status !== "Pending"} onClick={() => updateStatus(request.id, "Rejected")}>Reject</button>
                  </div>
                )}
                {request.status === "Pending" && (
                  <div className="leave-card-actions">
                    <button className="secondary-btn" disabled={!leaveDbConnected} onClick={() => cancelLeave(request.id)}>Cancel request</button>
                  </div>
                )}
              </article>
            )) : <div className="empty-state">No leave requests found.</div>}
          </div>
        </Panel>
      </div>

      {showApplyForm && (
        <LeaveApplyModal
          role={role}
          draft={draft}
          scopedEmployees={scopedEmployees}
          requestedDays={requestedDays}
          exceedsBalance={exceedsBalance}
          balanceMessage={balanceMessage}
          duplicateLeaveMessage={duplicateLeaveMessage}
          selectedTypeBalance={selectedTypeBalance}
          canSubmit={canSubmit}
          onUpdate={updateDraft}
          onClose={() => setShowApplyForm(false)}
          onSubmit={submitLeave}
        />
      )}

      {policyOpen && <LeavePolicyModal leaveSettings={leaveSettings} onClose={() => setPolicyOpen(false)} />}
      {settingsOpen && <LeaveSettingsModal employees={employees} leaveRecords={leaveRecords} attendanceRecords={attendanceRecords} leaveSettings={leaveSettings} onSave={saveLeaveBalances} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function LeavePolicyModal({ leaveSettings, onClose }) {
  const { start, end } = leaveYearRange();
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card policy-modal" role="dialog" aria-modal="true" aria-label="Leave policy">
        <div className="modal-head">
          <div>
            <h2>Leave Policy</h2>
            <p>Leave year: {start} to {end}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close leave policy"><X size={18} /></button>
        </div>

        <div className="policy-grid">
          {[
            ["Casual Leave", "1 Casual Leave is credited on the 1st of each month. Employees can apply Casual Leave only when the available balance is enough."],
            ["Compensatory Off", "Admin/HR can add balance. Employees can apply only if balance is available."],
            ["National Holidays", "Admin/HR can maintain the holiday calendar. Employees can view statutory holidays and office closures from the leave module."],
            ["Work From Home", "Tracked separately and does not reduce casual leave."],
            ["Unpaid Leave", "Allowed without a fixed balance."],
          ].map(([type, description]) => (
            <div className="feature" key={type}>
              <FileText size={18} />
              <h3>{type}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <span className="form-note">Employees cannot apply Casual Leave if available quota is not enough. Approved leave locks matching attendance rows.</span>
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function LeaveApplyModal({ role, draft, scopedEmployees, requestedDays, exceedsBalance, balanceMessage, duplicateLeaveMessage, selectedTypeBalance, canSubmit, onUpdate, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Apply leave">
        <div className="modal-head">
          <div>
            <h2>Apply Leave</h2>
            <p>{duplicateLeaveMessage || (exceedsBalance ? balanceMessage || `Only ${selectedTypeBalance?.available || 0} available` : `${requestedDays || 0} day${requestedDays === 1 ? "" : "s"}`)}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close apply leave"><X size={18} /></button>
        </div>

        <div className="form-grid">
          {role !== "employee" && <SelectField label="Employee" value={draft.employeeId} onChange={(value) => onUpdate("employeeId", value)} options={scopedEmployees.map((employee) => employee.employeeId)} />}
          <SelectField label="Leave type" value={draft.type} onChange={(value) => onUpdate("type", value)} options={leaveTypes} />
          <SelectField label="Duration" value={draft.duration || "Full Day"} onChange={(value) => onUpdate("duration", value)} options={["Full Day", "Half Day"]} />
          <Field label="From date" type="date" value={draft.fromDate} onChange={(value) => onUpdate("fromDate", value)} />
          <Field label="To date" type="date" value={draft.duration === "Half Day" ? draft.fromDate : draft.toDate} onChange={(value) => onUpdate("toDate", value)} disabled={draft.duration === "Half Day"} />
          {draft.type === "Casual Leave" ? (
            <SelectField label="Casual leave reason" value={draft.reason} onChange={(value) => onUpdate("reason", value)} options={casualLeaveReasons} />
          ) : (
            <Field label="Reason" value={draft.reason} onChange={(value) => onUpdate("reason", value)} />
          )}
        </div>

        <div className="modal-actions">
          <span className={exceedsBalance || duplicateLeaveMessage ? "form-error" : "form-note"}>{duplicateLeaveMessage || (exceedsBalance ? balanceMessage : "Request will be sent for approval.")}</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!canSubmit} onClick={onSubmit}>Submit</button>
        </div>
      </section>
    </div>
  );
}

function LeaveSettingsModal({ employees, leaveRecords, attendanceRecords, leaveSettings, onSave, onClose }) {
  const activeEmployees = employees.filter(isActiveEmployee);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [draftBalances, setDraftBalances] = useState(() => {
    const casualLeaveBalances = {};
    const compOffBalances = {};
    activeEmployees.forEach((employee) => {
      const balances = leaveBalanceRows(employee.employeeId, leaveRecords, leaveSettings, employee, attendanceRecords);
      const casual = balances.find((balance) => balance.type === "Casual Leave");
      casualLeaveBalances[employee.employeeId] = leaveBalanceValue(leaveSettings.casualLeaveBalances?.[employee.employeeId], casual?.available ?? 0);
      compOffBalances[employee.employeeId] = leaveBalanceValue(leaveSettings.compOffBalances?.[employee.employeeId]);
    });
    return { casualLeaveBalances, compOffBalances };
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveError("");
    fetch(`${API_BASE_URL}/api/leave/balances`, {
      headers: authHeaders(),
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Leave balances could not be loaded.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const casualLeaveBalances = {};
        const compOffBalances = {};
        (data.balances || []).forEach((row) => {
          casualLeaveBalances[row.employeeCode] = Number(row.casualLeaveBalance || 0);
          compOffBalances[row.employeeCode] = Number(row.compOffBalance || 0);
        });
        setDraftBalances({ casualLeaveBalances, compOffBalances });
      })
      .catch((error) => {
        if (!cancelled) setSaveError(error.message === "Failed to fetch" ? "Backend is not reachable. Showing local balances." : error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateBalance(employeeId, bucket, value) {
    const numericValue = bucket === "casualLeaveBalances" ? Number(value || 0) : Math.max(0, Number(value || 0));
    setDraftBalances((current) => ({
      ...current,
      [bucket]: {
        ...(current[bucket] || {}),
        [employeeId]: numericValue,
      },
    }));
  }

  const balanceRows = activeEmployees.map((employee) => {
    const projectedSettings = {
      ...leaveSettings,
      casualLeaveBalances: {
        ...(leaveSettings.casualLeaveBalances || {}),
        ...(draftBalances.casualLeaveBalances || {}),
      },
      compOffBalances: {
        ...(leaveSettings.compOffBalances || {}),
        ...(draftBalances.compOffBalances || {}),
      },
    };
    const balances = leaveBalanceRows(employee.employeeId, leaveRecords, projectedSettings, employee, attendanceRecords);
    const casual = balances.find((balance) => balance.type === "Casual Leave") || {};
    const compOff = balances.find((balance) => balance.type === "Compensatory Off") || {};
    return { employee, casual, compOff };
  });

  async function saveBalances() {
    setSaveError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/leave/balances`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          balances: activeEmployees.map((employee) => ({
            employeeCode: employee.employeeId,
            casualLeaveBalance: draftBalances.casualLeaveBalances?.[employee.employeeId] ?? 0,
            compOffBalance: draftBalances.compOffBalances?.[employee.employeeId] ?? 0,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Leave balances could not be saved.");
      onSave(draftBalances);
      onClose();
    } catch (error) {
      setSaveError(error.message === "Failed to fetch" ? "Backend is not reachable. Leave balances were not saved." : error.message);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-label="Leave settings">
        <div className="modal-head">
          <div>
            <h2>Employee Leave Balances</h2>
            <p>Edit available leave balances for active employees.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close leave settings"><X size={18} /></button>
        </div>
        {saveError && <div className="form-error attendance-error">{saveError}</div>}
        {loading && <div className="empty-state">Loading leave balances...</div>}
        <DataTable
          columns={["Employee", "Client", "Casual Balance", "Used", "Pending", "Comp Off Balance"]}
          rows={balanceRows.map(({ employee, casual, compOff }) => [
            <Person key={`${employee.employeeId}-leave-balance`} name={employee.name} detail={`${employee.employeeId} · ${employee.role}`} />,
            employee.client || "-",
            <input className="table-input small" type="number" min="-12" step="0.5" value={draftBalances.casualLeaveBalances?.[employee.employeeId] ?? 0} onInput={(event) => updateBalance(employee.employeeId, "casualLeaveBalances", event.target.value)} onChange={(event) => updateBalance(employee.employeeId, "casualLeaveBalances", event.target.value)} />,
            casual.used || 0,
            casual.pending || 0,
            <input className="table-input small" type="number" min="0" step="0.5" value={draftBalances.compOffBalances?.[employee.employeeId] ?? 0} onInput={(event) => updateBalance(employee.employeeId, "compOffBalances", event.target.value)} onChange={(event) => updateBalance(employee.employeeId, "compOffBalances", event.target.value)} />,
          ])}
        />
        <div className="modal-actions">
          <span className="form-note">Casual Balance is the currently available balance. Used and pending leaves are shown for reference.</span>
          <button className="secondary-btn" onClick={onClose}>Close</button>
          <button className="primary-btn" onClick={saveBalances}>Save balances</button>
        </div>
      </section>
    </div>
  );
}

function LeaveBalancePanel({ employee, balances, compact = false }) {
  const displayBalances = balances;
  const content = (
    <>
      <div className="balance-head">
        <Person name={employee?.name || "Employee"} detail={employee?.role || "Select employee in form"} />
      </div>
      <div className="balance-list">
        {displayBalances.map((balance) => (
          <div className="balance-row" key={balance.type}>
            <div>
              <strong>{balance.type}</strong>
              <span>{balance.used} used Â· {balance.pending} pending{balance.carryForward ? ` Â· ${balance.carryForward} carried` : ""}</span>
            </div>
            <Badge tone={balance.available > 5 ? "green" : balance.available > 0 ? "amber" : "red"}>{balance.type === "Unpaid Leave" ? "Open" : `${balance.available}/${balance.entitlement}`}</Badge>
          </div>
        ))}
      </div>
    </>
  );

  if (compact) return <div className="leave-balance-card">{content}</div>;

  return (
    <Panel title="Leave Balance" meta={employee?.employeeId || "Employee"}>
      {content}
    </Panel>
  );
}

function NationalHolidayCalendar({ holidays, canManage, onCreate, onArchive }) {
  const [draft, setDraft] = useState({
    date: new Date().toISOString().slice(0, 10),
    name: "",
    type: "National",
    legalEntity: "HRGP",
    location: "India",
  });
  const activeHolidays = useMemo(() => {
    return (holidays || [])
      .filter((holiday) => holiday.isActive !== false)
      .slice()
      .sort((first, second) => first.date.localeCompare(second.date));
  }, [holidays]);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = activeHolidays.filter((holiday) => holiday.date >= today);
  const shownHolidays = upcomingHolidays.length ? upcomingHolidays.slice(0, 6) : activeHolidays.slice(-6);
  const nextHoliday = upcomingHolidays[0];

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submitHoliday() {
    if (!draft.date || !draft.name.trim()) return;
    onCreate({ ...draft, name: draft.name.trim() });
    setDraft((current) => ({ ...current, name: "" }));
  }

  return (
    <section className="national-holiday-card holiday-calendar-card" aria-label="National holidays calendar">
      <div className="holiday-calendar-head">
        <div>
          <strong>National Holidays Calendar</strong>
          <span>{nextHoliday ? `Next: ${nextHoliday.name} on ${nextHoliday.date}` : "No upcoming holidays configured for this year."}</span>
        </div>
        <Badge tone="blue">{activeHolidays.length} active</Badge>
      </div>

      {canManage && (
        <div className="holiday-form">
          <label className="field">
            <span>Date</span>
            <input type="date" value={draft.date} onInput={(event) => updateDraft("date", event.target.value)} onChange={(event) => updateDraft("date", event.target.value)} />
          </label>
          <label className="field">
            <span>Holiday name</span>
            <input value={draft.name} placeholder="e.g. Diwali" onInput={(event) => updateDraft("name", event.target.value)} onChange={(event) => updateDraft("name", event.target.value)} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={draft.type} onChange={(event) => updateDraft("type", event.target.value)}>
              <option>National</option>
              <option>Festival</option>
              <option>Regional</option>
              <option>Company</option>
            </select>
          </label>
          <button className="primary-btn" disabled={!draft.date || !draft.name.trim()} onClick={submitHoliday}><CalendarCheck size={17} /> Add holiday</button>
        </div>
      )}

      <div className="holiday-list">
        {shownHolidays.length ? shownHolidays.map((holiday) => (
          <div className="holiday-row" key={holiday.id}>
            <div className="holiday-date">
              <strong>{new Date(`${holiday.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit" })}</strong>
              <span>{new Date(`${holiday.date}T00:00:00`).toLocaleDateString("en-IN", { month: "short" })}</span>
            </div>
            <div>
              <strong>{holiday.name}</strong>
              <span>{holiday.type || "National"}{holiday.location ? ` Â· ${holiday.location}` : ""}</span>
            </div>
            {canManage && (
              <button className="mini-btn" onClick={() => onArchive(holiday.id)} aria-label={`Archive ${holiday.name}`}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )) : (
          <div className="empty-state">No holidays configured yet.</div>
        )}
      </div>
    </section>
  );
}

function Payroll({ role, profile, employees, leaveRecords, attendanceRecords, payrollStatus, setPayrollStatus, payrollCycles, setPayrollCycles, canManage }) {
  const [selectedMonth, setSelectedMonth] = useState(() => (role === "employee" || role === "manager") ? previousPayrollMonth() : currentPayrollMonth());
  const [selectedEntity, setSelectedEntity] = useState("All");
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [bulkPayslipsOpen, setBulkPayslipsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [payrollNotice, setPayrollNotice] = useState("");
  const entityOptions = ["All", ...Array.from(new Set(employees.map((employee) => employee.legalEntity || "HRGP"))).sort()];
  const cycleKey = `${selectedMonth}:${selectedEntity}`;
  const currentCycle = selectedEntity === "All" ? null : payrollCycles[cycleKey];
  const cycleFinalized = currentCycle?.finalized;
  const scopedEmployees = employees.filter((employee) => {
    if (role === "employee" || role === "manager") return employee.name === profile.name;
    return selectedEntity === "All" || (employee.legalEntity || "HRGP") === selectedEntity;
  });
  const payrollRows = scopedEmployees.map((employee) => payrollForEmployee(employee, selectedMonth, attendanceRecords, leaveRecords, payrollStatus));

  useEffect(() => {
    if (selectedEntity === "All") return;
    fetch(`${API_BASE_URL}/api/payroll?month=${selectedMonth}&legalEntity=${selectedEntity}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load payroll cycle.");
        return data;
      })
      .then((data) => {
        setPayrollCycles((current) => {
          const next = { ...current };
          (data.cycles || []).forEach((cycle) => {
            next[cycle.key] = cycle;
          });
          return next;
        });
      })
      .catch(() => {});
  }, [selectedEntity, selectedMonth, setPayrollCycles]);

  async function persistPayrollRows(rows) {
    if (cycleFinalized) throw new Error("Payroll is finalized. Reopen it before making changes.");
    const byEntity = rows.reduce((groups, row) => {
      const entity = row.employee.legalEntity || "HRGP";
      if (!groups[entity]) groups[entity] = [];
      groups[entity].push(row);
      return groups;
    }, {});

    const savedGroups = await Promise.all(Object.entries(byEntity).map(async ([legalEntity, entityRows]) => {
      const response = await fetch(`${API_BASE_URL}/api/payroll/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          month: selectedMonth,
          legalEntity,
          rows: entityRows.map((row) => ({
            employeeId: row.employee.id,
            employeeCode: row.employee.employeeId,
            workDays: row.workDays,
            presentDays: row.presentDays,
            paidLeaveDays: row.paidLeaveDays,
            absentDays: row.absentDays,
            grossPay: row.monthlySalary,
            deductions: row.deductions,
            netPay: row.netPay,
            status: row.status,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Payroll sync failed.");
      return data.payslips || [];
    }));

    const savedPayslips = savedGroups.flat();
    setPayrollStatus((current) => {
      const next = { ...current };
      savedPayslips.forEach((payslip) => {
        next[payslip.key] = payslip.status;
        next[`${payslip.key}:id`] = payslip.id;
      });
      return next;
    });
    return savedPayslips;
  }

  async function savedPayslipIdFor(row) {
    if (payrollStatus[`${row.key}:id`]) return payrollStatus[`${row.key}:id`];
    const savedPayslips = await persistPayrollRows([row]);
    return savedPayslips.find((payslip) => payslip.key === row.key)?.id;
  }

  async function sendPayslipEmail(row) {
    try {
      setPayrollNotice("Preparing salary slip email...");
      const googleAccessToken = await requestGoogleMailAccessToken();
      const payslipId = await savedPayslipIdFor(row);
      if (!payslipId) throw new Error("Salary slip was not saved.");
      const response = await fetch(`${API_BASE_URL}/api/payroll/${payslipId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ googleAccessToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Email could not be queued.");
      setPayrollNotice(data.message || "Salary slip email queued.");
    } catch (error) {
      setPayrollNotice(error.message || "Email could not be queued.");
    }
  }

  async function sendAllPayslipEmails() {
    try {
      setPayrollNotice("Preparing all salary slip emails...");
      const googleAccessToken = await requestGoogleMailAccessToken();
      const savedPayslips = cycleFinalized ? [] : await persistPayrollRows(payrollRows);
      const payslipIds = cycleFinalized
        ? payrollRows.map((row) => payrollStatus[`${row.key}:id`]).filter(Boolean)
        : savedPayslips.map((payslip) => payslip.id).filter(Boolean);
      if (!payslipIds.length) throw new Error("No salary slips are available to email.");
      const response = await fetch(`${API_BASE_URL}/api/payroll/email-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payslipIds, googleAccessToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Salary slip emails could not be queued.");
      setPayrollNotice(data.message || "Salary slip emails queued.");
    } catch (error) {
      setPayrollNotice(error.message || "Salary slip emails could not be queued.");
    }
  }

  function updatePayrollStatus(key, status) {
    if (cycleFinalized) {
      setPayrollNotice("Payroll is finalized. Reopen it before changing status.");
      return;
    }
    setPayrollStatus((current) => ({ ...current, [key]: status }));
    const row = payrollRows.find((item) => item.key === key);
    const payslipId = payrollStatus[`${key}:id`];
    if (payslipId) {
      fetch(`${API_BASE_URL}/api/payroll/${payslipId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      }).catch(() => {});
    } else if (row) {
      persistPayrollRows([{ ...row, status }]).catch(() => {});
    }
  }

  const reviewRows = payrollRows.map((row) => {
    const issues = [];
    if (!row.monthlySalary) issues.push("Monthly salary missing");
    if (!row.employee.bankAccount) issues.push("Bank account missing");
    if (row.absentDays > 0) issues.push(`${row.absentDays} unpaid/absent day${row.absentDays === 1 ? "" : "s"} deducted`);
    if (row.leaveConflicts?.length) issues.push(`Attendance/leave conflict on ${row.leaveConflicts.join("; ")}`);
    if (row.status === "Paid") issues.push("Already marked paid");
    return { ...row, issues, reviewStatus: issues.length ? "Needs review" : "Clean" };
  });
  const cleanReviewRows = reviewRows.filter((row) => row.reviewStatus === "Clean");
  const issueReviewRows = reviewRows.filter((row) => row.reviewStatus !== "Clean");

  function markCleanRowsReviewed() {
    if (cycleFinalized) {
      setPayrollNotice("Payroll is finalized. Reopen it before reviewing calculations.");
      setReviewOpen(false);
      return;
    }
    setPayrollStatus((current) => {
      const next = { ...current };
      cleanReviewRows.forEach((row) => {
        if (!["Approved", "Paid"].includes(row.status)) next[row.key] = "Reviewed";
      });
      return next;
    });
    persistPayrollRows(cleanReviewRows.map((row) => ["Approved", "Paid"].includes(row.status) ? row : { ...row, status: "Reviewed" })).catch(() => {});
    setReviewOpen(false);
  }

  function exportPayroll() {
    const entitySlug = selectedEntity === "All" ? "all-entities" : selectedEntity.toLowerCase();
    downloadCsv(`hrguru-payroll-${entitySlug}-${selectedMonth}.csv`, payrollRowsToCsv(selectedMonth, payrollRows));
  }

  async function updateCycleFinalization(action) {
    if (selectedEntity === "All") {
      setPayrollNotice("Select HRGP or Taggd before finalizing payroll.");
      return;
    }
    try {
      setPayrollNotice(action === "finalize" ? "Finalizing payroll..." : "Reopening payroll...");
      if (action === "finalize") await persistPayrollRows(payrollRows);
      const response = await fetch(`${API_BASE_URL}/api/payroll/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month: selectedMonth, legalEntity: selectedEntity }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Payroll cycle could not be updated.");
      setPayrollCycles((current) => ({ ...current, [data.cycle.key]: data.cycle }));
      setPayrollNotice(data.message || "Payroll cycle updated.");
    } catch (error) {
      setPayrollNotice(error.message || "Payroll cycle could not be updated.");
    }
  }

  if (role === "employee" || role === "manager") {
    const payslip = payrollRows[0];
    return (
      <div className="stack">
        <Panel title="My Payslip" meta={selectedMonth}>
          <div className="toolbar">
            <label className="field compact-field">
              <span>Payroll month</span>
              <input type="month" value={selectedMonth} onInput={(event) => setSelectedMonth(event.target.value)} onChange={(event) => setSelectedMonth(event.target.value)} />
            </label>
            <label className="field compact-field">
              <span>Entity</span>
              <select value={selectedEntity} onChange={(event) => setSelectedEntity(event.target.value)} aria-label="Payroll entity">
                {entityOptions.map((entity) => <option key={entity}>{entity}</option>)}
              </select>
            </label>
          </div>
          {payrollNotice && <div className="payroll-notice">{payrollNotice}</div>}

          {payslip ? (
            <div className="payslip-card">
              <div className="payslip-card-head">
                <Person name={payslip.employee.name} detail={`${payslip.employee.employeeId} Â· ${payslip.employee.legalEntity || "HRGP"} Â· ${payslip.employee.dept}`} />
                <Badge tone={payslip.status === "Paid" ? "green" : payslip.status === "Approved" ? "blue" : "amber"}>{payslip.status}</Badge>
              </div>
              <div className="payslip-card-grid">
                <Info label="Work days" value={payslip.applicableDays || payslip.workDays} />
                <Info label="Paid days" value={payslip.paidDays} />
                <Info label="Present days" value={payslip.presentDays} />
                <Info label="Unpaid / absent days" value={payslip.absentDays} />
              </div>
              {payslip.leaveConflicts?.length > 0 && (
                <div className="form-error attendance-error">Attendance/leave conflict: {payslip.leaveConflicts.join("; ")}</div>
              )}
              <div className="payslip-money">
                <div>
                  <h3>Earnings</h3>
                  <div className="money-row"><span>Monthly gross salary</span><strong>INR {payslip.monthlySalary.toLocaleString("en-IN")}</strong></div>
                </div>
                <div>
                  <h3>Deductions</h3>
                  <div className="money-row"><span>Unpaid leave / absent deduction</span><strong>INR {payslip.deductions.toLocaleString("en-IN")}</strong></div>
                </div>
              </div>
              <div className="net-pay">
                <span>Net payable</span>
                <strong>INR {payslip.netPay.toLocaleString("en-IN")}</strong>
              </div>
              <div className="row-actions">
                <button className="secondary-btn payslip-card-action" onClick={() => setSelectedPayslip(payslip)}><FileText size={17} /> View payslip</button>
                <button className="secondary-btn payslip-card-action" onClick={() => sendPayslipEmail(payslip)}><Mail size={17} /> Email payslip</button>
              </div>
            </div>
          ) : (
            <div className="empty-state">Payslip is not available for this month.</div>
          )}
        </Panel>

        {selectedPayslip && (
          <PayslipModal payroll={selectedPayslip} month={selectedMonth} onClose={() => setSelectedPayslip(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <Panel title="Payroll Cycle" meta={`${selectedEntity} Â· ${selectedMonth}`}>
        <div className="toolbar">
          <label className="field compact-field">
            <span>Payroll month</span>
            <input type="month" value={selectedMonth} onInput={(event) => setSelectedMonth(event.target.value)} onChange={(event) => setSelectedMonth(event.target.value)} />
          </label>
          <label className="field compact-field">
            <span>Entity</span>
            <select value={selectedEntity} onChange={(event) => setSelectedEntity(event.target.value)} aria-label="Payroll entity">
              {entityOptions.map((entity) => <option key={entity}>{entity}</option>)}
            </select>
          </label>
          {selectedEntity !== "All" && <Badge tone={cycleFinalized ? "green" : currentCycle?.status === "Reviewed" ? "blue" : "amber"}>{cycleFinalized ? "Finalized" : currentCycle?.status || "Draft cycle"}</Badge>}
          {canManage && <button className="secondary-btn" onClick={() => setReviewOpen(true)}><ShieldCheck size={17} /> Review calculations</button>}
          <button className="secondary-btn" disabled={!payrollRows.length} onClick={() => setSelectedPayslip(payrollRows[0])}><FileText size={17} /> Payslip preview</button>
          {canManage && <button className="secondary-btn" disabled={!payrollRows.length} onClick={() => { if (!cycleFinalized) persistPayrollRows(payrollRows).catch((error) => setPayrollNotice(error.message)); setBulkPayslipsOpen(true); }}><FileText size={17} /> Generate {selectedEntity === "All" ? "all" : selectedEntity} salary slips</button>}
          {canManage && <button className="secondary-btn" disabled={!payrollRows.length} onClick={sendAllPayslipEmails}><Mail size={17} /> Email all salary slips</button>}
          {canManage && selectedEntity !== "All" && !cycleFinalized && <button className="primary-btn" disabled={!payrollRows.length} onClick={() => updateCycleFinalization("finalize")}><ShieldCheck size={17} /> Finalize payroll</button>}
          {canManage && selectedEntity !== "All" && cycleFinalized && <button className="secondary-btn" onClick={() => updateCycleFinalization("reopen")}>Reopen payroll</button>}
          {canManage && <button className="secondary-btn" disabled={!payrollRows.length} onClick={exportPayroll}><Download size={17} /> Export Payroll CSV</button>}
        </div>
        {payrollNotice && <div className="payroll-notice">{payrollNotice}</div>}

        <DataTable columns={["Employee", "Entity", "Payable period", "Present", "Paid leave", "Unpaid/Absent", "Gross", "Deductions", "Net payable", "Conflicts", "Status", "Salary Slip"]} rows={payrollRows.map((row) => [
          <Person key={`${row.key}-person`} name={row.employee.name} detail={`${row.employee.employeeId} Â· ${row.employee.dept}`} />,
          row.employee.legalEntity || "HRGP",
          `${row.applicableDays || row.workDays}/${row.workDays}`,
          row.presentDays,
          row.paidLeaveDays,
          row.absentDays,
          `INR ${row.monthlySalary.toLocaleString("en-IN")}`,
          `INR ${row.deductions.toLocaleString("en-IN")}`,
          `INR ${row.netPay.toLocaleString("en-IN")}`,
          row.leaveConflicts?.length ? <Badge key={`${row.key}-conflicts`} tone="red">{row.leaveConflicts.length} conflict{row.leaveConflicts.length === 1 ? "" : "s"}</Badge> : "-",
          <select key={`${row.key}-status`} value={row.status} disabled={!canManage || cycleFinalized} onChange={(event) => updatePayrollStatus(row.key, event.target.value)} aria-label={`Payroll status ${row.employee.name}`}>
            <option>Draft</option>
            <option>Reviewed</option>
            <option>Approved</option>
            <option>Paid</option>
          </select>,
          <div className="row-actions" key={`${row.key}-payslip-actions`}>
            <button className="mini-btn text-mini" aria-label={`View salary slip ${row.employee.name}`} onClick={() => setSelectedPayslip(row)}>View PDF</button>
            {canManage && <button className="mini-btn text-mini" aria-label={`Email salary slip ${row.employee.name}`} onClick={() => sendPayslipEmail(row)}>Email</button>}
          </div>,
        ])} />
      </Panel>

      {selectedPayslip && (
        <PayslipModal payroll={selectedPayslip} month={selectedMonth} onClose={() => setSelectedPayslip(null)} />
      )}

      {bulkPayslipsOpen && (
        <BulkPayslipModal rows={payrollRows} month={selectedMonth} onClose={() => setBulkPayslipsOpen(false)} />
      )}

      {reviewOpen && (
        <PayrollReviewModal
          month={selectedMonth}
          rows={reviewRows}
          cleanCount={cleanReviewRows.length}
          issueCount={issueReviewRows.length}
          onClose={() => setReviewOpen(false)}
          onMarkReviewed={markCleanRowsReviewed}
        />
      )}
    </div>
  );
}

function PayrollReviewModal({ month, rows, cleanCount, issueCount, onClose, onMarkReviewed }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-label="Payroll review">
        <div className="modal-head">
          <div>
            <h2>Payroll Calculation Review</h2>
            <p>Review calculation risks before moving payroll rows to Reviewed.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close payroll review"><X size={18} /></button>
        </div>

        <div className="import-summary">
          <Metric label="Month" value={month} note="Payroll cycle" />
          <Metric label="Clean rows" value={cleanCount} note="Ready to review" />
          <Metric label="Needs review" value={issueCount} note="Check before approval" />
        </div>

        <div className="import-table">
          <DataTable columns={["Employee", "Entity", "Payable period", "Gross", "Deductions", "Net", "Current status", "Review", "Issues"]} rows={rows.map((row) => [
            <Person key={`${row.key}-review-person`} name={row.employee.name} detail={row.employee.employeeId} />,
            row.employee.legalEntity || "HRGP",
            `${row.applicableDays || row.workDays}/${row.workDays}`,
            `INR ${row.monthlySalary.toLocaleString("en-IN")}`,
            `INR ${row.deductions.toLocaleString("en-IN")}`,
            `INR ${row.netPay.toLocaleString("en-IN")}`,
            row.status,
            <Badge key={`${row.key}-review-status`} tone={row.reviewStatus === "Clean" ? "green" : "amber"}>{row.reviewStatus}</Badge>,
            row.issues.length ? row.issues.join(", ") : "No issues",
          ])} />
        </div>

        <div className="modal-actions">
          <span className="form-note">{cleanCount} clean row{cleanCount === 1 ? "" : "s"} can be marked Reviewed.</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!cleanCount} onClick={onMarkReviewed}><CheckCircle2 size={17} /> Mark clean rows Reviewed</button>
        </div>
      </section>
    </div>
  );
}

function PayslipModal({ payroll, month, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card payslip-modal" role="dialog" aria-modal="true" aria-label="Payslip preview">
        <div className="modal-head">
          <div>
            <h2>Generated Salary Slip</h2>
            <p>{payroll.employee.name} Â· {payroll.employee.legalEntity || "HRGP"} Â· {month}</p>
          </div>
          <div className="row-actions">
            <button className="secondary-btn print-hide" onClick={() => window.print()}><Download size={17} /> Save PDF</button>
            <button className="icon-btn print-hide" onClick={onClose} aria-label="Close payslip"><X size={18} /></button>
          </div>
        </div>

        <SalarySlip payroll={payroll} month={month} />
      </section>
    </div>
  );
}

function BulkPayslipModal({ rows, month, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card payslip-modal bulk-payslip-modal" role="dialog" aria-modal="true" aria-label="All salary slips">
        <div className="modal-head">
          <div>
            <h2>Generated Salary Slips</h2>
            <p>{rows.length} employee{rows.length === 1 ? "" : "s"} Â· {rows[0]?.employee?.legalEntity || "All entities"} Â· {month}</p>
          </div>
          <div className="row-actions">
            <button className="secondary-btn print-hide" onClick={() => window.print()}><Download size={17} /> Save PDF</button>
            <button className="icon-btn print-hide" onClick={onClose} aria-label="Close all salary slips"><X size={18} /></button>
          </div>
        </div>

        <div className="bulk-payslip-pack">
          {rows.map((row) => (
            <SalarySlip key={row.key} payroll={row} month={month} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SalarySlip({ payroll, month }) {
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const basic = Math.round(payroll.monthlySalary * 0.5);
  const hra = Math.round(payroll.monthlySalary * 0.25);
  const leaveTravel = Math.round(payroll.monthlySalary * 0.1);
  const special = Math.max(payroll.monthlySalary - basic - hra - leaveTravel, 0);
  const maskedAccount = payroll.employee.bankAccount || "Not available";
  const panValue = payroll.employee.pan || "Not available";
  const displayEmployeeCode = String(payroll.employee.employeeId || "").replace(/^\D+/, "") || payroll.employee.employeeId;
  const formatMoney = (value) => Number(value || 0).toLocaleString("en-IN");

  return (
    <div className="salary-slip-page printable-payslip">
      <aside className="salary-slip-rail">
        <SalaryDetail label="Employee Code" value={displayEmployeeCode} />
        <SalaryDetail label="Entity" value={payroll.employee.legalEntity || "HRGP"} />
        <SalaryDetail label="Name" value={payroll.employee.name} />
        <SalaryDetail label="Designation" value={payroll.employee.role} />
        <SalaryDetail label="PAN" value={panValue} />
        <SalaryDetail label="Account no." value={maskedAccount} />
        <SalaryDetail label="IFSC code" value={payroll.employee.ifsc || "Not available"} />
        <SalaryDetail label="Date of joining" value={payroll.employee.joinDate || "Not available"} />
        <SalaryDetail label="Payable Days" value={`${payroll.paidDays} / ${payroll.applicableDays || payroll.workDays}`} />
        <SalaryDetail label="Leave Balance" value={payroll.paidLeaveDays} />
        <SalaryDetail label="Regime Opted" value="New Regime" />
      </aside>

      <main className="salary-slip-main">
        <header className="salary-slip-header">
          <h2>HR Guru Placement Services</h2>
          <div>
            <strong>Payslip: {monthLabel}</strong>
          </div>
        </header>

        <section className="salary-summary">
          <div className="salary-summary-item">
            <span>Net Pay</span>
            <strong>{formatMoney(payroll.netPay)}</strong>
          </div>
          <div className="salary-equals">=</div>
          <div className="salary-summary-item positive">
            <span>Gross Pay (A)</span>
            <strong>+ {formatMoney(payroll.monthlySalary)}</strong>
          </div>
          <div className="salary-summary-item negative">
            <span>Deductions (B)</span>
            <strong>- {formatMoney(payroll.deductions)}</strong>
          </div>
        </section>

        {payroll.leaveConflicts?.length > 0 && (
          <div className="form-error attendance-error">Attendance/leave conflict: {payroll.leaveConflicts.join("; ")}</div>
        )}

        <SalarySection
          tone="green"
          title="Gross Pay (A)"
          note="The total money you earned before the deductions"
          columns={["Earnings", "Monthly", "Total Amount"]}
          rows={[
            ["Basic", basic, basic],
            ["House Rent Allowance", hra, hra],
            ["Special Allowance", special, special],
            ["Leave & Travel Allowance", leaveTravel, leaveTravel],
          ]}
          totalLabel="Gross Pay"
          totalValue={payroll.monthlySalary}
        />

        <SalarySection
          tone="orange"
          title="Deductions (B)"
          note="The amount deducted for taxes and other benefits"
          columns={["Deductions", "Monthly", "Total Amount"]}
          rows={payroll.deductions ? [["Unpaid leave / absent deduction", payroll.deductions, payroll.deductions]] : []}
          totalLabel="Total Deductions"
          totalValue={payroll.deductions}
        />
      </main>
    </div>
  );
}

function SalaryDetail({ label, value }) {
  return (
    <div className="salary-detail">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function SalarySection({ tone, title, note, columns, rows, totalLabel, totalValue }) {
  const formatMoney = (value) => Number(value || 0).toLocaleString("en-IN");
  return (
    <section className={`salary-section ${tone}`}>
      <div className="salary-section-marker" />
      <div className="salary-section-head">
        <h3>{title}</h3>
        <i />
        <span>{note}</span>
      </div>
      <div className="salary-table">
        <div className="salary-table-row salary-table-head">
          {columns.map((column) => <strong key={column}>{column}</strong>)}
        </div>
        {rows.map((row) => (
          <div className="salary-table-row" key={row[0]}>
            <span>{row[0]}</span>
            <strong>{formatMoney(row[1])}</strong>
            <strong>{formatMoney(row[2])}</strong>
          </div>
        ))}
        <div className="salary-table-row salary-table-total">
          <span />
          <strong>{totalLabel}</strong>
          <strong>{formatMoney(totalValue)}</strong>
        </div>
      </div>
    </section>
  );
}

const emptyCandidate = {
  id: "",
  role: "",
  candidate: "",
  email: "",
  phone: "",
  stage: "Screening",
  owner: "",
  source: "LinkedIn",
  experience: "",
  location: "",
  expectedCtc: "",
  appliedOn: "",
  notes: "",
};

function Recruitment({ candidates, setCandidates, employees, setEmployees }) {
  const [stageFilter, setStageFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null);
  const [conversionDraft, setConversionDraft] = useState(null);
  const stageOptions = ["Screening", "Interview", "Offer", "Hired", "Rejected"];
  const filteredCandidates = candidates.filter((candidate) => {
    const text = query.trim().toLowerCase();
    const stageMatches = stageFilter === "All" || candidate.stage === stageFilter;
    const textMatches = !text || Object.values(candidate).join(" ").toLowerCase().includes(text);
    return stageMatches && textMatches;
  });
  const openRoles = Array.from(new Set(candidates.filter((candidate) => candidate.stage !== "Rejected" && candidate.stage !== "Hired").map((candidate) => candidate.role)));
  const stageCounts = stageOptions.map((stage) => ({ stage, count: candidates.filter((candidate) => candidate.stage === stage).length }));

  function startAdd() {
    setDraft({ ...emptyCandidate, id: `CAN-${Date.now()}`, appliedOn: new Date().toISOString().slice(0, 10) });
  }

  async function saveCandidate(candidate) {
    if (!candidate.candidate.trim() || !candidate.role.trim()) return;
    try {
      const exists = candidates.some((item) => item.id === candidate.id);
      const response = await fetch(`${API_BASE_URL}/api/recruitment/candidates${exists ? `/${candidate.id}` : ""}`, {
        method: exists ? "PATCH" : "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(candidate),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Unable to save candidate.");
      const savedCandidate = data.candidate || candidate;
      setCandidates((current) => {
        const hasCandidate = current.some((item) => item.id === savedCandidate.id);
        return hasCandidate ? current.map((item) => item.id === savedCandidate.id ? savedCandidate : item) : [savedCandidate, ...current];
      });
      setDraft(null);
    } catch (error) {
      window.alert(error.message || "Unable to save candidate.");
    }
  }

  async function updateStage(id, stage) {
    const previousCandidates = candidates;
    setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, stage } : candidate));
    try {
      const response = await fetch(`${API_BASE_URL}/api/recruitment/candidates/${id}/stage`, {
        method: "PATCH",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ stage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Unable to update candidate stage.");
      if (data.candidate) setCandidates((current) => current.map((candidate) => candidate.id === id ? data.candidate : candidate));
    } catch (error) {
      setCandidates(previousCandidates);
      window.alert(error.message || "Unable to update candidate stage.");
    }
  }

  function startConversion(candidate) {
    const nextNumber = Math.max(1000, ...employees.map((employee) => Number(String(employee.employeeId).replace(/\D/g, "")) || 0)) + 1;
    setConversionDraft({
      ...emptyEmployee,
      employeeId: `HG-${nextNumber}`,
      name: candidate.candidate,
      email: candidate.email,
      phone: candidate.phone,
      role: candidate.role,
      location: candidate.location || "Pune",
      status: "Probation",
      employmentType: "Full-time",
      joinDate: new Date().toISOString().slice(0, 10),
      workMode: "Office",
      ctc: candidate.expectedCtc,
      documents: `Converted from candidate ${candidate.id}`,
      preJoiningDocuments: "Pending upload",
      kycDocuments: "Pending upload",
      pfDeclaration: "Pending",
      onboardingStatus: "Not sent",
      lifecycleStage: "Probation",
      sourceCandidateId: candidate.id,
    });
  }

  function saveConvertedEmployee(employeeDraft) {
    if (!employeeDraft?.name.trim() || !employeeDraft?.email.trim() || !employeeDraft?.role.trim()) return;
    const { sourceCandidateId, ...employee } = employeeDraft;
    const onboardedEmployee = {
      ...employee,
      onboardingStatus: "Email sent",
      documents: `${employee.documents || ""}; Onboarding email sent for personal details, bank details, KYC documents, and PF declaration`,
    };
    setEmployees((current) => [onboardedEmployee, ...current]);
    setCandidates((current) => current.map((candidate) => candidate.id === sourceCandidateId ? { ...candidate, stage: "Hired", convertedEmployeeId: employee.employeeId } : candidate));
    window.alert(`Onboarding email queued for ${employee.name}. The employee will be asked to update personal details, bank details, KYC documents, and PF declaration.`);
    setConversionDraft(null);
  }

  return (
    <div className="stack">
      <div className="metrics compact-dashboard">
        <Metric label="Open roles" value={openRoles.length} note="Active hiring" />
        <Metric label="Candidates" value={candidates.length} note="Total pipeline" />
        <Metric label="Offers" value={stageCounts.find((item) => item.stage === "Offer")?.count || 0} note="Pending closure" />
      </div>

      <Panel title="Candidate Pipeline" meta={`${filteredCandidates.length} shown`}>
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input value={query} onInput={(event) => setQuery(event.target.value)} onChange={(event) => setQuery(event.target.value)} placeholder="Search candidate, role, source, owner" />
          </div>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} aria-label="Recruitment stage filter">
            <option>All</option>
            {stageOptions.map((stage) => <option key={stage}>{stage}</option>)}
          </select>
          <button className="primary-btn" onClick={startAdd}><UserCheck size={17} /> Add candidate</button>
        </div>

        <div className="leave-card-grid">
          {filteredCandidates.length ? filteredCandidates.map((candidate) => (
            <article className="leave-card" key={candidate.id}>
              <div className="leave-card-head">
                <Person name={candidate.candidate} detail={`${candidate.id} Â· ${candidate.role}`} />
                <Badge tone={candidate.stage === "Hired" ? "green" : candidate.stage === "Offer" ? "blue" : candidate.stage === "Rejected" ? "red" : "amber"}>{candidate.stage}</Badge>
              </div>
              <div className="leave-card-meta">
                <span>{candidate.email || "-"} Â· {candidate.phone || "-"}</span>
                <span>{candidate.source} Â· {candidate.experience || "Experience not set"}</span>
                <span>Owner: {candidate.owner || "-"}</span>
                <span>Expected CTC: {candidate.expectedCtc || "-"}</span>
              </div>
              <div className="leave-card-actions">
                <button className="secondary-btn" onClick={() => setDraft(candidate)}><Edit3 size={16} /> Edit</button>
                {candidate.stage === "Hired" && !candidate.convertedEmployeeId && <button className="secondary-btn" onClick={() => startConversion(candidate)}><UserCheck size={16} /> Convert</button>}
                {candidate.convertedEmployeeId && <Badge tone="green">{candidate.convertedEmployeeId}</Badge>}
                <select className="action-select" value={candidate.stage} onChange={(event) => updateStage(candidate.id, event.target.value)} aria-label={`Stage ${candidate.candidate}`}>
                  {stageOptions.map((stage) => <option key={stage}>{stage}</option>)}
                </select>
              </div>
            </article>
          )) : <div className="empty-state">No candidates match the current filter.</div>}
        </div>
      </Panel>

      <Panel title="Open Roles" meta={`${openRoles.length} active`}>
        <DataTable columns={["Role", "Candidates", "Interviews", "Offers"]} rows={openRoles.map((role) => {
          const roleCandidates = candidates.filter((candidate) => candidate.role === role);
          return [
            role,
            roleCandidates.length,
            roleCandidates.filter((candidate) => candidate.stage === "Interview").length,
            roleCandidates.filter((candidate) => candidate.stage === "Offer").length,
          ];
        })} />
      </Panel>

      {draft && <CandidateModal draft={draft} onUpdate={(field, value) => setDraft((current) => ({ ...current, [field]: value }))} onClose={() => setDraft(null)} onSave={() => saveCandidate(draft)} />}
      {conversionDraft && <EmployeeForm mode="add" employee={conversionDraft} onClose={() => setConversionDraft(null)} onSave={saveConvertedEmployee} />}
    </div>
  );
}

function CandidateModal({ draft, onUpdate, onClose, onSave }) {
  const canSave = draft.candidate.trim() && draft.role.trim();
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Candidate form">
        <div className="modal-head">
          <div>
            <h2>{draft.id ? "Candidate" : "Add Candidate"}</h2>
            <p>{draft.id || "Create candidate record"}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close candidate form"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <Field label="Candidate name" value={draft.candidate} onChange={(value) => onUpdate("candidate", value)} required />
          <Field label="Role" value={draft.role} onChange={(value) => onUpdate("role", value)} required />
          <SelectField label="Stage" value={draft.stage} onChange={(value) => onUpdate("stage", value)} options={["Screening", "Interview", "Offer", "Hired", "Rejected"]} />
          <Field label="Email" value={draft.email} onChange={(value) => onUpdate("email", value)} />
          <Field label="Phone" value={draft.phone} onChange={(value) => onUpdate("phone", value)} />
          <Field label="Owner" value={draft.owner} onChange={(value) => onUpdate("owner", value)} />
          <SelectField label="Source" value={draft.source} onChange={(value) => onUpdate("source", value)} options={["LinkedIn", "Referral", "Naukri", "Walk-in", "Agency", "Company site"]} />
          <Field label="Experience" value={draft.experience} onChange={(value) => onUpdate("experience", value)} />
          <Field label="Location" value={draft.location} onChange={(value) => onUpdate("location", value)} />
          <Field label="Expected CTC" value={draft.expectedCtc} onChange={(value) => onUpdate("expectedCtc", value)} />
          <Field label="Applied on" type="date" value={draft.appliedOn} onChange={(value) => onUpdate("appliedOn", value)} />
          <Field label="Notes" value={draft.notes} onChange={(value) => onUpdate("notes", value)} />
        </div>
        <div className="modal-actions">
          <span className="form-note">Required: candidate name and role.</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={!canSave} onClick={onSave}>Save candidate</button>
        </div>
      </section>
    </div>
  );
}

function Performance({ role, profile, employees, reviews, setReviews }) {
  const [editingReview, setEditingReview] = useState(null);
  const [offerDrilldown, setOfferDrilldown] = useState(null);
  const [atsPerformance, setAtsPerformance] = useState({ status: "Loading ATS offers...", rows: [], offeredTotal: 0 });
  const [selectedMonth, setSelectedMonth] = useState(() => currentPayrollMonth());
  const [activePerformanceTab, setActivePerformanceTab] = useState("dashboard");
  const [performanceClientFilter, setPerformanceClientFilter] = useState("all");
  const [performanceHistoryMonth, setPerformanceHistoryMonth] = useState("all");
  const atsRowsByEmail = new Map((atsPerformance.rows || []).map((row) => [String(row.recruiterEmail || "").toLowerCase(), row]));
  const atsRowsByName = new Map((atsPerformance.rows || []).map((row) => [normalizeName(row.recruiterName), row]));
  const monthlyReviews = buildMonthlySelectionReviews(employees, reviews).map((review) => {
    const employee = employees.find((item) => item.employeeId === review.employeeId);
    const atsRow = employee ? atsRowsByEmail.get(String(employee.email || "").toLowerCase()) || atsRowsByName.get(normalizeName(employee.name)) : null;
    if (!atsRow) return review;
    const monthlySelections = Number(atsRow.offeredCount || 0);
    const target = Math.max(Number(review.monthlySelectionTarget || 0), 1);
    return {
      ...review,
      monthlySelections,
      progress: Math.min(Math.round((monthlySelections / target) * 100), 100),
      atsCandidates: atsRow.candidates || [],
      atsAccounts: atsRow.accounts || {},
    };
  });
  const scopedEmployeeIds = new Set(employees.filter((employee) => {
    if (role === "employee") return employee.name === profile.name;
    if (role === "manager") return employee.manager === profile.name;
    return true;
  }).map((employee) => employee.employeeId));
  const scopedReviews = monthlyReviews.filter((review) => scopedEmployeeIds.has(review.employeeId));
  const cycleLabel = `${selectedMonth} offered candidates`;
  const totalTarget = scopedReviews.reduce((sum, review) => sum + Number(review.monthlySelectionTarget || 0), 0);
  const totalSelections = scopedReviews.reduce((sum, review) => sum + Number(review.monthlySelections || 0), 0);
  const averageProgress = scopedReviews.length ? Math.round(scopedReviews.reduce((sum, review) => sum + Number(review.progress || 0), 0) / scopedReviews.length) : 0;
  const targetMetCount = scopedReviews.filter((review) => Number(review.monthlySelections || 0) >= Number(review.monthlySelectionTarget || 0)).length;
  const dashboardRows = buildPerformanceDashboardRows(employees, scopedReviews, atsPerformance.rows || []);
  const dashboardClients = [...new Set(dashboardRows.map((row) => row.client).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filteredDashboardRows = dashboardRows.filter((row) => performanceClientFilter === "all" || row.client === performanceClientFilter);
  const monthLabel = performanceHistoryMonth === "all" ? "All months" : performanceHistoryMonths.find((month) => month.key === performanceHistoryMonth)?.label || "Selected month";
  const dashboardLeaderboardRows = filteredDashboardRows
    .map((row) => {
      const value = valueForPerformanceMonth(row, performanceHistoryMonth);
      const monthCount = activePerformanceMonthCount(row, performanceHistoryMonth);
      const tone = performanceTargetTone(value, row.target, monthCount);
      return { ...row, value, monthCount, tone };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 14);
  const dashboardTotal = filteredDashboardRows.reduce((sum, row) => sum + valueForPerformanceMonth(row, performanceHistoryMonth), 0);
  const activeDataPoints = filteredDashboardRows.reduce((sum, row) => sum + activePerformanceMonthCount(row, performanceHistoryMonth), 0);
  const averagePerRecruiter = activeDataPoints ? (dashboardTotal / activeDataPoints).toFixed(1) : "0.0";
  const trendData = performanceHistoryMonths.map((month, index) => ({
    ...month,
    total: filteredDashboardRows.reduce((sum, row) => sum + Number(row.data[index] || 0), 0),
    active: performanceHistoryMonth === "all" || performanceHistoryMonth === month.key,
  }));
  const maxTrendTotal = Math.max(...trendData.map((month) => month.total), 1);
  const bestTrendMonth = trendData.reduce((best, month) => month.total > best.total ? month : best, trendData[0] || { label: "-", total: 0 });
  const clientBreakdownRows = Object.entries(filteredDashboardRows.reduce((acc, row) => {
    acc[row.client] = (acc[row.client] || 0) + valueForPerformanceMonth(row, performanceHistoryMonth);
    return acc;
  }, {})).sort(([, a], [, b]) => b - a);
  const maxClientTotal = Math.max(...clientBreakdownRows.map(([, total]) => total), 1);

  useEffect(() => {
    let cancelled = false;
    setAtsPerformance((current) => ({ ...current, status: "Loading ATS offers..." }));
    fetch(`${API_BASE_URL}/api/performance/offered-candidates?month=${selectedMonth}`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load ATS offers.");
        if (!cancelled) setAtsPerformance({ status: "ATS connected", rows: data.rows || [], offeredTotal: data.offeredTotal || 0 });
      })
      .catch((error) => {
        if (!cancelled) setAtsPerformance({ status: error.message || "ATS offers unavailable", rows: [], offeredTotal: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  function saveReview(updatedReview) {
    setReviews((current) => current.some((review) => review.employeeId === updatedReview.employeeId)
      ? current.map((review) => review.employeeId === updatedReview.employeeId ? updatedReview : review)
      : [updatedReview, ...current]);
    setEditingReview(null);
  }

  return (
    <div className="stack">
      <div className="toolbar report-toolbar">
        <div className="segmented-control" aria-label="Performance sections">
          {[
            ["dashboard", "Dashboard"],
            ["overview", "Overview"],
            ["targets", role === "employee" ? "My Target" : "Recruiter Targets"],
            ["offers", "ATS Offers"],
            ["health", "Target Health"],
          ].map(([id, label]) => (
            <button key={id} className={activePerformanceTab === id ? "active" : ""} onClick={() => setActivePerformanceTab(id)}>{label}</button>
          ))}
        </div>
        <input type="month" value={selectedMonth} onInput={(event) => setSelectedMonth(event.target.value)} onChange={(event) => setSelectedMonth(event.target.value)} />
      </div>

      {activePerformanceTab === "dashboard" && (
        <Panel title="Offered Candidates Dashboard" meta={`${monthLabel} · ${atsPerformance.status}`}>
          <div className="performance-dashboard">
            <div className="performance-dashboard-head">
              <div>
                <div className="performance-title-row">
                  <UserCheck size={18} />
                  <strong>Recruiter output</strong>
                  <span className="source-pill">Sep-Mar migrated data</span>
                </div>
                <p>Client-wise offered candidate trend, targets, and recruiter leaderboard in one view.</p>
              </div>
              <div className="performance-filters">
                <select value={performanceClientFilter} onChange={(event) => setPerformanceClientFilter(event.target.value)} aria-label="Performance client filter">
                  <option value="all">All clients</option>
                  {dashboardClients.map((client) => <option key={client} value={client}>{client}</option>)}
                </select>
                <select value={performanceHistoryMonth} onChange={(event) => setPerformanceHistoryMonth(event.target.value)} aria-label="Performance month filter">
                  <option value="all">All months</option>
                  {performanceHistoryMonths.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}
                </select>
              </div>
            </div>

            <div className="performance-kpi-grid">
              <Metric label="Total offered" value={dashboardTotal} note={monthLabel} />
              <Metric label="Active recruiters" value={filteredDashboardRows.filter((row) => row.data.some((value) => Number(value || 0) > 0)).length} note={`${dashboardClients.length || 0} clients`} />
              <Metric label="Best month" value={bestTrendMonth?.label || "-"} note={`${bestTrendMonth?.total || 0} offers`} />
              <Metric label="Avg / recruiter / month" value={averagePerRecruiter} note="Target varies by recruiter" />
            </div>

            <div className="performance-chart-panel">
              <div className="performance-section-head">
                <strong>Monthly trend</strong>
                <span><i className="legend-dot migrated" />Migrated <i className="legend-dot ats" />ATS sourced</span>
              </div>
              <div className="performance-trend" role="img" aria-label="Monthly offered candidates trend">
                {trendData.map((month) => (
                  <div className={`performance-trend-item ${month.active ? "" : "muted"}`} key={month.key}>
                    <div className="performance-trend-bar-wrap">
                      <span className={`performance-trend-bar ${month.source}`} style={{ height: `${Math.max(8, Math.round((month.total / maxTrendTotal) * 100))}%` }} />
                    </div>
                    <strong>{month.total}</strong>
                    <small>{month.label}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="performance-split">
              <div className="performance-chart-panel">
                <div className="performance-section-head">
                  <strong>Recruiter leaderboard</strong>
                  <span>{performanceClientFilter === "all" ? "All clients" : performanceClientFilter} · {monthLabel}</span>
                </div>
                <div className="performance-leaderboard">
                  {dashboardLeaderboardRows.map((row, index) => (
                    <div className="performance-leader-row" key={`${row.name}-${row.client}`}>
                      <span className="rank">{index + 1}</span>
                      <Person name={row.employeeName} detail={row.client} />
                      <span className="target">Target {row.target || "-"}</span>
                      <button className="link-button offered-value" disabled={!row.atsCandidates?.length} onClick={() => setOfferDrilldown({ employee: row.employeeName, account: row.client, atsCandidates: row.atsCandidates })}>
                        {row.value}
                      </button>
                      <Badge tone={row.tone}>{performanceTargetLabel(row.tone)}</Badge>
                      <div className="performance-spark" aria-label={`${row.employeeName} monthly trend`}>
                        {row.data.map((value, sparkIndex) => (
                          <span key={`${row.name}-${sparkIndex}`} className={performanceHistoryMonths[sparkIndex].source} style={{ height: `${Math.max(4, Math.round((Number(value || 0) / 18) * 24))}px` }} title={`${performanceHistoryMonths[sparkIndex].label}: ${Number(value || 0)}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {!dashboardLeaderboardRows.length && <div className="empty-state">No recruiter performance records match this filter.</div>}
                </div>
              </div>

              <div className="performance-chart-panel">
                <div className="performance-section-head">
                  <strong>Client breakdown</strong>
                  <span>{monthLabel}</span>
                </div>
                <div className="client-bars">
                  {clientBreakdownRows.map(([client, total]) => (
                    <div className="client-bar-row" key={client}>
                      <div>
                        <span>{client}</span>
                        <strong>{total}</strong>
                      </div>
                      <i style={{ width: `${Math.max(4, Math.round((total / maxClientTotal) * 100))}%` }} />
                    </div>
                  ))}
                  {!clientBreakdownRows.length && <div className="empty-state">No client output found for this filter.</div>}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {activePerformanceTab === "overview" && (
        <Panel title="Performance Overview" meta={cycleLabel}>
          <div className="metrics compact-dashboard">
            <Metric label={role === "employee" ? "My progress" : "Average progress"} value={`${averageProgress}%`} note={cycleLabel} />
            <Metric label={role === "employee" ? "My target" : "Monthly target"} value={totalTarget} note="Selections" />
            <Metric label={role === "employee" ? "My offers" : "Offers recorded"} value={totalSelections} note="From ATS" />
            <Metric label={role === "employee" ? "Target status" : "Targets met"} value={role === "employee" ? `${scopedReviews[0]?.progress || 0}%` : targetMetCount} note="Current month" />
          </div>
        </Panel>
      )}

      {activePerformanceTab === "offers" && (
        <Panel title="ATS Offered Candidates" meta={`${atsPerformance.offeredTotal || 0} offer${Number(atsPerformance.offeredTotal || 0) === 1 ? "" : "s"} Â· ${atsPerformance.status}`}>
          <DataTable
            columns={["Recruiter", "Email", "ATS Offered", "Accounts", "Candidates"]}
            rows={(atsPerformance.rows || []).length ? atsPerformance.rows.map((row) => [
              row.recruiterName || "-",
              row.recruiterEmail || "-",
              row.offeredCount || 0,
              Object.entries(row.accounts || {}).map(([account, count]) => `${account}: ${count}`).join(", ") || "-",
              <button className="link-button" onClick={() => setOfferDrilldown({
                employee: row.recruiterName,
                account: Object.keys(row.accounts || {}).join(", "),
                atsCandidates: row.candidates || [],
              })}>{row.candidates?.length || 0} candidate{(row.candidates?.length || 0) === 1 ? "" : "s"}</button>,
            ]) : [["No ATS offered candidates found for this month", "-", "-", "-", "-"]]}
          />
        </Panel>
      )}

      {activePerformanceTab === "targets" && (
        <Panel title={role === "employee" ? "My Monthly Target" : role === "manager" ? "Team Recruiter Targets" : "Recruiter Target Cards"} meta={cycleLabel}>
          <div className="leave-card-grid">
            {scopedReviews.length ? scopedReviews.map((review) => (
              <article className="leave-card" key={review.id}>
                <div className="leave-card-head">
                  <Person name={review.employee} detail={`${review.employeeId} Â· ${review.cycle}`} />
                  <Badge tone={Number(review.monthlySelections || 0) >= Number(review.monthlySelectionTarget || 0) ? "green" : Number(review.monthlySelections || 0) ? "blue" : "amber"}>{Number(review.monthlySelections || 0) >= Number(review.monthlySelectionTarget || 0) ? "Target met" : "In progress"}</Badge>
                </div>
                <div className="leave-card-meta">
                  <span>Account: {review.account || "-"}</span>
                  <span>Monthly target: {review.monthlySelectionTarget || 0} selections</span>
                  <span>
                    Offers from ATS: {review.atsCandidates?.length ? (
                      <button className="link-button" onClick={() => setOfferDrilldown(review)}>{review.monthlySelections || 0}</button>
                    ) : review.monthlySelections || 0}
                  </span>
                  <span>Rating: {review.rating || "Not rated"}</span>
                </div>
                <Progress label="Selection target progress" value={Number(review.progress || 0)} />
                {role !== "employee" && (
                  <div className="leave-card-actions">
                    <button className="secondary-btn" onClick={() => setEditingReview(review)}><Edit3 size={16} /> Update target</button>
                  </div>
                )}
              </article>
            )) : <div className="empty-state">No performance target records found.</div>}
          </div>
        </Panel>
      )}

      {activePerformanceTab === "health" && (
        <Panel title="Target Health" meta={cycleLabel}>
          <div className="progress-list">
            <Progress label="Overall target progress" value={totalTarget ? Math.min(Math.round((totalSelections / totalTarget) * 100), 100) : 0} />
            <Progress label="Employees with at least one offer" value={scopedReviews.length ? Math.round((scopedReviews.filter((review) => Number(review.monthlySelections || 0) > 0).length / scopedReviews.length) * 100) : 0} />
            <Progress label="Targets met" value={scopedReviews.length ? Math.round((targetMetCount / scopedReviews.length) * 100) : 0} />
          </div>
        </Panel>
      )}


      {editingReview && <PerformanceReviewModal role={role} draft={editingReview} onUpdate={(field, value) => setEditingReview((current) => ({ ...current, [field]: value }))} onClose={() => setEditingReview(null)} onSave={() => saveReview(editingReview)} />}
      {offerDrilldown && <PerformanceOfferModal review={offerDrilldown} onClose={() => setOfferDrilldown(null)} />}
    </div>
  );
}

function PerformanceOfferModal({ review, onClose }) {
  const candidates = review.atsCandidates || [];
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card import-modal" role="dialog" aria-modal="true" aria-label="ATS offered candidates">
        <div className="modal-head">
          <div>
            <h2>ATS Offered Candidates</h2>
            <p>{review.employee} Â· {review.account || "All accounts"} Â· {candidates.length} offer{candidates.length === 1 ? "" : "s"}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close offered candidates"><X size={18} /></button>
        </div>
        <DataTable
          columns={["Candidate", "Role", "Client", "Offered On", "Email", "Phone"]}
          rows={candidates.map((candidate) => [
            candidate.candidateName || "-",
            candidate.role || "-",
            candidate.client || "-",
            candidate.offeredAt || "-",
            candidate.candidateEmail || "-",
            candidate.candidatePhone || "-",
          ])}
        />
        <div className="modal-actions">
          <span className="form-note">Read-only data from ATS candidate status.</span>
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function PerformanceReviewModal({ role, draft, onUpdate, onClose, onSave }) {
  const managerCanEdit = role !== "employee";
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Performance review">
        <div className="modal-head">
          <div>
            <h2>Performance Review</h2>
            <p>{draft.employee} Â· {draft.cycle}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close performance review"><X size={18} /></button>
        </div>
        <div className="form-grid">
          <Field label="Account" value={draft.account || ""} onChange={(value) => onUpdate("account", value)} disabled={!managerCanEdit} />
          <Field label="Monthly selection target" value={String(draft.monthlySelectionTarget || 0)} onChange={(value) => onUpdate("monthlySelectionTarget", value)} disabled={!managerCanEdit} />
          <Field label="Offers from ATS" value={String(draft.monthlySelections || 0)} onChange={() => {}} disabled />
          <Field label="Goal" value={draft.goal} onChange={(value) => onUpdate("goal", value)} disabled={!managerCanEdit} />
          <Field label="Target progress %" value={String(draft.progress)} onChange={(value) => onUpdate("progress", value)} disabled />
          <SelectField label="Rating" value={draft.rating} onChange={(value) => onUpdate("rating", value)} options={["Not rated", "Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding"]} />
        </div>
        <div className="modal-actions">
          <span className="form-note">Offer count is read-only and comes from ATS. Detailed review sections will be captured in a separate form.</span>
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={onSave}>Save review</button>
        </div>
      </section>
    </div>
  );
}

function countBy(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || "Unassigned";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function groupRows(counts) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
}

function Reports({ employees, leaveRecords, attendanceRecords, setAttendanceRecords, payrollStatus }) {
  const [reportMonth, setReportMonth] = useState(currentPayrollMonth());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [leaveReport, setLeaveReport] = useState({ loading: false, error: "", data: null });
  const [leaveSearch, setLeaveSearch] = useState("");
  const [leaveSort, setLeaveSort] = useState({ field: "employeeName", direction: "asc" });
  const payrollRows = employees.map((employee) => payrollForEmployee(employee, reportMonth, attendanceRecords, leaveRecords, payrollStatus));
  const attendanceSummaryRows = employees.map((employee) => attendanceSummaryForEmployee(employee, reportMonth, attendanceRecords, leaveRecords));
  const headcountByDept = groupRows(countBy(employees, (employee) => employee.dept));
  const employeeStatus = groupRows(countBy(employees, (employee) => employee.status));
  const leaveStatus = groupRows(countBy(leaveRecords, (request) => request.status));
  const attendanceStatus = groupRows(countBy(attendanceRecords, (record) => record.status));
  const payrollStatusRows = groupRows(countBy(payrollRows, (row) => row.status));
  const selectedEmployee = employees.find((employee) => employee.employeeId === selectedEmployeeId);

  useEffect(() => {
    let cancelled = false;
    async function loadLeaveReport() {
      setLeaveReport((current) => ({ ...current, loading: true, error: "" }));
      try {
        const response = await fetch(`${API_BASE_URL}/api/reports/leaves?month=${reportMonth}`, { credentials: "include", headers: authHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Could not load leave report.");
        if (!cancelled) {
          setLeaveReport({ loading: false, error: "", data: data.report || null });
        }
      } catch (error) {
        if (!cancelled) {
          setLeaveReport({ loading: false, error: error.message || "Could not load leave report.", data: null });
        }
      }
    }
    loadLeaveReport();
    return () => { cancelled = true; };
  }, [reportMonth]);

  const leaveRows = useMemo(() => {
    const rows = leaveReport.data?.rows || [];
    const query = leaveSearch.trim().toLowerCase();
    const filtered = query ? rows.filter((row) => row.employeeName.toLowerCase().includes(query) || row.employeeId.toLowerCase().includes(query)) : rows;
    const sorted = [...filtered].sort((left, right) => {
      const direction = leaveSort.direction === "asc" ? 1 : -1;
      if (leaveSort.field === "paidLeaveDays") return (Number(left.paidLeaveDays) - Number(right.paidLeaveDays)) * direction || left.employeeName.localeCompare(right.employeeName) * direction;
      if (leaveSort.field === "leaveDays") return (Number(left.totalLeaveDays) - Number(right.totalLeaveDays)) * direction || left.employeeName.localeCompare(right.employeeName) * direction;
      return left.employeeName.localeCompare(right.employeeName) * direction || left.employeeId.localeCompare(right.employeeId) * direction;
    });
    return sorted;
  }, [leaveReport.data?.rows, leaveSearch, leaveSort]);

  const leaveCsvRows = useMemo(() => {
    return leaveRows.map((row) => ({
      employeeName: row.employeeName,
      employeeCode: row.employeeId,
      paidLeaveDays: row.paidLeaveDays,
      unpaidLeaveDays: row.unpaidLeaveDays,
      totalLeaveDays: row.totalLeaveDays,
      currentBalanceTotal: row.currentBalanceTotal,
      monthEndBalanceRemaining: row.monthEndBalanceRemaining ?? "",
      leaveBreakdown: row.leaveDaysByType.map((item) => `${item.leaveType}: ${item.days}`).join(" | "),
      balanceRemainingBreakdown: row.currentBalancesByType.map((item) => `${item.leaveType}: ${item.balance}`).join(" | "),
    }));
  }, [leaveRows]);

  function exportLeaveCsv() {
    const header = [
      "Employee Name",
      "Employee Code",
      "Paid Leave Days",
      "Unpaid Leave Days",
      "Total Leave Days",
      "Total Balance Remaining",
      "Month-end Remaining",
      "Leave Breakdown",
      "Balance Remaining by Type",
    ].map((label) => csvEscape(label)).join(",");
    const body = leaveCsvRows.map((row) => [
      row.employeeName,
      row.employeeCode,
      row.paidLeaveDays,
      row.unpaidLeaveDays,
      row.totalLeaveDays,
      row.currentBalanceTotal,
      row.monthEndBalanceRemaining,
      row.leaveBreakdown,
      row.balanceRemainingBreakdown,
    ].map((value) => csvEscape(value)).join(",")).join("\n");
    downloadCsv(`hrguru-leave-report-${reportMonth}.csv`, `${header}\n${body}`);
  }

  function updateMonthlyAttendance(employee, date, field, value) {
    const current = attendanceRecords.find((record) => record.employeeId === employee.employeeId && record.date === date) ||
      defaultAttendanceFor(employee, date, leaveRecords);
    const next = { ...current, [field]: value };
    if (field === "status") {
      const payableStatus = ["Present", "Late", "Remote", "Half Day"].includes(value);
      next.checkIn = payableStatus ? (next.checkIn || "09:30") : "";
      next.checkOut = payableStatus ? (next.checkOut || "18:30") : "";
      next.hours = value === "Half Day" ? "4.5" : payableStatus ? (next.hours || "9.0") : "0";
    }
    setAttendanceRecords((records) => {
      const withoutCurrent = records.filter((record) => !(record.employeeId === employee.employeeId && record.date === date));
      return [next, ...withoutCurrent];
    });
  }

  return (
    <div className="stack">
      <Panel title="Employee Leave Report" meta={leaveReport.data?.sourceLabel || reportMonth}>
        <div className="toolbar report-toolbar">
          <label className="field compact-field">
            <span>Report month</span>
            <input type="month" value={reportMonth} onInput={(event) => setReportMonth(event.target.value)} onChange={(event) => setReportMonth(event.target.value)} />
          </label>
          <label className="field compact-field">
            <span>Search employee</span>
            <input type="search" value={leaveSearch} onInput={(event) => setLeaveSearch(event.target.value)} onChange={(event) => setLeaveSearch(event.target.value)} placeholder="Type a name or code" />
          </label>
          <div className="toolbar">
            <button className={leaveSort.field === "employeeName" ? "secondary-btn" : "primary-btn"} onClick={() => setLeaveSort((current) => ({ field: "employeeName", direction: current.field === "employeeName" && current.direction === "asc" ? "desc" : "asc" }))}>Sort by name</button>
            <button className={leaveSort.field === "leaveDays" ? "secondary-btn" : "primary-btn"} onClick={() => setLeaveSort((current) => ({ field: "leaveDays", direction: current.field === "leaveDays" && current.direction === "asc" ? "desc" : "asc" }))}>Sort by leave days</button>
            <button className="secondary-btn" disabled={leaveReport.loading || !leaveRows.length} onClick={exportLeaveCsv}><Download size={17} /> Export CSV</button>
          </div>
        </div>
        {leaveReport.loading && <div className="empty-state">Loading leave report...</div>}
        {leaveReport.error && <div className="form-error">{leaveReport.error}</div>}
        {leaveReport.data?.sourceMode === "live" && <div className="payroll-notice">This month has not been finalized - showing live / unreconciled data.</div>}
        {leaveReport.data?.sourceMode === "reconciled" && <div className="form-note">Showing reconciled month-end data.</div>}
        <DataTable
          columns={["Employee", "Code", "Paid leave by type", "Unpaid leave", "Total balance remaining", "Balance remaining by leave type", "Month-end remaining", "Source"]}
          rows={leaveRows.length ? leaveRows.map((row) => [
            row.employeeName,
            row.employeeId,
            row.leaveDaysByType.length ? row.leaveDaysByType.map((item) => `${item.leaveType}: ${item.days}`).join(" | ") : "-",
            row.unpaidLeaveDays,
            row.currentBalanceTotal,
            row.currentBalancesByType.length ? row.currentBalancesByType.map((item) => `${item.leaveType}: ${item.balance}`).join(" | ") : "-",
            row.monthEndBalanceRemaining ?? "-",
            row.dataSource,
          ]) : [["No leave report data found", "-", "-", "-", "-", "-", "-", "-"]]}
        />
      </Panel>

      <Panel title="Monthly Attendance Report" meta={reportMonth}>
        <div className="toolbar report-toolbar">
          <label className="field compact-field">
            <span>Payroll month</span>
            <input type="month" value={reportMonth} onInput={(event) => setReportMonth(event.target.value)} onChange={(event) => setReportMonth(event.target.value)} />
          </label>
          <button className="secondary-btn" disabled={!attendanceSummaryRows.length} onClick={() => downloadCsv(`hrguru-attendance-${reportMonth}.csv`, attendanceSummaryToCsv(reportMonth, attendanceSummaryRows))}><Download size={17} /> Download CSV</button>
        </div>
        <DataTable
          columns={["Emp ID", "Employee Name", "Present", "Half Day", "On Leave", "Unpaid Leave", "Shift Issues", "Open Requests", "No Data"]}
          rows={attendanceSummaryRows.map((row) => [
            <button className="link-button" onClick={() => setSelectedEmployeeId(row.employee.employeeId)}>{row.employee.employeeId}</button>,
            row.employee.name,
            row.present,
            row.halfDay,
            row.onLeave,
            row.unpaidLeave,
            row.shiftIssues,
            row.openRequests,
            row.noData,
          ])}
        />
      </Panel>

      <div className="two-col">
        <Panel title="Headcount By Department" meta="Employees">
          <DataTable columns={["Department", "Employees"]} rows={headcountByDept.map(([label, value]) => [label, value])} />
        </Panel>
        <Panel title="Employee Status" meta="Lifecycle">
          <DataTable columns={["Status", "Employees"]} rows={employeeStatus.map(([label, value]) => [label, value])} />
        </Panel>
      </div>

      <div className="two-col">
        <Panel title="Leave Summary" meta="Requests">
          <DataTable columns={["Status", "Requests"]} rows={leaveStatus.map(([label, value]) => [label, value])} />
        </Panel>
        <Panel title="Attendance Summary" meta="Saved records">
          <DataTable columns={["Status", "Records"]} rows={attendanceStatus.map(([label, value]) => [label, value])} />
        </Panel>
      </div>

      <Panel title="Payroll Summary" meta={reportMonth}>
        <DataTable columns={["Payroll Status", "Employees"]} rows={payrollStatusRows.map(([label, value]) => [label, value])} />
      </Panel>

      {selectedEmployee && (
        <AttendanceMonthModal
          employee={selectedEmployee}
          month={reportMonth}
          rows={attendanceRowsForEmployee(selectedEmployee, reportMonth, attendanceRecords, leaveRecords)}
          onClose={() => setSelectedEmployeeId("")}
          onUpdate={(date, field, value) => updateMonthlyAttendance(selectedEmployee, date, field, value)}
        />
      )}
    </div>
  );
}

function AttendanceMonthModal({ employee, month, rows, onClose, onUpdate }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card attendance-month-modal" role="dialog" aria-modal="true" aria-label="Monthly attendance">
        <div className="modal-head">
          <div>
            <h2>{employee.name} Attendance</h2>
            <p>{employee.employeeId} Â· {month}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close monthly attendance"><X size={18} /></button>
        </div>
        <div className="import-table">
          <DataTable
            columns={["Date", "Status", "Check In", "Check Out", "Duration", "Remarks"]}
            rows={rows.map((row) => [
              row.date,
              <select value={row.status} onChange={(event) => onUpdate(row.date, "status", event.target.value)} aria-label={`Status ${row.date}`}>
                <option>Present</option>
                <option>Remote</option>
                <option>Late</option>
                <option>Half Day</option>
                <option>Leave</option>
                <option>Absent</option>
                <option>Weekend</option>
              </select>,
              <input className="table-input" type="time" value={row.checkIn || ""} onInput={(event) => onUpdate(row.date, "checkIn", event.target.value)} onChange={(event) => onUpdate(row.date, "checkIn", event.target.value)} />,
              <input className="table-input" type="time" value={row.checkOut || ""} onInput={(event) => onUpdate(row.date, "checkOut", event.target.value)} onChange={(event) => onUpdate(row.date, "checkOut", event.target.value)} />,
              <input className="table-input small" value={row.hours || ""} onInput={(event) => onUpdate(row.date, "hours", event.target.value)} onChange={(event) => onUpdate(row.date, "hours", event.target.value)} />,
              <input className="table-input remarks" value={row.notes || ""} onInput={(event) => onUpdate(row.date, "notes", event.target.value)} onChange={(event) => onUpdate(row.date, "notes", event.target.value)} />,
            ])}
          />
        </div>
        <div className="modal-actions">
          <span className="form-note">Changes are saved to this frontend prototype immediately.</span>
          <button className="primary-btn" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

function Communication() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
  const editableTemplate = selectedTemplate && selectedTemplate.id !== "team-onboarding";

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/communication/templates`, { credentials: "include" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || "Unable to load communication templates.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const responseTemplates = data.templates || [];
        const firstTemplate = responseTemplates[0] || {};
        const customTemplate = {
          id: "custom-email",
          name: "Custom email",
          description: "Write a custom subject and message for active team members.",
          recipientCount: firstTemplate.recipientCount || firstTemplate.recipients?.length || 0,
          recipients: firstTemplate.recipients || [],
          sample: {
            to: firstTemplate.sample?.to || "",
            subject: "",
            text: "",
            html: "",
          },
          sourceFile: "",
        };
        const loadedTemplates = responseTemplates.some((template) => template.id === "custom-email")
          ? responseTemplates
          : [customTemplate, ...responseTemplates];
        setTemplates(loadedTemplates);
        const firstEditable = loadedTemplates.find((template) => template.id === "custom-email") || loadedTemplates.find((template) => template.id !== "team-onboarding") || loadedTemplates[0] || null;
        if (firstEditable) {
          setSelectedTemplateId(firstEditable.id);
          setSubject(firstEditable.sample?.subject || "");
          setBody(firstEditable.sample?.text || "");
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    setSelectedTemplateId(templateId);
    setNotice("");
    setError("");
    setSubject(template?.sample?.subject || "");
    setBody(template?.sample?.text || "");
  }

  async function sendTemplate() {
    if (!selectedTemplate) return;
    if (editableTemplate && (!subject.trim() || !body.trim())) {
      setError("Subject and email body are required before sending.");
      return;
    }
    setSending(selectedTemplate.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/communication/templates/${selectedTemplate.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editableTemplate ? { subject, text: body } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Emails could not be sent.");
      setNotice(data.message || "Communication processed.");
    } catch (error) {
      setError(error.message === "Failed to fetch" ? "Backend server is not reachable." : error.message);
    } finally {
      setSending("");
    }
  }

  return (
    <div className="stack">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">Team communication</span>
          <h2>Email templates</h2>
          <p>Send approved HRMS communication templates to team members from one place.</p>
        </div>
        <Mail size={32} />
      </div>

      {notice && <div className="payroll-notice">{notice}</div>}
      {error && <div className="form-error">{error}</div>}

      <Panel title="Compose Email" meta={loading ? "Loading" : `${templates.length} templates`}>
        {loading ? (
          <div className="empty-state">Loading communication templates...</div>
        ) : selectedTemplate ? (
          <div className="communication-compose">
            <div className="communication-compose-grid">
              <label className="field">
                <span>Template</span>
                <select value={selectedTemplateId} onChange={(event) => selectTemplate(event.target.value)}>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <div className="communication-template-summary">
                <strong>{selectedTemplate.name}</strong>
                <span>{selectedTemplate.description}</span>
              </div>
              <Badge tone="blue">{selectedTemplate.recipientCount} recipients</Badge>
            </div>

            {selectedTemplate.id === "team-onboarding" && (
              <div className="payroll-notice">Onboarding emails include individual passwords from the password file, so the content is locked for safety.</div>
            )}

            <label className="field">
              <span>Subject</span>
              <input value={subject} disabled={!editableTemplate} onInput={(event) => setSubject(event.target.value)} onChange={(event) => setSubject(event.target.value)} />
            </label>

            <label className="field communication-body-field">
              <span>Email body</span>
              <textarea value={body} disabled={!editableTemplate} onInput={(event) => setBody(event.target.value)} onChange={(event) => setBody(event.target.value)} />
            </label>

            <div className="communication-preview">
              <strong>Preview</strong>
              <span>To: {selectedTemplate.sample?.to || "Team members"}</span>
              <span>Subject: {subject || "-"}</span>
              <pre>{body || "No body content."}</pre>
            </div>

            {selectedTemplate.recipients?.length > 0 && (
              <div className="communication-preview">
                <strong>Recipients ({selectedTemplate.recipients.length})</strong>
                <pre>{selectedTemplate.recipients.map((recipient) => `${recipient.employeeCode || "-"} · ${recipient.fullName} · ${recipient.email}`).join("\n")}</pre>
              </div>
            )}

            <div className="communication-actions">
              <span className="form-note">{selectedTemplate.sourceFile ? `Source: ${selectedTemplate.sourceFile}` : "You can edit this content before sending."}</span>
              <button className="primary-btn" disabled={sending === selectedTemplate.id || !selectedTemplate.recipientCount || (editableTemplate && (!subject.trim() || !body.trim()))} onClick={sendTemplate}>
                <Mail size={16} /> {sending === selectedTemplate.id ? "Sending..." : "Send to all"}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">No communication templates configured yet.</div>
        )}
      </Panel>
    </div>
  );
}

function SettingsModule({ profile }) {
  const [userAdmin, setUserAdmin] = useState({
    loading: true,
    saving: false,
    notice: "",
    error: "",
    temporaryPassword: "",
    users: [],
  });
  const [userDraft, setUserDraft] = useState({
    employeeCode: "",
    email: "",
    username: "",
    role: "employee",
    status: "active",
    password: "",
    mustChangePassword: true,
  });
  const [resetDraft, setResetDraft] = useState({
    userId: "",
    password: "",
    mustChangePassword: true,
  });
  const [attendanceResetDraft, setAttendanceResetDraft] = useState({
    employeeLookup: "",
    month: currentPayrollMonth(),
    justification: "",
  });
  const [attendanceReset, setAttendanceReset] = useState({
    saving: false,
    notice: "",
    error: "",
  });
  const [deviceControl, setDeviceControl] = useState({
    loading: true,
    saving: false,
    notice: "",
    error: "",
    policy: { loginDeviceRestrictionEnabled: false },
    currentDevice: null,
    devices: [],
    loginEvents: [],
  });
  const permissionRows = [
    ["Admin / HR", "All modules", "Create, edit, approve, export"],
    ["Manager", "Team employees, leave, attendance, performance", "View, approve, comment"],
    ["Finance", "Payroll, reports, employee compensation", "Review, approve, export"],
    ["Employee", "Self profile, leave, attendance, payslip", "View, apply, download"],
  ];
  const moduleRows = [
    ["Employees", "Admin / HR", "Create, edit, import, export"],
    ["Leave", "Admin / HR, Manager, Employee", "Apply, approve, reject, balance"],
    ["Attendance", "Admin / HR, Manager, Employee", "Employee self-mark, manager view, HR update"],
    ["Payroll", "Admin / HR, Finance", "Review, approve, paid, payslip"],
    ["Communication", "Admin / HR", "Preview and send team email templates"],
    ["Reports", "Admin / HR, Finance", "View summaries, export later"],
    ["Settings", "Admin / HR", "Configure roles and rules"],
  ];
  const deviceRows = deviceControl.devices.map((device) => [
    <div><strong>{device.label}</strong><span>{device.deviceName || "-"}</span></div>,
    device.deviceType || "-",
    device.isActive ? <Badge tone="green">Allowed</Badge> : <Badge tone="amber">Pending</Badge>,
    <div><strong>{device.lastLocation || "-"}</strong><span>{device.lastIpAddress || "-"}</span></div>,
    device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("en-IN") : "-",
    device.approvedAt ? new Date(device.approvedAt).toLocaleString("en-IN") : "-",
    <button
      className={`secondary-btn ${device.isActive ? "danger-btn" : ""}`}
      onClick={() => updateDeviceStatus(device.id, !device.isActive)}
      disabled={deviceControl.saving}
    >
      {device.isActive ? "Disable" : "Allow"}
    </button>,
  ]);
  const loginEventRows = deviceControl.loginEvents.map((event) => [
    event.user?.name || event.emailOrLogin || "-",
    event.successful ? <Badge tone="green">Success</Badge> : <Badge tone="red">Blocked</Badge>,
    event.blockedReason || "-",
    event.deviceType || "-",
    <div><strong>{event.deviceName || "-"}</strong><span>{event.browser || "-"} / {event.platform || "-"}</span></div>,
    <div><strong>{event.location || "-"}</strong><span>{event.ipAddress || "-"}</span></div>,
    event.createdAt ? new Date(event.createdAt).toLocaleString("en-IN") : "-",
  ]);
  const currentDeviceAllowed = Boolean(deviceControl.currentDevice?.isActive);
  const userRows = userAdmin.users.map((user) => [
    <Person key={`${user.id}-person`} name={user.employee?.fullName || user.email} detail={`${user.employee?.employeeCode || "No employee"} · ${user.employee?.department || user.username || "-"}`} />,
    <div key={`${user.id}-login`}><strong>{user.email}</strong><span>{user.username || "-"}</span></div>,
    <Badge key={`${user.id}-role`} tone={user.role === "admin" ? "red" : user.role === "hr" ? "blue" : user.role === "manager" ? "amber" : "green"}>{user.role}</Badge>,
    <Badge key={`${user.id}-status`} tone={user.status === "active" ? "green" : user.status === "locked" ? "red" : "amber"}>{user.status}</Badge>,
    user.mustChangePassword ? <Badge key={`${user.id}-change`} tone="amber">Must change</Badge> : <Badge key={`${user.id}-change`} tone="green">Set</Badge>,
    user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-IN") : "-",
    <button key={`${user.id}-delete`} className="secondary-btn danger-btn" disabled={userAdmin.saving} onClick={() => deleteLoginUser(user)}>Delete user</button>,
  ]);

  function updateUserDraft(field, value) {
    setUserDraft((current) => ({ ...current, [field]: value }));
  }

  function updateResetDraft(field, value) {
    setResetDraft((current) => ({ ...current, [field]: value }));
  }

  function updateAttendanceResetDraft(field, value) {
    setAttendanceResetDraft((current) => ({ ...current, [field]: value }));
  }

  async function loadUsers() {
    setUserAdmin((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/users`, {
        credentials: "include",
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not load login users.");
      setUserAdmin((current) => ({ ...current, loading: false, users: data.users || [] }));
    } catch (error) {
      setUserAdmin((current) => ({ ...current, loading: false, error: error.message || "Could not load login users." }));
    }
  }

  async function saveLoginUser() {
    if (!userDraft.employeeCode.trim()) {
      setUserAdmin((current) => ({ ...current, error: "Employee code, email, or name is required.", notice: "", temporaryPassword: "" }));
      return;
    }
    setUserAdmin((current) => ({ ...current, saving: true, notice: "", error: "", temporaryPassword: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/users`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          ...userDraft,
          employeeCode: userDraft.employeeCode.trim(),
          email: userDraft.email.trim() || null,
          username: userDraft.username.trim() || null,
          password: userDraft.password || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not create login user.");
      setUserAdmin((current) => ({
        ...current,
        saving: false,
        notice: `Login user created for ${data.user?.employee?.fullName || data.user?.email}.`,
        temporaryPassword: data.temporaryPassword || "",
      }));
      setUserDraft((current) => ({ ...current, employeeCode: "", email: "", username: "", password: "", role: "employee", status: "active", mustChangePassword: true }));
      await loadUsers();
    } catch (error) {
      setUserAdmin((current) => ({ ...current, saving: false, error: error.message || "Could not create login user." }));
    }
  }

  async function resetLoginPassword() {
    if (!resetDraft.userId) {
      setUserAdmin((current) => ({ ...current, error: "Select a login user to reset.", notice: "", temporaryPassword: "" }));
      return;
    }
    setUserAdmin((current) => ({ ...current, saving: true, notice: "", error: "", temporaryPassword: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/users/${resetDraft.userId}/password`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          password: resetDraft.password || null,
          mustChangePassword: resetDraft.mustChangePassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not reset password.");
      setUserAdmin((current) => ({
        ...current,
        saving: false,
        notice: `Password reset for ${data.user?.employee?.fullName || data.user?.email}.`,
        temporaryPassword: data.temporaryPassword || "",
      }));
      setResetDraft((current) => ({ ...current, password: "", mustChangePassword: true }));
      await loadUsers();
    } catch (error) {
      setUserAdmin((current) => ({ ...current, saving: false, error: error.message || "Could not reset password." }));
    }
  }

  async function deleteLoginUser(user) {
    if (!window.confirm(`Delete login user ${user.email}? Employee master data will remain.`)) return;
    setUserAdmin((current) => ({ ...current, saving: true, notice: "", error: "", temporaryPassword: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/users/${user.id}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not delete login user.");
      setUserAdmin((current) => ({
        ...current,
        saving: false,
        notice: `Deleted login user ${data.user?.email || user.email}.`,
        users: current.users.filter((item) => item.id !== user.id),
      }));
    } catch (error) {
      setUserAdmin((current) => ({ ...current, saving: false, error: error.message || "Could not delete login user." }));
    }
  }

  async function resetAttendanceRequestLimit() {
    if (!attendanceResetDraft.employeeLookup.trim()) {
      setAttendanceReset({ saving: false, notice: "", error: "Select or enter an employee to reset." });
      return;
    }
    setAttendanceReset({ saving: true, notice: "", error: "" });
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/attendance-request-limit-resets`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          employeeLookup: attendanceResetDraft.employeeLookup.trim(),
          month: attendanceResetDraft.month || currentPayrollMonth(),
          justification: attendanceResetDraft.justification.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not reset attendance request count.");
      setAttendanceReset({
        saving: false,
        notice: `Reset ${data.reset?.employee || "employee"} for ${data.reset?.month || attendanceResetDraft.month}. Previous count was ${data.reset?.previousRequestCount ?? 0}; effective count is now 0.`,
        error: "",
      });
      setAttendanceResetDraft((current) => ({ ...current, justification: "" }));
    } catch (error) {
      setAttendanceReset({ saving: false, notice: "", error: error.message || "Could not reset attendance request count." });
    }
  }

  async function loadDeviceControl() {
    setDeviceControl((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/login-devices`, {
        credentials: "include",
        headers: { "X-HRMS-Device-ID": getDeviceKey() },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not load device controls.");
      setDeviceControl((current) => ({
        ...current,
        loading: false,
        policy: data.policy || current.policy,
        currentDevice: data.currentDevice || null,
        devices: data.devices || [],
        loginEvents: data.loginEvents || [],
      }));
    } catch (error) {
      setDeviceControl((current) => ({ ...current, loading: false, error: error.message || "Could not load device controls." }));
    }
  }

  async function approveCurrentDevice() {
    setDeviceControl((current) => ({ ...current, saving: true, notice: "", error: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/login-devices/current`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-HRMS-Device-ID": getDeviceKey() },
        credentials: "include",
        body: JSON.stringify({ deviceKey: getDeviceKey(), label: deviceLabel(), deviceInfo: loginDeviceInfo() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not approve this machine.");
      setDeviceControl((current) => ({ ...current, saving: false, notice: "This machine is now allowed for HRMS login." }));
      await loadDeviceControl();
    } catch (error) {
      setDeviceControl((current) => ({ ...current, saving: false, error: error.message || "Could not approve this machine." }));
    }
  }

  async function setDeviceRestriction(enabled) {
    setDeviceControl((current) => ({ ...current, saving: true, notice: "", error: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/login-devices/policy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-HRMS-Device-ID": getDeviceKey() },
        credentials: "include",
        body: JSON.stringify({ loginDeviceRestrictionEnabled: enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not update device login policy.");
      setDeviceControl((current) => ({
        ...current,
        saving: false,
        notice: enabled ? "Login is now restricted to allowed machines." : "Machine restriction is now disabled.",
        policy: data.policy || { loginDeviceRestrictionEnabled: enabled },
      }));
    } catch (error) {
      setDeviceControl((current) => ({ ...current, saving: false, error: error.message || "Could not update device login policy." }));
    }
  }

  async function updateDeviceStatus(id, isActive) {
    setDeviceControl((current) => ({ ...current, saving: true, notice: "", error: "" }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/login-devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-HRMS-Device-ID": getDeviceKey() },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Could not update this machine.");
      setDeviceControl((current) => ({ ...current, saving: false, notice: isActive ? "Machine allowed." : "Machine disabled." }));
      await loadDeviceControl();
    } catch (error) {
      setDeviceControl((current) => ({ ...current, saving: false, error: error.message || "Could not update this machine." }));
    }
  }

  useEffect(() => {
    loadUsers();
    loadDeviceControl();
  }, []);

  return (
    <div className="stack">
      <Panel title="Login Users" meta={`${userAdmin.users.length} user${userAdmin.users.length === 1 ? "" : "s"}`}>
        <div className="dashboard-section-label">Create login user</div>
        <div className="form-grid">
          <Field label="Employee code / email / name" value={userDraft.employeeCode} onChange={(value) => updateUserDraft("employeeCode", value)} required />
          <Field label="Login email" value={userDraft.email} onChange={(value) => updateUserDraft("email", value)} />
          <Field label="Username" value={userDraft.username} onChange={(value) => updateUserDraft("username", value)} />
          <SelectField label="Role" value={userDraft.role} onChange={(value) => updateUserDraft("role", value)} options={["employee", "manager", "hr", "admin"]} />
          <SelectField label="Status" value={userDraft.status} onChange={(value) => updateUserDraft("status", value)} options={["active", "inactive", "locked"]} />
          <Field label="Temporary password" value={userDraft.password} onChange={(value) => updateUserDraft("password", value)} />
          <label className="toggle-row">
            <input type="checkbox" checked={userDraft.mustChangePassword} onChange={(event) => updateUserDraft("mustChangePassword", event.target.checked)} />
            <span>Force password change</span>
          </label>
        </div>
        <div className="modal-actions">
          <span className="form-note">Leave email, username, or password blank to use employee defaults and a generated password.</span>
          <button className="primary-btn" disabled={userAdmin.saving} onClick={saveLoginUser}><UserCheck size={17} /> {userAdmin.saving ? "Saving..." : "Create user"}</button>
        </div>
        <div className="dashboard-section-label">Reset password</div>
        <div className="form-grid">
          <SelectField
            label="Login user"
            value={resetDraft.userId}
            onChange={(value) => updateResetDraft("userId", value)}
            options={[
              { value: "", label: "Select user" },
              ...userAdmin.users.map((user) => ({ value: user.id, label: `${user.employee?.fullName || user.email} (${user.email})` })),
            ]}
          />
          <Field label="New temporary password" value={resetDraft.password} onChange={(value) => updateResetDraft("password", value)} />
          <label className="toggle-row">
            <input type="checkbox" checked={resetDraft.mustChangePassword} onChange={(event) => updateResetDraft("mustChangePassword", event.target.checked)} />
            <span>Force password change</span>
          </label>
        </div>
        <div className="modal-actions">
          <span className="form-note">Leave password blank to generate a secure temporary password.</span>
          <button className="secondary-btn" disabled={userAdmin.saving || !resetDraft.userId} onClick={resetLoginPassword}><ShieldCheck size={17} /> {userAdmin.saving ? "Saving..." : "Reset password"}</button>
        </div>
        {userAdmin.temporaryPassword && <div className="payroll-notice">Temporary password: <strong>{userAdmin.temporaryPassword}</strong></div>}
        {userAdmin.notice && <div className="form-note">{userAdmin.notice}</div>}
        {userAdmin.error && <div className="form-error">{userAdmin.error}</div>}
        {userAdmin.loading ? (
          <div className="empty-state">Loading login users...</div>
        ) : (
          <DataTable columns={["Employee", "Login", "Role", "Status", "Password", "Last login", "Action"]} rows={userRows.length ? userRows : [["No login users found", "-", "-", "-", "-", "-", "-"]]} />
        )}
      </Panel>

      <Panel title="Attendance Request Login Reset" meta="Admin tool">
        <div className="dashboard-section-label">Reset monthly request count</div>
        <div className="form-grid">
          <SelectField
            label="Login user"
            value={attendanceResetDraft.employeeLookup}
            onChange={(value) => updateAttendanceResetDraft("employeeLookup", value)}
            options={[
              { value: "", label: "Select user" },
              ...userAdmin.users
                .filter((user) => user.employee?.employeeCode || user.employee?.email)
                .map((user) => ({
                  value: user.employee?.employeeCode || user.employee?.email || user.email,
                  label: `${user.employee?.fullName || user.email} (${user.employee?.employeeCode || user.email})`,
                })),
            ]}
          />
          <Field label="Employee code / email / name" value={attendanceResetDraft.employeeLookup} onChange={(value) => updateAttendanceResetDraft("employeeLookup", value)} />
          <Field label="Month" type="month" value={attendanceResetDraft.month} onChange={(value) => updateAttendanceResetDraft("month", value)} />
          <Field label="Admin note" value={attendanceResetDraft.justification} onChange={(value) => updateAttendanceResetDraft("justification", value)} />
        </div>
        <div className="modal-actions">
          <span className="form-note">Use this when an employee is blocked at login because the monthly attendance correction limit was reached.</span>
          <button className="secondary-btn" disabled={attendanceReset.saving || !attendanceResetDraft.employeeLookup.trim()} onClick={resetAttendanceRequestLimit}>
            <ShieldCheck size={17} /> {attendanceReset.saving ? "Resetting..." : "Reset request count"}
          </button>
        </div>
        {attendanceReset.notice && <div className="payroll-notice">{attendanceReset.notice}</div>}
        {attendanceReset.error && <div className="form-error">{attendanceReset.error}</div>}
      </Panel>

      <Panel title="Login Device Control" meta={deviceControl.policy.loginDeviceRestrictionEnabled ? "Restricted" : "Open"}>
        <div className="security-control">
          <div>
            <strong>{deviceControl.policy.loginDeviceRestrictionEnabled ? "Only allowed machines can log in" : "Team laptops are being collected for approval"}</strong>
            <span>Ask team members to log in once from their laptops while restriction is off. New laptop browsers appear here as Pending, with IP and device details for approval.</span>
          </div>
          <div className="security-actions">
            <button className="secondary-btn" onClick={approveCurrentDevice} disabled={deviceControl.saving}>
              <ShieldCheck size={17} /> Allow this machine
            </button>
            <button
              className={deviceControl.policy.loginDeviceRestrictionEnabled ? "secondary-btn danger-btn" : "primary-btn"}
              onClick={() => setDeviceRestriction(!deviceControl.policy.loginDeviceRestrictionEnabled)}
              disabled={deviceControl.saving || (!deviceControl.policy.loginDeviceRestrictionEnabled && !currentDeviceAllowed)}
            >
              {deviceControl.policy.loginDeviceRestrictionEnabled ? "Disable restriction" : "Enable restriction"}
            </button>
          </div>
        </div>
        {deviceControl.notice && <div className="form-note">{deviceControl.notice}</div>}
        {deviceControl.error && <div className="form-error">{deviceControl.error}</div>}
        {deviceControl.loading ? (
          <div className="empty-state">Loading allowed machines...</div>
        ) : (
          <DataTable columns={["Machine", "Type", "Status", "Location / IP", "Last seen", "Approved", "Action"]} rows={deviceRows.length ? deviceRows : [["No laptop logins captured yet", "-", "-", "-", "-", "-", "-"]]} />
        )}
      </Panel>

      <Panel title="Login History" meta="Recent 25">
        <DataTable
          columns={["User", "Result", "Reason", "Type", "Device", "Location / IP", "When"]}
          rows={loginEventRows.length ? loginEventRows : [["No login activity recorded yet", "-", "-", "-", "-", "-", "-"]]}
        />
      </Panel>

      <Panel title="Role Permissions" meta={profile.label}>
        <DataTable columns={["Role", "Access", "Allowed actions"]} rows={permissionRows} />
      </Panel>

      <Panel title="Module Access Matrix" meta="Read-only MVP">
        <DataTable columns={["Module", "Roles", "Permissions"]} rows={moduleRows} />
      </Panel>

      <div className="module-grid">
        <Feature title="Leave Rules" text="Annual 18, Sick 7, Casual 6, Work From Home 24, Unpaid 0. Approved and pending leave reduce availability." icon={CalendarCheck} />
        <Feature title="Attendance Rules" text="Default day is Present. Approved leave locks the attendance row. Approved WFH becomes Remote." icon={Clock3} />
        <Feature title="Payroll Rules" text="Monthly salary drives gross pay. Absent days create deductions. Status moves Draft, Reviewed, Approved, Paid." icon={IndianRupee} />
      </div>

      <Panel title="Audit & Security Notes" meta="Planned backend">
        <div className="check-list">
          <div className="check-row"><ShieldCheck size={17} /><span>Every sensitive HR action should be logged after backend integration.</span></div>
          <div className="check-row"><ShieldCheck size={17} /><span>Laravel backend will enforce permissions server-side, not only in the React UI.</span></div>
          <div className="check-row"><ShieldCheck size={17} /><span>Exports and payroll approval should require Admin / HR or Finance access.</span></div>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Metric({ label, value, note }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function QueueItem({ label, value, tone }) {
  return <div className="queue-item"><span>{label}</span><Badge tone={tone}>{value}</Badge></div>;
}

function Badge({ tone, children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Person({ name, detail }) {
  return (
    <div className="person">
      <div className="avatar">{initials(name)}</div>
      <div><strong>{name}</strong><span>{detail}</span></div>
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Feature({ title, text, icon: Icon }) {
  return <div className="feature"><Icon size={21} /><h3>{title}</h3><p>{text}</p></div>;
}

function Progress({ label, value }) {
  return <div className="progress-row"><div><span>{label}</span><strong>{value}%</strong></div><div className="bar"><i style={{ width: `${value}%` }} /></div></div>;
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="login-page">
          <section className="login-card" aria-label="Application error">
            <div className="login-brand compact">
              <div className="brand-mark">HG</div>
              <div>
                <strong>HR Guru</strong>
                <span>HRMS</span>
              </div>
            </div>
            <h1>Something went wrong</h1>
            <p className="form-note">The page could not open this profile cleanly. Please refresh once or return to admin and try again.</p>
            <div className="form-error">{this.state.error.message || "Unexpected application error."}</div>
            <button className="primary-btn login-submit" type="button" onClick={() => window.location.reload()}>Reload HRMS</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(<AppErrorBoundary><App /></AppErrorBoundary>);
