import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  Activity, ArrowDownRight, ArrowLeftRight, ArrowRight, ArrowUpRight, CalendarDays,
  ChevronDown, ChevronLeft, ChevronRight, Cloud, Download, Ellipsis, FileUp,
  LayoutDashboard, LogOut, Moon, MoreHorizontal, Pencil, Plus, Search, Settings,
  ShieldCheck, Sparkles, Sun, Tag, Trash2, TrendingDown, TrendingUp, Wallet, Wifi, WifiOff, X
} from 'lucide-react';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import AuthScreen from './components/AuthScreen';
import { Brand, Button, EmptyState, Field, LoadingBlock, Modal, Notice, inputClass } from './components/Ui';
import { BudgetForm, CategoryForm, TransactionForm, type TransactionPayload } from './components/Forms';
import { supabase, supabaseConfigured } from './lib/supabase';
import { calculateBudgetStatus, formatCurrency, getPeriodRange, getTransactionDateLabel, inRange, localDateInputValue, periodLabel, spendingByCategory, sumTransactions } from './lib/finance';
import { transactionsToCsv, validateTransactionsCsv, type CsvImportResult } from './lib/csv';
import type { Budget, BudgetPeriod, Category, Household, HouseholdMember, Profile, Transaction } from './types';

type Page = 'dashboard' | 'history' | 'analytics' | 'budgets' | 'categories' | 'settings' | 'data';

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'history', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'budgets', label: 'Budgets', icon: Wallet },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'data', label: 'Data tools', icon: FileUp }
];

const categoryEmoji: Record<string, string> = {
  smartphone: '📱', cookie: '🍪', coffee: '☕', utensils: '🍽️', 'train-front': '🚆', fuel: '⛽',
  'car-front': '🚗', bike: '🏍️', gift: '🎁', 'shopping-basket': '🛍️', sparkles: '✨', wallet: '👛',
  heart: '💗', house: '🏠', 'book-open': '📚', 'paw-print': '🐾'
};

function categorySymbol(category?: Category | null) {
  return category ? categoryEmoji[category.icon] ?? '✳️' : '✳️';
}

function SetupScreen() {
  return <main className="auth-gradient flex min-h-dvh items-center justify-center p-5"><div className="w-full max-w-xl rounded-[28px] border border-white/100 bg-white/90 p-7 shadow-pop dark:border-white/10 dark:bg-navy-950"><Brand /><div className="mt-8"><Notice kind="warning"><strong>Supabase is not configured yet.</strong> Add your Supabase project URL and public anon/publishable key to a local <code>.env</code> file, then restart the development server. Your financial data will be stored in Supabase, not in this browser.</Notice></div><div className="mt-5 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300"><p><strong>1.</strong> Create a free project at <a className="font-bold text-mint-600 underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase Dashboard</a>.</p><p><strong>2.</strong> Run <code>supabase/migrations/202610230001_initial_schema.sql</code> in the Supabase SQL Editor.</p><p><strong>3.</strong> Copy <code>.env.example</code> to <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart <code>npm run dev</code>.</p></div></div></main>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    document.title = `${import.meta.env.VITE_APP_NAME?.trim() || 'SmartSpend'} — Family Budget Tracker`;
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setAuthLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  if (!supabaseConfigured) return <SetupScreen />;
  if (authLoading) return <div className="grid min-h-dvh place-items-center bg-[#f5f7fb] dark:bg-navy-950"><LoadingBlock label="Restoring your secure session…" /></div>;
  if (!session) return <AuthScreen />;
  return <Workspace key={session.user.id} user={session.user} onSignOut={async () => { await supabase?.auth.signOut(); }} />;
}

