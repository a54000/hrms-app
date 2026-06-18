import { Router } from "express";
import { z } from "zod";
import { httpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();

const stageLabels = {
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

const stageValues = {
  Screening: "screening",
  Interview: "interview",
  Offer: "offer",
  Hired: "hired",
  Rejected: "rejected",
  screening: "screening",
  interview: "interview",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
};

const candidateSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  candidate: z.string().min(1).optional(),
  fullName: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  roleAppliedFor: z.string().min(1).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  stage: z.string().optional().default("Screening"),
  owner: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  experience: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  expectedCtc: z.string().optional().nullable(),
  appliedOn: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const candidateUpdateSchema = candidateSchema.partial();
const stageSchema = z.object({ stage: z.string().min(1) });

function toDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function normalizeStage(stage) {
  const normalized = stageValues[stage];
  if (!normalized) throw httpError(400, "Candidate stage is invalid.");
  return normalized;
}

function publicCandidate(candidate) {
  return {
    id: candidate.candidateCode,
    databaseId: candidate.id,
    candidate: candidate.fullName,
    role: candidate.roleAppliedFor,
    email: candidate.email || "",
    phone: candidate.phone || "",
    stage: stageLabels[candidate.stage] || candidate.stage,
    owner: candidate.ownerName || candidate.owner?.email || candidate.owner?.username || "",
    source: candidate.source || "",
    experience: candidate.experience || "",
    location: candidate.location || "",
    expectedCtc: candidate.expectedCtc || "",
    appliedOn: toDateString(candidate.appliedOn),
    notes: candidate.notes || "",
    convertedEmployeeId: candidate.convertedEmployee?.employeeCode || "",
  };
}

function candidateSelect() {
  return {
    id: true,
    candidateCode: true,
    fullName: true,
    email: true,
    phone: true,
    roleAppliedFor: true,
    source: true,
    experience: true,
    location: true,
    expectedCtc: true,
    stage: true,
    ownerName: true,
    owner: { select: { email: true, username: true } },
    convertedEmployee: { select: { employeeCode: true } },
    notes: true,
    appliedOn: true,
    createdAt: true,
  };
}

function dataFromBody(body, fallbackCode) {
  const fullName = body.fullName || body.candidate;
  const roleAppliedFor = body.roleAppliedFor || body.role;
  if (!fullName?.trim() || !roleAppliedFor?.trim()) throw httpError(400, "Candidate name and role are required.");
  return {
    candidateCode: body.id || fallbackCode || `CAN-${Date.now()}`,
    fullName: fullName.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    roleAppliedFor: roleAppliedFor.trim(),
    source: body.source?.trim() || null,
    experience: body.experience?.trim() || null,
    location: body.location?.trim() || null,
    expectedCtc: body.expectedCtc?.trim() || null,
    stage: normalizeStage(body.stage || "Screening"),
    ownerName: body.owner?.trim() || null,
    notes: body.notes?.trim() || null,
    appliedOn: toDate(body.appliedOn),
  };
}

router.use(requireAuth);
router.use(requireRole("admin", "hr"));

router.get("/candidates", async (_request, response, next) => {
  try {
    const candidates = await prisma.recruitmentCandidate.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: candidateSelect(),
    });
    response.json({ candidates: candidates.map(publicCandidate) });
  } catch (error) {
    next(error);
  }
});

router.post("/candidates", async (request, response, next) => {
  try {
    const parsed = candidateSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Candidate details are invalid.");
    const candidateCode = parsed.data.id || `CAN-${Date.now()}`;
    const candidateData = dataFromBody({ ...parsed.data, id: candidateCode }, candidateCode);
    const candidate = await prisma.recruitmentCandidate.upsert({
      where: { candidateCode },
      update: candidateData,
      create: candidateData,
      select: candidateSelect(),
    });
    response.status(201).json({ candidate: publicCandidate(candidate) });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Candidate code already exists."));
    else next(error);
  }
});

router.patch("/candidates/:id", async (request, response, next) => {
  try {
    const parsed = candidateUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Candidate details are invalid.");
    const candidate = await prisma.recruitmentCandidate.update({
      where: { candidateCode: request.params.id },
      data: dataFromBody({ ...parsed.data, id: request.params.id }, request.params.id),
      select: candidateSelect(),
    });
    response.json({ candidate: publicCandidate(candidate) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Candidate not found."));
    else next(error);
  }
});

router.patch("/candidates/:id/stage", async (request, response, next) => {
  try {
    const parsed = stageSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Candidate stage is invalid.");
    const candidate = await prisma.recruitmentCandidate.update({
      where: { candidateCode: request.params.id },
      data: { stage: normalizeStage(parsed.data.stage) },
      select: candidateSelect(),
    });
    response.json({ candidate: publicCandidate(candidate) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Candidate not found."));
    else next(error);
  }
});

router.post("/candidates/:id/convert-to-employee", (_request, response) => response.status(501).json({ error: { message: "Candidate conversion is not implemented yet.", status: 501 } }));

export default router;
