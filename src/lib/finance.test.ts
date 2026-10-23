import { describe, expect, it } from 'vitest';
import { calculateBudgetStatus, getPeriodRange, inRange, spendingByCategory, sumTransactions } from './finance';
import type { Category, Transaction } from '../types';

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1', household_id: 'family-1', user_id: 'user-1', category_id: 'food', subcategory_id: null,
  amount: 100, type: 'expense', description: 'Lunch', payment_method: 'upi', occurred_at: '2026-10-21T07:00:00.000Z',
  created_at: '2026-10-21T07:00:00.000Z', updated_at: '2026-10-21T07:00:00.000Z', ...overrides
});

describe('budget calculations', () => {
  it('calculates remaining budget and warning states', () => {
    expect(calculateBudgetStatus(1000, 650)).toMatchObject({ spent: 650, limit: 1000, remaining: 350, percentage: 65, state: 'normal' });
    expect(calculateBudgetStatus(1000, 800).state).toBe('warning');
    expect(calculateBudgetStatus(1000, 1125)).toMatchObject({ remaining: -125, percentage: 113, state: 'exceeded' });
  });

  it('handles invalid limits safely', () => {
    expect(calculateBudgetStatus(0, 20)).toMatchObject({ limit: 0, spent: 20, percentage: 0, remaining: -20, state: 'exceeded' });
    expect(calculateBudgetStatus(Number.NaN, Number.NaN)).toMatchObject({ limit: 0, spent: 0, percentage: 0, remaining: 0, state: 'normal' });
  });
});

describe('reporting periods', () => {
  it('uses an exclusive end boundary for a local calendar day', () => {
    const date = new Date(2026, 9, 23, 14, 20);
    const range = getPeriodRange('daily', date);
    expect(range.start.getHours()).toBe(0);
    expect(range.end.getDate()).toBe(24);
    expect(inRange(new Date(2026, 9, 23, 23, 59).toISOString(), range)).toBe(true);
    expect(inRange(new Date(2026, 9, 24, 0, 0).toISOString(), range)).toBe(false);
  });

  it('respects a Saturday week start', () => {
    const friday = new Date(2026, 9, 23, 12);
    const range = getPeriodRange('weekly', friday, 6);
    expect(range.start.getDay()).toBe(6);
    expect(range.start.getDate()).toBe(17);
    expect(range.end.getDate()).toBe(24);
  });

  it('uses a calendar-month boundary', () => {
    const range = getPeriodRange('monthly', new Date(2026, 9, 23));
    expect(range.start.getDate()).toBe(1);
    expect(range.end.getMonth()).toBe(10);
    expect(range.end.getDate()).toBe(1);
  });
});

describe('transaction aggregation', () => {
  it('sums only the requested transaction type and ignores invalid values', () => {
    const rows = [transaction(), transaction({ id: 'tx-2', amount: '75.25' }), transaction({ id: 'tx-3', amount: -8 }), transaction({ id: 'tx-4', type: 'income', amount: 500 })];
    expect(sumTransactions(rows)).toBe(175.25);
    expect(sumTransactions(rows, 'income')).toBe(500);
  });

  it('groups expenses by category and sorts largest first', () => {
    const categories: Category[] = [
      { id: 'food', household_id: 'family-1', name: 'Food', parent_id: null, icon: 'utensils', color: '#ff0000', sort_order: 0, archived: false },
      { id: 'travel', household_id: 'family-1', name: 'Travel', parent_id: null, icon: 'car-front', color: '#0000ff', sort_order: 1, archived: false }
    ];
    const rows = [transaction(), transaction({ id: 'tx-2', category_id: 'travel', amount: 450 }), transaction({ id: 'tx-3', category_id: 'food', amount: 25, type: 'income' })];
    expect(spendingByCategory(rows, categories)).toEqual([
      { categoryId: 'travel', name: 'Travel', color: '#0000ff', value: 450 },
      { categoryId: 'food', name: 'Food', color: '#ff0000', value: 100 }
    ]);
  });
});
