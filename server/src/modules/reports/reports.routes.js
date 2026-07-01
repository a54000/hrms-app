import { Router } from "express";
import { buildLeaveReport } from "./leave-report.js";

export function createReportRouter({ leaveReportBuilder = buildLeaveReport } = {}) {
  const router = Router();

  router.get("/attendance", (_request, response) => response.status(501).json({ error: { message: "Attendance report is not implemented yet.", status: 501 } }));
  router.get("/attendance/:employeeId", (_request, response) => response.status(501).json({ error: { message: "Employee attendance report is not implemented yet.", status: 501 } }));
  router.get("/payroll", (_request, response) => response.status(501).json({ error: { message: "Payroll report is not implemented yet.", status: 501 } }));
  router.get("/headcount", (_request, response) => response.status(501).json({ error: { message: "Headcount report is not implemented yet.", status: 501 } }));

  router.get("/leaves", async (request, response, next) => {
    try {
      const month = String(request.query.month || new Date().toISOString().slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(month)) {
        response.status(400).json({ error: { message: "Month must be in YYYY-MM format.", status: 400 } });
        return;
      }
      const report = await leaveReportBuilder(month);
      response.json({ report });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const router = createReportRouter();

export default router;
