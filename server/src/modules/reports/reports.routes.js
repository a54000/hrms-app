import { Router } from "express";

const router = Router();

router.get("/attendance", (_request, response) => response.status(501).json({ error: { message: "Attendance report is not implemented yet.", status: 501 } }));
router.get("/attendance/:employeeId", (_request, response) => response.status(501).json({ error: { message: "Employee attendance report is not implemented yet.", status: 501 } }));
router.get("/payroll", (_request, response) => response.status(501).json({ error: { message: "Payroll report is not implemented yet.", status: 501 } }));
router.get("/headcount", (_request, response) => response.status(501).json({ error: { message: "Headcount report is not implemented yet.", status: 501 } }));

export default router;
