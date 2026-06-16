import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const sourcePath = process.argv[2] || "/private/tmp/hrguru-import/workbook-employees.json";

function toDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function main() {
  const rows = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.employee.findUnique({
      where: {
        employeeCode_legalEntity: {
          employeeCode: row.employeeCode,
          legalEntity: row.legalEntity,
        },
      },
      select: { id: true },
    });

    await prisma.employee.upsert({
      where: {
        employeeCode_legalEntity: {
          employeeCode: row.employeeCode,
          legalEntity: row.legalEntity,
        },
      },
      update: {
        fullName: row.fullName,
        email: row.email,
        designation: row.designation,
        department: row.department,
        status: row.status,
        joinDate: toDate(row.joinDate),
        exitDate: toDate(row.exitDate),
        salaryBand: row.salaryBand,
        ctc: row.ctc,
        monthlySalary: row.monthlySalary,
        pan: row.pan,
        bankName: row.bankName,
        bankAccount: row.bankAccount,
        ifsc: row.ifsc,
        documents: row.documents,
        lifecycleStage: row.lifecycleStage,
      },
      create: {
        employeeCode: row.employeeCode,
        legalEntity: row.legalEntity,
        fullName: row.fullName,
        email: row.email,
        designation: row.designation,
        department: row.department,
        status: row.status,
        joinDate: toDate(row.joinDate),
        exitDate: toDate(row.exitDate),
        employmentType: "Full-time",
        workMode: "Office",
        workLocation: "India",
        salaryBand: row.salaryBand,
        ctc: row.ctc,
        monthlySalary: row.monthlySalary,
        pan: row.pan,
        bankName: row.bankName,
        bankAccount: row.bankAccount,
        ifsc: row.ifsc,
        documents: row.documents,
        lifecycleStage: row.lifecycleStage,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  const counts = await prisma.employee.groupBy({
    by: ["legalEntity"],
    _count: { _all: true },
    orderBy: { legalEntity: "asc" },
  });

  console.log(JSON.stringify({ imported: rows.length, created, updated, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
