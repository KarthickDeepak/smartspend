import type { Category, PaymentMethod, Transaction, TransactionType } from '../types';

export const CSV_HEADERS = ['id', 'date', 'type', 'amount', 'category', 'subcategory', 'payment_method', 'description'];

function escapeCsv(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function transactionsToCsv(transactions: Transaction[], categories: Category[]): string {
  const categoryById = new Map(categories.map((category) => [category.id, category] as const));
  const lines = [CSV_HEADERS.join(',')];
  for (const transaction of transactions) {
    const fields = [
      transaction.id,
      new Date(transaction.occurred_at).toISOString(),
      transaction.type,
      Number(transaction.amount).toFixed(2),
      categoryById.get(transaction.category_id)?.name ?? 'Uncategorized',
      transaction.subcategory_id ? categoryById.get(transaction.subcategory_id)?.name ?? '' : '',
      transaction.payment_method,
      transaction.description ?? ''
    ];
    lines.push(fields.map(escapeCsv).join(','));
  }
  return lines.join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains a quotation mark that was not closed.');
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

export interface ImportedTransaction {
  amount: number;
  type: TransactionType;
  occurred_at: string;
  category_id: string;
  subcategory_id: string | null;
  payment_method: PaymentMethod;
  description: string;
  dedupeKey: string;
}

export interface CsvImportResult {
  valid: ImportedTransaction[];
  errors: string[];
  skippedDuplicates: number;
}

export function validateTransactionsCsv(
  text: string,
  categories: Category[],
  existingTransactions: Transaction[]
): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The CSV has no transaction rows. Include a header and at least one transaction.');
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const required = ['date', 'type', 'amount', 'category'];
  for (const header of required) if (!headers.includes(header)) throw new Error(`Missing required CSV column: ${header}`);
  const indexOf = (name: string) => headers.indexOf(name);
  const get = (cells: string[], name: string) => {
    const idx = indexOf(name);
    return idx < 0 ? '' : (cells[idx] ?? '').trim();
  };
  const categoryByName = new Map(categories.filter((category) => category.parent_id === null).map((category) => [category.name.toLowerCase(), category] as const));
  const existingKeys = new Set(existingTransactions.map((transaction) => dedupeTransaction({
    amount: Number(transaction.amount), type: transaction.type, occurred_at: transaction.occurred_at,
    category_id: transaction.category_id, description: transaction.description ?? ''
  })));
  const batchKeys = new Set<string>();
  const valid: ImportedTransaction[] = [];
  const errors: string[] = [];
  let skippedDuplicates = 0;

  rows.slice(1).forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const amount = Number(get(cells, 'amount'));
    const type = get(cells, 'type').toLowerCase();
    const dateText = get(cells, 'date');
    const category = categoryByName.get(get(cells, 'category').toLowerCase());
    const description = get(cells, 'description').slice(0, 500);
    const methodRaw = get(cells, 'payment_method').toLowerCase().replace(/[ -]/g, '_');
    const allowedMethods: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer', 'other'];
    const payment_method: PaymentMethod = allowedMethods.includes(methodRaw as PaymentMethod) ? methodRaw as PaymentMethod : 'upi';
    const parsedDate = new Date(dateText);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999_999.99) { errors.push(`Row ${rowNumber}: amount must be greater than zero and within the supported limit.`); return; }
    if (type !== 'expense' && type !== 'income') { errors.push(`Row ${rowNumber}: type must be expense or income.`); return; }
    if (!dateText || !Number.isFinite(parsedDate.getTime())) { errors.push(`Row ${rowNumber}: date is missing or invalid.`); return; }
    if (!category || category.archived || category.parent_id !== null) { errors.push(`Row ${rowNumber}: category “${get(cells, 'category')}” is missing, archived, or not a top-level category.`); return; }
    const subcategoryName = get(cells, 'subcategory').toLowerCase();
    const subcategory = subcategoryName ? categories.find((item) => item.name.toLowerCase() === subcategoryName && item.parent_id === category.id && !item.archived) : undefined;
    if (subcategoryName && !subcategory) { errors.push(`Row ${rowNumber}: subcategory “${get(cells, 'subcategory')}” was not found under ${category.name}.`); return; }
    const occurred_at = parsedDate.toISOString();
    const item = {
      amount: Math.round(amount * 100) / 100,
      type: type as TransactionType,
      occurred_at,
      category_id: category.id,
      subcategory_id: subcategory?.id ?? null,
      payment_method,
      description,
      dedupeKey: ''
    };
    item.dedupeKey = dedupeTransaction(item);
    if (existingKeys.has(item.dedupeKey) || batchKeys.has(item.dedupeKey)) { skippedDuplicates += 1; return; }
    batchKeys.add(item.dedupeKey);
    valid.push(item);
  });
  return { valid, errors, skippedDuplicates };
}

function dedupeTransaction(transaction: Pick<ImportedTransaction, 'amount' | 'type' | 'occurred_at' | 'category_id' | 'description'> | Pick<Transaction, 'amount' | 'type' | 'occurred_at' | 'category_id' | 'description'>): string {
  const date = new Date(transaction.occurred_at);
  const minuteBucket = Number.isFinite(date.getTime()) ? Math.floor(date.getTime() / 60_000) : transaction.occurred_at;
  return [Number(transaction.amount).toFixed(2), transaction.type, transaction.category_id, minuteBucket, (transaction.description ?? '').trim().toLowerCase()].join('|');
}