function Workspace({ user, onSignOut }: { user: User; onSignOut: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [member, setMember] = useState<HouseholdMember | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [dark, setDark] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('smartspend-theme') === 'dark');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [showTransaction, setShowTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showBudget, setShowBudget] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showCategory, setShowCategory] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [analyticsCategory, setAnalyticsCategory] = useState('all');
  const [customFrom, setCustomFrom] = useState(localDateInputValue(new Date(Date.now() - 29 * 86_400_000)));
  const [customTo, setCustomTo] = useState(localDateInputValue());
  const [historyCategory, setHistoryCategory] = useState('all');
  const [historyType, setHistoryType] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvImport, setCsvImport] = useState<CsvImportResult | null>(null);
  const [csvError, setCsvError] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState('INR');
  const [householdNameInput, setHouseholdNameInput] = useState('');
  const [weekStartInput, setWeekStartInput] = useState('1');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [familyBusy, setFamilyBusy] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('smartspend-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadData = useCallback(async (showSpinner = true) => {
    if (!supabase) return;
    if (showSpinner) setLoading(true);
    setWorkspaceError('');
    try {
      const membershipResult = await supabase.from('household_members').select('household_id,user_id,role').eq('user_id', user.id).maybeSingle();
      if (membershipResult.error) throw membershipResult.error;
      if (!membershipResult.data) {
        setWorkspaceError('No family workspace was found for this account. If you just signed up, confirm your email and refresh. If the database migration is not installed, run the supplied SQL script first.');
        return;
      }
      const membership = membershipResult.data as HouseholdMember;
      const householdId = membership.household_id;
      const [profileResult, householdResult, categoriesResult, budgetsResult, membersResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('households').select('*').eq('id', householdId).single(),
        supabase.from('categories').select('*').eq('household_id', householdId).order('sort_order', { ascending: true }),
        supabase.from('budgets').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
        supabase.from('household_members').select('household_id,user_id,role').eq('household_id', householdId)
      ]);
      for (const result of [profileResult, householdResult, categoriesResult, budgetsResult, membersResult]) if (result.error) throw result.error;
      const collected: Transaction[] = [];
      const batchSize = 1000;
      for (let offset = 0; ; offset += batchSize) {
        const result = await supabase.from('transactions').select('*').eq('household_id', householdId).order('occurred_at', { ascending: false }).range(offset, offset + batchSize - 1);
        if (result.error) throw result.error;
        const batch = (result.data ?? []) as Transaction[];
        collected.push(...batch);
        if (batch.length < batchSize) break;
      }
      setMember(membership);
      setProfile(profileResult.data as Profile);
      setHousehold(householdResult.data as Household);
      setCategories((categoriesResult.data ?? []) as Category[]);
      setBudgets((budgetsResult.data ?? []) as Budget[]);
      setMembers((membersResult.data ?? []) as HouseholdMember[]);
      setTransactions(collected);
      setProfileNameInput((profileResult.data as Profile).full_name ?? '');
      setCurrencyInput((householdResult.data as Household).currency ?? 'INR');
      setHouseholdNameInput((householdResult.data as Household).name ?? 'My family');
      setWeekStartInput(String((householdResult.data as Household).weekly_start_day ?? 1));
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Unable to load data. Check your network and Supabase settings.');
    } finally { if (showSpinner) setLoading(false); }
  }, [user.id]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const client = supabase;

    if (!client || !household?.id) {
      return;
    }

    const channel = client
      .channel(`smartspend-${household.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          void loadData(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          void loadData(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          void loadData(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'household_members',
          filter: `household_id=eq.${household.id}`,
        },
        () => {
          void loadData(false);
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [household?.id, loadData]);
  const currency = household?.currency ?? profile?.currency ?? 'INR';
  const activeCategories = useMemo(() => categories.filter((category) => !category.archived), [categories]);
  const topLevelCategories = useMemo(() => activeCategories.filter((category) => !category.parent_id).sort((a, b) => a.sort_order - b.sort_order), [activeCategories]);
  const expenseTransactions = useMemo(() => transactions.filter((transaction) => transaction.type === 'expense'), [transactions]);
  const now = new Date();
  const todayRange = getPeriodRange('daily', now, household?.weekly_start_day ?? 1);
  const weekRange = getPeriodRange('weekly', now, household?.weekly_start_day ?? 1);
  const monthRange = getPeriodRange('monthly', now, household?.weekly_start_day ?? 1);
  const todayTransactions = expenseTransactions.filter((transaction) => inRange(transaction.occurred_at, todayRange));
  const weekTransactions = expenseTransactions.filter((transaction) => inRange(transaction.occurred_at, weekRange));
  const monthTransactions = expenseTransactions.filter((transaction) => inRange(transaction.occurred_at, monthRange));
  const todayTotal = sumTransactions(todayTransactions);
  const weekTotal = sumTransactions(weekTransactions);
  const monthTotal = sumTransactions(monthTransactions);
  const monthlyOverallBudget = budgets.find((budget) => budget.active && budget.period_type === 'monthly' && !budget.category_id);
  const monthlyBudgetStatus = monthlyOverallBudget ? calculateBudgetStatus(Number(monthlyOverallBudget.amount), monthTotal) : null;
  const monthCategoryBreakdown = spendingByCategory(monthTransactions, topLevelCategories);
  const pageMeta: Record<Page, { title: string; description: string }> = {
    dashboard: { title: 'Your money at a glance', description: 'A clearer view of the choices you make every day.' },
    history: { title: 'Transaction history', description: 'Every expense and income, in one place.' },
    analytics: { title: 'Understand your spending', description: 'Spot patterns, compare categories, and stay in control.' },
    budgets: { title: 'Budgets that fit your life', description: 'Set a limit, track progress, and adjust as you go.' },
    categories: { title: 'Make it your own', description: 'Organize spending with categories that make sense to you.' },
    settings: { title: 'Your SmartSpend setup', description: 'Profile, family sharing, preferences, and security.' },
    data: { title: 'Import, export & backups', description: 'Move your financial history safely, validate CSVs, and keep a backup.' }
  };

  async function saveTransaction(payload: TransactionPayload, transactionId?: string) {
    if (!supabase || !household) throw new Error('Database connection is unavailable.');
    if (!online) throw new Error('You are offline. Reconnect to save financial changes safely.');
    const row = { ...payload, household_id: household.id, user_id: transactionId ? (transactions.find((item) => item.id === transactionId)?.user_id ?? user.id) : user.id };
    const query = transactionId
      ? supabase.from('transactions').update(row).eq('id', transactionId).eq('household_id', household.id)
      : supabase.from('transactions').insert(row);
    const { error } = await query;
    if (error) throw error;
    setShowTransaction(false); setEditingTransaction(null);
    await loadData(false);
    setToast({ kind: 'success', message: transactionId ? 'Transaction updated.' : 'Transaction saved and synced.' });
  }

  async function deleteTransaction() {
    if (!supabase || !household || !confirmDelete) return;
    if (!online) { setToast({ kind: 'error', message: 'Reconnect to delete a transaction.' }); return; }
    const { error } = await supabase.from('transactions').delete().eq('id', confirmDelete.id).eq('household_id', household.id);
    if (error) { setToast({ kind: 'error', message: error.message }); return; }
    setTransactions((items) => items.filter((item) => item.id !== confirmDelete.id));
    setConfirmDelete(null); setToast({ kind: 'success', message: 'Transaction deleted.' });
  }

  async function saveBudget(payload: { household_id: string; period_type: BudgetPeriod; amount: number; category_id: string | null; created_by?: string }, existingId?: string) {
    if (!supabase) throw new Error('Database connection is unavailable.');
    if (!online) throw new Error('You are offline. Reconnect to save a budget.');
    const query = existingId ? supabase.from('budgets').update({ amount: payload.amount, active: true }).eq('id', existingId) : supabase.from('budgets').insert(payload);
    const { error } = await query;
    if (error) throw error;
    setShowBudget(false); await loadData(false); setToast({ kind: 'success', message: existingId ? 'Budget updated.' : 'Budget created.' });
  }

  async function toggleBudget(budget: Budget) {
    if (!supabase) return;
    const { error } = await supabase.from('budgets').update({ active: !budget.active }).eq('id', budget.id);
    if (error) { setToast({ kind: 'error', message: error.message }); return; }
    await loadData(false); setToast({ kind: 'success', message: budget.active ? 'Budget paused.' : 'Budget reactivated.' });
  }

  async function saveCategory(payload: Partial<Category> & { household_id: string; name: string; created_by?: string }, categoryId?: string) {
    if (!supabase) throw new Error('Database connection is unavailable.');
    if (!online) throw new Error('You are offline. Reconnect to save categories.');
    const result = categoryId
      ? await supabase.from('categories').update({ name: payload.name, parent_id: payload.parent_id, icon: payload.icon, color: payload.color }).eq('id', categoryId).eq('household_id', payload.household_id)
      : await supabase.from('categories').insert({ ...payload, sort_order: Math.max(-1, ...categories.filter((item) => item.parent_id === (payload.parent_id ?? null)).map((item) => item.sort_order)) + 1 });
    if (result.error) throw result.error;
    setShowCategory(false); setEditingCategory(null); await loadData(false); setToast({ kind: 'success', message: categoryId ? 'Category updated.' : 'Category added.' });
  }

  async function archiveCategory(category: Category) {
    if (!supabase) return;
    const action = category.archived ? 'restore' : 'archive';
    if (!window.confirm(`${action === 'archive' ? 'Archive' : 'Restore'} “${category.name}”? ${action === 'archive' ? 'It will be hidden from new transactions, while historical records remain.' : 'It will become available for new transactions again.'}`)) return;
    const { error } = await supabase.from('categories').update({ archived: !category.archived }).eq('id', category.id);
    if (error) { setToast({ kind: 'error', message: error.message }); return; }
    if (!category.parent_id) {
      const childrenResult = await supabase.from('categories').update({ archived: !category.archived }).eq('parent_id', category.id);
      if (childrenResult.error) { setToast({ kind: 'error', message: childrenResult.error.message }); return; }
    }
    await loadData(false); setToast({ kind: 'success', message: category.archived ? 'Category restored.' : 'Category archived.' });
  }

  async function reorderCategory(category: Category, direction: -1 | 1) {
    if (!supabase) return;
    const group = categories.filter((item) => item.parent_id === category.parent_id && !item.archived).sort((a, b) => a.sort_order - b.sort_order);
    const index = group.findIndex((item) => item.id === category.id);
    const neighbour = group[index + direction];
    if (!neighbour) return;
    const first = await supabase.from('categories').update({ sort_order: neighbour.sort_order }).eq('id', category.id);
    const second = await supabase.from('categories').update({ sort_order: category.sort_order }).eq('id', neighbour.id);
    if (first.error || second.error) { setToast({ kind: 'error', message: (first.error ?? second.error)?.message ?? 'Could not reorder categories.' }); return; }
    await loadData(false);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !household || !profile) return;
    if (profileNameInput.trim().length < 2) { setToast({ kind: 'error', message: 'Your name must be at least two characters.' }); return; }
    setSettingsBusy(true);
    try {
      const profileResult = await supabase.from('profiles').update({ full_name: profileNameInput.trim() }).eq('id', user.id);
      if (profileResult.error) throw profileResult.error;
      if (member?.role === 'admin') {
        const householdResult = await supabase.from('households').update({ name: householdNameInput.trim().slice(0, 80) || 'My family', currency: currencyInput, weekly_start_day: Number(weekStartInput) }).eq('id', household.id);
        if (householdResult.error) throw householdResult.error;
      }
      await loadData(false); setToast({ kind: 'success', message: 'Settings saved.' });
    } catch (err) { setToast({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save settings.' }); }
    finally { setSettingsBusy(false); }
  }

  async function createInvite() {
    if (!supabase) return;
    setFamilyBusy(true);
    try {
      const { data, error } = await supabase.rpc('create_household_invite');
      if (error) throw error;
      setInviteCode(String(data)); setToast({ kind: 'success', message: 'Invite code created. It expires in seven days.' });
    } catch (err) { setToast({ kind: 'error', message: err instanceof Error ? err.message : 'Could not create an invite.' }); }
    finally { setFamilyBusy(false); }
  }

  async function joinFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || joinCode.trim().length < 6) return;
    setFamilyBusy(true);
    try {
      const { error } = await supabase.rpc('join_household_by_code', { p_code: joinCode.trim() });
      if (error) throw error;
      setJoinCode(''); setInviteCode(''); await loadData(); setToast({ kind: 'success', message: 'You joined the family workspace. Shared data is now syncing.' });
    } catch (err) { setToast({ kind: 'error', message: err instanceof Error ? err.message : 'Could not join this family.' }); }
    finally { setFamilyBusy(false); }
  }

  function downloadText(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const csv = transactionsToCsv(transactions, categories);
    downloadText(csv, `smartspend-transactions-${localDateInputValue()}.csv`, 'text/csv;charset=utf-8');
    setToast({ kind: 'success', message: `${transactions.length} transactions exported as CSV.` });
  }

  function exportBackup() {
    const backup = {
      application: 'SmartSpend', schemaVersion: 1, exportedAt: new Date().toISOString(),
      currency, household: { id: household?.id, name: household?.name, weekly_start_day: household?.weekly_start_day },
      categories, budgets, transactions
    };
    downloadText(JSON.stringify(backup, null, 2), `smartspend-backup-${localDateInputValue()}.json`, 'application/json;charset=utf-8');
    setToast({ kind: 'success', message: 'Backup exported. Store it somewhere private and safe.' });
  }

  async function onCsvFile(file?: File) {
    setCsvImport(null); setCsvError(''); setCsvFileName(file?.name ?? '');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setCsvError('Maximum import size is 5 MB.'); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { setCsvError('Choose a CSV file. JSON backups are not currently accepted as CSV imports.'); return; }
    try {
      const text = await file.text();
      const preview = validateTransactionsCsv(text, categories, transactions);
      setCsvImport(preview);
      setToast({ kind: 'info', message: `CSV checked: ${preview.valid.length} valid row(s), ${preview.skippedDuplicates} duplicate(s), ${preview.errors.length} row error(s).` });
    } catch (err) { setCsvError(err instanceof Error ? err.message : 'Could not read this CSV file.'); }
  }

  async function importCsv() {
    if (!supabase || !household || !csvImport) return;
    if (csvImport.valid.length === 0) { setCsvError('There are no valid new transactions to import.'); return; }
    setCsvBusy(true); setCsvError('');
    try {
      const rows = csvImport.valid.map((item) => ({ amount: item.amount, type: item.type, occurred_at: item.occurred_at, category_id: item.category_id, subcategory_id: item.subcategory_id, payment_method: item.payment_method, description: item.description, household_id: household.id, user_id: user.id }));
      // Submit one PostgreSQL insert statement so a rejected import is not split into partial batches.
      const { error } = await supabase.from('transactions').insert(rows);
      if (error) throw error;
      const count = rows.length;
      setCsvFileName(''); setCsvImport(null);
      const input = document.getElementById('csv-file-input') as HTMLInputElement | null; if (input) input.value = '';
      await loadData(false); setToast({ kind: 'success', message: `${count} transactions imported successfully.` });
    } catch (err) { setCsvError(err instanceof Error ? err.message : 'Import failed. No success was reported.'); }
    finally { setCsvBusy(false); }
  }

  const title = pageMeta[page].title;
  if (loading) return <div className="grid min-h-dvh place-items-center bg-[#f5f7fb] dark:bg-navy-950"><LoadingBlock /></div>;
  if (workspaceError || !household || !profile || !member) return <main className="auth-gradient flex min-h-dvh items-center justify-center p-5"><div className="w-full max-w-xl rounded-[28px] bg-white p-7 shadow-pop dark:bg-navy-950"><Brand /><div className="mt-7"><Notice kind="error">{workspaceError || 'The family workspace could not be loaded.'}</Notice></div><div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => void loadData()}><Cloud size={16} /> Retry connection</Button><Button variant="outline" onClick={() => void onSignOut()}>Sign out</Button></div><p className="mt-5 text-xs leading-5 text-slate-500">Confirm that the migration in <code>supabase/migrations/</code> has been run in your Supabase project and the correct environment variables are set. The app will not create a local-only account or store finance data in browser storage.</p></div></main>;

  return <div className="app-shell min-h-dvh bg-[#f5f7fb] text-slate-900 dark:bg-[#0c142b] dark:text-slate-100">
    <div className="mx-auto flex min-h-dvh max-w-[1700px]">
      <aside className="sidebar hidden w-[252px] shrink-0 flex-col border-r border-slate-200/80 bg-white/80 px-4 py-6 dark:border-white/10 dark:bg-[#101b37] lg:flex">
        <div className="px-2"><Brand /></div>
        <div className="mt-9 px-2"><p className="section-eyebrow">WORKSPACE</p></div>
        <nav className="mt-3 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} />)}
        </nav>
        <div className="mt-auto space-y-4 px-2 pt-8">
          <div className="rounded-2xl bg-gradient-to-br from-navy-950 to-[#24507a] p-4 text-white"><div className="flex items-center gap-2 text-xs font-semibold text-mint-100"><ShieldCheck size={15} /> FAMILY SPACE</div><p className="mt-2 truncate font-display text-base font-bold">{household.name}</p><p className="mt-1 text-xs text-white/60">{members.length} {members.length === 1 ? 'member' : 'members'} · cloud synced</p><button type="button" onClick={() => setPage('settings')} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-mint-100 hover:text-white">Manage family <ArrowRight size={13} /></button></div>
          <button type="button" onClick={() => setDark((value) => !value)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">{dark ? <Sun size={17} /> : <Moon size={17} />}{dark ? 'Light appearance' : 'Dark appearance'}</button>
          <button type="button" onClick={() => void onSignOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10"><LogOut size={17} /> Sign out</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-[#f5f7fb]/90 px-4 py-3.5 backdrop-blur-xl dark:border-white/10 dark:bg-[#0c142b]/90 sm:px-7 lg:px-9 lg:py-5">
          <div className="flex min-w-0 items-center gap-3"><div className="lg:hidden"><Brand compact /></div><div className="hidden sm:block"><h1 className="font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{pageMeta[page].description}</p></div></div>
          <div className="flex shrink-0 items-center gap-2.5"><span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold sm:inline-flex ${online ? 'bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-100' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-100'}`}>{online ? <><Wifi size={12} /> Synced session</> : <><WifiOff size={12} /> Offline</>}</span><button type="button" onClick={() => setPage('settings')} aria-label="Open profile settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-[#7bd8b8] text-sm font-extrabold text-navy-950 shadow-sm">{(profile.full_name || user.email || 'S').trim().slice(0, 1).toUpperCase()}</button><button type="button" onClick={() => { setEditingTransaction(null); setShowTransaction(true); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-950 px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-navy-800 dark:bg-mint-500 dark:text-navy-950 dark:hover:bg-mint-100 sm:px-4"><Plus size={17} strokeWidth={2.5} /><span className="hidden sm:inline">Add transaction</span><span className="sm:hidden">Add</span></button></div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 sm:px-7 sm:pt-7 lg:px-9 lg:pb-10">
          {toast && <div className="toast-wrap mb-5"><div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${toast.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100' : toast.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100' : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100'}`} role="status"><span>{toast.message}</span><button aria-label="Dismiss notification" type="button" onClick={() => setToast(null)}><X size={16} /></button></div></div>}
          {!online && <div className="mb-5"><Notice kind="warning"><strong>You’re offline.</strong> Cached screens may open, but new writes are disabled until you reconnect. SmartSpend does not queue uncommitted financial edits locally.</Notice></div>}
          {page === 'dashboard' && <DashboardPage profile={profile} household={household} currency={currency} transactions={transactions} monthTransactions={monthTransactions} todayTotal={todayTotal} weekTotal={weekTotal} monthTotal={monthTotal} monthlyBudgetStatus={monthlyBudgetStatus} budgets={budgets} categories={categories} categoryBreakdown={monthCategoryBreakdown} onNavigate={setPage} onAdd={() => { setEditingTransaction(null); setShowTransaction(true); }} onEdit={(transaction) => { setEditingTransaction(transaction); setShowTransaction(true); }} />}
          {page === 'history' && <HistoryPage transactions={transactions} categories={categories} currency={currency} categoryFilter={historyCategory} setCategoryFilter={setHistoryCategory} typeFilter={historyType} setTypeFilter={setHistoryType} search={historySearch} setSearch={setHistorySearch} from={historyFrom} setFrom={setHistoryFrom} to={historyTo} setTo={setHistoryTo} onEdit={(transaction) => { setEditingTransaction(transaction); setShowTransaction(true); }} onDelete={(transaction) => setConfirmDelete(transaction)} onExport={exportCsv} />}
          {page === 'analytics' && <AnalyticsPage transactions={transactions} categories={topLevelCategories} currency={currency} period={analyticsPeriod} setPeriod={setAnalyticsPeriod} category={analyticsCategory} setCategory={setAnalyticsCategory} from={customFrom} setFrom={setCustomFrom} to={customTo} setTo={setCustomTo} weekStartsOn={household.weekly_start_day} />}
          {page === 'budgets' && <BudgetsPage budgets={budgets} transactions={transactions} categories={categories} currency={currency} weekStartsOn={household.weekly_start_day} onAdd={() => setShowBudget(true)} onToggle={toggleBudget} />}
          {page === 'categories' && <CategoriesPage categories={categories} transactions={transactions} onAdd={() => { setEditingCategory(null); setShowCategory(true); }} onEdit={(category) => { setEditingCategory(category); setShowCategory(true); }} onArchive={archiveCategory} onReorder={reorderCategory} />}
          {(page === 'settings' || page === 'data') && <SettingsPage section={page === 'data' ? 'data' : 'settings'} profile={profile} household={household} member={member} members={members} currencyInput={currencyInput} setCurrencyInput={setCurrencyInput} profileNameInput={profileNameInput} setProfileNameInput={setProfileNameInput} householdNameInput={householdNameInput} setHouseholdNameInput={setHouseholdNameInput} weekStartInput={weekStartInput} setWeekStartInput={setWeekStartInput} settingsBusy={settingsBusy} onSaveSettings={saveSettings} inviteCode={inviteCode} onCreateInvite={createInvite} familyBusy={familyBusy} joinCode={joinCode} setJoinCode={setJoinCode} onJoinFamily={joinFamily} onExportCsv={exportCsv} onExportBackup={exportBackup} csvFileName={csvFileName} onCsvFile={onCsvFile} csvImport={csvImport} csvError={csvError} csvBusy={csvBusy} onImportCsv={importCsv} onClearCsv={() => { setCsvFileName(''); setCsvImport(null); setCsvError(''); }} transactionCount={transactions.length} />}
        </main>
      </div>
    </div>

    <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-slate-200/80 bg-white/95 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#101b37]/95 lg:hidden" aria-label="Mobile navigation">
      {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-[10px] font-bold transition ${page === item.id ? 'text-mint-600 dark:text-mint-100' : 'text-slate-400 dark:text-slate-500'}`} aria-current={page === item.id ? 'page' : undefined}><span className={`grid h-7 w-8 place-items-center rounded-lg ${page === item.id ? 'bg-mint-50 dark:bg-mint-500/10' : ''}`}><Icon size={18} /></span><span className="max-w-full truncate">{item.id === 'dashboard' ? 'Home' : item.id === 'history' ? 'History' : item.id === 'analytics' ? 'Insights' : item.id === 'budgets' ? 'Budget' : item.id === 'categories' ? 'Tags' : item.id === 'settings' ? 'Settings' : 'Data'}</span></button>; })}
    </nav>

    <Modal open={showTransaction} title={editingTransaction ? 'Edit transaction' : 'Add transaction'} subtitle="A few details now make your spending easier to understand later." onClose={() => { setShowTransaction(false); setEditingTransaction(null); }}>
      <TransactionForm categories={categories} transaction={editingTransaction} currency={currency} onSave={saveTransaction} onCancel={() => { setShowTransaction(false); setEditingTransaction(null); }} />
    </Modal>
    <Modal open={showBudget} title="Set a budget" subtitle="Set a limit for the whole family or an individual category." onClose={() => setShowBudget(false)}>
      <BudgetForm budgets={budgets} categories={categories} householdId={household.id} userId={user.id} onSave={saveBudget} onCancel={() => setShowBudget(false)} />
    </Modal>
    <Modal open={showCategory} title={editingCategory ? 'Edit category' : 'Create category'} subtitle="Use a top-level category or nest it under another category." onClose={() => { setShowCategory(false); setEditingCategory(null); }}>
      <CategoryForm categories={categories} initial={editingCategory} householdId={household.id} userId={user.id} onSave={saveCategory} onCancel={() => { setShowCategory(false); setEditingCategory(null); }} />
    </Modal>
    <Modal open={Boolean(confirmDelete)} title="Delete this transaction?" subtitle="This action cannot be undone." onClose={() => setConfirmDelete(null)} width="max-w-md">
      <p className="mb-5 text-sm leading-6 text-slate-600 dark:text-slate-300">{confirmDelete ? `${confirmDelete.type === 'expense' ? 'Expense' : 'Income'} of ${formatCurrency(Number(confirmDelete.amount), currency)} on ${getTransactionDateLabel(confirmDelete.occurred_at)} will be permanently removed from the family history.` : ''}</p>
      <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Keep transaction</Button><Button variant="danger" className="flex-1" onClick={() => void deleteTransaction()}><Trash2 size={16} />Delete</Button></div>
    </Modal>
  </div>;
}

function NavButton({ item, active, onClick }: { item: typeof navItems[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button type="button" onClick={onClick} className={`nav-button flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? 'nav-button-active' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'}`} aria-current={active ? 'page' : undefined}><Icon size={18} strokeWidth={active ? 2.3 : 1.9} /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-mint-500" />}</button>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="section-eyebrow mb-2">{eyebrow}</p>}<h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[28px]">{title}</h2>{description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}</div>{action}</div>;
}

function MetricCard({ title, value, caption, icon, trend, tone = 'mint' }: { title: string; value: string; caption: string; icon: ReactNode; trend?: string; tone?: 'mint' | 'blue' | 'amber' | 'rose' }) {
  const tones = { mint: 'bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-100', blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-200', rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200' };
  return <div className="panel-card min-w-0 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-5"><div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">{title}</span><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span></div><div className="mt-4 break-words font-display text-[23px] font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[27px]">{value}</div><div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">{trend && <span className="font-bold text-mint-600 dark:text-mint-100">{trend}</span>}{caption}</div></div>;
}

function DashboardPage({ profile, household, currency, transactions, monthTransactions, todayTotal, weekTotal, monthTotal, monthlyBudgetStatus, budgets, categories, categoryBreakdown, onNavigate, onAdd, onEdit }: {
  profile: Profile; household: Household; currency: string; transactions: Transaction[]; monthTransactions: Transaction[];
  todayTotal: number; weekTotal: number; monthTotal: number; monthlyBudgetStatus: ReturnType<typeof calculateBudgetStatus> | null;
  budgets: Budget[]; categories: Category[]; categoryBreakdown: ReturnType<typeof spendingByCategory>;
  onNavigate: (page: Page) => void; onAdd: () => void; onEdit: (transaction: Transaction) => void;
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category] as const));
  const recent = transactions.slice(0, 6);
  const incomeTotal = sumTransactions(transactions.filter((transaction) => inRange(transaction.occurred_at, getPeriodRange('monthly'))), 'income');
  return <div className="space-y-6">
    <div className="dashboard-hero relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#111e40] via-[#1c3664] to-[#246d70] p-5 text-white shadow-card sm:p-7 xl:p-8">
      <div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" />
      <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div className="max-w-xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-mint-100"><Sparkles size={13} /> FAMILY OVERVIEW <span className="opacity-50">/</span> {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</div><h2 className="mt-5 font-display text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">Good to see you, {(profile.full_name || 'there').split(' ')[0]}.</h2><p className="mt-2 max-w-md text-sm leading-6 text-white/70">Here’s how your family’s money is moving. Small check-ins make the bigger goals easier.</p><div className="mt-5 flex flex-wrap gap-2">
      <Button variant="ghost" onClick={onAdd} className="border border-white/20 text-white hover:bg-white/10"><Plus size={16} /> Add transaction</Button>
      <Button variant="ghost" onClick={() => onNavigate('analytics')} className="border border-white/20 text-white hover:bg-white/10"><Activity size={16} /> See insights</Button></div></div>
      <div className="relative min-w-[200px] rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm sm:max-w-[245px] sm:p-5"><div className="flex items-center justify-between text-xs font-semibold text-white/60"><span>Monthly budget</span><Wallet size={16} /></div>{monthlyBudgetStatus ? <><div className="mt-3 font-display text-2xl font-extrabold">{formatCurrency(Math.max(0, monthlyBudgetStatus.remaining), currency)}</div><p className="mt-1 text-xs text-white/60">left of {formatCurrency(monthlyBudgetStatus.limit, currency)}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"><div className={`h-full rounded-full ${monthlyBudgetStatus.state === 'exceeded' ? 'bg-rose-300' : monthlyBudgetStatus.state === 'warning' ? 'bg-amber-300' : 'bg-mint-100'}`} style={{ width: `${Math.min(monthlyBudgetStatus.percentage, 100)}%` }} /></div><div className="mt-2 flex items-center justify-between text-[11px] text-white/60"><span>{monthlyBudgetStatus.percentage}% used</span><button type="button" onClick={() => onNavigate('budgets')} className="font-bold text-mint-100">View budget ↗</button></div></> : <><p className="mt-3 text-sm font-semibold">Give your month a plan</p><p className="mt-1 text-xs leading-5 text-white/60">Set a monthly budget to see how much you have left.</p><button type="button" onClick={() => onNavigate('budgets')} className="mt-3 text-xs font-bold text-mint-100">Create budget ↗</button></>}</div></div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricCard title="Spent today" value={formatCurrency(todayTotal, currency)} caption="Since midnight" tone="mint" icon={<TrendingDown size={18} />} /><MetricCard title="This week" value={formatCurrency(weekTotal, currency)} caption="Your current week" tone="blue" icon={<CalendarDays size={18} />} /><MetricCard title="Spent this month" value={formatCurrency(monthTotal, currency)} caption={`${monthTransactions.length} expense${monthTransactions.length === 1 ? '' : 's'} logged`} tone="amber" icon={<Wallet size={18} />} /><MetricCard title="Income this month" value={formatCurrency(incomeTotal, currency)} caption="Recorded income" tone="rose" icon={<TrendingUp size={18} />} /></div>
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="panel-card rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Recent activity</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The latest moves in your family account.</p></div><button type="button" onClick={() => onNavigate('history')} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-mint-600 hover:text-mint-500 dark:text-mint-100">View history <ArrowRight size={13} /></button></div>{recent.length ? <div className="divide-y divide-slate-100 dark:divide-white/10">{recent.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} category={categoryMap.get(transaction.category_id)} subcategory={categoryMap.get(transaction.subcategory_id ?? '')} currency={currency} onEdit={() => onEdit(transaction)} compact />)}</div> : <EmptyState title="Your first step starts here" text="Add your first expense or income to see your activity appear here." action={<Button onClick={onAdd}><Plus size={15} /> Add a transaction</Button>} />}</section>
      <section className="panel-card rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Where it goes</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Category split for this month.</p></div><button type="button" aria-label="Open analytics" onClick={() => onNavigate('analytics')} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><ArrowRight size={17} /></button></div>{categoryBreakdown.length ? <><div className="relative mt-2 h-[220px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryBreakdown.slice(0, 7)} dataKey="value" nameKey="name" innerRadius={61} outerRadius={86} paddingAngle={3} stroke="none">{categoryBreakdown.slice(0, 7).map((entry) => <Cell key={entry.categoryId} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div className="text-[11px] font-semibold text-slate-400">MONTH TOTAL</div><div className="mt-1 font-display text-lg font-extrabold text-slate-900 dark:text-white">{formatCompact(monthTotal, currency)}</div></div></div><div className="space-y-3">{categoryBreakdown.slice(0, 4).map((entry) => <div key={entry.categoryId} className="flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.name}</span><span className="text-xs text-slate-400">{monthTotal > 0 ? Math.round(entry.value / monthTotal * 100) : 0}%</span><span className="w-24 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-white">{formatCurrency(entry.value, currency)}</span></div>)}</div></> : <EmptyState title="No spending breakdown yet" text="Once you add expenses, your biggest categories will appear here." />}</section>
    </div>
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Budget check-in</p><h3 className="mt-1 font-display text-lg font-extrabold text-slate-900 dark:text-white">Keep your month in view</h3></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-100"><Wallet size={18} /></div></div><div className="mt-4 text-sm text-slate-600 dark:text-slate-300">{monthlyBudgetStatus ? monthlyBudgetStatus.state === 'exceeded' ? 'You have crossed the monthly spending limit. Review recent spending and make a plan for the rest of the month.' : monthlyBudgetStatus.state === 'warning' ? 'You have used most of your monthly budget. A quick check of the biggest categories can help.' : 'You are within the monthly budget. Keep recording spending to maintain a clear picture.' : 'Create an overall monthly budget to measure your progress and see your remaining amount.'}</div><button type="button" onClick={() => onNavigate('budgets')} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-mint-600 dark:text-mint-100">Manage budgets <ArrowRight size={15} /></button></section><section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Family workspace</p><h3 className="mt-1 font-display text-lg font-extrabold text-slate-900 dark:text-white">Money, shared thoughtfully</h3></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200"><ShieldCheck size={18} /></div></div><p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{household.name} has {budgets.filter((budget) => budget.active).length} active budget{budgets.filter((budget) => budget.active).length === 1 ? '' : 's'}. Each member signs in with their own email; family records sync across devices.</p><button type="button" onClick={() => onNavigate('settings')} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-mint-600 dark:text-mint-100">Family settings <ArrowRight size={15} /></button></section></div>
  </div>;
}

function formatCompact(value: number, currency: string) {
  if (value >= 1_000_000) return `${currency === 'INR' ? '₹' : `${currency} `}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 100_000) return `${currency === 'INR' ? '₹' : `${currency} `}${(value / 100_000).toFixed(1)}L`;
  return formatCurrency(value, currency);
}

function TransactionRow({ transaction, category, subcategory, currency, onEdit, onDelete, compact = false }: {
  transaction: Transaction; category?: Category; subcategory?: Category; currency: string; onEdit?: () => void; onDelete?: () => void; compact?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className={`group flex min-w-0 items-center gap-3 py-3 ${compact ? '' : 'rounded-xl px-3 hover:bg-slate-50 dark:hover:bg-white/[0.035]'}`}>
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base" style={{ backgroundColor: `${category?.color ?? '#24b47e'}18` }}>{categorySymbol(category)}</div>
    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{transaction.description.trim() || category?.name || 'Transaction'}</div><div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400"><span className="truncate">{category?.name ?? 'Uncategorized'}{subcategory ? ` / ${subcategory.name}` : ''}</span><span>·</span><span>{getTransactionDateLabel(transaction.occurred_at)}</span>{!compact && <><span>·</span><span className="capitalize">{transaction.payment_method.replace('_', ' ')}</span></>}</div></div>
    <div className="text-right"><div className={`whitespace-nowrap text-sm font-extrabold tabular-nums ${transaction.type === 'income' ? 'text-emerald-600 dark:text-mint-100' : 'text-slate-900 dark:text-white'}`}>{transaction.type === 'income' ? '+' : '−'}{formatCurrency(Number(transaction.amount), currency)}</div>{!compact && <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{transaction.type}</div>}</div>
    {!compact && <div className="relative ml-1 flex shrink-0 items-center gap-1"><button type="button" onClick={onEdit} aria-label="Edit transaction" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-navy-950 dark:hover:bg-white/10 dark:hover:text-white"><Pencil size={15} /></button><button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="More transaction actions" className="rounded-lg p-2 text-slate-400 hover:bg-white dark:hover:bg-white/10"><MoreHorizontal size={16} /></button>{menuOpen && <div className="absolute right-0 top-9 z-10 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-pop dark:border-white/10 dark:bg-navy-900"><button type="button" onClick={() => { setMenuOpen(false); onEdit?.(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 dark:hover:bg-white/5"><Pencil size={13} /> Edit</button><button type="button" onClick={() => { setMenuOpen(false); onDelete?.(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"><Trash2 size={13} /> Delete</button></div>}</div>}
  </div>;
}

function HistoryPage({ transactions, categories, currency, categoryFilter, setCategoryFilter, typeFilter, setTypeFilter, search, setSearch, from, setFrom, to, setTo, onEdit, onDelete, onExport }: {
  transactions: Transaction[]; categories: Category[]; currency: string; categoryFilter: string; setCategoryFilter: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void; search: string; setSearch: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void; onExport: () => void;
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category] as const));
  const filtered = transactions.filter((transaction) => {
    const categoryMatches = categoryFilter === 'all' || transaction.category_id === categoryFilter;
    const typeMatches = typeFilter === 'all' || transaction.type === typeFilter;
    const searchText = `${transaction.description} ${categoryMap.get(transaction.category_id)?.name ?? ''} ${transaction.payment_method}`.toLowerCase();
    const matchesSearch = !search.trim() || searchText.includes(search.toLowerCase().trim());
    const date = new Date(transaction.occurred_at);
    const fromDate = from ? new Date(`${from}T00:00:00`) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
    return categoryMatches && typeMatches && matchesSearch && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });
  const totalExpenses = sumTransactions(filtered);
  const totalIncome = sumTransactions(filtered, 'income');
  return <div className="space-y-5"><PageTitle eyebrow="YOUR ACTIVITY" title="Transaction history" description="Search, filter, edit, or export your family's records." action={<Button variant="outline" onClick={onExport}><Download size={16} /> Export CSV</Button>} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><MetricCard title="Matching expenses" value={formatCurrency(totalExpenses, currency)} caption={`${filtered.filter((item) => item.type === 'expense').length} records`} icon={<ArrowDownRight size={17} />} tone="rose" /><MetricCard title="Matching income" value={formatCurrency(totalIncome, currency)} caption={`${filtered.filter((item) => item.type === 'income').length} records`} icon={<ArrowUpRight size={17} />} tone="mint" /><MetricCard title="Net movement" value={formatCurrency(totalIncome - totalExpenses, currency)} caption="Income less expenses" icon={<ArrowLeftRight size={17} />} tone="blue" /></div>
    <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-5"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="relative sm:col-span-2 xl:col-span-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search notes or categories" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select aria-label="Filter category" className={inputClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.filter((category) => !category.parent_id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select aria-label="Filter transaction type" className={inputClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Income & expenses</option><option value="expense">Expenses only</option><option value="income">Income only</option></select><input aria-label="From date" type="date" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} /><input aria-label="To date" type="date" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} /></div>{(from || to || search || categoryFilter !== 'all' || typeFilter !== 'all') && <button type="button" onClick={() => { setFrom(''); setTo(''); setSearch(''); setCategoryFilter('all'); setTypeFilter('all'); }} className="mt-3 text-xs font-bold text-mint-600 dark:text-mint-100">Clear filters</button>}</section>
    <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-5"><div className="mb-2 flex items-center justify-between"><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">All records <span className="ml-1 text-sm font-semibold text-slate-400">({filtered.length})</span></h3><span className="text-xs text-slate-400">Newest first</span></div>{filtered.length ? <div className="divide-y divide-slate-100 dark:divide-white/10">{filtered.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} category={categoryMap.get(transaction.category_id)} subcategory={categoryMap.get(transaction.subcategory_id ?? '')} currency={currency} onEdit={() => onEdit(transaction)} onDelete={() => onDelete(transaction)} />)}</div> : <EmptyState title="No matching transactions" text="Try changing the filters or add a new transaction." />}</section>
  </div>;
}

function AnalyticsPage({ transactions, categories, currency, period, setPeriod, category, setCategory, from, setFrom, to, setTo, weekStartsOn }: {
  transactions: Transaction[]; categories: Category[]; currency: string; period: 'daily' | 'weekly' | 'monthly' | 'custom'; setPeriod: (period: 'daily' | 'weekly' | 'monthly' | 'custom') => void; category: string; setCategory: (id: string) => void; from: string; setFrom: (date: string) => void; to: string; setTo: (date: string) => void; weekStartsOn: number;
}) {
  const [typeFilter, setTypeFilter] = useState<'expense' | 'income'>('expense');
  const range = useMemo(() => {
    if (period === 'custom') {
      const rangeStart = from ? new Date(`${from}T00:00:00`) : getPeriodRange('monthly').start;
      const rangeEnd = to ? new Date(`${to}T23:59:59.999`) : new Date();
      return { start: rangeStart, end: new Date(rangeEnd.getTime() + 1) };
    }
    return getPeriodRange(period, new Date(), weekStartsOn);
  }, [period, from, to, weekStartsOn]);
  const filteredTransactions = transactions.filter((transaction) => transaction.type === typeFilter && inRange(transaction.occurred_at, range) && (category === 'all' || transaction.category_id === category));
  const breakdown = spendingByCategory(filteredTransactions, categories, typeFilter);
  const total = sumTransactions(filteredTransactions, typeFilter);
  const dailyMap = new Map<string, number>();
  for (const transaction of filteredTransactions) {
    const d = new Date(transaction.occurred_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(transaction.amount));
  }
  const dailyBars = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  return <div className="space-y-5"><PageTitle eyebrow="SPENDING INSIGHTS" title="The story behind your spending" description="Explore expense and income patterns with filters that work across your family data." />
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-white/5">{(['daily', 'weekly', 'monthly', 'custom'] as const).map((value) => <button type="button" key={value} onClick={() => setPeriod(value)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize transition ${period === value ? 'bg-white text-navy-950 shadow-sm dark:bg-white/10 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{value === 'custom' ? 'Custom range' : value}</button>)}</div><div className="flex gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-white/5"><button type="button" onClick={() => setTypeFilter('expense')} className={`rounded-lg px-3 py-2 text-xs font-bold ${typeFilter === 'expense' ? 'bg-white text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300' : 'text-slate-500'}`}>Expenses</button><button type="button" onClick={() => setTypeFilter('income')} className={`rounded-lg px-3 py-2 text-xs font-bold ${typeFilter === 'income' ? 'bg-white text-mint-600 shadow-sm dark:bg-white/10 dark:text-mint-100' : 'text-slate-500'}`}>Income</button></div></div>
    {period === 'custom' && <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:grid-cols-3"><Field label="From"><input type="date" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="To"><input type="date" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field label="Category"><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>}
    {period !== 'custom' && <div className="flex items-center gap-3"><div className="max-w-xs flex-1"><select aria-label="Filter by category" className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="text-xs text-slate-500 dark:text-slate-400">{range.start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(range.end.getTime() - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.85fr]"><section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">{typeFilter === 'expense' ? 'Expense' : 'Income'} distribution</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{breakdown.length} categor{breakdown.length === 1 ? 'y' : 'ies'} in the selected period.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">{periodLabel(period === 'custom' ? 'monthly' : period)}</span></div>{breakdown.length ? <><div className="relative mt-4 h-[290px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={78} outerRadius={118} paddingAngle={3} stroke="none">{breakdown.map((entry) => <Cell key={entry.categoryId} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value), currency)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[11px] font-bold tracking-wide text-slate-400">TOTAL</span><span className="mt-1 font-display text-xl font-extrabold text-slate-900 dark:text-white">{formatCompact(total, currency)}</span></div></div><div className="divide-y divide-slate-100 dark:divide-white/10">{breakdown.map((entry) => <div key={entry.categoryId} className="flex items-center gap-3 py-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} /><span className="flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.name}</span><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10 sm:w-28"><div className="h-full rounded-full" style={{ width: `${total > 0 ? entry.value / total * 100 : 0}%`, backgroundColor: entry.color }} /></div><span className="w-12 text-right text-xs text-slate-400">{total > 0 ? Math.round(entry.value / total * 100) : 0}%</span><span className="w-28 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-white">{formatCurrency(entry.value, currency)}</span></div>)}</div></> : <EmptyState title="Nothing to chart yet" text="Add expenses for this time period or change your filters. The chart will populate automatically." />}</section>
      <div className="space-y-5"><section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035]"><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">At a glance</h3><div className="mt-4 space-y-4">{[{ label: typeFilter === 'expense' ? 'Total expenses' : 'Total income', value: formatCurrency(total, currency) }, { label: 'Transactions', value: String(filteredTransactions.length) }, { label: 'Average per record', value: formatCurrency(filteredTransactions.length ? total / filteredTransactions.length : 0, currency) }, { label: 'Top category', value: breakdown[0]?.name ?? '—' }].map((item) => <div key={item.label} className="flex items-center justify-between gap-3"><span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span><span className="text-right text-sm font-extrabold text-slate-900 dark:text-white">{item.value}</span></div>)}</div></section>
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035]"><div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Recent daily activity</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last 14 active dates in this filter.</p></div><Activity size={17} className="text-mint-600 dark:text-mint-100" /></div>{dailyBars.length ? <div className="mt-5 space-y-3">{dailyBars.map(([date, value]) => <div key={date} className="grid grid-cols-[62px_1fr_auto] items-center gap-3"><span className="text-[11px] text-slate-400">{new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-mint-500 to-[#87ddbc]" style={{ width: `${Math.max(2, value / Math.max(...dailyBars.map((entry) => entry[1]), 1) * 100)}%` }} /></div><span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(value, currency)}</span></div>)}</div> : <p className="py-8 text-center text-sm text-slate-400">No daily data to display.</p>}</section></div></div>
  </div>;
}

function BudgetsPage({ budgets, transactions, categories, currency, weekStartsOn, onAdd, onToggle }: {
  budgets: Budget[]; transactions: Transaction[]; categories: Category[]; currency: string; weekStartsOn: number; onAdd: () => void; onToggle: (budget: Budget) => void;
}) {
  const allCategory = new Map(categories.map((category) => [category.id, category] as const));
  const activeBudgets = budgets.filter((budget) => budget.active);
  const paused = budgets.filter((budget) => !budget.active);
  function stats(budget: Budget) {
    const range = getPeriodRange(budget.period_type, new Date(), weekStartsOn);
    const spent = sumTransactions(transactions.filter((transaction) => transaction.type === 'expense' && inRange(transaction.occurred_at, range) && (!budget.category_id || transaction.category_id === budget.category_id)));
    return calculateBudgetStatus(Number(budget.amount), spent);
  }
  return <div className="space-y-5"><PageTitle eyebrow="PLAN AHEAD" title="Budgets for your real life" description="Overall limits and category caps share the same live transaction data." action={<Button onClick={onAdd}><Plus size={16} /> New budget</Button>} />
    {!activeBudgets.length ? <section className="rounded-2xl border border-slate-200/70 bg-white shadow-card dark:border-white/10 dark:bg-white/[0.035]"><EmptyState title="A budget gives your spending a frame" text="Start with a monthly limit, then add weekly, daily, or category-specific budgets when you’re ready." action={<Button onClick={onAdd}><Plus size={16} /> Create your first budget</Button>} /></section> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{activeBudgets.map((budget) => { const status = stats(budget); const cat = budget.category_id ? allCategory.get(budget.category_id) : null; const progressColor = status.state === 'exceeded' ? 'bg-rose-500' : status.state === 'warning' ? 'bg-amber-400' : 'bg-mint-500'; return <section key={budget.id} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${cat?.color ?? '#24b47e'}18`, color: cat?.color ?? '#24b47e' }}>{cat ? categorySymbol(cat) : <Wallet size={20} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">{cat ? cat.name : 'Overall family budget'}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">{budget.period_type}</span></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{cat ? `${periodLabel(budget.period_type)} category limit` : `${periodLabel(budget.period_type)} spending limit`}</p></div><button type="button" aria-label={`Pause ${budget.period_type} budget`} onClick={() => onToggle(budget)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><Ellipsis size={17} /></button></div><div className="mt-6 flex items-end justify-between gap-4"><div><div className="font-display text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{formatCurrency(status.spent, currency)}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">of {formatCurrency(status.limit, currency)} used</div></div><div className="text-right"><div className={`font-display text-xl font-extrabold tabular-nums ${status.state === 'exceeded' ? 'text-rose-600 dark:text-rose-300' : status.state === 'warning' ? 'text-amber-600 dark:text-amber-200' : 'text-mint-600 dark:text-mint-100'}`}>{status.percentage}%</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{status.remaining >= 0 ? `${formatCurrency(status.remaining, currency)} left` : `${formatCurrency(Math.abs(status.remaining), currency)} over`}</div></div></div><div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${Math.min(status.percentage, 100)}%` }} /></div><div className="mt-3 flex items-center justify-between text-xs"><span className={status.state === 'exceeded' ? 'font-bold text-rose-600 dark:text-rose-300' : status.state === 'warning' ? 'font-bold text-amber-600 dark:text-amber-200' : 'text-slate-500 dark:text-slate-400'}>{status.state === 'exceeded' ? 'Limit exceeded' : status.state === 'warning' ? 'Getting close to your limit' : 'Within budget'}</span><span className="text-slate-400">Live from transactions</span></div></section>; })}</div>}
    {paused.length > 0 && <section className="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-white/[0.035]"><h3 className="font-display text-base font-extrabold text-slate-800 dark:text-white">Paused budgets</h3><div className="mt-3 divide-y divide-slate-100 dark:divide-white/10">{paused.map((budget) => <div key={budget.id} className="flex items-center gap-3 py-3"><div className="flex-1"><div className="text-sm font-bold">{budget.category_id ? allCategory.get(budget.category_id)?.name : 'Overall family budget'} · {budget.period_type}</div><div className="mt-1 text-xs text-slate-400">{formatCurrency(Number(budget.amount), currency)}</div></div><Button variant="outline" onClick={() => onToggle(budget)}>Resume</Button></div>)}</div></section>}
    <p className="text-xs leading-5 text-slate-400">Period definitions: daily means local calendar day; weekly follows your chosen week-start day; monthly means local calendar month. Category budgets only count expenses recorded against that category.</p>
  </div>;
}

function CategoriesPage({ categories, transactions, onAdd, onEdit, onArchive, onReorder }: {
  categories: Category[]; transactions: Transaction[]; onAdd: () => void; onEdit: (category: Category) => void; onArchive: (category: Category) => void; onReorder: (category: Category, direction: -1 | 1) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const parents = categories.filter((category) => !category.parent_id && !category.archived).sort((a, b) => a.sort_order - b.sort_order);
  const archived = categories.filter((category) => category.archived);
  return <div className="space-y-5"><PageTitle eyebrow="ORGANIZE SPENDING" title="Categories & subcategories" description="Keep your system personal. Archive old categories without losing financial history." action={<Button onClick={onAdd}><Plus size={16} /> Add category</Button>} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{parents.map((parent, index) => { const children = categories.filter((category) => category.parent_id === parent.id && !category.archived).sort((a, b) => a.sort_order - b.sort_order); const used = transactions.filter((transaction) => transaction.category_id === parent.id || children.some((child) => child.id === transaction.category_id)).length; return <section key={parent.id} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop dark:border-white/10 dark:bg-white/[0.035] sm:p-5"><div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl" style={{ backgroundColor: `${parent.color}1c` }}>{categorySymbol(parent)}</div><div className="min-w-0 flex-1"><h3 className="truncate font-display text-base font-extrabold text-slate-900 dark:text-white">{parent.name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{used} transaction{used === 1 ? '' : 's'} · {children.length} subcategor{children.length === 1 ? 'y' : 'ies'}</p></div><button type="button" aria-label={`Edit ${parent.name}`} onClick={() => onEdit(parent)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><Pencil size={15} /></button></div>{children.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-white/10">{children.map((child, childIndex) => <div key={child.id} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: child.color }} /><span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600 dark:text-slate-300">{child.name}</span><button type="button" disabled={childIndex === 0} aria-label={`Move ${child.name} up`} onClick={() => onReorder(child, -1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10"><ChevronLeft className="-rotate-90" size={12} /></button><button type="button" disabled={childIndex === children.length - 1} aria-label={`Move ${child.name} down`} onClick={() => onReorder(child, 1)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10"><ChevronRight className="rotate-90" size={12} /></button><button type="button" aria-label={`Edit ${child.name}`} onClick={() => onEdit(child)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><Pencil size={13} /></button></div>)}</div>}<div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10"><div className="flex gap-1"><button type="button" aria-label={`Move ${parent.name} up`} disabled={index === 0} onClick={() => onReorder(parent, -1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10"><ChevronLeft className="-rotate-90" size={15} /></button><button type="button" aria-label={`Move ${parent.name} down`} disabled={index === parents.length - 1} onClick={() => onReorder(parent, 1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10"><ChevronRight className="rotate-90" size={15} /></button></div><button type="button" onClick={() => onArchive(parent)} className="text-xs font-bold text-slate-400 hover:text-rose-600 dark:hover:text-rose-300">Archive</button></div></section>; })}</div>
    {!parents.length && <section className="rounded-2xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-white/[0.035]"><EmptyState title="Start with a category" text="Create a category that matches the way your family spends." action={<Button onClick={onAdd}><Plus size={16} /> Add category</Button>} /></section>}
    {archived.length > 0 && <section className="rounded-2xl border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-white/[0.035]"><button type="button" onClick={() => setShowArchived((value) => !value)} className="flex w-full items-center justify-between gap-3"><div className="text-left"><h3 className="font-display text-base font-extrabold text-slate-800 dark:text-white">Archived categories</h3><p className="mt-1 text-xs text-slate-400">Hidden from new transactions; historical transactions are preserved.</p></div>{showArchived ? <ChevronDown className="rotate-180 text-slate-400" size={18} /> : <ChevronDown size={18} className="text-slate-400" />}</button>{showArchived && <div className="mt-4 divide-y divide-slate-100 dark:divide-white/10">{archived.map((category) => <div key={category.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 dark:bg-white/5">{categorySymbol(category)}</span><div className="flex-1"><div className="text-sm font-bold">{category.name}</div><div className="mt-1 text-xs text-slate-400">{category.parent_id ? 'Subcategory' : 'Top-level category'}</div></div><Button variant="outline" onClick={() => onArchive(category)}>Restore</Button></div>)}</div>}</section>}
    <Notice kind="info">Categories with existing transactions cannot be deleted because the database restricts removal of referenced records. Archive them instead so reports remain intact.</Notice>
  </div>;
}

function SettingsPage({ section, profile, household, member, members, currencyInput, setCurrencyInput, profileNameInput, setProfileNameInput, householdNameInput, setHouseholdNameInput, weekStartInput, setWeekStartInput, settingsBusy, onSaveSettings, inviteCode, onCreateInvite, familyBusy, joinCode, setJoinCode, onJoinFamily, onExportCsv, onExportBackup, csvFileName, onCsvFile, csvImport, csvError, csvBusy, onImportCsv, onClearCsv, transactionCount }: {
  section: 'settings' | 'data'; profile: Profile; household: Household; member: HouseholdMember; members: HouseholdMember[]; currencyInput: string; setCurrencyInput: (value: string) => void; profileNameInput: string; setProfileNameInput: (value: string) => void; householdNameInput: string; setHouseholdNameInput: (value: string) => void; weekStartInput: string; setWeekStartInput: (value: string) => void; settingsBusy: boolean; onSaveSettings: (event: FormEvent<HTMLFormElement>) => void; inviteCode: string; onCreateInvite: () => void; familyBusy: boolean; joinCode: string; setJoinCode: (value: string) => void; onJoinFamily: (event: FormEvent<HTMLFormElement>) => void; onExportCsv: () => void; onExportBackup: () => void; csvFileName: string; onCsvFile: (file?: File) => void; csvImport: CsvImportResult | null; csvError: string; csvBusy: boolean; onImportCsv: () => void; onClearCsv: () => void; transactionCount: number;
}) {
  const [showJoin, setShowJoin] = useState(false);
  const currencies = [['INR', 'Indian Rupee (₹)'], ['USD', 'US Dollar ($)'], ['EUR', 'Euro (€)'], ['GBP', 'British Pound (£)'], ['AED', 'UAE Dirham (د.إ)'], ['SGD', 'Singapore Dollar (S$)'], ['AUD', 'Australian Dollar (A$)'], ['CAD', 'Canadian Dollar (C$)']];
  const weekDays = [['1', 'Monday'], ['0', 'Sunday'], ['6', 'Saturday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday']];
  return <div className="space-y-5"><PageTitle eyebrow={section === 'data' ? 'DATA PORTABILITY' : 'PREFERENCES & CONTROL'} title={section === 'data' ? 'Import, export & backups' : 'Settings & family sharing'} description={section === 'data' ? 'Export a backup before making changes, or import validated transactions from CSV.' : 'Manage your profile, family invites, shared currency, and reporting preferences.'} />
    <div className="grid grid-cols-1 gap-5">
      {section !== 'data' && <div className="space-y-5"><section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200"><Settings size={19} /></div><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Profile & preferences</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your account uses individual secure sign-in.</p></div></div><form onSubmit={onSaveSettings} className="space-y-4"><Field label="Name"><input required minLength={2} maxLength={80} className={inputClass} value={profileNameInput} onChange={(event) => setProfileNameInput(event.target.value)} /></Field><Field label="Email address"><input readOnly className={`${inputClass} cursor-not-allowed opacity-70`} value={profile.email || ''} /><span className="text-xs text-slate-400">Email is managed by your authentication provider.</span></Field><Field label="Family currency"><select disabled={member.role !== 'admin'} className={inputClass} value={currencyInput} onChange={(event) => setCurrencyInput(event.target.value)}>{currencies.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><span className="text-xs text-slate-400">Shared by all family members. Changes formatting only; transaction amounts are not converted.</span></Field><div className="border-t border-slate-100 pt-4 dark:border-white/10"><h4 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-200">Family workspace</h4><Field label="Family name"><input disabled={member.role !== 'admin'} maxLength={80} className={inputClass} value={householdNameInput} onChange={(event) => setHouseholdNameInput(event.target.value)} /></Field><div className="mt-4"><Field label="Week starts on"><select disabled={member.role !== 'admin'} className={inputClass} value={weekStartInput} onChange={(event) => setWeekStartInput(event.target.value)}>{weekDays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>{member.role !== 'admin' && <p className="mt-2 text-xs text-slate-400">Only the family administrator can change shared workspace settings.</p>}</div><Button type="submit" disabled={settingsBusy} className="w-full">{settingsBusy ? 'Saving…' : 'Save preferences'}</Button></form></section>
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-100"><ShieldCheck size={19} /></div><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Family sharing</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{members.length} account{members.length === 1 ? '' : 's'} in {household.name}.</p></div></div><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Every family member signs in using their own account. Once joined, members can see the shared family transactions, categories, and budgets. Invite codes expire after seven days and allow up to ten uses.</p>{member.role === 'admin' ? <div className="mt-4"><Button onClick={onCreateInvite} disabled={familyBusy} variant="secondary" className="w-full"><Plus size={16} />{familyBusy ? 'Creating invite…' : 'Create family invite code'}</Button>{inviteCode && <div className="mt-3 rounded-xl border border-mint-500/20 bg-mint-50 p-4 dark:bg-mint-500/10"><div className="text-xs font-semibold text-mint-600 dark:text-mint-100">SHARE THIS CODE WITH FAMILY</div><div className="mt-2 flex items-center justify-between gap-3"><span className="font-mono text-xl font-extrabold tracking-[0.16em] text-navy-950 dark:text-white">{inviteCode}</span><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(inviteCode); }}>Copy code</Button></div><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Share privately. Anyone with this code can join before it expires.</p></div>}</div> : <Notice kind="info">Ask your family administrator to generate an invite code.</Notice>}
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10"><button type="button" onClick={() => setShowJoin((value) => !value)} className="flex w-full items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-200"><span>Joining another family?</span><ChevronDown className={showJoin ? 'rotate-180' : ''} size={17} /></button>{showJoin && <form onSubmit={onJoinFamily} className="mt-3 space-y-3"><Notice kind="warning">Your new account's empty starter family will be replaced when you join. Accounts with existing transactions or budgets cannot switch automatically; export a backup first.</Notice><Field label="Invite code"><input required minLength={6} maxLength={20} className={inputClass} autoCapitalize="characters" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Paste family invite code" /></Field><Button type="submit" disabled={familyBusy} className="w-full">{familyBusy ? 'Joining…' : 'Join family workspace'}</Button></form>}</div></section>
      </div>}

      {section !== 'settings' && <div className="space-y-5"><section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-200"><Download size={19} /></div><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Export your data</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Keep an independent backup of financial records.</p></div></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-slate-800 dark:text-slate-100">Transaction CSV</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{transactionCount} records · works with spreadsheets</div></div><FileUp size={20} className="text-slate-400" /></div><Button variant="outline" onClick={onExportCsv} className="mt-3 w-full"><Download size={15} /> Download CSV</Button></div><div className="mt-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-slate-800 dark:text-slate-100">Full JSON backup</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Transactions, budgets, categories, and workspace details</div></div><ShieldCheck size={20} className="text-slate-400" /></div><Button variant="outline" onClick={onExportBackup} className="mt-3 w-full"><Download size={15} /> Download backup</Button></div><p className="mt-3 text-xs leading-5 text-slate-400">Export before bulk imports or other destructive operations. Store backup files somewhere private: they contain financial history.</p></section>
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035] sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-200"><FileUp size={19} /></div><div><h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">Import CSV transactions</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Validate before any rows are written.</p></div></div><label htmlFor="csv-file-input" className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition hover:border-mint-500/50 hover:bg-mint-50/30 dark:border-white/10 dark:hover:bg-mint-500/5"><FileUp size={24} className="text-slate-400" /><span className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">Choose a .csv file</span><span className="mt-1 max-w-xs text-xs leading-5 text-slate-400">Required columns: date, type, amount, category. Optional: subcategory, payment_method, description. Max 5 MB.</span><input id="csv-file-input" type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void onCsvFile(event.target.files?.[0])} /></label>{csvFileName && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5"><span className="min-w-0 truncate text-xs font-semibold">{csvFileName}</span><button type="button" onClick={onClearCsv} aria-label="Clear CSV selection"><X size={15} className="text-slate-400" /></button></div>}{csvError && <div className="mt-3"><Notice kind="error">{csvError}</Notice></div>}{csvImport && <div className="mt-3 space-y-3"><div className="grid grid-cols-3 gap-2"><ImportStat label="Valid new" value={csvImport.valid.length} /><ImportStat label="Duplicates" value={csvImport.skippedDuplicates} /><ImportStat label="Row errors" value={csvImport.errors.length} /></div>{csvImport.errors.length > 0 && <div className="max-h-36 overflow-auto rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{csvImport.errors.slice(0, 15).map((error) => <div key={error}>{error}</div>)}{csvImport.errors.length > 15 && <div>…and {csvImport.errors.length - 15} more</div>}</div>}<Button disabled={csvBusy || csvImport.valid.length === 0} onClick={onImportCsv} className="w-full">{csvBusy ? 'Importing…' : `Import ${csvImport.valid.length} valid transaction(s)`}</Button><p className="text-xs leading-5 text-slate-400">Duplicates are skipped based on amount, type, category, time (rounded to a minute), and description. A batch with valid and invalid rows imports only the valid rows.</p></div>}<div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-white/5 dark:text-slate-400"><strong className="text-slate-700 dark:text-slate-200">CSV format:</strong> <code>date,type,amount,category,subcategory,payment_method,description</code>. Dates can be ISO timestamps or parseable date strings. Category names must already exist.</div></section>
        <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dark:border-white/10 dark:bg-white/[0.035]"><div className="flex items-center gap-3"><Cloud size={20} className="text-mint-600 dark:text-mint-100" /><h3 className="font-display text-base font-extrabold">Cloud storage & privacy</h3></div><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">SmartSpend uses Supabase Auth and PostgreSQL with Row Level Security. Cross-device changes sync while online. The app caches its UI for installation, but intentionally does not save uncommitted financial changes offline.</p><div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Never share your Supabase secret/service-role key. The frontend needs only the project URL and public anon/publishable key.</div></section>
      </div>}
    </div>
  </div>;
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-white/5"><div className="font-display text-lg font-extrabold text-slate-900 dark:text-white">{value}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div></div>;
}
