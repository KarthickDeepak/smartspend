import type { ReactNode } from 'react';
import { LoaderCircle, X } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      {!compact && <div className="min-w-0"><div className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{import.meta.env.VITE_APP_NAME || 'SmartSpend'}</div><div className="text-xs text-slate-500 dark:text-slate-400">Family finances, made clear</div></div>}
    </div>
  );
}

export function Button({
  children, variant = 'primary', className = '', disabled, type = 'button', onClick
}: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  className?: string; disabled?: boolean; type?: 'button' | 'submit' | 'reset'; onClick?: () => void;
}) {
  const variants = {
    primary: 'bg-navy-950 text-white shadow-sm hover:bg-navy-800 focus-visible:ring-navy-500 dark:bg-mint-500 dark:text-navy-950 dark:hover:bg-mint-100',
    secondary: 'bg-mint-50 text-mint-600 hover:bg-mint-100 dark:bg-mint-500/10 dark:text-mint-100 dark:hover:bg-mint-500/25',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
  };
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}>{children}</button>;
}

export function Modal({ open, title, subtitle, onClose, children, width = 'max-w-xl' }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`modal-panel max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-pop dark:bg-navy-950 sm:rounded-[28px] sm:p-7 ${width}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function LoadingBlock({ label = 'Loading your family finances…' }: { label?: string }) {
  return <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400"><LoaderCircle size={28} className="animate-spin text-mint-500" /><span>{label}</span></div>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-mint-50 text-mint-600 dark:bg-mint-500/10 dark:text-mint-100"><span className="text-2xl">✳</span></div><h3 className="font-display text-base font-bold text-slate-800 dark:text-white">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>{children}{hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}</label>;
}

export const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-mint-500 focus:ring-4 focus:ring-mint-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  const kinds = {
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100',
    error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100'
  };
  return <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${kinds[kind]}`}>{children}</div>;
}
