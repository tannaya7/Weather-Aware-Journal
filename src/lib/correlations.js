import { MOOD_SCORES, parseTemperature, withMoonFraction } from './insights.js';

// Which weather, sky, and habit factors move with your mood, and how sure
// we can be. Mood is an ordered score, not a measured quantity, so this
// uses Spearman rank correlation (no assumption about spacing or shape).
// Every factor is tested at lag 0 (same day) and lag 1 (the day before),
// and because that is many tests at once, p-values are corrected for it
// (Benjamini-Hochberg). A correlation is never presented as a cause.

// Fewer paired days than this and a correlation is mostly luck.
export const MIN_PAIRS = 14;
// Share of tests allowed to be false alarms among the ones we call "clear".
export const CLEAR_Q = 0.05;
export const POSSIBLE_Q = 0.2;

const DAY_MS = 86400000;

// --- Statistics ------------------------------------------------------------

function logGamma(x) {
  // Lanczos approximation.
  const c = [
    76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015,
    0.120865097386618e-2, -0.539523938495e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const coef of c) ser += coef / ++y;
  return -tmp + Math.log((2.506628274631 * ser) / x);
}

function betaContinuedFraction(a, b, x) {
  const MAX_ITER = 300;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a, b).
export function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  // Use the form that converges fastest.
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

// Two-sided p-value of Student's t with `df` degrees of freedom.
export function tTwoSidedP(t, df) {
  if (!Number.isFinite(t)) return 0;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

// Ranks 1..n, tied values sharing their average rank.
export function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // one side never varies
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

// Spearman's rho with a p-value (t approximation, good from n ~ 10) and a
// 95% confidence interval (Fisher transform). Null when it can't be
// computed: too few pairs, or one side is constant.
export function spearman(xs, ys) {
  const n = xs.length;
  if (n < 4 || n !== ys.length) return null;
  const rho = pearson(ranks(xs), ranks(ys));
  if (rho === null) return null;

  const denom = 1 - rho * rho;
  const p = denom <= 0 ? 0 : tTwoSidedP(rho * Math.sqrt((n - 2) / denom), n - 2);
  let ci = [rho, rho];
  if (Math.abs(rho) < 1) {
    const z = Math.atanh(rho);
    // Bonett-Wright standard error for Spearman.
    const se = Math.sqrt((1 + (rho * rho) / 2) / (n - 3));
    ci = [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)];
  }
  return { rho, p, n, ci };
}

// Benjamini-Hochberg adjusted p-values ("q"), in the input order.
export function adjustPValues(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const q = new Array(m);
  let running = 1;
  order.forEach(([p, i], k) => {
    const rank = m - k;
    running = Math.min(running, (p * m) / rank);
    q[i] = Math.min(1, running);
  });
  return q;
}

export function describeStrength(rho) {
  const r = Math.abs(rho);
  if (r < 0.1) return 'negligible';
  if (r < 0.3) return 'weak';
  if (r < 0.5) return 'moderate';
  return 'strong';
}

// --- Daily data ------------------------------------------------------------

function dayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

const WEATHER_GROUPS = [
  { id: 'weather-wet', name: 'Wet weather', types: ['Rain', 'Drizzle', 'Thunderstorm'] },
  { id: 'weather-clear', name: 'Clear skies', types: ['Clear sky'] },
  { id: 'weather-grey', name: 'Cloud or fog', types: ['Clouds', 'Fog'] },
  { id: 'weather-snow', name: 'Snow', types: ['Snow'] },
];

