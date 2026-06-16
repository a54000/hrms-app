import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { httpError } from "../../lib/http-error.js";
import { sendGmail, sendMail } from "../../lib/mailer.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();

const statusMap = {
  Draft: "draft",
  Reviewed: "reviewed",
  Approved: "approved",
  Paid: "paid",
};

const statusLabelMap = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
  paid: "Paid",
};

const payrollSyncSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  legalEntity: z.string().min(1),
  rows: z.array(z.object({
    employeeId: z.string().uuid().optional(),
    employeeCode: z.string().min(1),
    workDays: z.number(),
    presentDays: z.number(),
    paidLeaveDays: z.number(),
    absentDays: z.number(),
    grossPay: z.number(),
    deductions: z.number(),
    netPay: z.number(),
    status: z.enum(["Draft", "Reviewed", "Approved", "Paid"]),
  })),
});

const statusSchema = z.object({
  status: z.enum(["Draft", "Reviewed", "Approved", "Paid"]),
});

const cycleSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  legalEntity: z.string().min(1),
});

const bulkEmailSchema = z.object({
  payslipIds: z.array(z.string().uuid()).min(1),
  googleAccessToken: z.string().min(1).optional(),
});

const emailSchema = z.object({
  googleAccessToken: z.string().min(1).optional(),
});

const payslipInclude = {
  employee: { select: { id: true, employeeCode: true, fullName: true, email: true, designation: true } },
  payrollCycle: true,
};

