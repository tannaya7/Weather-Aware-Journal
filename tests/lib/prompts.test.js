import { describe, expect, it } from 'vitest';
import { GENERAL_PROMPTS, WEATHER_PROMPTS, getPrompt } from '../../src/lib/prompts.js';
import { mapWeatherCodeToType } from '../../src/lib/weatherApi.js';

const MORNING = new Date(2026, 9, 5, 8, 0);
const EVENING = new Date(2026, 9, 5, 22, 0);
const TOMORROW = new Date(2026, 9, 6, 8, 0);

describe('getPrompt', () => {
  it('stays the same all day and changes the next day', () => {
    expect(getPrompt(MORNING)).toBe(getPrompt(EVENING));
    expect(getPrompt(TOMORROW)).not.toBe(getPrompt(MORNING));
  });

  it('gives a different general prompt each time you shuffle', () => {
    const seen = new Set(GENERAL_PROMPTS.map((_, i) => getPrompt(MORNING, undefined, i)));
    expect(seen.size).toBe(GENERAL_PROMPTS.length);
  });

  it('opens with a weather prompt when the weather is known', () => {
    expect(WEATHER_PROMPTS.Rain).toContain(getPrompt(MORNING, 'Rain'));
  });

  it('moves on to general prompts after shuffling past the weather one', () => {
    expect(GENERAL_PROMPTS).toContain(getPrompt(MORNING, 'Rain', 1));
    expect(getPrompt(MORNING, 'Rain', GENERAL_PROMPTS.length + 1)).toBe(getPrompt(MORNING, 'Rain'));
  });

  it('falls back to general prompts for unknown weather', () => {
    expect(GENERAL_PROMPTS).toContain(getPrompt(MORNING, 'Unknown'));
  });

  it('has prompts for every weather type the API can return', () => {
    const codes = [0, 1, 45, 51, 61, 71, 95];
    for (const code of codes) {
      expect(WEATHER_PROMPTS[mapWeatherCodeToType(code)]?.length).toBeGreaterThan(0);
    }
  });
});
