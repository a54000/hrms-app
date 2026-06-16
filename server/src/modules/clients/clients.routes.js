import { Router } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { httpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/require-auth.js";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, "../../..");
const invoiceOutputDir = resolve(serverRoot, "uploads/invoices");
const historicalInvoiceUploadDir = resolve(serverRoot, "uploads/historical-invoices");
const invoiceLogoPath = resolve(serverRoot, "../HRGuruInvoiceApp/invoice_static/logo.jpg");

const clientSchema = z.object({
  clientCode: z.string().min(1).optional(),
  name: z.string().min(1),
  status: z.enum(["active", "paused", "inactive"]).optional(),
  industry: z.string().optional().nullable(),
  workingSince: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  stateCode: z.string().optional().nullable(),
  buyerPo: z.string().optional().nullable(),
  hsnSac: z.string().optional().nullable(),
  spoc: z.string().optional().nullable(),
  pitchdeck: z.string().optional().nullable(),
  customizedPitch: z.string().optional().nullable(),
  proposals: z.string().optional().nullable(),
});

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceMonth: z.string().min(1),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(["draft", "raised", "paid", "cancelled"]).optional(),
  externalRef: z.string().optional().nullable(),
});

const historicalInvoicePreviewSchema = z.object({
  files: z.array(z.object({
    fileName: z.string().min(1),
    dataUrl: z.string().min(1),
  })).min(1),
});

const historicalInvoiceSaveSchema = z.object({
  rows: z.array(z.object({
    selected: z.boolean().optional(),
    clientId: z.string().min(1),
    invoiceNumber: z.string().min(1),
    invoiceMonth: z.string().min(1),
    invoiceDate: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    amount: z.union([z.string(), z.number()]).optional().nullable(),
    billValue: z.union([z.string(), z.number()]).optional().nullable(),
    cgst: z.union([z.string(), z.number()]).optional().nullable(),
    sgst: z.union([z.string(), z.number()]).optional().nullable(),
    igst: z.union([z.string(), z.number()]).optional().nullable(),
    tdsPercent: z.union([z.string(), z.number()]).optional().nullable(),
    tds: z.union([z.string(), z.number()]).optional().nullable(),
    gross: z.union([z.string(), z.number()]).optional().nullable(),
    status: z.enum(["draft", "raised", "paid", "cancelled"]).optional(),
    candidateName: z.string().optional().nullable(),
    invoiceType: z.enum(["taggd", "non_taggd", "legacy"]).optional(),
    gstType: z.string().optional().nullable(),
    modeOfPayment: z.string().optional().nullable(),
    sourceFileName: z.string().optional().nullable(),
    rawText: z.string().optional().nullable(),
    dataUrl: z.string().optional().nullable(),
  })).min(1),
});

const invoiceUpdateSchema = z.object({
  invoiceNumber: z.string().min(1).optional(),
  invoiceMonth: z.string().min(1).optional(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(["draft", "raised", "paid", "cancelled"]).optional(),
  details: z.record(z.any()).optional(),
});

const invoicePdfAttachSchema = z.object({
  fileName: z.string().min(1),
  dataUrl: z.string().min(1),
});

const taggdServiceItemSchema = z.object({
  description: z.string().min(1),
  count: z.union([z.string(), z.number()]).optional().nullable(),
  rate: z.union([z.string(), z.number()]).optional().nullable(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
});

const nativeInvoiceSchema = z.object({
  invoiceType: z.enum(["taggd", "non_taggd"]).optional(),
  candidateName: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  ctc: z.union([z.string(), z.number()]).optional().nullable(),
  joiningDate: z.string().optional().nullable(),
  invoiceDate: z.string().optional().nullable(),
  feeRate: z.union([z.string(), z.number()]).optional().nullable(),
  reference: z.string().optional().nullable(),
  serviceItems: z.array(taggdServiceItemSchema).optional(),
});

const agreementSchema = z.object({
  fileName: z.string().min(1),
  fileUrl: z.string().optional().nullable(),
});

const companyState = "Haryana";
const company = {
  name: "HR Guru Placement Services Pvt Ltd",
  address: "1202, Tower -8, Orchid Petals, Sector - 49, Gurgaon, Haryana, 122018",
  contact: "+91 99719 33995",
  gstin: "06AAJCC5251B1Z2",
  pan: "AAJCC5251B",
  state: "Haryana",
  stateCode: "06",
  bank: "IndusInd Bank",
  account: "250406202101",
  ifsc: "INDB0000316",
  branch: "Omaxe City Centre, Sector-49, Gurgaon",
};
const defaultFeeRate = 0.0833;
const taggdDefaultServiceItems = [
  { description: "Recruiters Salaries", count: 41, rate: 34540.66, amount: 1416167 },
  { description: "Seats Cost (Recruiters)", count: 20, rate: 4500, amount: 90000 },
  { description: "Manager Salary", count: 1, rate: 50000, amount: 50000 },
  { description: "Seats Cost (Manager)", count: 1, rate: 4500, amount: 4500 },
  { description: "Partial Laptop Cost Payment - 2/6", count: 2, rate: 3333, amount: 6666 },
  { description: "Partial Laptop Cost Payment - 3/6", count: 2, rate: 3333, amount: 6666 },
  { description: "Mark-up Charges", count: 15, rate: 15606.67, amount: 234100.05 },
];

function toDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function statusLabel(value) {
  const labels = { active: "Active", paused: "Paused", inactive: "Inactive", draft: "Draft", raised: "Raised", paid: "Paid", cancelled: "Cancelled" };
  return labels[value] || value;
}

function statusValue(value, fallback) {
  return String(value || fallback).trim().toLowerCase().replace(/\s+/g, "_");
}

function includeClient() {
  return {
    invoices: { orderBy: [{ invoiceMonth: "desc" }, { createdAt: "desc" }] },
    agreements: { orderBy: { uploadedAt: "desc" } },
  };
}

function publicClient(client) {
  return {
    id: client.id,
    clientCode: client.clientCode,
    name: client.name,
    status: statusLabel(client.status),
    industry: client.industry || "",
    workingSince: toDateString(client.workingSince),
    owner: client.owner || "",
    billingAddress: client.billingAddress || "",
    gstin: client.gstin || "",
    pan: client.pan || "",
    state: client.state || "",
    stateCode: client.stateCode || "",
    buyerPo: client.buyerPo || "",
    hsnSac: client.hsnSac || "",
    spoc: client.spoc || "",
    bdTools: {
      pitchdeck: client.pitchdeck || "",
      customizedPitch: client.customizedPitch || "",
      proposals: client.proposals || "",
    },
    invoices: (client.invoices || []).map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      month: invoice.invoiceMonth,
      amount: invoice.amount?.toString() || "0",
      dueDate: toDateString(invoice.dueDate),
      status: statusLabel(invoice.status),
      externalRef: invoice.externalRef || "",
      details: parseInvoiceDetails(invoice.externalRef),
    })),
    agreements: (client.agreements || []).map((agreement) => ({
      id: agreement.id,
      fileName: agreement.fileName,
      fileUrl: agreement.fileUrl || "",
      uploadedAt: agreement.uploadedAt,
    })),
  };
}

