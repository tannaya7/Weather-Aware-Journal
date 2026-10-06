import { describeAirQuality, describeUv, moonPhase } from '../../lib/sky.js';
import styles from './SkyDetails.module.css';

// Sunrise/sunset, daylight, UV, air quality, and the moon for an entry's
// day: whatever is known, as small labeled chips.
export function SkyDetails({ data, date }) {
  const moon = date ? moonPhase(date) : null;
  const chips = [];

  if (data.sunrise && data.sunset) {
    chips.push(['sun', '🌅', `${data.sunrise} – ${data.sunset}`, `Sunrise ${data.sunrise}, sunset ${data.sunset}`]);
  }
  if (typeof data.daylightHours === 'number') {
    chips.push(['daylight', '☀️', `${data.daylightHours}h daylight`, `${data.daylightHours} hours of daylight`]);
  }
  if (typeof data.uvIndex === 'number') {
    const uv = Math.round(data.uvIndex);
    chips.push(['uv', '🕶️', `UV ${uv} · ${describeUv(data.uvIndex)}`, `UV index ${uv}, ${describeUv(data.uvIndex)}`]);
  }
  if (typeof data.airQuality === 'number') {
    const label = describeAirQuality(data.airQuality);
    chips.push(['air', '🌬️', `AQI ${data.airQuality} · ${label}`, `Air quality index ${data.airQuality}, ${label}`]);
  }
  if (moon) chips.push(['moon', moon.emoji, moon.name, moon.name]);

  if (chips.length === 0) return null;

  return (
    <ul className={styles.chips} aria-label="Sun, air, and moon">
      {chips.map(([key, icon, text, label]) => (
        <li key={key} className={styles.chip} aria-label={label}>
          <span aria-hidden="true">{icon}</span> <span aria-hidden="true">{text}</span>
        </li>
      ))}
    </ul>
  );
}
