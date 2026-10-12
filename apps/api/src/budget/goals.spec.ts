import type {
  CategoryGroupDto,
  MonthlyEntryDto,
} from './dto/budget-responses.dto.js';
import { buildGoalsOverview, goalUsage, leftoverUsage } from './goals.js';

const type = (
  id: number,
  kind: 'INCOME' | 'EXPENSE',
  goalPercent: number | null,
  categoryIds: number[],
  active = true,
): CategoryGroupDto => ({
  id,
  kind,
  name: `Tipo ${id}`,
  position: id,
  active,
  goalPercent,
  categories: categoryIds.map((c) => ({
    id: c,
    name: `Categoria ${c}`,
    position: c,
    active: true,
  })),
});

const entry = (
  categoryId: number,
  month: string,
  amountCents: number,
  groupCents = 0,
): MonthlyEntryDto => ({
  categoryId,
  month,
  amountCents,
  groupCents,
  count: 1,
});

describe('goalUsage', () => {
  it.each([
    [44_99, 'ok'],
    [45_00, 'warning'],
    [50_00, 'warning'],
    [50_01, 'over'],
  ])('%i of 100,00 against 50%% is %s', (spent, status) => {
    expect(goalUsage(spent, 100_00, 50).status).toBe(status);
  });

  it('gives the target and the share in tenths of a percent', () => {
    expect(goalUsage(48_50, 100_00, 50)).toEqual({
      spentCents: 48_50,
      incomeCents: 100_00,
      targetCents: 50_00,
      permille: 485,
      status: 'warning',
    });
  });

  it('without income, any spending is over and there is no share', () => {
    expect(goalUsage(1, 0, 50)).toMatchObject({
      permille: null,
      targetCents: 0,
      status: 'over',
    });
    expect(goalUsage(0, 0, 50).status).toBe('ok');
  });
});

describe('leftoverUsage', () => {
  it('warns below the minimum and is over when negative', () => {
    expect(leftoverUsage(20_00, 100_00, 20).status).toBe('ok');
    expect(leftoverUsage(19_99, 100_00, 20).status).toBe('warning');
    expect(leftoverUsage(-1, 100_00, 20).status).toBe('over');
  });
});

describe('buildGoalsOverview', () => {
  const types = [
    type(1, 'EXPENSE', 50, [10, 11]),
    type(2, 'EXPENSE', 30, [20]),
    type(3, 'EXPENSE', null, [30]),
    type(4, 'EXPENSE', 10, [40], false),
    type(5, 'INCOME', null, [50]),
  ];

  it('sums the reference month and the window, group shares included', () => {
    const overview = buildGoalsOverview(
      types,
      [
        entry(50, '2026-10', 1000_00),
        entry(50, '2026-11', 1000_00),
        entry(10, '2026-10', 300_00),
        entry(11, '2026-10', 100_00, 50_00),
        entry(10, '2026-11', 600_00),
        entry(20, '2026-10', 100_00),
        entry(30, '2026-10', 200_00),
        entry(40, '2026-10', 100_00),
      ],
      '2026-10',
      '2026-11',
    );

    expect(overview.from).toBe('2026-10');
    expect(overview.to).toBe('2026-11');
    // The inactive type keeps no goal, but its spending counts in the leftover
    expect(overview.goals.map((g) => g.typeId)).toEqual([1, 2]);
    expect(overview.totalGoalPercent).toBe(80);
    const [housing, leisure] = overview.goals;
    expect(housing.month).toMatchObject({
      spentCents: 450_00,
      incomeCents: 1000_00,
      targetCents: 500_00,
      status: 'warning',
    });
    expect(housing.period).toMatchObject({
      spentCents: 1050_00,
      incomeCents: 2000_00,
      status: 'over',
    });
    expect(leisure.month.status).toBe('ok');
    expect(overview.total.month).toMatchObject({
      spentCents: 550_00,
      targetCents: 800_00,
    });
    expect(overview.leftover).toMatchObject({
      targetPercent: 20,
      month: { spentCents: 1000_00 - 850_00, status: 'warning' },
      period: { spentCents: 2000_00 - 1450_00, status: 'ok' },
    });
  });

  it('has no goals and the whole income as the minimum without goals', () => {
    const overview = buildGoalsOverview(
      [type(3, 'EXPENSE', null, [30]), type(5, 'INCOME', null, [50])],
      [entry(50, '2026-10', 100_00), entry(30, '2026-10', 150_00)],
      '2026-10',
      '2026-10',
    );
    expect(overview.goals).toEqual([]);
    expect(overview.leftover).toMatchObject({
      targetPercent: 100,
      month: { spentCents: -50_00, status: 'over' },
    });
  });

  it('never asks for a negative leftover when the goals pass 100%', () => {
    const overview = buildGoalsOverview(
      [type(1, 'EXPENSE', 70, [10]), type(2, 'EXPENSE', 40, [20])],
      [],
      '2026-10',
      '2026-10',
    );
    expect(overview.totalGoalPercent).toBe(110);
    expect(overview.leftover.targetPercent).toBe(0);
  });
});
