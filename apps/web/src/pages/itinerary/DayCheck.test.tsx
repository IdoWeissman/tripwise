import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayCheck } from './DayCheck';
import type { DayPlan } from './queries';

const stop = (title: string, start: string, end: string) => ({
  activity: { id: title, title, startTime: null, durationMinutes: null, booking: null },
  start,
  end,
  durationMinutes: 60,
  durationEstimated: true,
  travel: null,
});
const plan = (issues: DayPlan['issues'] = []) =>
  ({
    stops: [stop('Castle', '09:30', '11:30'), stop('Market', '12:00', '13:15')],
    issues,
    travelMinutes: 40,
    startTime: '09:30',
    endTime: '13:15',
    backToStay: null,
    travelEstimated: false,
    freeFrom: null,
    freeUntil: null,
  }) as unknown as DayPlan;

describe('DayCheck', () => {
  it('sums up a fine day and opens the plan', () => {
    const onOpen = vi.fn();
    render(<DayCheck plan={plan()} loading={false} dayName="Day 2, Sun, Nov 15" onOpen={onOpen} />);
    const button = screen.getByRole('button', {
      name: 'Day plan for Day 2, Sun, Nov 15: 2 stops · 40 min travel · 09:30–13:15',
    });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
  });

  it('says how many things need a look, in words', () => {
    render(
      <DayCheck
        plan={plan([
          { kind: 'CLOSED', message: 'Closes at 13:00', activityId: 'Market', blocking: true },
        ] as DayPlan['issues'])}
        loading={false}
        dayName="Day 2"
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('1 to check')).toBeTruthy();
  });

  it('shows nothing for a day without plans', () => {
    const { container } = render(
      <DayCheck
        plan={{ ...plan(), stops: [] } as DayPlan}
        loading={false}
        dayName="Day 2"
        onOpen={() => undefined}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
