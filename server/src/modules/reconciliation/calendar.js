const IST_OFFSET_MINUTES = 330;

export function monthRange(month) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start, end };
}

export function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

export function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function dayOfWeek(date) {
  return date.getUTCDay();
}

export function isWeekend(date) {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

export function buildWorkingDayCalendar({ month, holidayDates = new Set(), saturdayWorkingDates = new Set() }) {
  const { start, end } = monthRange(month);
  const days = [];
  for (let current = start; current <= end; current = addDays(current, 1)) {
    const iso = toDateString(current);
    const saturday = dayOfWeek(current) === 6;
    const weekend = isWeekend(current);
    const holiday = holidayDates.has(iso);
    const saturdayRotaWorkingDay = saturday && saturdayWorkingDates.has(iso);
    let kind = "working";
    if (holiday) kind = "holiday";
    else if (saturdayRotaWorkingDay) kind = "saturday_rota_working";
    else if (weekend) kind = "weekend";
    days.push({
      date: iso,
      kind,
      isWorkingDay: kind === "working" || kind === "saturday_rota_working",
      isWeekend: weekend,
      isHoliday: holiday,
      isSaturdayRotaWorkingDay: saturdayRotaWorkingDay,
    });
  }
  return days;
}

export function mapCalendarByDate(calendar) {
  return new Map(calendar.map((row) => [row.date, row]));
}

