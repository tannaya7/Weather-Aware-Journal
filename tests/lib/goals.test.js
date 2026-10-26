import { describe, expect, it } from 'vitest';
import { allGoalProgress, dayNumber, describeGoal, goalProgress, isValidGoal } from '../../src/lib/goals.js';

const EXERCISE = { id: 'exercise', name: 'Exercise', emoji: '🏃', type: 'boolean' };
const SLEEP = { id: 'sleep', name: 'Sleep', emoji: '😴', type: 'number', unit: 'hours' };
const SCREEN = { id: 'screen', name: 'Screen time', emoji: '📱', type: 'number', unit: 'hours' };

// Wednesday 14 Oct 2026; its week runs Mon 12 Oct - Sun 18 Oct.
const NOW = new Date(2026, 9, 14, 15);

function on(month, day, habits, hour = 9) {
  return { id: `${month}-${day}-${hour}`, date: new Date(2026, month, day, hour).toISOString(), habits };
}

describe('isValidGoal / describeGoal', () => {
  it('accepts days for yes/no habits and needs a threshold for number habits', () => {
    expect(isValidGoal({ days: 3 }, EXERCISE)).toBe(true);
    expect(isValidGoal({ days: 0 }, EXERCISE)).toBe(false);
    expect(isValidGoal({ days: 8 }, EXERCISE)).toBe(false);
    expect(isValidGoal({ days: 2.5 }, EXERCISE)).toBe(false);
    expect(isValidGoal({ days: 5 }, SLEEP)).toBe(false);
    expect(isValidGoal({ days: 5, direction: 'atLeast', threshold: 7 }, SLEEP)).toBe(true);
    expect(isValidGoal({ days: 5, direction: 'sideways', threshold: 7 }, SLEEP)).toBe(false);
    expect(isValidGoal({ days: 5, direction: 'atMost', threshold: -1 }, SLEEP)).toBe(false);
    expect(isValidGoal(undefined, SLEEP)).toBe(false);
  });

  it('describes goals in words', () => {
    expect(describeGoal({ days: 3 }, EXERCISE)).toBe('Exercise: 3 days a week');
    expect(describeGoal({ days: 1 }, EXERCISE)).toBe('Exercise: 1 day a week');
    expect(describeGoal({ days: 5, direction: 'atLeast', threshold: 7 }, SLEEP)).toBe(
      'Sleep: at least 7 hours on 5 days a week',
    );
    expect(describeGoal({ days: 4, direction: 'atMost', threshold: 3 }, SCREEN)).toBe(
      'Screen time: at most 3 hours on 4 days a week',
    );
  });
});

