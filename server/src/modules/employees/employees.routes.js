import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";
import { httpError } from "../../lib/http-error.js";

const router = Router();

const employeeSchema = z.object({
  employeeCode: z.string().min(1),
  legalEntity: z.string().min(1).optional(),
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  designation: z.string().min(1),
  department: z.string().min(1),
  client: z.string().optional().nullable(),
  clientStartDate: z.string().optional().nullable(),
  managerEmployeeCode: z.string().optional().nullable(),
  workLocation: z.string().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  workMode: z.string().optional().nullable(),
  status: z.enum(["active", "probation", "on_leave", "inactive", "exited"]).optional(),
  joinDate: z.string().min(1),
  confirmationDate: z.string().optional().nullable(),
  exitDate: z.string().optional().nullable(),
  salaryBand: z.string().optional().nullable(),
  ctc: z.string().optional().nullable(),
  monthlySalary: z.union([z.string(), z.number()]).optional().nullable(),
  pan: z.string().optional().nullable(),
  uan: z.string().optional().nullable(),
  aadhaarNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  ifsc: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  complianceStatus: z.string().optional().nullable(),
  documents: z.string().optional().nullable(),
  lifecycleStage: z.string().optional().nullable(),
});

const updateEmployeeSchema = employeeSchema.partial().omit({ employeeCode: true });
const complianceSchema = z.object({
  pan: z.string().optional().nullable(),
  uan: z.string().optional().nullable(),
  aadhaarNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  ifsc: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
});

function toDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function employeeSelect() {
  return {
    id: true,
    employeeCode: true,
    legalEntity: true,
    fullName: true,
    email: true,
    phone: true,
    dateOfBirth: true,
    gender: true,
    address: true,
    emergencyContact: true,
    designation: true,
    department: true,
    client: true,
    clientStartDate: true,
    managerId: true,
    manager: { select: { employeeCode: true, fullName: true } },
    workLocation: true,
    employmentType: true,
    workMode: true,
    status: true,
    joinDate: true,
    confirmationDate: true,
    exitDate: true,
    salaryBand: true,
    ctc: true,
    monthlySalary: true,
    pan: true,
    uan: true,
    aadhaarNumber: true,
    bankName: true,
    bankAccount: true,
    ifsc: true,
    bankBranch: true,
    complianceStatus: true,
    documents: true,
    lifecycleStage: true,
  };
}

const sensitiveEmployeeFields = [
  "salaryBand",
  "ctc",
  "monthlySalary",
  "pan",
  "uan",
  "aadhaarNumber",
  "bankName",
  "bankAccount",
  "ifsc",
  "bankBranch",
];

function canViewSensitiveEmployeeFields(user, employee) {
  if (["admin", "hr"].includes(user?.role)) return true;
  return Boolean(user?.employee?.id && employee?.id === user.employee.id);
}

function publicEmployee(employee, user = null) {
  const showSensitive = canViewSensitiveEmployeeFields(user, employee);
  const result = {
    id: employee.id,
    employeeCode: employee.employeeCode,
    legalEntity: employee.legalEntity || "HRGP",
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone || "",
    dateOfBirth: toDateString(employee.dateOfBirth),
    gender: employee.gender || "",
    address: employee.address || "",
    emergencyContact: employee.emergencyContact || "",
    designation: employee.designation,
    department: employee.department,
    client: employee.client || "",
    clientStartDate: toDateString(employee.clientStartDate),
    managerEmployeeCode: employee.manager?.employeeCode || "",
    managerName: employee.manager?.fullName || "",
    workLocation: employee.workLocation || "",
    employmentType: employee.employmentType,
    workMode: employee.workMode,
    status: employee.status,
    joinDate: toDateString(employee.joinDate),
    confirmationDate: toDateString(employee.confirmationDate),
    exitDate: toDateString(employee.exitDate),
    salaryBand: showSensitive ? employee.salaryBand || "" : "",
    ctc: showSensitive ? employee.ctc || "" : "",
    monthlySalary: showSensitive ? employee.monthlySalary?.toString() || "0" : "0",
    pan: showSensitive ? employee.pan || "" : "",
    uan: showSensitive ? employee.uan || "" : "",
    aadhaarNumber: showSensitive ? employee.aadhaarNumber || "" : "",
    bankName: showSensitive ? employee.bankName || "" : "",
    bankAccount: showSensitive ? employee.bankAccount || "" : "",
    ifsc: showSensitive ? employee.ifsc || "" : "",
    bankBranch: showSensitive ? employee.bankBranch || "" : "",
    complianceStatus: employee.complianceStatus || "Pending HR Verification",
    documents: employee.documents || "",
    lifecycleStage: employee.lifecycleStage || "",
  };

  if (!showSensitive) {
    sensitiveEmployeeFields.forEach((field) => {
      result[field] = field === "monthlySalary" ? "0" : "";
    });
  }

  return result;
}

