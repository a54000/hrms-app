import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { httpError } from "../../lib/http-error.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const assignmentSchema = z.object({
  employeeCode: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isWorking: z.boolean().optional(),
});
const saveSchema = z.object({
  month: monthSchema,
  assignments: z.array(assignmentSchema),
});

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(value) {
  return value.toISOString().slice(0, 10);
}

function monthRange(month) {
  const start = toDate(`${month}-01`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function publicAssignment(row) {
  return {
    id: row.id,
    employeeId: row.employee.employeeCode,
    employee: row.employee.fullName,
    date: toDateString(row.rotaDate),
    isWorking: row.isWorking,
  };
}

router.use(requireAuth);

router.get("/", async (request, response, next) => {
  try {
    const month = request.query.month || new Date().toISOString().slice(0, 7);
    const parsed = monthSchema.safeParse(month);
    if (!parsed.success) throw httpError(400, "Month must be in YYYY-MM format.");
    const { start, end } = monthRange(parsed.data);
    const assignments = await prisma.saturdayRotaAssignment.findMany({
      where: {
        rotaDate: { gte: start, lt: end },
        isWorking: true,
        employee: { legalEntity: "HRGP", status: "active" },
      },
      include: { employee: { select: { employeeCode: true, fullName: true, status: true, legalEntity: true } } },
      orderBy: [{ rotaDate: "asc" }, { employee: { employeeCode: "asc" } }],
    });
    response.json({ assignments: assignments.map(publicAssignment) });
  } catch (error) {
    next(error);
  }
});

router.put("/", requireRole("admin", "hr", "manager"), async (request, response, next) => {
  try {
    const parsed = saveSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Saturday rota details are invalid.");
    const { start, end } = monthRange(parsed.data.month);
    const activeEmployees = await prisma.employee.findMany({
      where: {
        legalEntity: "HRGP",
        status: "active",
        employeeCode: { in: parsed.data.assignments.map((item) => item.employeeCode) },
      },
      select: { id: true, employeeCode: true },
    });
    const employeeByCode = new Map(activeEmployees.map((employee) => [employee.employeeCode, employee]));
    const rows = parsed.data.assignments
      .filter((item) => item.isWorking !== false && employeeByCode.has(item.employeeCode))
      .map((item) => ({
        employeeId: employeeByCode.get(item.employeeCode).id,
        rotaDate: toDate(item.date),
        isWorking: true,
        assignedById: request.user.id,
      }));

    await prisma.$transaction([
      prisma.saturdayRotaAssignment.deleteMany({ where: { rotaDate: { gte: start, lt: end } } }),
      ...rows.map((data) => prisma.saturdayRotaAssignment.create({ data })),
    ]);

    const saved = await prisma.saturdayRotaAssignment.findMany({
      where: {
        rotaDate: { gte: start, lt: end },
        isWorking: true,
        employee: { legalEntity: "HRGP", status: "active" },
      },
      include: { employee: { select: { employeeCode: true, fullName: true } } },
      orderBy: [{ rotaDate: "asc" }, { employee: { employeeCode: "asc" } }],
    });
    response.json({ assignments: saved.map(publicAssignment) });
  } catch (error) {
    next(error);
  }
});

export default router;
