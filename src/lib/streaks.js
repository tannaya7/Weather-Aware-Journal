// A calendar day (in local time) as a whole number, so consecutive days
// differ by exactly 1 regardless of daylight-saving shifts.
function dayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

// Streaks count calendar days with at least one entry. The current streak
// stays alive through today even before you've written, so it doesn't drop
// to 0 every morning — it only breaks once a whole day is missed.
export function computeStreaks(entries, today = new Date()) {
  const days = new Set();
  for (const entry of entries) {
    const d = new Date(entry.date);
    if (entry.date && !isNaN(d)) days.add(dayNumber(d));
  }

  const todayNum = dayNumber(today);
  const wroteToday = days.has(todayNum);

  let current = 0;
  for (let day = wroteToday ? todayNum : todayNum - 1; days.has(day); day--) {
    current += 1;
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of [...days].sort((a, b) => a - b)) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  return { current, longest, wroteToday };
}