function parseInvoiceDetails(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function decodePdfDataUrl(dataUrl) {
  const base64 = String(dataUrl || "").includes(",") ? String(dataUrl).split(",").pop() : String(dataUrl || "");
  return Buffer.from(base64, "base64");
}

function unescapePdfText(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdfText(buffer) {
  const content = buffer.toString("latin1");
  const textParts = [];
  const textPattern = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  for (const match of content.matchAll(textPattern)) {
    const raw = match[0].replace(/\)\s*Tj$/, "").replace(/^\(/, "");
    textParts.push(unescapePdfText(raw));
  }
  const arrayTextPattern = /\[(.*?)\]\s*TJ/gs;
  for (const match of content.matchAll(arrayTextPattern)) {
    for (const item of match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      textParts.push(unescapePdfText(item[0].slice(1, -1)));
    }
  }
  return textParts.join("\n").replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

function parseAmount(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d{1,2})?/);
  return match ? Number(match[0]) : 0;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueAfterLabel(text, labels, valuePattern = "[^\\n]+") {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const label of labels) {
    const labelPattern = escapeRegex(label).replace(/\s+/g, "\\s+");
    const sameLine = new RegExp(`${labelPattern}\\s*:?\\s*(${valuePattern})`, "i").exec(text);
    if (sameLine?.[1]?.trim()) return sameLine[1].trim();
    const labelIndex = lines.findIndex((line) => new RegExp(`^${labelPattern}\\s*:?$`, "i").test(line));
    if (labelIndex >= 0) {
      for (let index = labelIndex + 1; index < Math.min(lines.length, labelIndex + 4); index += 1) {
        const candidate = lines[index]?.trim();
        if (candidate && new RegExp(`^${valuePattern}$`, "i").test(candidate)) return candidate;
      }
    }
  }
  return "";
}

function numberNearLine(lines, startIndex, lookAhead = 4) {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + lookAhead); index += 1) {
    const matches = [...String(lines[index] || "").matchAll(/(?:INR|Rs\.?)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi)];
    if (matches.length) return parseAmount(matches[matches.length - 1][1]);
  }
  return 0;
}

function parseTaggdTotals(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const result = { billValue: 0, cgst: 0, sgst: 0, gross: 0 };
  const totalAmountIndex = lines.findIndex((line) => /^Total\s+Amount$/i.test(line) || /^Total\s+Amount\b/i.test(line));
  if (totalAmountIndex >= 0) result.billValue = numberNearLine(lines, totalAmountIndex, 5);
  const cgstIndex = lines.findIndex((line) => /^CGST\b/i.test(line));
  if (cgstIndex >= 0) result.cgst = numberNearLine(lines, cgstIndex, 4);
  const sgstIndex = lines.findIndex((line) => /^SGST\b/i.test(line));
  if (sgstIndex >= 0) result.sgst = numberNearLine(lines, sgstIndex, 4);
  const finalTotalStart = sgstIndex >= 0 ? sgstIndex + 1 : totalAmountIndex + 1;
  const finalTotalIndex = lines.findIndex((line, index) => index >= finalTotalStart && /^Total\b/i.test(line));
  if (finalTotalIndex >= 0) result.gross = numberNearLine(lines, finalTotalIndex, 4);
  if (!result.gross && result.billValue) result.gross = roundMoney(result.billValue + result.cgst + result.sgst);
  return result;
}

function normalizeTdsPercent(value) {
  const percent = Number(value || 2);
  if (!Number.isFinite(percent)) return 2;
  return Math.min(10, Math.max(1, percent));
}

function calculateTdsAmount(billValue, percent) {
  return roundMoney(moneyNumber(billValue) * (normalizeTdsPercent(percent) / 100));
}