function monthDate(month) {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function monthString(date) {
  return date.toISOString().slice(0, 7);
}

function publicPayslip(payslip) {
  return {
    id: payslip.id,
    key: `${monthString(payslip.payrollCycle.payrollMonth)}:${payslip.employee.employeeCode}:${payslip.payrollCycle.legalEntity}`,
    month: monthString(payslip.payrollCycle.payrollMonth),
    legalEntity: payslip.payrollCycle.legalEntity,
    employeeId: payslip.employeeId,
    employeeCode: payslip.employee.employeeCode,
    employeeName: payslip.employee.fullName,
    recipientEmail: payslip.employee.email,
    status: statusLabelMap[payslip.status],
    workDays: payslip.workDays,
    presentDays: payslip.presentDays,
    paidLeaveDays: payslip.paidLeaveDays,
    absentDays: payslip.absentDays,
    grossPay: Number(payslip.grossPay),
    deductions: Number(payslip.deductions),
    netPay: Number(payslip.netPay),
  };
}

function publicCycle(cycle) {
  return {
    id: cycle.id,
    key: `${monthString(cycle.payrollMonth)}:${cycle.legalEntity}`,
    month: monthString(cycle.payrollMonth),
    legalEntity: cycle.legalEntity,
    status: statusLabelMap[cycle.status],
    finalized: cycle.status === "paid",
    processedAt: cycle.processedAt,
    processedBy: cycle.processedBy?.email || "",
  };
}

async function audit(request, action, entityId, beforeData = null, afterData = null) {
  await prisma.auditLog.create({
    data: {
      actorUserId: request.user?.id,
      module: "payroll",
      action,
      entityTable: "PayrollCycle",
      entityId,
      beforeData,
      afterData,
      ipAddress: request.ip,
      userAgent: request.get("user-agent") || "",
    },
  });
}

function canEmailPayslip(user, payslip) {
  if (["admin", "hr"].includes(user.role)) return true;
  return user.employee?.id === payslip.employeeId;
}

function canViewPayslip(user, payslip) {
  if (["admin", "hr"].includes(user.role)) return true;
  return user.employee?.id === payslip.employeeId;
}

function emailReceipt(payslip, delivery = {}) {
  return {
    payslipId: payslip.id,
    employeeCode: payslip.employee.employeeCode,
    employeeName: payslip.employee.fullName,
    recipientEmail: payslip.employee.email,
    month: monthString(payslip.payrollCycle.payrollMonth),
    legalEntity: payslip.payrollCycle.legalEntity,
    emailStatus: delivery.status || "queued",
    deliveryMode: delivery.deliveryMode || "smtp_not_configured",
    messageId: delivery.messageId || null,
  };
}

function formatCurrency(value) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function payslipEmailContent(payslip) {
  const month = monthString(payslip.payrollCycle.payrollMonth);
  const subject = `Salary slip for ${month}`;
  const text = [
    `Dear ${payslip.employee.fullName},`,
    "",
    `Your salary slip for ${month} is ready.`,
    `Net payable: INR ${formatCurrency(payslip.netPay)}`,
    "",
    "Regards,",
    "HR Guru Payroll",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <p>Dear ${payslip.employee.fullName},</p>
      <p>Your salary slip for <strong>${month}</strong> is ready.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;min-width:360px">
        <tr><td style="border:1px solid #e5e7eb">Employee Code</td><td style="border:1px solid #e5e7eb"><strong>${payslip.employee.employeeCode}</strong></td></tr>
        <tr><td style="border:1px solid #e5e7eb">Entity</td><td style="border:1px solid #e5e7eb"><strong>${payslip.payrollCycle.legalEntity}</strong></td></tr>
        <tr><td style="border:1px solid #e5e7eb">Gross Pay</td><td style="border:1px solid #e5e7eb">INR ${formatCurrency(payslip.grossPay)}</td></tr>
        <tr><td style="border:1px solid #e5e7eb">Deductions</td><td style="border:1px solid #e5e7eb">INR ${formatCurrency(payslip.deductions)}</td></tr>
        <tr><td style="border:1px solid #e5e7eb">Net Payable</td><td style="border:1px solid #e5e7eb"><strong>INR ${formatCurrency(payslip.netPay)}</strong></td></tr>
      </table>
      <p>Regards,<br/>HR Guru Payroll</p>
    </div>
  `;
  const attachmentHtml = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>${subject}</title></head>
      <body>${html}</body>
    </html>
  `;
  return {
    subject,
    text,
    html,
    attachments: [{
      filename: `salary-slip-${payslip.employee.employeeCode}-${month}.html`,
      content: attachmentHtml,
      contentType: "text/html",
    }],
  };
}

async function sendPayslipMail(payslip, googleAccessToken) {
  const content = payslipEmailContent(payslip);
  if (googleAccessToken) {
    return emailReceipt(payslip, await sendGmail({
      accessToken: googleAccessToken,
      to: payslip.employee.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    }));
  }
  const delivery = await sendMail({
    to: payslip.employee.email,
    ...content,
  });
  return emailReceipt(payslip, delivery);
}

async function findEmployee(row, legalEntity) {
  if (row.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: row.employeeId } });
    if (employee) return employee;
  }
  const employee = await prisma.employee.findFirst({ where: { employeeCode: row.employeeCode, legalEntity } });
  if (!employee) throw httpError(404, `Employee ${row.employeeCode} was not found for ${legalEntity}.`);
  return employee;
}

router.use(requireAuth);

