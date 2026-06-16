import { Router } from "express";
import { sendOnboardingEmails } from "../../jobs/send-onboarding-emails.js";
import { sendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";
import { z } from "zod";

const router = Router();
const sendTemplateSchema = z.object({
  subject: z.string().trim().min(3).optional(),
  text: z.string().trim().min(10).optional(),
  html: z.string().trim().optional(),
});

const sendDocumentSchema = z.object({
  employeeCode: z.string().trim().min(1),
  documentType: z.string().trim().min(3),
  subject: z.string().trim().min(3),
  text: z.string().trim().min(10),
  html: z.string().trim().min(10).optional(),
  documentHtml: z.string().trim().min(10).optional(),
});

router.use(requireAuth, requireRole("admin", "hr"));

const genericTemplates = [
  {
    id: "payroll-completion",
    name: "Payroll completion",
    description: "Inform team members that payroll processing is complete and salary slips are available in HRMS.",
    subject: "Payroll processing completed for this month",
    intro: "Payroll processing for this month has been completed.",
    bullets: [
      "You can log in to HRMS and check your salary slip from the Payroll section.",
      "Please verify your bank details, PAN, UAN, and Aadhaar details in My Profile.",
      "If you find any mismatch, contact Admin/HR before the payroll closure window ends.",
    ],
    closing: "Thank you for keeping your HRMS records updated.",
  },
  {
    id: "leave-announcement",
    name: "Leave announcement",
    description: "Share leave balance or leave policy announcements with the team.",
    subject: "Leave balance and policy update",
    intro: "This is a reminder to review your Casual Leave balance and upcoming leave plans in HRMS.",
    bullets: [
      "Casual Leave is managed through HRMS and is subject to available balance.",
      "Please apply for planned leave in advance so managers can review staffing needs.",
      "If your leave quota is reduced due to attendance shortfall, HRMS will notify you after your next check-in.",
    ],
    closing: "Please coordinate planned leaves with your manager.",
  },
  {
    id: "attendance-reminder",
    name: "Attendance reminder",
    description: "Remind team members about daily check-in, checkout, and request limits.",
    subject: "HRMS attendance reminder",
    intro: "Please follow the HRMS attendance rules consistently from your approved laptop or desktop.",
    bullets: [
      "Login is available from 8:30 AM to 8:00 PM.",
      "Direct check-in is available till 10:30 AM.",
      "If check-in or checkout is missed, raise the correct Forgot to punch request.",
      "A maximum of 5 Forgot to punch requests are allowed per month. Working from 2nd Half does not count in this limit.",
      "Working less than 6 hours may be marked as half day as per policy.",
    ],
    closing: "Consistent attendance marking helps avoid payroll and leave balance issues.",
  },
  {
    id: "holiday-announcement",
    name: "Holiday announcement",
    description: "Announce upcoming national holidays or office holidays.",
    subject: "Upcoming holiday announcement",
    intro: "Please note the upcoming holiday update from HR Guru.",
    bullets: [
      "Check the Leave module in HRMS for the active holiday calendar.",
      "Plan leave requests around holiday dates in advance.",
      "For urgent client work or special staffing requirements, please coordinate with your manager.",
    ],
    closing: "Enjoy the upcoming holiday and keep your HRMS calendar updated.",
  },
  {
    id: "policy-update",
    name: "Policy update",
    description: "Send a general HR policy update or reminder to all team members.",
    subject: "HRMS policy update",
    intro: "A policy reminder has been issued for all team members.",
    bullets: [
      "Please keep your employee master details complete and accurate in HRMS.",
      "Bank details, PAN, UAN, Aadhaar, and phone number should be reviewed regularly.",
      "Any missing or incorrect information should be updated from My Profile or shared with HR.",
    ],
    closing: "Thank you for helping keep HRMS records clean and compliant.",
  },
  {
    id: "device-login-reminder",
    name: "Approved device login reminder",
    description: "Remind employees to use only approved laptops/desktops for HRMS login.",
    subject: "HRMS approved device login reminder",
    intro: "HRMS access is restricted to approved laptop or desktop devices.",
    bullets: [
      "Do not use mobile devices for HRMS login.",
      "Use your assigned laptop or desktop for attendance and HRMS self-service.",
      "If HRMS says your device is pending approval, contact Admin before marking attendance.",
    ],
    closing: "This helps protect employee and payroll information.",
  },
];

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function templateText(template, recipient = {}) {
  const appUrl = process.env.CLIENT_ORIGIN || "https://hrms.hrgp.in";
  return [
    `Hi ${recipient.fullName || "Team member"},`,
    "",
    template.intro,
    "",
    ...template.bullets.map((item) => `- ${item}`),
    "",
    `HRMS URL: ${appUrl}`,
    "",
    template.closing,
    "",
    "Regards,",
    "HR Guru HRMS",
  ].join("\n");
}

function templateHtml(template, recipient = {}) {
  const appUrl = process.env.CLIENT_ORIGIN || "https://hrms.hrgp.in";
  return `
    <p>Hi ${htmlEscape(recipient.fullName || "Team member")},</p>
    <p>${htmlEscape(template.intro)}</p>
    <ul>${template.bullets.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul>
    <p><strong>HRMS URL:</strong> <a href="${htmlEscape(appUrl)}">${htmlEscape(appUrl)}</a></p>
    <p>${htmlEscape(template.closing)}</p>
    <p>Regards,<br>HR Guru HRMS</p>
  `;
}

function editedText(template, recipient, overrideText) {
  return String(overrideText || templateText(template, recipient)).replaceAll("{{name}}", recipient.fullName || "Team member").replaceAll("{{hrmsUrl}}", process.env.CLIENT_ORIGIN || "https://hrms.hrgp.in");
}

function editedHtml(template, recipient, overrideHtml, overrideText) {
  if (overrideHtml) {
    return String(overrideHtml).replaceAll("{{name}}", htmlEscape(recipient.fullName || "Team member")).replaceAll("{{hrmsUrl}}", htmlEscape(process.env.CLIENT_ORIGIN || "https://hrms.hrgp.in"));
  }
  return editedText(template, recipient, overrideText).split("\n").map((line) => line.trim() ? `<p>${htmlEscape(line)}</p>` : "<br>").join("");
}

async function teamRecipients() {
  const users = await prisma.user.findMany({
    where: {
      status: "active",
      role: { in: ["employee", "manager"] },
      employee: { status: { in: ["active", "probation", "on_leave"] } },
    },
    select: {
      email: true,
      username: true,
      employee: { select: { fullName: true, employeeCode: true } },
    },
    orderBy: [{ employee: { employeeCode: "asc" } }],
  });
  return users.map((user) => ({
    email: user.email,
    username: user.username || "",
    fullName: user.employee?.fullName || user.username || user.email,
    employeeCode: user.employee?.employeeCode || "",
  }));
}

async function genericTemplatePreview(template) {
  const recipients = await teamRecipients();
  const sampleRecipient = recipients[0] || { email: "", fullName: "Team member" };
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    recipientCount: recipients.length,
    recipients,
    sample: {
      to: sampleRecipient.email,
      subject: template.subject,
      text: templateText(template, sampleRecipient),
      html: templateHtml(template, sampleRecipient),
    },
    sourceFile: "",
  };
}