function parseHistoricalInvoice(file, text, clients) {
  const compact = text.replace(/\r/g, "\n");
  const invoiceNumber = valueAfterLabel(compact, ["Invoice Number", "Invoice No", "Invoice #"], "[A-Z0-9/-]+") || firstMatch(compact, [
    /Invoice(?:\s+Number| No\.?| #)?\s*:?\s*([A-Z0-9/-]+)/i,
    /\b(HRGP\d{2,}\d{4})\b/i,
  ]);
  const invoiceDate = valueAfterLabel(compact, ["Invoice Date"], "(?:[A-Za-z]+\\s+\\d{1,2},\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4})") || firstMatch(compact, [
    /Invoice Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /Invoice Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
    /Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
  ]);
  const modeOfPayment = valueAfterLabel(compact, ["Mode Of Payment", "Mode of Payment", "Payment Mode"], "[A-Za-z ]+");
  const normalizedInvoiceDate = normalizeParsedDate(invoiceDate);
  const isTaggdInvoice = compact.toLowerCase().includes("taggd") || compact.toLowerCase().includes("monthly service invoice");
  const taggdTotals = isTaggdInvoice ? parseTaggdTotals(compact) : null;
  const amountTbr = firstMatch(compact, [/Amount TBR\s*:?\s*(?:INR|Rs\.?)?\s*([0-9,]+(?:\.\d{1,2})?)/i]);
  const gross = firstMatch(compact, [/(?:Gross|Total)\s*:?\s*(?:INR|Rs\.?)?\s*([0-9,]+(?:\.\d{1,2})?)/i]);
  const amount = taggdTotals?.gross || parseAmount(amountTbr || gross || firstMatch(compact, [/(?:Amount|Total)\s*:?\s*(?:INR|Rs\.?)?\s*([0-9,]+(?:\.\d{1,2})?)/i]));
  const candidateName = firstMatch(compact, [/Candidate\s*:?\s*([^\n]+)/i]);
  const gstType = firstMatch(compact, [/GST Type\s*:?\s*([^\n]+)/i]);
  const gstin = firstMatch(compact, [/Billed To[\s\S]*?GSTIN\s*:?\s*([0-9A-Z]{15})/i, /GSTIN\s*:?\s*([0-9A-Z]{15})/i]);
  const client = clients.find((item) => item.gstin && gstin && item.gstin.toUpperCase() === gstin.toUpperCase())
    || clients.find((item) => compact.toLowerCase().includes(item.name.toLowerCase().slice(0, 18)))
    || null;
  return {
    sourceFileName: file.fileName,
    selected: Boolean(invoiceNumber && client?.id),
    clientId: client?.id || "",
    clientName: client?.name || "",
    invoiceNumber: invoiceNumber || file.fileName.replace(/\.pdf$/i, "").slice(0, 40),
    invoiceMonth: (normalizedInvoiceDate || new Date().toISOString().slice(0, 10)).slice(0, 7),
    invoiceDate: normalizedInvoiceDate,
    dueDate: normalizedInvoiceDate ? addDays(normalizedInvoiceDate, 30) : "",
    amount,
    billValue: taggdTotals?.billValue || 0,
    cgst: taggdTotals?.cgst || 0,
    sgst: taggdTotals?.sgst || 0,
    igst: 0,
    tdsPercent: 2,
    tds: calculateTdsAmount(taggdTotals?.billValue || amount, 2),
    gross: taggdTotals?.gross || amount,
    status: "raised",
    candidateName,
    invoiceType: isTaggdInvoice ? "taggd" : "non_taggd",
    gstType,
    modeOfPayment,
    rawText: compact.slice(0, 5000),
    warnings: [
      !invoiceNumber ? "Invoice number not found" : "",
      !client ? "Client not matched" : "",
      !amount ? "Amount not found" : "",
      !normalizedInvoiceDate ? "Invoice date not found" : "",
    ].filter(Boolean),
  };
}

function normalizeParsedDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())).toISOString().slice(0, 10);
}

function clientData(input) {
  return {
    name: input.name,
    status: statusValue(input.status, "active"),
    industry: input.industry || null,
    workingSince: toDate(input.workingSince),
    owner: input.owner || null,
    billingAddress: input.billingAddress || null,
    gstin: input.gstin || null,
    pan: input.pan || null,
    state: input.state || null,
    stateCode: input.stateCode || null,
    buyerPo: input.buyerPo || null,
    hsnSac: input.hsnSac || null,
    spoc: input.spoc || null,
    pitchdeck: input.pitchdeck || null,
    customizedPitch: input.customizedPitch || null,
    proposals: input.proposals || null,
  };
}

async function nextClientCode() {
  const count = await prisma.client.count();
  return `CL-${String(count + 1).padStart(4, "0")}`;
}

async function nextInvoiceNumber(tx = prisma) {
  const year = new Date().getFullYear();
  const rows = await tx.clientInvoice.findMany({
    where: { invoiceNumber: { endsWith: String(year) } },
    select: { invoiceNumber: true },
  });
  const maxNumber = rows.reduce((max, row) => {
    const match = String(row.invoiceNumber || "").match(/^HRGP(\d+)(\d{4})$/);
    if (!match || match[2] !== String(year)) return max;
    return Math.max(max, Number(match[1] || 0));
  }, 0);
  return `HRGP${String(maxNumber + 1).padStart(2, "0")}${year}`;
}