router.get("/", async (request, response, next) => {
  try {
    const month = request.query.month || new Date().toISOString().slice(0, 7);
    const legalEntity = request.query.legalEntity || undefined;
    const ownEmployeeId = ["admin", "hr"].includes(request.user.role) ? null : request.user.employee?.id;
    const cycles = await prisma.payrollCycle.findMany({
      where: {
        payrollMonth: monthDate(month),
        ...(legalEntity ? { legalEntity } : {}),
      },
      include: {
        payslips: {
          where: ownEmployeeId ? { employeeId: ownEmployeeId } : undefined,
          include: payslipInclude,
        },
        processedBy: { select: { email: true } },
      },
    });
    response.json({
      cycles: cycles.map(publicCycle),
      payslips: cycles.flatMap((cycle) => cycle.payslips.map(publicPayslip)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/finalize", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = cycleSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Payroll cycle details are invalid.");
    const cycle = await prisma.payrollCycle.upsert({
      where: {
        payrollMonth_legalEntity: {
          payrollMonth: monthDate(parsed.data.month),
          legalEntity: parsed.data.legalEntity,
        },
      },
      update: {
        status: "paid",
        processedById: request.user.id,
        processedAt: new Date(),
      },
      create: {
        payrollMonth: monthDate(parsed.data.month),
        legalEntity: parsed.data.legalEntity,
        status: "paid",
        processedById: request.user.id,
        processedAt: new Date(),
      },
      include: { processedBy: { select: { email: true } } },
    });
    await audit(request, "finalized", cycle.id, null, publicCycle(cycle));
    response.json({ cycle: publicCycle(cycle), message: `${parsed.data.legalEntity} payroll finalized for ${parsed.data.month}.` });
  } catch (error) {
    next(error);
  }
});

router.post("/reopen", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = cycleSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Payroll cycle details are invalid.");
    const existing = await prisma.payrollCycle.findUnique({
      where: {
        payrollMonth_legalEntity: {
          payrollMonth: monthDate(parsed.data.month),
          legalEntity: parsed.data.legalEntity,
        },
      },
    });
    if (!existing) throw httpError(404, "Payroll cycle not found.");
    const cycle = await prisma.payrollCycle.update({
      where: { id: existing.id },
      data: {
        status: "reviewed",
        processedById: request.user.id,
        processedAt: new Date(),
      },
      include: { processedBy: { select: { email: true } } },
    });
    await audit(request, "reopened", cycle.id, { status: statusLabelMap[existing.status] }, publicCycle(cycle));
    response.json({ cycle: publicCycle(cycle), message: `${parsed.data.legalEntity} payroll reopened for ${parsed.data.month}.` });
  } catch (error) {
    next(error);
  }
});

router.post("/sync", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = payrollSyncSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Payroll details are invalid.");

    const existingCycle = await prisma.payrollCycle.findUnique({
      where: {
        payrollMonth_legalEntity: {
          payrollMonth: monthDate(parsed.data.month),
          legalEntity: parsed.data.legalEntity,
        },
      },
    });
    if (existingCycle?.status === "paid") throw httpError(409, "Payroll is finalized. Reopen it before making changes.");

    const cycle = await prisma.payrollCycle.upsert({
      where: {
        payrollMonth_legalEntity: {
          payrollMonth: monthDate(parsed.data.month),
          legalEntity: parsed.data.legalEntity,
        },
      },
      update: {},
      create: {
        payrollMonth: monthDate(parsed.data.month),
        legalEntity: parsed.data.legalEntity,
      },
    });

    const saved = [];
    for (const row of parsed.data.rows) {
      const employee = await findEmployee(row, parsed.data.legalEntity);
      const payslip = await prisma.payslip.upsert({
        where: {
          payrollCycleId_employeeId: {
            payrollCycleId: cycle.id,
            employeeId: employee.id,
          },
        },
        update: {
          workDays: row.workDays,
          presentDays: row.presentDays,
          paidLeaveDays: row.paidLeaveDays,
          absentDays: row.absentDays,
          grossPay: row.grossPay,
          deductions: row.deductions,
          netPay: row.netPay,
          status: statusMap[row.status],
          generatedAt: new Date(),
        },
        create: {
          payrollCycleId: cycle.id,
          employeeId: employee.id,
          workDays: row.workDays,
          presentDays: row.presentDays,
          paidLeaveDays: row.paidLeaveDays,
          absentDays: row.absentDays,
          grossPay: row.grossPay,
          deductions: row.deductions,
          netPay: row.netPay,
          status: statusMap[row.status],
          generatedAt: new Date(),
        },
        include: payslipInclude,
      });
      saved.push(publicPayslip(payslip));
    }

    await audit(request, "synced_payslips", cycle.id, null, { month: parsed.data.month, legalEntity: parsed.data.legalEntity, count: saved.length });
    response.json({ payslips: saved });
  } catch (error) {
    next(error);
  }
});

