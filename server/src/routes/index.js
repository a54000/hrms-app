import { Router } from "express";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import clientRoutes from "../modules/clients/clients.routes.js";
import communicationRoutes from "../modules/communication/communication.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import employeeRoutes from "../modules/employees/employees.routes.js";
import leaveRoutes from "../modules/leave/leave.routes.js";
import payrollRoutes from "../modules/payroll/payroll.routes.js";
import performanceRoutes from "../modules/performance/performance.routes.js";
import recruitmentRoutes from "../modules/recruitment/recruitment.routes.js";
import reportRoutes from "../modules/reports/reports.routes.js";
import saturdayRotaRoutes from "../modules/saturday-rota/saturday-rota.routes.js";
import settingsRoutes from "../modules/settings/settings.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/clients", clientRoutes);
router.use("/communication", communicationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/employees", employeeRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/leave", leaveRoutes);
router.use("/payroll", payrollRoutes);
router.use("/recruitment", recruitmentRoutes);
router.use("/performance", performanceRoutes);
router.use("/reports", reportRoutes);
router.use("/saturday-rota", saturdayRotaRoutes);
router.use("/settings", settingsRoutes);

export default router;