function addDays(dateString, days) {
  const value = toDate(dateString) || new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function moneyNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function serviceItemKind(description) {
  const text = String(description || "").toLowerCase();
  if (text.includes("salary") || text.includes("salaries")) return "salary";
  if (text.includes("seat")) return "seat";
  if (text.includes("laptop")) return "laptop";
  if (text.includes("mark")) return "markup";
  return "manual";
}

function normalizeServiceItems(items = []) {
  return items
    .map((item) => {
      const description = String(item.description || "").trim();
      const count = moneyNumber(item.count || 0);
      const rate = moneyNumber(item.rate || 0);
      const manualAmount = moneyNumber(item.amount || 0);
      const calculatedAmount = count > 0 && rate > 0 ? count * rate : manualAmount;
      return {
        description,
        count,
        rate,
        amount: roundMoney(calculatedAmount),
        kind: serviceItemKind(description),
      };
    })
    .filter((item) => item.description && item.amount > 0);
}

function calculateNativeInvoice(client, input) {
  const invoiceDate = input.invoiceDate || new Date().toISOString().slice(0, 10);
  const invoiceType = input.invoiceType === "taggd" || String(client.name || "").toLowerCase().includes("taggd") ? "taggd" : "non_taggd";
  const serviceItems = invoiceType === "taggd" ? normalizeServiceItems(input.serviceItems?.length ? input.serviceItems : taggdDefaultServiceItems) : [];
  if (invoiceType === "taggd" && !serviceItems.length) throw httpError(400, "Taggd invoice needs at least one service row.");
  if (invoiceType === "non_taggd" && (!String(input.candidateName || "").trim() || !String(input.role || "").trim() || !input.joiningDate)) {
    throw httpError(400, "Candidate name, role, and joining date are required for Non-Taggd invoices.");
  }
  const ctc = invoiceType === "taggd" ? serviceItems.reduce((sum, item) => sum + item.amount, 0) : Number(input.ctc || 0);
  if (!Number.isFinite(ctc) || ctc <= 0) throw httpError(400, invoiceType === "taggd" ? "Service total must be greater than zero." : "CTC must be greater than zero.");
  const feeRate = invoiceType === "taggd"
    ? 0
    : input.feeRate === undefined || input.feeRate === null || input.feeRate === ""
      ? defaultFeeRate
      : Number(input.feeRate);
  if (!Number.isFinite(feeRate) || feeRate < 0) throw httpError(400, "Fee rate is invalid.");
  const billValue = invoiceType === "taggd" ? roundMoney(ctc) : roundMoney(ctc * feeRate);
  const sameState = String(client.state || "").toLowerCase() === companyState.toLowerCase();
  const cgst = sameState ? roundMoney(billValue * 0.09) : 0;
  const sgst = sameState ? roundMoney(billValue * 0.09) : 0;
  const igst = sameState ? 0 : roundMoney(billValue * 0.18);
  const gst = cgst + sgst + igst;
  const gross = roundMoney(billValue + gst);
  const tds = invoiceType === "taggd" ? 0 : roundMoney(billValue * 0.10);
  const amountTbr = roundMoney(gross - tds);
  return {
    source: "hrms_native",
    invoiceType,
    candidateName: invoiceType === "taggd" ? "Taggd" : String(input.candidateName || "").trim(),
    clientName: client.name,
    clientCode: client.clientCode,
    role: invoiceType === "taggd" ? "Monthly Service Invoice" : String(input.role || "").trim(),
    ctc,
    joiningDate: invoiceType === "taggd" ? invoiceDate : input.joiningDate,
    invoiceDate,
    dueDate: addDays(invoiceDate, 30),
    feeRate,
    gstType: sameState ? "CGST + SGST" : "IGST",
    billValue,
    cgst,
    sgst,
    igst,
    gst,
    gross,
    tds,
    netIncome: roundMoney(billValue - tds),
    amountTbr,
    status: "Draft",
    reference: input.reference || client.spoc || "",
    serviceItems,
    companyState,
  };
}

function pdfEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function cleanFilePart(value) {
  return String(value || "invoice").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "invoice";
}

async function saveHistoricalPdf(row) {
  if (!row.dataUrl) return "";
  await mkdir(historicalInvoiceUploadDir, { recursive: true });
  const buffer = decodePdfDataUrl(row.dataUrl);
  const fileName = `${cleanFilePart(row.invoiceNumber)}_${cleanFilePart(row.sourceFileName || "invoice.pdf")}`;
  const filePath = join(historicalInvoiceUploadDir, fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  await writeFile(filePath, buffer);
  return filePath;
}

async function saveAttachedHistoricalPdf(invoice, file) {
  await mkdir(historicalInvoiceUploadDir, { recursive: true });
  const buffer = decodePdfDataUrl(file.dataUrl);
  const fileName = `${cleanFilePart(invoice.invoiceNumber)}_${cleanFilePart(file.fileName || "invoice.pdf")}`;
  const filePath = join(historicalInvoiceUploadDir, fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  await writeFile(filePath, buffer);
  return filePath;
}

function wordsForAmount(value) {
  return `INR ${money(value)}`;
}

function displayDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("en-IN", { month: "long", day: "2-digit", year: "numeric" });
}

function hsnSacFor(client) {
  return client.hsnSac || "998519";
}

function jpegSize(buffer) {
  let index = 2;
  while (index < buffer.length) {
    if (buffer[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = buffer[index + 1];
    index += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(index);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(index + 3),
        width: buffer.readUInt16BE(index + 5),
      };
    }
    index += length;
  }
  return null;
}

class SimplePdf {
  constructor() {
    this.ops = [];
    this.images = [];
  }
  textWidth(value, size = 10) {
    return String(value ?? "").length * size * 0.48;
  }
  text(x, y, value, size = 10, bold = false, options = {}) {
    const font = bold ? "F2" : "F1";
    const text = String(value ?? "");
    let drawX = x;
    if (options.align === "right" && options.width) drawX = x + options.width - this.textWidth(text, size);
    if (options.align === "center" && options.width) drawX = x + (options.width - this.textWidth(text, size)) / 2;
    if (options.color) this.ops.push(`${options.color.join(" ")} rg`);
    this.ops.push(`BT /${font} ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
    if (options.color) this.ops.push("0 0 0 rg");
  }
  line(x1, y1, x2, y2) {
    this.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }
  rect(x, y, w, h) {
    this.ops.push(`${x} ${y} ${w} ${h} re S`);
  }
  fill(x, y, w, h, r = 0.93, g = 0.95, b = 0.98) {
    this.ops.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`);
  }
  imageJpeg(buffer, x, y, width, height) {
    const size = jpegSize(buffer);
    if (!size) return;
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, width: size.width, height: size.height, buffer });
    this.ops.push(`q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q`);
  }
  wrapLines(value, width, size = 8) {
    const lines = [];
    const maxChars = Math.max(8, Math.floor(width / (size * 0.5)));
    for (const paragraph of String(value || "").split(/\r?\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      for (const word of words) {
        if (word.length > maxChars) {
          if (line) lines.push(line);
          for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
          line = "";
        } else if (`${line} ${word}`.trim().length > maxChars) {
          if (line) lines.push(line);
          line = word;
        } else {
          line = `${line} ${word}`.trim();
        }
      }
      if (line || !words.length) lines.push(line);
    }
    return lines.length ? lines : [""];
  }
  wrapped(x, y, value, width = 240, size = 8, leading = 11, options = {}) {
    const lines = this.wrapLines(value, width, size).slice(0, options.maxLines || 8);
    for (const item of lines) {
      this.text(x, y, item, size, Boolean(options.bold), options);
      y -= leading;
    }
    return y;
  }
  tableRow({ x, y, columns, values, fontSize = 8, padding = 7, minHeight = 24, header = false, fill = false, headerTextColor = [1, 1, 1] }) {
    const lineHeight = fontSize + 3;
    const wrappedValues = values.map((value, index) => {
      const column = columns[index];
      if (column.wrap === false) return [String(value ?? "")];
      return this.wrapLines(value, column.width - padding * 2, fontSize);
    });
    const rowHeight = Math.max(minHeight, Math.max(...wrappedValues.map((lines) => lines.length)) * lineHeight + padding * 2);
    if (fill) this.fill(x, y - rowHeight, columns.reduce((sum, column) => sum + column.width, 0), rowHeight, ...fill);
    let cursorX = x;
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      this.rect(cursorX, y - rowHeight, column.width, rowHeight);
      let textY = y - padding - fontSize;
      for (const line of wrappedValues[index]) {
        this.text(cursorX + padding, textY, line, fontSize, header || column.bold, {
          align: column.align,
          width: column.width - padding * 2,
          color: header && fill ? headerTextColor : undefined,
        });
        textY -= lineHeight;
      }
      cursorX += column.width;
    }
    return y - rowHeight;
  }
  bytes() {
    const stream = `0.4 w\n${this.ops.join("\n")}`;
    const imageResource = this.images.map((image, index) => `/${image.name} ${6 + index} 0 R`).join(" ");
    const contentObjectNumber = 6 + this.images.length;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << ${imageResource} >> >> /Contents ${contentObjectNumber} 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ];
    for (const image of this.images) {
      objects.push(Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.buffer.length} >>\nstream\n`, "latin1"),
        image.buffer,
        Buffer.from("\nendstream", "latin1"),
      ]));
    }
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "latin1"));
      chunks.push(Buffer.isBuffer(objects[index]) ? objects[index] : Buffer.from(objects[index], "latin1"));
      chunks.push(Buffer.from("\nendobj\n", "latin1"));
    }
    const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, "latin1"));
    for (const offset of offsets.slice(1)) chunks.push(Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`, "latin1"));
    chunks.push(Buffer.from(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, "latin1"));
    return Buffer.concat(chunks);
  }
}