router.patch("/:payslipId/status", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Payroll status is invalid.");
    const current = await prisma.payslip.findUnique({
      where: { id: request.params.payslipId },
      include: { payrollCycle: true },
    });
    if (!current) throw httpError(404, "Payslip not found.");
    if (current.payrollCycle.status === "paid") throw httpError(409, "Payroll is finalized. Reopen it before changing status.");
    const payslip = await prisma.payslip.update({
      where: { id: request.params.payslipId },
      data: { status: statusMap[parsed.data.status] },
      include: {
        ...payslipInclude,
      },
    });
    await audit(request, parsed.data.status === "Paid" ? "marked_paid" : "status_changed", payslip.payrollCycleId, { status: statusLabelMap[current.status] }, { payslipId: payslip.id, status: parsed.data.status });
    response.json({ payslip: publicPayslip(payslip) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Payslip not found."));
    else next(error);
  }
});

router.post("/email-bulk", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = bulkEmailSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Select at least one salary slip to email.");

    const payslips = await prisma.payslip.findMany({
      where: { id: { in: parsed.data.payslipIds } },
      include: payslipInclude,
    });

    const emails = [];
    for (const payslip of payslips) {
      emails.push(await sendPayslipMail(payslip, parsed.data.googleAccessToken));
    }
    const sentCount = emails.filter((email) => email.emailStatus === "sent").length;
    const cycleIds = [...new Set(payslips.map((payslip) => payslip.payrollCycleId))];
    for (const cycleId of cycleIds) {
      await audit(request, "emailed_payslips", cycleId, null, { count: payslips.filter((payslip) => payslip.payrollCycleId === cycleId).length });
    }

    response.json({
      queued: sentCount !== emails.length,
      sent: sentCount,
      count: payslips.length,
      emails,
      message: sentCount === emails.length
        ? `${sentCount} salary slip email${sentCount === 1 ? "" : "s"} sent.`
        : `${payslips.length} salary slip email${payslips.length === 1 ? "" : "s"} queued. Add SMTP settings to send live emails.`,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:payslipId/email", async (request, response, next) => {
  try {
    const parsed = emailSchema.safeParse(request.body || {});
    if (!parsed.success) throw httpError(400, "Email request is invalid.");
    const payslip = await prisma.payslip.findUnique({
      where: { id: request.params.payslipId },
      include: payslipInclude,
    });
    if (!payslip) throw httpError(404, "Payslip not found.");
    if (!canEmailPayslip(request.user, payslip)) throw httpError(403, "You can email only your own salary slip.");

    const email = await sendPayslipMail(payslip, parsed.data.googleAccessToken);
    await audit(request, "emailed_payslip", payslip.payrollCycleId, null, { payslipId: payslip.id, recipientEmail: payslip.employee.email, emailStatus: email.emailStatus });

    response.json({
      queued: email.emailStatus !== "sent",
      sent: email.emailStatus === "sent",
      email,
      message: email.emailStatus === "sent"
        ? `Salary slip email sent to ${payslip.employee.email}.`
        : `Salary slip email queued for ${payslip.employee.email}. Add SMTP settings to send live emails.`,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:payslipId", async (request, response, next) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: request.params.payslipId },
      include: payslipInclude,
    });
    if (!payslip) throw httpError(404, "Payslip not found.");
    if (!canViewPayslip(request.user, payslip)) throw httpError(403, "You can view only your own salary slip.");
    response.json({ payslip: publicPayslip(payslip) });
  } catch (error) {
    next(error);
  }
});

router.get("/:payslipId/pdf", (_request, response) => response.status(501).json({ error: { message: "Payslip PDF file storage will be connected after browser print output is finalized.", status: 501 } }));
router.get("/month/:month/pdf", (_request, response) => response.status(501).json({ error: { message: "Bulk payslip PDF file storage will be connected after browser print output is finalized.", status: 501 } }));

export default router;
