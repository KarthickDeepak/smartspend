export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  currency: string;
}

export interface Household {
  id: string;
  name: string;
  currency: string;
  created_by: string | null;
  weekly_start_day: number;
}

export interface HouseholdMember {
  user_id: string;
  household_id: string;
  role: 'admin' | 'member';
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  parent_id: string | null;
  icon: string;
  color: string;
  sort_order: number;
  archived: boolean;
}

export interface Transaction {
  id: string;
  household_id: string;
  user_id: string;
  category_id: string;
  subcategory_id: string | null;
  amount: number | string;
  type: TransactionType;
  description: string;
  payment_method: PaymentMethod;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  household_id: string;
  period_type: BudgetPeriod;
  amount: number | string;
  category_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetStatus {
  spent: number;
  limit: number;
  remaining: number;
  percentage: number;
  state: 'normal' | 'warning' | 'exceeded';
}