export async function createInvoicePdf(client, invoice, details) {
  const pdf = new SimplePdf();
  const navy = [0.12, 0.22, 0.39];
  const blue = [0.18, 0.33, 0.58];
  const pale = [0.93, 0.95, 0.98];
  const stripe = [0.97, 0.98, 1];
  const left = 40;
  const fullWidth = 516;
  const invoiceDate = details.invoiceDate || invoice.createdAt?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10);

  try {
    const logo = await readFile(invoiceLogoPath);
    pdf.imageJpeg(logo, 46, 753, 62, 54);
  } catch (_error) {
    pdf.text(46, 790, "HR Guru", 16, true, { color: navy });
  }
  pdf.text(116, 790, company.name, 12, true, { color: navy });
  pdf.wrapped(116, 773, company.address, 36, 8, 10, { maxLines: 2 });
  pdf.text(346, 790, "Invoice Number", 10.5, true);
  pdf.text(452, 790, invoice.invoiceNumber, 10.5, true);
  pdf.text(346, 772, "Invoice Date", 10.5, true);
  pdf.text(452, 772, displayDate(invoiceDate), 10.5, true);
  pdf.text(346, 754, "Mode Of Payment", 10.5, true);
  pdf.text(452, 754, details.modeOfPayment || "Bank Transfer", 10.5, true);
  pdf.line(46, 739, 549, 739);

  pdf.fill(left, 711, fullWidth, 23, ...blue);
  pdf.text(left, 718, "TAX INVOICE", 11, true, { align: "center", width: fullWidth, color: [1, 1, 1] });

  pdf.fill(40, 555, 258, 151, ...pale);
  pdf.fill(298, 555, 258, 151, ...pale);
  pdf.rect(40, 555, 258, 151);
  pdf.rect(298, 555, 258, 151);
  pdf.text(47, 690, "Biller", 11, true, { color: navy });
  pdf.text(47, 675, company.name, 9, true);
  let y = pdf.wrapped(47, 662, company.address, 34, 8, 12);
  for (const line of [
    `Contact No: ${company.contact}`,
    `GSTIN: ${company.gstin}`,
    `PAN: ${company.pan}`,
    `State Code: ${company.stateCode}`,
    `HSN/SAC Code: ${hsnSacFor(client)}`,
  ]) y = pdf.wrapped(47, y, line, 34, 8, 12);

  pdf.text(305, 690, "Billed To", 11, true, { color: navy });
  pdf.wrapped(305, 675, client.name, 34, 9, 11, { maxLines: 2 });
  y = pdf.wrapped(305, 655, client.billingAddress || "-", 34, 8, 12);
  for (const line of [
    `GSTIN: ${client.gstin || "-"}`,
    `PAN: ${client.pan || "-"}`,
    client.buyerPo ? `Buyer PO Number: ${client.buyerPo}` : "",
    `Buyer's Spoc: ${client.spoc || details.reference || "-"}`,
  ].filter(Boolean)) y = pdf.wrapped(305, y, line, 34, 8, 12);

  if (details.invoiceType === "taggd") {
    const x0 = 40;
    const top = 535;
    const rowH = 30;
    const serviceItems = details.serviceItems || [];
    const totalRows = 1 + serviceItems.length + 3;
    const bottom = top - rowH * totalRows;
    pdf.fill(x0, top - rowH, fullWidth, rowH, ...blue);
    const cols = [x0, x0 + 258, x0 + 326, x0 + 416, x0 + fullWidth];
    for (let index = 0; index <= totalRows; index += 1) {
      const lineY = top - rowH * index;
      pdf.line(x0, lineY, x0 + fullWidth, lineY);
      if (index > 1 && index % 2 === 0) pdf.fill(x0, lineY, fullWidth, rowH, ...stripe);
    }
    for (const colX of cols) pdf.line(colX, bottom, colX, top);
    for (const [label, textX, textY, width] of [
      ["Description of Services", x0 + 5, top - 15, 0],
      ["Count", x0 + 258, top - 15, 68],
      ["Rate", x0 + 326, top - 15, 90],
      ["Amount", x0 + 416, top - 15, 100],
    ]) {
      pdf.text(textX, textY, label, 8.5, true, { color: [1, 1, 1], align: width ? "center" : "left", width });
    }
    let rowY = top - 36;
    for (const item of serviceItems) {
      pdf.wrapped(x0 + 5, rowY + 10, item.description, 34, 8, 11);
      pdf.text(x0 + 258, rowY + 6, Number(item.count || 0).toLocaleString("en-IN"), 8.5, false, { align: "center", width: 68 });
      pdf.text(x0 + 326, rowY + 6, Number(item.rate || 0) ? money(item.rate) : "", 8.5, false, { align: "right", width: 80 });
      pdf.text(x0 + 416, rowY + 6, money(item.amount), 8.5, false, { align: "right", width: 90 });
      rowY -= rowH;
    }
    for (const [label, rate, amount] of [
      ["CGST", details.cgst ? "9%" : "0%", details.cgst],
      ["SGST", details.sgst ? "9%" : "0%", details.sgst],
      ["Total", "", details.gross],
    ]) {
      pdf.text(x0 + 258, rowY + 6, label, label === "Total" ? 9 : 8.5, true, { color: label === "Total" ? navy : undefined, align: "center", width: 68 });
      pdf.text(x0 + 326, rowY + 6, rate, 8.5, false, { align: "center", width: 90 });
      pdf.text(x0 + 416, rowY + 6, money(amount), label === "Total" ? 9 : 8.5, label === "Total", { color: label === "Total" ? navy : undefined, align: "right", width: 90 });
      rowY -= rowH;
    }
    y = bottom;
  } else {
    const x0 = 40;
    const y0 = 375;
    pdf.fill(x0, y0 + 160, fullWidth, 21, ...blue);
    pdf.fill(x0, y0 + 84, fullWidth, 76, 1, 1, 1);
    pdf.fill(x0, y0 + 63, fullWidth, 21, ...stripe);
    pdf.fill(x0, y0 + 42, fullWidth, 21, 1, 1, 1);
    pdf.fill(x0, y0 + 21, fullWidth, 21, ...stripe);
    pdf.fill(x0, y0, fullWidth, 21, ...pale);
    for (const colX of [x0, x0 + 268, x0 + 361, x0 + 433, x0 + fullWidth]) pdf.line(colX, y0, colX, y0 + 181);
    for (const lineY of [y0, y0 + 21, y0 + 42, y0 + 63, y0 + 84, y0 + 160, y0 + 181]) pdf.line(x0, lineY, x0 + fullWidth, lineY);
    for (const [label, textX, textY, width] of [
      ["Description of Services", x0 + 5, y0 + 165, 0],
      ["HSN/SAC", x0 + 268, y0 + 165, 93],
      ["Rate", x0 + 361, y0 + 165, 72],
      ["Amount", x0 + 433, y0 + 165, 83],
    ]) {
      pdf.text(textX, textY, label, 8.5, true, { color: [1, 1, 1], align: width ? "center" : "left", width });
    }
    const descY = y0 + 143;
    pdf.text(x0 + 5, descY, "Recruitment / Placement Services", 10, true);
    pdf.text(x0 + 5, descY - 15, `Candidate: ${details.candidateName || "-"}`, 9.5, true);
    pdf.text(x0 + 5, descY - 30, `D.O.J: ${displayDate(details.joiningDate)}`, 9);
    pdf.wrapped(x0 + 5, descY - 45, `Role: ${String(details.role || "-").replace(/\b\w/g, (letter) => letter.toUpperCase())}`, 36, 9, 13);
    pdf.text(x0 + 268, y0 + 120, hsnSacFor(client), 8.5, false, { align: "center", width: 93 });
    pdf.text(x0 + 361, y0 + 120, `${(Number(details.feeRate || 0) * 100).toFixed(2)}%`, 8.5, false, { align: "center", width: 72 });
    pdf.text(x0 + 433, y0 + 120, money(details.billValue), 8.5, false, { align: "right", width: 74 });
    pdf.text(x0 + 5, y0 + 69, "Offered CTC", 8.5, true);
    pdf.text(x0 + 433, y0 + 69, money(details.ctc), 8.5, false, { align: "right", width: 74 });
    const secondTaxLabel = details.igst ? "IGST" : "SGST";
    const secondTaxRate = details.igst ? "18%" : (details.sgst ? "9%" : "0%");
    const secondTaxAmount = details.igst || details.sgst;
    for (const [rowY, label, rate, amount] of [
      [y0 + 46, "CGST", details.cgst ? "9%" : "0%", details.cgst],
      [y0 + 25, secondTaxLabel, secondTaxRate, secondTaxAmount],
      [y0 + 4, "Total", "", details.gross],
    ]) {
      pdf.text(x0 + 268, rowY, label, label === "Total" ? 9 : 8.5, true, { color: label === "Total" ? navy : undefined, align: "center", width: 93 });
      pdf.text(x0 + 361, rowY, rate, 8.5, false, { align: "center", width: 72 });
      pdf.text(x0 + 433, rowY, money(amount), label === "Total" ? 9 : 8.5, label === "Total", { color: label === "Total" ? navy : undefined, align: "right", width: 74 });
    }
    y = y0;
  }

  const wordsY = details.invoiceType === "taggd" ? y - 29 : 346;
  const bankBoxY = details.invoiceType === "taggd" ? 118 : 235;
  pdf.fill(40, wordsY, fullWidth, 23, ...pale);
  pdf.rect(40, wordsY, fullWidth, 23);
  pdf.wrapped(46, wordsY + 8, `Amount in words: ${wordsForAmount(details.gross)} Only`, 86, 8.5, 10, { maxLines: 2 });

  pdf.rect(40, bankBoxY, fullWidth, 103);
  pdf.line(324, bankBoxY, 324, bankBoxY + 103);
  pdf.text(47, bankBoxY + 84, "Declaration:", 8.5, true);
  pdf.wrapped(47, bankBoxY + 58, "We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.", 62, 8, 13);
  pdf.text(331, bankBoxY + 84, "Company's Bank Details", 8.5, true);
  let bankY = bankBoxY + 71;
  for (const [index, line] of [
    `Bank Name: ${company.bank}`,
    `A/c No: ${company.account}`,
    "Branch And IFSC:",
    company.branch,
    `IFSC: ${company.ifsc}`,
  ].entries()) bankY = pdf.wrapped(331, bankY, line, 45, 8, 13, { maxLines: 2, bold: index === 2 });
  pdf.text(418, bankBoxY - 47, "(Authorized Signatory)", 8.5, true);
  pdf.line(46, bankBoxY - 63, 549, bankBoxY - 63);
  pdf.text(46, bankBoxY - 79, `${company.name} | GSTIN: ${company.gstin} | Tower 8/1202, Orchid Petals, Sector 49, Gurgaon, 122018, Haryana, India`, 7, false, { align: "center", width: 503 });

  await mkdir(invoiceOutputDir, { recursive: true });
  const fileName = `${invoice.invoiceNumber}_${cleanFilePart(details.candidateName || client.name)}.pdf`;
  const filePath = join(invoiceOutputDir, fileName);
  await writeFile(filePath, pdf.bytes());
  return filePath;
}

