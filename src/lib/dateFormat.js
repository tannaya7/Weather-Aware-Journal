const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Formats the date string into something nice for the card
// Example: "28 Nov 2025"
export function formatDateForCard(isoString) {
  if (!isoString) return '';

  const d = new Date(isoString);
  if (isNaN(d)) return isoString;

  const day = d.getDate().toString().padStart(2, '0');
  return `${day} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Long form for the entry reading page. Example: "Friday, 28 November 2025"
export function formatDateLong(isoString) {
  if (!isoString) return '';

  const d = new Date(isoString);
  if (isNaN(d)) return isoString;

  return `${WEEKDAY_NAMES_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

// Small "calendar corner" badge used in the timeline: { day: '28', weekday: 'Fri' }
export function getDateBadgeParts(isoString) {
  if (!isoString) return { day: '—', weekday: '' };

  const d = new Date(isoString);
  if (isNaN(d)) return { day: '—', weekday: '' };

  return {
    day: d.getDate().toString(),
    weekday: WEEKDAY_NAMES_SHORT[d.getDay()],
  };
}

// Grouping key + label for the monthly timeline sections. Example key: "2025-11"
export function getMonthKey(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return 'Undated';
  return `${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

// 0-indexed (0 = January), for calendar-grid style month headers.
export function monthNameLong(monthIndex) {
  return MONTH_NAMES_LONG[monthIndex];
}

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function isSameDay(dateString, refDate) {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d)) return false;
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  );
}
