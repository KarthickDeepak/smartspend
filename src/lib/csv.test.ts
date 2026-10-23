import { describe, expect, it } from 'vitest';
import { parseCsv, transactionsToCsv, validateTransactionsCsv } from './csv';
import type { Category, Transaction } from '../types';

const category: Category = { id: 'food', household_id: 'family-1', name: 'Food & drink', parent_id: null, icon: 'utensils', color: '#22aa88', sort_order: 0, archived: false };
const baseTransaction: Transaction = {
  id: 'id-1', household_id: 'family-1', user_id: 'user-1', category_id: 'food', subcategory_id: null,
  amount: 50, type: 'expense', description: 'Coffee, with milk', payment_method: 'upi', occurred_at: '2026-10-22T06:00:00.000Z',
  created_at: '2026-10-22T06:00:00.000Z', updated_at: '2026-10-22T06:00:00.000Z'
};

describe('CSV import/export', () => {
  it('parses quoted commas and escaped quote characters', () => {
    expect(parseCsv('date,description\n2026-10-22,"Coffee, with milk"\n2026-10-23,"He said ""hello"""')).toEqual([
      ['date', 'description'], ['2026-10-22', 'Coffee, with milk'], ['2026-10-23', 'He said "hello"']
    ]);
  });

  it('rejects unclosed quoted fields', () => {
    expect(() => parseCsv('date,description\n2026-10-22,"unfinished')).toThrow('quotation mark');
  });

  it('validates amounts and category names and skips duplicates', () => {
    const rows = [
      'date,type,amount,category,payment_method,description',
      '2026-10-22T06:00:00.000Z,expense,50,"Food & drink",upi,"Coffee, with milk"',
      '2026-10-22T07:00:00.000Z,expense,-5,"Food & drink",cash,Invalid',
      '2026-10-22T08:00:00.000Z,expense,12,Unknown,upi,No category'
    ].join('\n');
    const result = validateTransactionsCsv(rows, [category], [baseTransaction]);
    expect(result.valid).toHaveLength(0);
    expect(result.skippedDuplicates).toBe(1);
    expect(result.errors).toHaveLength(2);
  });

  it('exports valid CSV and escapes descriptions', () => {
    const csv = transactionsToCsv([baseTransaction], [category]);
    expect(csv).toContain('"Coffee, with milk"');
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