router.use(requireAuth);

router.get("/", async (_request, response, next) => {
  try {
    const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, include: includeClient() });
    response.json({ clients: clients.map(publicClient) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = clientSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Client details are incomplete.");
    const client = await prisma.client.create({
      data: {
        clientCode: parsed.data.clientCode || await nextClientCode(),
        ...clientData(parsed.data),
      },
      include: includeClient(),
    });
    response.status(201).json({ client: publicClient(client) });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Client code already exists."));
    else next(error);
  }
});

router.patch("/:id", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = clientSchema.partial().safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Client details are invalid.");
    const data = {};
    if (Object.hasOwn(parsed.data, "name")) data.name = parsed.data.name;
    if (Object.hasOwn(parsed.data, "status")) data.status = statusValue(parsed.data.status, "active");
    if (Object.hasOwn(parsed.data, "industry")) data.industry = parsed.data.industry || null;
    if (Object.hasOwn(parsed.data, "workingSince")) data.workingSince = toDate(parsed.data.workingSince);
    if (Object.hasOwn(parsed.data, "owner")) data.owner = parsed.data.owner || null;
    if (Object.hasOwn(parsed.data, "billingAddress")) data.billingAddress = parsed.data.billingAddress || null;
    if (Object.hasOwn(parsed.data, "gstin")) data.gstin = parsed.data.gstin || null;
    if (Object.hasOwn(parsed.data, "pan")) data.pan = parsed.data.pan || null;
    if (Object.hasOwn(parsed.data, "state")) data.state = parsed.data.state || null;
    if (Object.hasOwn(parsed.data, "stateCode")) data.stateCode = parsed.data.stateCode || null;
    if (Object.hasOwn(parsed.data, "buyerPo")) data.buyerPo = parsed.data.buyerPo || null;
    if (Object.hasOwn(parsed.data, "hsnSac")) data.hsnSac = parsed.data.hsnSac || null;
    if (Object.hasOwn(parsed.data, "spoc")) data.spoc = parsed.data.spoc || null;
    if (Object.hasOwn(parsed.data, "pitchdeck")) data.pitchdeck = parsed.data.pitchdeck || null;
    if (Object.hasOwn(parsed.data, "customizedPitch")) data.customizedPitch = parsed.data.customizedPitch || null;
    if (Object.hasOwn(parsed.data, "proposals")) data.proposals = parsed.data.proposals || null;
    const client = await prisma.client.update({ where: { id: request.params.id }, data, include: includeClient() });
    response.json({ client: publicClient(client) });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Client not found."));
    else next(error);
  }
});