async function sendGenericTemplate(template, overrides = {}) {
  const recipients = await teamRecipients();
  const subject = overrides.subject || template.subject;
  const deliveries = [];
  for (const recipient of recipients) {
    deliveries.push({
      to: recipient.email,
      result: await sendMail({
        to: recipient.email,
        subject,
        html: editedHtml(template, recipient, overrides.html, overrides.text),
        text: editedText(template, recipient, overrides.text),
      }),
    });
  }
  return { mode: "send", templateId: template.id, count: recipients.length, deliveries };
}

function responseFromSendResult(result, label) {
  const sentCount = result.deliveries.filter((delivery) => delivery.result?.status === "sent").length;
  const queuedCount = result.deliveries.length - sentCount;
  return {
    ...result,
    sentCount,
    queuedCount,
    message: sentCount === result.count
      ? `${sentCount} ${label} email${sentCount === 1 ? "" : "s"} sent.`
      : `${result.count} ${label} email${result.count === 1 ? "" : "s"} processed. ${queuedCount} queued because mail is not fully configured.`,
  };
}

router.get("/templates", async (_request, response, next) => {
  try {
    const preview = await sendOnboardingEmails({ send: false });
    const recipients = await teamRecipients();
    const genericPreviews = await Promise.all(genericTemplates.map((template) => genericTemplatePreview(template)));
    response.json({
      templates: [
        {
          id: "custom-email",
          name: "Custom email",
          description: "Write a custom subject and message for active team members.",
          recipientCount: recipients.length,
          recipients,
          sample: {
            to: recipients[0]?.email || "",
            subject: "",
            text: "",
            html: "",
          },
          sourceFile: "",
        },
        {
          id: "team-onboarding",
          name: "Team onboarding login details",
          description: "Send HRMS login URL, username, temporary password, and attendance instructions to all team members.",
          recipientCount: preview.count,
          sample: preview.sample,
          sourceFile: preview.filePath,
        },
        ...genericPreviews,
      ],
    });
  } catch (error) {
    next(error);
  }
});

