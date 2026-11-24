function utcDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function membershipDayStats(startsAt: Date, endsAt: Date) {
  const start = utcDay(startsAt);
  const end = utcDay(endsAt);
  const today = utcDay(new Date());
  const msDay = 86_400_000;
  const daySpan = Math.floor((end.getTime() - start.getTime()) / msDay);
  const totalDays = Math.max(1, daySpan + 1);
  const remainingDays = Math.max(
    0,
    Math.round((end.getTime() - today.getTime()) / msDay),
  );
  const usedDays = Math.min(totalDays, Math.max(0, totalDays - remainingDays));
  return { totalDays, remainingDays, usedDays };
}