router.post("/:id/invoices", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = invoiceSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Invoice details are incomplete.");
    const invoice = await prisma.clientInvoice.create({
      data: {
        clientId: request.params.id,
        invoiceNumber: parsed.data.invoiceNumber,
        invoiceMonth: parsed.data.invoiceMonth,
        amount: parsed.data.amount || 0,
        dueDate: toDate(parsed.data.dueDate),
        status: statusValue(parsed.data.status, "draft"),
        externalRef: parsed.data.externalRef || null,
      },
    });
    response.status(201).json({ invoice });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Invoice number already exists for this client."));
    else next(error);
  }
});

router.post("/invoices/import-preview", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = historicalInvoicePreviewSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Upload at least one invoice PDF.");
    const clients = await prisma.client.findMany({ where: { status: "active" }, orderBy: { name: "asc" } });
    const rows = parsed.data.files.map((file, index) => {
      const buffer = decodePdfDataUrl(file.dataUrl);
      const text = extractPdfText(buffer);
      const row = parseHistoricalInvoice(file, text, clients);
      return { rowId: `preview-${index + 1}`, ...row, dataUrl: file.dataUrl };
    });
    response.json({
      rows,
      clients: clients.map((client) => ({ id: client.id, name: client.name, clientCode: client.clientCode, gstin: client.gstin || "" })),
      message: `${rows.length} invoice PDF${rows.length === 1 ? "" : "s"} parsed for preview.`,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/invoices/import-save", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = historicalInvoiceSaveSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Preview rows are incomplete.");
    const selectedRows = parsed.data.rows.filter((row) => row.selected !== false);
    if (!selectedRows.length) throw httpError(400, "Select at least one invoice row to save.");
    const saved = [];
    for (const row of selectedRows) {
      const client = await prisma.client.findUnique({ where: { id: row.clientId } });
      if (!client) throw httpError(404, "Client not found for one of the imported invoices.");
      if (client.status !== "active") throw httpError(400, "Invoices can be saved only for active clients.");
      const pdfPath = await saveHistoricalPdf(row);
      const details = {
        source: "historical_pdf_import",
        invoiceType: row.invoiceType || "legacy",
        candidateName: row.candidateName || "",
        invoiceDate: row.invoiceDate || "",
        gstType: row.gstType || "",
        modeOfPayment: row.modeOfPayment || "",
        billValue: moneyNumber(row.billValue),
        cgst: moneyNumber(row.cgst),
        sgst: moneyNumber(row.sgst),
        igst: moneyNumber(row.igst),
        tdsPercent: normalizeTdsPercent(row.tdsPercent),
        tds: row.tds === undefined || row.tds === null || row.tds === "" ? calculateTdsAmount(row.billValue || row.amount, row.tdsPercent) : moneyNumber(row.tds),
        gross: moneyNumber(row.gross || row.amount),
        sourceFileName: row.sourceFileName || "",
        pdfPath,
        importedAt: new Date().toISOString(),
        rawText: row.rawText || "",
      };
      const invoice = await prisma.clientInvoice.upsert({
        where: { clientId_invoiceNumber: { clientId: row.clientId, invoiceNumber: row.invoiceNumber } },
        update: {
          invoiceMonth: row.invoiceMonth,
          amount: row.amount || 0,
          dueDate: toDate(row.dueDate),
          status: statusValue(row.status, "raised"),
          externalRef: JSON.stringify(details),
        },
        create: {
          clientId: row.clientId,
          invoiceNumber: row.invoiceNumber,
          invoiceMonth: row.invoiceMonth,
          amount: row.amount || 0,
          dueDate: toDate(row.dueDate),
          status: statusValue(row.status, "raised"),
          externalRef: JSON.stringify(details),
        },
      });
      saved.push(invoice.invoiceNumber);
    }
    const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, include: includeClient() });
    response.status(201).json({
      message: `${saved.length} historical invoice${saved.length === 1 ? "" : "s"} saved.`,
      saved,
      clients: clients.map(publicClient),
    });
  } catch (error) {
    if (error.code === "P2025") next(httpError(404, "Client not found for one of the imported invoices."));
    else next(error);
  }
});

