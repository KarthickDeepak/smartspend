import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, Save } from 'lucide-react';
import type { Budget, BudgetPeriod, Category, PaymentMethod, Transaction, TransactionType } from '../types';
import { localDateInputValue } from '../lib/finance';
import { Button, Field, inputClass, Notice } from './Ui';

export interface TransactionPayload {
  amount: number;
  type: TransactionType;
  occurred_at: string;
  category_id: string;
  subcategory_id: string | null;
  payment_method: PaymentMethod;
  description: string;
}

export function TransactionForm({
  categories, transaction, currency, onSave, onCancel
}: {
  categories: Category[]; transaction: Transaction | null; currency: string;
  onSave: (payload: TransactionPayload, transactionId?: string) => Promise<void>; onCancel: () => void;
}) {
  const activeCategories = useMemo(() => categories.filter((category) => !category.archived || category.id === transaction?.category_id || category.id === transaction?.subcategory_id), [categories, transaction?.category_id, transaction?.subcategory_id]);
  const parents = useMemo(() => activeCategories.filter((category) => !category.parent_id).sort((a, b) => a.sort_order - b.sort_order), [activeCategories]);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? parents[0]?.id ?? '');
  const [subcategoryId, setSubcategoryId] = useState(transaction?.subcategory_id ?? '');
  const [date, setDate] = useState(transaction ? localDateInputValue(new Date(transaction.occurred_at)) : localDateInputValue());
  const [time, setTime] = useState(transaction ? `${String(new Date(transaction.occurred_at).getHours()).padStart(2, '0')}:${String(new Date(transaction.occurred_at).getMinutes()).padStart(2, '0')}` : new Date().toTimeString().slice(0, 5));
  const [method, setMethod] = useState<PaymentMethod>(transaction?.payment_method ?? 'upi');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const children = useMemo(() => activeCategories.filter((category) => category.parent_id === categoryId).sort((a, b) => a.sort_order - b.sort_order), [activeCategories, categoryId]);

  useEffect(() => {
    if (!parents.some((category) => category.id === categoryId)) setCategoryId(parents[0]?.id ?? '');
  }, [parents, categoryId]);
  useEffect(() => {
    if (subcategoryId && !children.some((category) => category.id === subcategoryId)) setSubcategoryId('');
  }, [children, subcategoryId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 9_999_999_999.99) { setError('Enter an amount greater than zero and within the supported limit.'); return; }
    if (!categoryId) { setError('Create or choose a category first.'); return; }
    if (!date) { setError('Choose a transaction date.'); return; }
    const dateTime = new Date(`${date}T${time || '12:00'}:00`);
    if (!Number.isFinite(dateTime.getTime())) { setError('Choose a valid date and time.'); return; }
    setBusy(true);
    try {
      await onSave({
        amount: Math.round(parsedAmount * 100) / 100, type,
        occurred_at: dateTime.toISOString(), category_id: categoryId,
        subcategory_id: subcategoryId || null, payment_method: method,
        description: description.trim().slice(0, 500)
      }, transaction?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this transaction.');
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
      <button type="button" onClick={() => setType('expense')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${type === 'expense' ? 'bg-white text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}><ArrowDownRight size={17} /> Expense</button>
      <button type="button" onClick={() => setType('income')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${type === 'income' ? 'bg-white text-emerald-600 shadow-sm dark:bg-white/10 dark:text-mint-100' : 'text-slate-500 dark:text-slate-400'}`}><ArrowUpRight size={17} /> Income</button>
    </div>
    <Field label={`Amount (${currency})`}><div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{currency === 'INR' ? '₹' : currency}</span><input required autoFocus inputMode="decimal" type="number" step="0.01" min="0.01" max="9999999999.99" className={`${inputClass} pl-12 text-lg font-bold tabular-nums`} placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></Field>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Category"><select required className={inputClass} value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(''); }}><option value="">Choose a category</option>{parents.map((category) => <option key={category.id} value={category.id}>{category.name}{category.archived ? ' (archived — existing transaction)' : ''}</option>)}</select></Field>
      <Field label="Subcategory (optional)"><select className={inputClass} value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)} disabled={!children.length}><option value="">No subcategory</option>{children.map((category) => <option key={category.id} value={category.id}>{category.name}{category.archived ? ' (archived — existing transaction)' : ''}</option>)}</select></Field>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Date"><input type="date" required className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label="Time (optional)"><input type="time" className={inputClass} value={time} onChange={(event) => setTime(event.target.value)} /></Field>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Payment method"><select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Credit / debit card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></Field>
      <Field label="Note (optional)"><input maxLength={500} className={inputClass} placeholder="What was it for?" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
    </div>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="flex gap-3 pt-1"><Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy} className="flex-1"><Save size={16} />{busy ? 'Saving…' : transaction ? 'Save changes' : 'Save transaction'}</Button></div>
  </form>;
}

export function BudgetForm({
  budgets, categories, householdId, userId, onSave, onCancel
}: {
  budgets: Budget[]; categories: Category[]; householdId: string; userId: string;
  onSave: (payload: { household_id: string; period_type: BudgetPeriod; amount: number; category_id: string | null; created_by?: string }, existingId?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const existing = budgets.find((budget) => budget.period_type === period && budget.category_id === (categoryId || null));
    setAmount(existing ? String(existing.amount) : '');
  }, [budgets, period, categoryId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > 9_999_999_999.99) { setError('Budget must be a positive amount.'); return; }
    const existing = budgets.find((budget) => budget.period_type === period && budget.category_id === (categoryId || null));
    setBusy(true);
    try {
      await onSave({ household_id: householdId, period_type: period, amount: Math.round(value * 100) / 100, category_id: categoryId || null, ...(!existing && { created_by: userId }) }, existing?.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the budget.'); }
    finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={submit}>
    <Field label="Budget period"><select className={inputClass} value={period} onChange={(event) => setPeriod(event.target.value as BudgetPeriod)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
    <Field label="Category"><select className={inputClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Overall family budget</option>{categories.filter((category) => !category.archived && !category.parent_id).map((category) => <option key={category.id} value={category.id}>{category.name} only</option>)}</select><span className="text-xs text-slate-500 dark:text-slate-400">Set a category for a separate budget just for that category.</span></Field>
    <Field label="Spending limit"><input required type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" className={inputClass} placeholder="e.g. 15000" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy} className="flex-1"><Save size={16} />{busy ? 'Saving…' : 'Save budget'}</Button></div>
  </form>;
}

export function CategoryForm({
  categories, initial, householdId, userId, onSave, onCancel
}: {
  categories: Category[]; initial: Category | null; householdId: string; userId: string;
  onSave: (payload: Partial<Category> & { household_id: string; name: string; created_by?: string }, categoryId?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [parentId, setParentId] = useState(initial?.parent_id ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'wallet');
  const [color, setColor] = useState(initial?.color ?? '#24b47e');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parentOptions = categories.filter((category) => !category.archived && !category.parent_id && category.id !== initial?.id);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (name.trim().length < 1 || name.trim().length > 50) { setError('Category name must be between 1 and 50 characters.'); return; }
    if (categories.some((category) => category.household_id === householdId && category.name.trim().toLowerCase() === name.trim().toLowerCase() && category.parent_id === (parentId || null) && category.id !== initial?.id)) { setError('A category or subcategory with this name already exists at that level.'); return; }
    if (initial && parentId === initial.id) { setError('A category cannot be its own parent.'); return; }
    setBusy(true);
    try {
      await onSave({ household_id: householdId, name: name.trim(), parent_id: parentId || null, icon, color, ...(!initial && { created_by: userId }) }, initial?.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the category.'); }
    finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={submit}>
    <Field label="Name"><input required maxLength={50} autoFocus className={inputClass} placeholder="e.g. Groceries" value={name} onChange={(event) => setName(event.target.value)} /></Field>
    <Field label="Parent category"><select className={inputClass} value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Top-level category</option>{parentOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><span className="text-xs text-slate-500 dark:text-slate-400">Choose a parent to create a nested subcategory.</span></Field>
    <div className="grid grid-cols-[1fr_92px] gap-3"><Field label="Icon"><select className={inputClass} value={icon} onChange={(event) => setIcon(event.target.value)}>{[['wallet','Wallet'],['smartphone','Mobile'],['cookie','Snacks'],['coffee','Coffee'],['utensils','Food'],['train-front','Travel'],['fuel','Fuel'],['car-front','Car'],['bike','Bike'],['gift','Gift'],['shopping-basket','Shopping'],['sparkles','Lifestyle'],['heart','Health'],['house','Home'],['book-open','Learning']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Color"><input aria-label="Category color" type="color" className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5" value={color} onChange={(event) => setColor(event.target.value)} /></Field></div>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy} className="flex-1"><Save size={16} />{busy ? 'Saving…' : initial ? 'Save category' : 'Add category'}</Button></div>
  </form>;
}
