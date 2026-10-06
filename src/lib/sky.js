// Sun, daylight, UV, air quality, and the moon, for an entry's date and
// place. Sunrise/sunset/daylight/UV come from Open-Meteo's daily weather
// (the archive has no UV), air quality from its air-quality API, and the
// moon phase is calculated locally.

// Entry fields this module fills in.
export const SKY_FIELDS = ['sunrise', 'sunset', 'daylightHours', 'uvIndex', 'airQuality'];

export function pickSky(source) {
  return Object.fromEntries(SKY_FIELDS.map((field) => [field, source?.[field]]));
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const FORECAST_PAST_DAYS = 90;

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function numberOrUndefined(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}

// Everything is best effort: whatever can't be looked up is left out, and
// the weather itself never fails because of it.
export async function fetchSkyAt({ latitude, longitude, date, now = new Date() }) {
  const when = date ? new Date(date) : now;
  const day = localDay(when);
  const hour = `${day}T${pad(when.getHours())}:00`;
  const where = `latitude=${latitude}&longitude=${longitude}&timezone=auto&start_date=${day}&end_date=${day}`;
  const recent = (now - when) / 86400000 <= FORECAST_PAST_DAYS;

  const [sun, air] = await Promise.allSettled([
    getJson(
      `${recent ? FORECAST_URL : ARCHIVE_URL}?${where}&daily=sunrise,sunset,daylight_duration${
        recent ? ',uv_index_max' : ''
      }`,
    ),
    getJson(`${AIR_URL}?${where}&hourly=us_aqi`),
  ]);

  const sky = {};
  const daily = sun.status === 'fulfilled' ? sun.value.daily : null;
  if (daily) {
    sky.sunrise = daily.sunrise?.[0]?.slice(11, 16);
    sky.sunset = daily.sunset?.[0]?.slice(11, 16);
    const seconds = numberOrUndefined(daily.daylight_duration?.[0]);
    sky.daylightHours = seconds === undefined ? undefined : Math.round((seconds / 3600) * 10) / 10;
    sky.uvIndex = numberOrUndefined(daily.uv_index_max?.[0]);
  }
  const hourly = air.status === 'fulfilled' ? air.value.hourly : null;
  if (hourly) {
    const index = hourly.time?.indexOf(hour) ?? -1;
    sky.airQuality = numberOrUndefined(hourly.us_aqi?.[index]);
  }

  return Object.fromEntries(Object.entries(sky).filter(([, v]) => v !== undefined));
}

// --- Labels ----------------------------------------------------------------

// US AQI bands (EPA).
export function describeAirQuality(aqi) {
  if (typeof aqi !== 'number') return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

// WHO UV index bands.
export function describeUv(uv) {
  if (typeof uv !== 'number') return null;
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

// --- Moon --------------------------------------------------------------------

const SYNODIC_MONTH = 29.530588853; // days, new moon to new moon
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 6 Jan 2000, 18:14 UTC

const PHASES = [
  { name: 'New moon', emoji: '🌑' },
  { name: 'Waxing crescent', emoji: '🌒' },
  { name: 'First quarter', emoji: '🌓' },
  { name: 'Waxing gibbous', emoji: '🌔' },
  { name: 'Full moon', emoji: '🌕' },
  { name: 'Waning gibbous', emoji: '🌖' },
  { name: 'Last quarter', emoji: '🌗' },
  { name: 'Waning crescent', emoji: '🌘' },
];

// Position in the lunar cycle (0 = new, 0.5 = full) and its name. Accurate
// to within about a day, which is plenty for a journal.
export function moonPhase(date) {
  const d = new Date(date);
  const days = (d.getTime() - KNOWN_NEW_MOON) / 86400000;
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const fraction = age / SYNODIC_MONTH;
  return { fraction, ...PHASES[Math.round(fraction * 8) % 8] };
}