router.post("/templates/:templateId/send", async (request, response, next) => {
  try {
    const parsed = sendTemplateSchema.safeParse(request.body || {});
    if (!parsed.success) {
      response.status(400).json({ error: { message: "Email subject and body are required.", status: 400 } });
      return;
    }
    if (request.params.templateId === "team-onboarding") {
      if (parsed.data.subject || parsed.data.text || parsed.data.html) {
        response.status(400).json({ error: { message: "Team onboarding uses the secure password file template and cannot be edited here.", status: 400 } });
        return;
      }
      const result = await sendOnboardingEmails({ send: true });
      response.json(responseFromSendResult(result, "onboarding"));
      return;
    }
    if (request.params.templateId === "custom-email") {
      if (!parsed.data.subject || !parsed.data.text) {
        response.status(400).json({ error: { message: "Custom email subject and body are required.", status: 400 } });
        return;
      }
      const result = await sendGenericTemplate({
        id: "custom-email",
        name: "Custom email",
        subject: parsed.data.subject,
        intro: "",
        bullets: [],
        closing: "",
      }, parsed.data);
      response.json(responseFromSendResult(result, "custom"));
      return;
    }

    const template = genericTemplates.find((item) => item.id === request.params.templateId);
    if (!template) {
      response.status(404).json({ error: { message: "Communication template not found.", status: 404 } });
      return;
    }
    const result = await sendGenericTemplate(template, parsed.data);
    response.json(responseFromSendResult(result, template.name.toLowerCase()));
  } catch (error) {
    next(error);
  }
});

router.post("/documents/send", async (request, response, next) => {
  try {
    const parsed = sendDocumentSchema.safeParse(request.body || {});
    if (!parsed.success) {
      response.status(400).json({ error: { message: "Document email details are incomplete.", status: 400 } });
      return;
    }
    const employee = await prisma.employee.findFirst({
      where: { employeeCode: parsed.data.employeeCode },
      select: { employeeCode: true, fullName: true, email: true },
    });
    if (!employee) {
      response.status(404).json({ error: { message: "Employee not found.", status: 404 } });
      return;
    }
    const result = await sendMail({
      to: employee.email,
      subject: parsed.data.subject,
      text: parsed.data.text,
      html: parsed.data.html || parsed.data.text.split("\n").map((line) => line.trim() ? `<p>${htmlEscape(line)}</p>` : "<br>").join(""),
      attachments: [{
        filename: `${parsed.data.documentType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${employee.employeeCode}.html`,
        content: `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(parsed.data.subject)}</title></head><body>${parsed.data.documentHtml || parsed.data.html || htmlEscape(parsed.data.text)}</body></html>`,
        contentType: "text/html",
      }],
    });
    response.json({
      to: employee.email,
      employeeName: employee.fullName,
      delivery: result,
      message: result.status === "sent"
        ? `${parsed.data.documentType} email sent to ${employee.fullName}.`
        : `${parsed.data.documentType} email queued for ${employee.fullName}. Add SMTP settings to send live emails.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