router.patch("/:clientId/invoices/:invoiceId", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = invoiceUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Invoice update details are invalid.");
    const existing = await prisma.clientInvoice.findFirst({
      where: { id: request.params.invoiceId, clientId: request.params.clientId },
    });
    if (!existing) throw httpError(404, "Invoice not found.");
    const existingDetails = parseInvoiceDetails(existing.externalRef) || {};
    const invoice = await prisma.clientInvoice.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.invoiceNumber ? { invoiceNumber: parsed.data.invoiceNumber } : {}),
        ...(parsed.data.invoiceMonth ? { invoiceMonth: parsed.data.invoiceMonth } : {}),
        ...(Object.hasOwn(parsed.data, "amount") ? { amount: parsed.data.amount || 0 } : {}),
        ...(Object.hasOwn(parsed.data, "dueDate") ? { dueDate: toDate(parsed.data.dueDate) } : {}),
        ...(parsed.data.status ? { status: statusValue(parsed.data.status, "raised") } : {}),
        externalRef: JSON.stringify({ ...existingDetails, ...(parsed.data.details || {}), editedAt: new Date().toISOString() }),
      },
    });
    const client = await prisma.client.findUnique({ where: { id: request.params.clientId }, include: includeClient() });
    response.json({
      message: `Invoice ${invoice.invoiceNumber} updated.`,
      invoice,
      client: publicClient(client),
    });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Invoice number already exists for this client."));
    else next(error);
  }
});

router.post("/:clientId/invoices/:invoiceId/original-pdf", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = invoicePdfAttachSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Upload a valid invoice PDF.");
    const invoice = await prisma.clientInvoice.findFirst({
      where: { id: request.params.invoiceId, clientId: request.params.clientId },
    });
    if (!invoice) throw httpError(404, "Invoice not found.");
    const existingDetails = parseInvoiceDetails(invoice.externalRef) || {};
    const pdfPath = await saveAttachedHistoricalPdf(invoice, parsed.data);
    const details = {
      ...existingDetails,
      source: existingDetails.source || "historical_pdf_import",
      sourceFileName: parsed.data.fileName,
      pdfPath,
      pdfAttachedAt: new Date().toISOString(),
    };
    await prisma.clientInvoice.update({
      where: { id: invoice.id },
      data: { externalRef: JSON.stringify(details) },
    });
    const client = await prisma.client.findUnique({ where: { id: request.params.clientId }, include: includeClient() });
    response.json({
      message: `PDF attached for invoice ${invoice.invoiceNumber}.`,
      client: publicClient(client),
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:clientId/invoices/:invoiceId", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const invoice = await prisma.clientInvoice.findFirst({
      where: { id: request.params.invoiceId, clientId: request.params.clientId },
    });
    if (!invoice) throw httpError(404, "Invoice not found.");
    await prisma.clientInvoice.delete({ where: { id: invoice.id } });
    const client = await prisma.client.findUnique({ where: { id: request.params.clientId }, include: includeClient() });
    response.json({
      message: `Invoice ${invoice.invoiceNumber} deleted.`,
      client: publicClient(client),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/native-invoices", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = nativeInvoiceSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Invoice details are incomplete.");
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: request.params.id } });
      if (!client) throw httpError(404, "Client not found.");
      if (client.status !== "active") throw httpError(400, "Invoices can be created only for active clients.");
      const calculation = calculateNativeInvoice(client, parsed.data);
      const invoiceNumber = await nextInvoiceNumber(tx);
      const invoice = await tx.clientInvoice.create({
        data: {
          clientId: client.id,
          invoiceNumber,
          invoiceMonth: calculation.invoiceDate.slice(0, 7),
          amount: calculation.gross,
          dueDate: toDate(calculation.dueDate),
          status: "draft",
          externalRef: JSON.stringify({ ...calculation, invoiceNumber }),
        },
      });
      return { client, invoice, calculation: { ...calculation, invoiceNumber } };
    });
    const refreshedClient = await prisma.client.findUnique({ where: { id: result.client.id }, include: includeClient() });
    response.status(201).json({
      message: `Native HRMS invoice ${result.invoice.invoiceNumber} created for ${result.client.name}.`,
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        month: result.invoice.invoiceMonth,
        amount: result.invoice.amount?.toString() || "0",
        dueDate: toDateString(result.invoice.dueDate),
        status: statusLabel(result.invoice.status),
        externalRef: result.invoice.externalRef || "",
        details: result.calculation,
      },
      client: publicClient(refreshedClient),
    });
  } catch (error) {
    if (error.code === "P2002") next(httpError(409, "Invoice number already exists for this client. Please retry."));
    else next(error);
  }
});

router.get("/:clientId/invoices/:invoiceId/pdf", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const invoice = await prisma.clientInvoice.findFirst({
      where: { id: request.params.invoiceId, clientId: request.params.clientId },
      include: { client: true },
    });
    if (!invoice) throw httpError(404, "Invoice not found.");
    const details = parseInvoiceDetails(invoice.externalRef);
    if (details?.source !== "hrms_native") throw httpError(400, "PDF can be generated only for native HRMS invoices.");
    const filePath = await createInvoicePdf(invoice.client, invoice, details);
    response.download(filePath, `${invoice.invoiceNumber}.pdf`);
  } catch (error) {
    next(error);
  }
});

router.get("/:clientId/invoices/:invoiceId/original-pdf", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const invoice = await prisma.clientInvoice.findFirst({
      where: { id: request.params.invoiceId, clientId: request.params.clientId },
    });
    if (!invoice) throw httpError(404, "Invoice not found.");
    const details = parseInvoiceDetails(invoice.externalRef);
    if (details?.source !== "historical_pdf_import" || !details.pdfPath) throw httpError(404, "Original PDF is not available for this invoice.");
    const safeRoot = resolve(historicalInvoiceUploadDir);
    const filePath = resolve(details.pdfPath);
    if (!filePath.startsWith(safeRoot)) throw httpError(403, "Original PDF path is invalid.");
    response.download(filePath, details.sourceFileName || `${invoice.invoiceNumber}.pdf`);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/agreements", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const parsed = agreementSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, "Agreement details are incomplete.");
    const agreement = await prisma.clientAgreement.create({
      data: {
        clientId: request.params.id,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl || null,
      },
    });
    response.status(201).json({ agreement });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/raise-invoice", requireRole("admin", "hr"), async (request, response, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: request.params.id } });
    if (!client) throw httpError(404, "Client not found.");
    response.json({
      ok: true,
      message: `Invoice integration handoff prepared for ${client.name}.`,
      handoff: {
        clientId: client.id,
        clientCode: client.clientCode,
        clientName: client.name,
        integrationStatus: "pending_external_api",
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
