import { toDateString } from "./calendar.js";

export function reconcileAttendanceDay({ calendarDay, attendanceRecord, leaveDay }) {
  const base = {
    date: calendarDay.date,
    calendarKind: calendarDay.kind,
    attendanceStatus: attendanceRecord?.status || null,
    leaveStatus: leaveDay?.status || null,
    leaveType: leaveDay?.leaveType || null,
    payable: false,
    reduceLeaveBalance: false,
    reduceSalary: false,
    workedDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
  };

  if (!calendarDay.isWorkingDay) return base;
  if (attendanceRecord && ["present", "remote", "late"].includes(attendanceRecord.status)) {
    return { ...base, payable: true, reduceSalary: false, workedDays: 1 };
  }
  if (attendanceRecord?.status === "half_day") {
    const halfDayCoveredByLeave = leaveDay?.isHalfDay && leaveDay?.status === "approved_paid";
    return {
      ...base,
      payable: true,
      reduceLeaveBalance: Boolean(halfDayCoveredByLeave),
      reduceSalary: !halfDayCoveredByLeave,
      workedDays: 0.5,
      paidLeaveDays: halfDayCoveredByLeave ? 0.5 : 0,
      unpaidLeaveDays: 0,
    };
  }
  if (leaveDay?.status === "approved_paid") {
    return { ...base, payable: true, reduceLeaveBalance: true, workedDays: 0, paidLeaveDays: leaveDay.days || 1 };
  }
  if (leaveDay?.status === "approved_unpaid") {
    return { ...base, payable: false, reduceLeaveBalance: false, reduceSalary: true, unpaidLeaveDays: leaveDay.days || 1 };
  }
  return { ...base, reduceSalary: true, absentDays: 1 };
}

export function summarizeAttendance(rows) {
  return rows.reduce((acc, row) => {
    acc.workDays += row.workedDays || 0;
    acc.presentDays += row.workedDays || 0;
    acc.paidLeaveDays += row.paidLeaveDays || 0;
    acc.unpaidLeaveDays += row.unpaidLeaveDays || 0;
    acc.absentDays += row.absentDays || 0;
    return acc;
  }, { workDays: 0, presentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0 });
}