function publicEmployeeLegacy(employee) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    legalEntity: employee.legalEntity || "HRGP",
    fullName: employee.fullName,
    email: employee.email,
    phone: employee.phone || "",
    dateOfBirth: toDateString(employee.dateOfBirth),
    gender: employee.gender || "",
    address: employee.address || "",
    emergencyContact: employee.emergencyContact || "",
    designation: employee.designation,
    department: employee.department,
    client: employee.client || "",
    clientStartDate: toDateString(employee.clientStartDate),
    managerEmployeeCode: employee.manager?.employeeCode || "",
    managerName: employee.manager?.fullName || "",
    workLocation: employee.workLocation || "",
    employmentType: employee.employmentType,
    workMode: employee.workMode,
    status: employee.status,
    joinDate: toDateString(employee.joinDate),
    confirmationDate: toDateString(employee.confirmationDate),
    exitDate: toDateString(employee.exitDate),
    salaryBand: employee.salaryBand || "",
    ctc: employee.ctc || "",
    monthlySalary: employee.monthlySalary?.toString() || "0",
    pan: employee.pan || "",
    uan: employee.uan || "",
    aadhaarNumber: employee.aadhaarNumber || "",
    bankName: employee.bankName || "",
    bankAccount: employee.bankAccount || "",
    ifsc: employee.ifsc || "",
    bankBranch: employee.bankBranch || "",
    complianceStatus: employee.complianceStatus || "Pending HR Verification",
    documents: employee.documents || "",
    lifecycleStage: employee.lifecycleStage || "",
  };
}

async function resolveManager(employeeCode) {
  if (!employeeCode) return undefined;
  const manager = await prisma.employee.findFirst({ where: { employeeCode } });
  if (!manager) throw httpError(400, "Selected manager was not found.");
  return manager.id;
}

function has(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function salaryValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw httpError(400, "Monthly salary must be a valid number.");
  return amount;
}

async function employeeData(input, { partial = false } = {}) {
  const data = {};
  if (has(input, "fullName")) data.fullName = input.fullName;
  if (has(input, "legalEntity")) data.legalEntity = input.legalEntity || "HRGP";
  if (has(input, "email")) data.email = input.email.toLowerCase();
  if (has(input, "phone")) data.phone = input.phone || null;
  if (has(input, "dateOfBirth")) data.dateOfBirth = toDate(input.dateOfBirth);
  if (has(input, "gender")) data.gender = input.gender || null;
  if (has(input, "address")) data.address = input.address || null;
  if (has(input, "emergencyContact")) data.emergencyContact = input.emergencyContact || null;
  if (has(input, "designation")) data.designation = input.designation;
  if (has(input, "department")) data.department = input.department;
  if (has(input, "client")) data.client = input.client || null;
  if (has(input, "clientStartDate")) data.clientStartDate = toDate(input.clientStartDate || "2026-01-01");
  if (has(input, "workLocation")) data.workLocation = input.workLocation || null;
  if (has(input, "employmentType")) data.employmentType = input.employmentType || "Full-time";
  if (has(input, "workMode")) data.workMode = input.workMode || "Office";
  if (has(input, "status")) data.status = input.status || "probation";
  if (has(input, "joinDate")) data.joinDate = toDate(input.joinDate);
  if (has(input, "confirmationDate")) data.confirmationDate = toDate(input.confirmationDate);
  if (has(input, "exitDate")) data.exitDate = toDate(input.exitDate);
  if (has(input, "salaryBand")) data.salaryBand = input.salaryBand || null;
  if (has(input, "ctc")) data.ctc = input.ctc || null;
  if (has(input, "monthlySalary")) data.monthlySalary = salaryValue(input.monthlySalary);
  if (has(input, "pan")) data.pan = input.pan || null;
  if (has(input, "uan")) data.uan = input.uan || null;
  if (has(input, "aadhaarNumber")) data.aadhaarNumber = input.aadhaarNumber || null;
  if (has(input, "bankName")) data.bankName = input.bankName || null;
  if (has(input, "bankAccount")) data.bankAccount = input.bankAccount || null;
  if (has(input, "ifsc")) data.ifsc = input.ifsc || null;
  if (has(input, "bankBranch")) data.bankBranch = input.bankBranch || null;
  if (has(input, "complianceStatus")) data.complianceStatus = input.complianceStatus || "Pending HR Verification";
  if (has(input, "documents")) data.documents = input.documents || null;
  if (has(input, "lifecycleStage")) data.lifecycleStage = input.lifecycleStage || null;
  if (has(input, "managerEmployeeCode")) {
    const managerId = await resolveManager(input.managerEmployeeCode);
    data.managerId = managerId || null;
  }
  if (!partial) {
    data.employmentType ||= "Full-time";
    data.workMode ||= "Office";
    data.status ||= "probation";
    data.monthlySalary ||= 0;
  }
  return data;
}

