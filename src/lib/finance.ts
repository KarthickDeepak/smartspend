import type { BudgetStatus, Category, BudgetPeriod, Transaction } from '../types';

export interface DateRange {
  start: Date;
  end: Date; // exclusive
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getPeriodRange(period: BudgetPeriod, from: Date = new Date(), weekStartsOn = 1): DateRange {
  const start = startOfLocalDay(from);
  if (period === 'daily') return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
  if (period === 'weekly') {
    const weekday = start.getDay();
    const offset = (weekday - weekStartsOn + 7) % 7;
    const weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - offset);
    return { start: weekStart, end: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7) };
  }
  return {
    start: new Date(start.getFullYear(), start.getMonth(), 1),
    end: new Date(start.getFullYear(), start.getMonth() + 1, 1)
  };
}

export function inRange(isoDate: string, range: DateRange): boolean {
  const timestamp = new Date(isoDate).getTime();
  return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp < range.end.getTime();
}

export function sumTransactions(transactions: Transaction[], type: 'expense' | 'income' = 'expense'): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.type !== type) return total;
    const amount = Number(transaction.amount);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

export function calculateBudgetStatus(limitValue: number, spentValue: number): BudgetStatus {
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 0;
  const spent = Number.isFinite(spentValue) && spentValue > 0 ? spentValue : 0;
  const remaining = limit - spent;
  const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  return {
    limit,
    spent,
    remaining,
    percentage,
    state: remaining < 0 ? 'exceeded' : percentage >= 80 ? 'warning' : 'normal'
  };
}

export function spendingByCategory(transactions: Transaction[], categories: Category[], type: 'expense' | 'income' = 'expense') {
  const categoryMap = new Map(categories.map((category) => [category.id, category] as const));
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== type) continue;
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    totals.set(transaction.category_id, (totals.get(transaction.category_id) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([categoryId, value]) => ({
      categoryId,
      name: categoryMap.get(categoryId)?.name ?? 'Uncategorized',
      color: categoryMap.get(categoryId)?.color ?? '#94a3b8',
      value
    }))
    .sort((a, b) => b.value - a.value);
}

export function formatCurrency(value: number, currency = 'INR'): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(safeValue);
  } catch {
    return `₹${safeValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
}

export function localDateInputValue(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTransactionDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  const today = startOfLocalDay(new Date()).getTime();
  const day = startOfLocalDay(date).getTime();
  if (day === today) return 'Today';
  if (day === today - 86_400_000) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function periodLabel(period: BudgetPeriod): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}
