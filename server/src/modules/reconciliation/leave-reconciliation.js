import { monthRange, toDate, toDateString } from "./calendar.js";

export function leaveDaysIntersectingCalendar({ leaveRequest, workingCalendar }) {
  const { start, end } = monthRange(workingCalendar[0]?.date?.slice(0, 7) || toDateString(toDate("1970-01-01")));
  const from = leaveRequest.fromDate < start ? start : leaveRequest.fromDate;
  const to = leaveRequest.toDate > end ? end : leaveRequest.toDate;
  const days = workingCalendar.filter((day) => day.date >= toDateString(from) && day.date <= toDateString(to));
  return days;
}

export function classifyLeaveRequest(leaveRequest, workingCalendar) {
  const inRangeDays = workingCalendar.filter((day) => day.date >= toDateString(leaveRequest.fromDate) && day.date <= toDateString(leaveRequest.toDate));
  const workingDays = inRangeDays.filter((day) => day.isWorkingDay).length;
  const requestedDays = Number(leaveRequest.days ?? 0);
  const isSingleDay = toDateString(leaveRequest.fromDate) === toDateString(leaveRequest.toDate);
  const isPaidLeave = leaveRequest.leaveType !== "Unpaid Leave";
  const mismatch = !isSingleDay && requestedDays !== workingDays;
  const details = {
    leaveRequestId: leaveRequest.id,
    leaveType: leaveRequest.leaveType,
    fromDate: toDateString(leaveRequest.fromDate),
    toDate: toDateString(leaveRequest.toDate),
    requestedDays,
    workingDays,
    isSingleDay,
  };

  if (isSingleDay && requestedDays === 0.5) {
    return {
      days: [{ date: toDateString(leaveRequest.fromDate), days: 0.5 }],
      status: isPaidLeave ? "approved_paid" : "approved_unpaid",
      isHalfDay: true,
      mismatch: false,
      details,
    };
  }

  if (mismatch) {
    return {
      // Known limitation: when the request span and the requested days do not reconcile,
      // we intentionally avoid guessing which exact date is the half-day.
      // We mark the whole in-range span as full-day leave pending manual review.
      days: inRangeDays.map((day) => ({ date: day.date, days: 1 })),
      status: isPaidLeave ? "approved_paid" : "approved_unpaid",
      isHalfDay: false,
      mismatch: true,
      details,
    };
  }

  return {
    days: inRangeDays.filter((day) => day.isWorkingDay).map((day) => ({ date: day.date, days: 1 })),
    status: isPaidLeave ? "approved_paid" : "approved_unpaid",
    isHalfDay: false,
    mismatch: false,
    details,
  };
}

export function buildLeaveDayMap(leaveRequests, workingCalendar) {
  const map = new Map();
  const all = [];
  for (const leaveRequest of leaveRequests) {
    const classification = classifyLeaveRequest(leaveRequest, workingCalendar);
    all.push({ leaveRequest, classification });
    for (const day of classification.days) {
      const existing = map.get(day.date);
      const entry = {
        leaveRequestId: leaveRequest.id,
        leaveType: leaveRequest.leaveType,
        status: classification.status,
        days: day.days,
        isHalfDay: classification.isHalfDay,
      };
      if (!existing) map.set(day.date, entry);
      else map.set(day.date, { ...existing, overlapping: true });
    }
  }
  return { leaveDayMap: map, classifications: all };
}