describe('goalProgress (yes/no habit)', () => {
  const goal = { days: 3 };

  it('counts distinct days met this week, Monday to Sunday', () => {
    const entries = [
      on(9, 11, { exercise: true }), // Sunday of last week: not this week
      on(9, 12, { exercise: true }), // Monday
      on(9, 12, { exercise: true }, 20), // Monday again: same day
      on(9, 13, { exercise: false }), // Tuesday, logged as not done
      on(9, 14, { exercise: true }), // Wednesday
    ];
    const p = goalProgress(entries, EXERCISE, goal, NOW);
    expect(p.metThisWeek).toBe(2);
    expect(p.achieved).toBe(false);
    expect(p.daysLeft).toBe(5); // Wed..Sun
    expect(p.onTrack).toBe(true);
  });

  it('is achieved once the target is reached', () => {
    const entries = [12, 13, 14].map((d) => on(9, d, { exercise: true }));
    const p = goalProgress(entries, EXERCISE, goal, NOW);
    expect(p.achieved).toBe(true);
    expect(p.streakWeeks).toBe(1);
  });

  it('says when a goal can no longer be reached this week', () => {
    const sunday = new Date(2026, 9, 18, 20);
    const p = goalProgress([on(9, 12, { exercise: true })], EXERCISE, goal, sunday);
    expect(p.daysLeft).toBe(1);
    expect(p.onTrack).toBe(false);
  });

  it('builds eight finished weeks, oldest first, and a streak of reached weeks', () => {
    // Reached in the weeks of 5 Oct, 28 Sep and 21 Sep; missed 14 Sep.
    const weeks = [5, 28, 21].map((start) => {
      const month = start >= 21 && start !== 5 ? 8 : 9; // 28 and 21 are September
      return [0, 1, 2].map((i) => on(month, start + i, { exercise: true }));
    });
    const entries = weeks.flat();
    const p = goalProgress(entries, EXERCISE, goal, NOW);
    expect(p.history).toHaveLength(8);
    expect(p.history[7].weekStart).toBe(dayNumber(new Date(2026, 9, 5)));
    expect(p.history[7].achieved).toBe(true);
    expect(p.history[6].achieved).toBe(true);
    expect(p.history[5].achieved).toBe(true);
    expect(p.history[4].achieved).toBe(false);
    expect(p.streakWeeks).toBe(3);
  });

  it('a missed week breaks the streak, and this week adds to it once reached', () => {
    const entries = [on(9, 5, { exercise: true }), on(9, 6, { exercise: true }), on(9, 7, { exercise: true })];
    expect(goalProgress(entries, EXERCISE, goal, NOW).streakWeeks).toBe(1);
    const thisWeek = [12, 13, 14].map((d) => on(9, d, { exercise: true }));
    expect(goalProgress([...entries, ...thisWeek], EXERCISE, goal, NOW).streakWeeks).toBe(2);
    expect(goalProgress([], EXERCISE, goal, NOW).streakWeeks).toBe(0);
  });

  it('handles the daylight-saving change without shifting weeks', () => {
    // Europe/US clocks change on different dates; check the week math for
    // the Sunday and Monday around a late-October change in the local zone.
    const sunday = new Date(2026, 9, 25, 23, 30);
    const monday = new Date(2026, 9, 26, 0, 30);
    const p = goalProgress([{ id: 1, date: sunday.toISOString(), habits: { exercise: true } }], EXERCISE, goal, monday);
    expect(p.metThisWeek).toBe(0);
    expect(p.history[7].met).toBe(1);
  });

  it('ignores entries with bad dates', () => {
    const p = goalProgress([{ id: 1, date: 'nope', habits: { exercise: true } }], EXERCISE, goal, NOW);
    expect(p.metThisWeek).toBe(0);
  });
});

describe('goalProgress (number habit)', () => {
  it('meets an at-least goal on days the value reaches the threshold', () => {
    const goal = { days: 3, direction: 'atLeast', threshold: 7 };
    const entries = [
      on(9, 12, { sleep: 7 }),
      on(9, 13, { sleep: 6.5 }),
      on(9, 14, { sleep: 8 }),
    ];
    expect(goalProgress(entries, SLEEP, goal, NOW).metThisWeek).toBe(2);
  });

  it('meets an at-most goal on days the value stays under the threshold', () => {
    const goal = { days: 2, direction: 'atMost', threshold: 3 };
    const entries = [on(9, 12, { screen: 2 }), on(9, 13, { screen: 3.5 }), on(9, 14, { screen: 3 })];
    expect(goalProgress(entries, SCREEN, goal, NOW).metThisWeek).toBe(2);
  });

  it('averages several entries in one day, and never counts a day with no value', () => {
    const goal = { days: 1, direction: 'atLeast', threshold: 7 };
    const entries = [on(9, 12, { sleep: 5 }, 8), on(9, 12, { sleep: 9 }, 20), on(9, 13, {}), on(9, 14, { sleep: '' })];
    expect(goalProgress(entries, SLEEP, goal, NOW).metThisWeek).toBe(1); // (5+9)/2 = 7
    expect(goalProgress(entries.slice(2), SLEEP, goal, NOW).metThisWeek).toBe(0);
  });
});

describe('allGoalProgress', () => {
  it('returns only habits with a valid goal', () => {
    const goals = { exercise: { days: 3 }, sleep: { days: 5 }, gone: { days: 2 } };
    const result = allGoalProgress([], [EXERCISE, SLEEP], goals, NOW);
    expect(result.map((r) => r.habit.id)).toEqual(['exercise']);
    expect(allGoalProgress([], [EXERCISE], undefined, NOW)).toEqual([]);
  });
});