function employeeWhere(id) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id) ? { OR: [{ id }, { employeeCode: id }] } : { employeeCode: id };
}

router.use(requireAuth);

router.get("/", async (request, response, next) => {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: [{ legalEntity: "asc" }, { employeeCode: "asc" }],
      select: employeeSelect(),
    });
    response.json({ employees: employees.map((employee) => publicEmployee(employee, request.user)) });
  } catch (error) {
    next(error);
  }
});

router.get("/export/csv", requireRole("admin", "hr"), async (_request, response, next) => {
  try {
    const employees = await prisma.employee.findMany({ orderBy: [{ legalEntity: "asc" }, { employeeCode: "asc" }], select: employeeSelect() });
    const header = ["Entity", "Employee ID", "Full Name", "Email", "Phone", "Job Title", "Department", "Client", "Manager", "Location", "Status", "Monthly Salary", "PAN", "UAN", "Aadhaar", "Bank Name", "Bank Account", "IFSC", "Bank Branch", "Compliance Status"];
    const rows = employees.map(publicEmployee).map((employee) => [
      employee.legalEntity,
      employee.employeeCode,
      employee.fullName,
      employee.email,
      employee.phone,
      employee.designation,
      employee.department,
      employee.client,
      employee.managerName,
      employee.workLocation,
      employee.status,
      employee.monthlySalary,
      employee.pan,
      employee.uan,
      employee.aadhaarNumber,
      employee.bankName,
      employee.bankAccount,
      employee.ifsc,
      employee.bankBranch,
      employee.complianceStatus,
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    response.header("Content-Type", "text/csv;charset=utf-8");
    response.attachment("hrguru-employee-master.csv");
    response.send(csv);
  } catch (error) {
    next(error);
  }
});

router.patch("/me/compliance", async (request, response, next) => {
  try {
    if (!request.user.employee?.id) throw httpError(404, "Profile record is not linked yet.");
    const parsed = complianceSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Compliance details are invalid.");
    const employee = await prisma.employee.update({
      where: { id: request.user.employee.id },
      data: {
        ...(await employeeData(parsed.data, { partial: true })),
        complianceStatus: "Pending HR Verification",
      },
      select: employeeSelect(),
    });
    response.json({ employee: publicEmployee(employee, request.user) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (request, response, next) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: employeeWhere(request.params.id),
      select: employeeSelect(),
    });
    if (!employee) throw httpError(404, "Employee not found.");
    response.json({ employee: publicEmployee(employee, request.user) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = employeeSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Employee details are incomplete.");
    const employee = await prisma.employee.create({
      data: {
        employeeCode: parsed.data.employeeCode,
        legalEntity: parsed.data.legalEntity || "HRGP",
        ...(await employeeData(parsed.data)),
      },
      select: employeeSelect(),
    });
    response.status(201).json({ employee: publicEmployee(employee, request.user) });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Employee ID or email already exists."));
    else next(error);
  }
});

router.patch("/:id", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = updateEmployeeSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Employee details are invalid.");
    const current = await prisma.employee.findFirst({
      where: employeeWhere(request.params.id),
      select: { id: true },
    });
    if (!current) throw httpError(404, "Employee not found.");
    const employee = await prisma.employee.update({
      where: { id: current.id },
      data: await employeeData(parsed.data, { partial: true }),
      select: employeeSelect(),
    });
    response.json({ employee: publicEmployee(employee, request.user) });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Employee email already exists."));
    else next(error);
  }
});

router.delete("/:id", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const current = await prisma.employee.findFirst({
      where: employeeWhere(request.params.id),
      select: { id: true },
    });
    if (!current) throw httpError(404, "Employee not found.");
    await prisma.employee.delete({ where: { id: current.id } });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/import", requireRole("admin", "hr"), (_request, response) => {
  response.status(501).json({ error: { message: "Employee CSV import will be connected after the main employee save flow.", status: 501 } });
});

export default router;