// The factors tested, with how each is read from one day's entries.
export function buildFactors(habits = []) {
  const factors = [
    { id: 'temperature', name: 'Temperature', kind: 'number', unit: '°C', read: (es) => mean(es.map((e) => parseTemperature(e.temperature)).filter((v) => v !== null)) },
    { id: 'daylight', name: 'Daylight', kind: 'number', unit: 'hours', read: (es) => mean(es.map((e) => e.daylightHours).filter((v) => typeof v === 'number')) },
    { id: 'air', name: 'Air quality (AQI)', kind: 'number', read: (es) => mean(es.map((e) => e.airQuality).filter((v) => typeof v === 'number')) },
    { id: 'uv', name: 'UV index', kind: 'number', read: (es) => mean(es.map((e) => e.uvIndex).filter((v) => typeof v === 'number')) },
    {
      id: 'moon',
      name: 'Moon brightness',
      kind: 'number',
      // Illumination, not cycle position: position wraps around, so a
      // rank correlation on it would be meaningless.
      read: (es) =>
        mean(
          es
            .map((e) => withMoonFraction(e).moonFraction)
            .filter((f) => typeof f === 'number')
            .map((f) => (1 - Math.cos(2 * Math.PI * f)) / 2),
        ),
    },
    ...WEATHER_GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      kind: 'flag',
      read: (es) => {
        const typed = es.filter((e) => e.weatherType && e.weatherType !== 'Unknown');
        return typed.length ? (typed.some((e) => g.types.includes(e.weatherType)) ? 1 : 0) : null;
      },
    })),
  ];

  for (const habit of habits) {
    factors.push({
      id: `habit-${habit.id}`,
      name: habit.name,
      emoji: habit.emoji,
      kind: habit.type === 'boolean' ? 'flag' : 'number',
      unit: habit.unit,
      read: (es) => {
        const vals = es
          .map((e) => e.habits?.[habit.id])
          .filter((v) => v !== undefined && v !== '' && v !== null)
          .map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)))
          .filter((v) => !Number.isNaN(v));
        return mean(vals);
      },
    });
  }
  return factors;
}

// One row per calendar day with a mood: { day, mood, entries }.
export function groupByDay(entries) {
  const days = new Map();
  for (const entry of entries) {
    const d = entry?.date ? new Date(entry.date) : null;
    if (!d || isNaN(d)) continue;
    const day = dayNumber(d);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(entry);
  }
  return days;
}

function dayMood(dayEntries) {
  return mean(dayEntries.map((e) => MOOD_SCORES[e.mood]).filter((s) => s !== undefined));
}

// --- Analysis --------------------------------------------------------------

function sentence(factor, lag, rho) {
  const dir = rho > 0 ? 'higher' : 'lower';
  const name = factor.name.toLowerCase();
  if (factor.kind === 'flag') {
    return lag === 0
      ? `Your mood tends to be ${dir} on days with ${name}.`
      : `Your mood tends to be ${dir} the day after ${name}.`;
  }
  return lag === 0
    ? `Your mood tends to be ${dir} on days with more ${name}.`
    : `Your mood tends to be ${dir} the day after more ${name}.`;
}

// Tests each factor against mood. `lags` are days of delay between the
// factor and the mood it is compared with (1 = yesterday's factor vs
// today's mood). Returns every testable result, best first.
export function analyzeCorrelations(entries, { habits = [], lags = [0, 1], minPairs = MIN_PAIRS } = {}) {
  const days = groupByDay(entries);
  const factors = buildFactors(habits);
  const results = [];

  for (const factor of factors) {
    const series = new Map();
    for (const [day, dayEntries] of days) {
      const v = factor.read(dayEntries);
      if (v !== null && v !== undefined) series.set(day, v);
    }
    for (const lag of lags) {
      const xs = [];
      const ys = [];
      for (const [day, dayEntries] of days) {
        const mood = dayMood(dayEntries);
        const x = series.get(day - lag);
        if (mood === null || x === undefined) continue;
        xs.push(x);
        ys.push(mood);
      }
      if (xs.length < minPairs) continue;
      if (factor.kind === 'flag') {
        const ones = xs.filter((v) => v === 1).length;
        // Need both kinds of day, each seen a few times.
        if (ones < 3 || xs.length - ones < 3) continue;
      }
      const stat = spearman(xs, ys);
      if (!stat) continue;
      results.push({ factor, lag, ...stat, direction: stat.rho > 0 ? 'positive' : 'negative', strength: describeStrength(stat.rho), summary: sentence(factor, lag, stat.rho) });
    }
  }

  const qs = adjustPValues(results.map((r) => r.p));
  results.forEach((r, i) => {
    r.q = qs[i];
    r.confidence = r.q < CLEAR_Q ? 'clear' : r.q < POSSIBLE_Q ? 'possible' : 'none';
  });

  return results.sort((a, b) => a.q - b.q || Math.abs(b.rho) - Math.abs(a.rho));
}

// How many days of data each factor has alongside a mood, for telling the
// person what is still missing.
export function dataCoverage(entries) {
  const days = groupByDay(entries);
  const moodDays = [...days.values()].filter((es) => dayMood(es) !== null).length;
  return { moodDays, enough: moodDays >= MIN_PAIRS };
}
