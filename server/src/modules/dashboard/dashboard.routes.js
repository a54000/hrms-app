import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/require-auth.js";

const router = Router();
const IST_OFFSET_MINUTES = 330;
const activeStatuses = ["active", "probation", "on_leave"];
const hiddenAttendanceNames = ["Surinder Singh"];

function localDateString(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function statusLabel(value) {
  const labels = {
    present: "Present",
    remote: "Remote",
    late: "Late",
    half_day: "Half Day",
    leave: "Leave",
    absent: "Absent",
    weekend: "Weekend",
  };
  return labels[value] || value;
}

function leaveLabel(value) {
  const labels = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
  return labels[value] || value;
}

function employeeWhereForUser(user) {
  if (user.role === "employee") return { id: user.employee?.id || "" };
  if (user.role === "manager") return { managerId: user.employee?.id || "" };
  return {};
}

router.use(requireAuth);

router.get("/summary", async (request, response, next) => {
  try {
    const today = localDateString();
    const date = toDate(today);
    const employeeWhere = {
      status: { in: activeStatuses },
      fullName: { notIn: hiddenAttendanceNames },
      ...employeeWhereForUser(request.user),
    };

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      orderBy: { employeeCode: "asc" },
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        client: true,
        department: true,
        designation: true,
        status: true,
        monthlySalary: true,
        bankAccount: true,
      },
    });
    const employeeIds = employees.map((employee) => employee.id);
    const [attendanceRecords, leaveRequests, pendingAttendanceRequests, pendingLeaveCount] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { employeeId: { in: employeeIds }, attendanceDate: date },
        select: { employeeId: true, status: true, checkIn: true, checkOut: true, durationMinutes: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: { in: ["approved", "pending"] },
          fromDate: { lte: date },
          toDate: { gte: date },
        },
        select: { id: true, employeeId: true, leaveType: true, fromDate: true, toDate: true, status: true },
      }),
      prisma.attendanceUpdateRequest.count({
        where: { employeeId: { in: employeeIds }, status: "pending" },
      }),
      prisma.leaveRequest.count({
        where: { employeeId: { in: employeeIds }, status: "pending" },
      }),
    ]);

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const attendanceByEmployee = new Map(attendanceRecords.map((record) => [record.employeeId, record]));
    const leaveByEmployee = new Map(leaveRequests.map((leave) => [leave.employeeId, leave]));
    const presentStatuses = new Set(["present", "remote", "late"]);
    const presentToday = attendanceRecords.filter((record) => presentStatuses.has(record.status)).length;
    const onLeaveToday = leaveRequests.map((leave) => {
      const employee = employeeById.get(leave.employeeId);
      return {
        employeeId: employee?.employeeCode || "",
        employee: employee?.fullName || "",
        type: leave.leaveType,
        status: leaveLabel(leave.status),
        fromDate: toDateString(leave.fromDate),
        toDate: toDateString(leave.toDate),
      };
    });
    const absentToday = employees
      .filter((employee) => {
        const attendance = attendanceByEmployee.get(employee.id);
        return !leaveByEmployee.has(employee.id) && (!attendance || attendance.status === "absent");
      })
      .map((employee) => {
        const attendance = attendanceByEmployee.get(employee.id);
        return {
          employeeId: employee.employeeCode,
          employee: employee.fullName,
          client: employee.client || employee.department || "",
          status: attendance ? statusLabel(attendance.status) : "Not checked in",
        };
      });

    response.json({
      today,
      employeeCount: employees.length,
      probationCount: employees.filter((employee) => employee.status === "probation").length,
      presentToday,
      absentToday,
      onLeaveToday,
      pendingAttendanceRequests,
      pendingLeave: pendingLeaveCount,
      missingPayrollDetails: employees.filter((employee) => !employee.monthlySalary || !employee.bankAccount).length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
