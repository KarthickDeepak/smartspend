import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Brand, Button, Field, Notice, inputClass } from './Ui';

function explainAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('email rate limit') || lower.includes('rate limit')) return 'Too many email requests were made in a short time. Wait before retrying, or configure custom SMTP in Supabase Auth settings. The built-in sender is limited to 2 emails/hour and is not intended for real users.';
  if (lower.includes('email address not authorized') || lower.includes('not authorized')) return 'Supabase’s built-in email sender only delivers to addresses associated with your project team. Configure custom SMTP for family members, or temporarily disable email confirmation only while testing locally.';
  if (lower.includes('invalid login credentials')) return 'Email or password was not recognised. Check both values, or create an account first.';
  if (lower.includes('email not confirmed')) return 'Confirm your email using the link sent by Supabase, then sign in.';
  if (lower.includes('already registered') || lower.includes('user already registered')) return 'An account already exists for this email. Switch to Sign in instead.';
  if (lower.includes('password')) return message;
  return message;
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      if (mode === 'signup') {
        if (name.trim().length < 2) throw new Error('Enter your name (at least 2 characters).');
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() } }
        });
        if (authError) throw authError;
        if (!data.session) setSuccess('Account created. Check your inbox and confirm your email before signing in. If the confirmation email does not arrive, check Supabase Auth email limits and SMTP settings.');
        else setSuccess('Account created successfully. Your family workspace is being prepared.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (err) {
      setError(explainAuthError(err instanceof Error ? err.message : 'Authentication failed. Please try again.'));
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-gradient min-h-dvh px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden px-5 lg:block">
          <Brand />
          <div className="mt-16 max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-mint-500/20 bg-white/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-mint-600 shadow-sm dark:bg-white/5 dark:text-mint-100"><Sparkles size={14} /> Your money, in focus</div>
            <h1 className="font-display text-5xl font-extrabold leading-[1.12] tracking-[-0.04em] text-navy-950 dark:text-white xl:text-6xl">Make every rupee <span className="text-mint-600 dark:text-mint-100">feel intentional.</span></h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600 dark:text-slate-300">A calmer way to track spending, stay close to your budget, and make money decisions together as a family.</p>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[['Track','Daily spending'],['Plan','Flexible budgets'],['Share','Family accounts']].map(([title, sub]) => <div key={title} className="rounded-2xl border border-white/100 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"><div className="font-display text-lg font-extrabold text-navy-950 dark:text-white">{title}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div></div>)}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-[30px] border border-white/100 bg-white/90 p-6 shadow-pop backdrop-blur-xl dark:border-white/10 dark:bg-navy-950/90 sm:p-8">
          <div className="mb-7 flex items-center justify-between lg:hidden"><Brand /><span className="rounded-full bg-mint-50 px-3 py-1 text-xs font-bold text-mint-600 dark:bg-mint-500/10 dark:text-mint-100">Family finance</span></div>
          <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-mint-600 dark:text-mint-100">Welcome to SmartSpend</p><h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{mode === 'signin' ? 'Good to see you.' : 'Start fresh, together.'}</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{mode === 'signin' ? 'Sign in to pick up where your family left off.' : 'Create your account to set up a private family workspace.'}</p></div>
          {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
          {success && <div className="mb-4"><Notice kind="success">{success}</Notice></div>}
          <form className="space-y-4" onSubmit={submit}>
            {mode === 'signup' && <Field label="Your name"><input required minLength={2} autoComplete="name" className={inputClass} placeholder="e.g. Karthick" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
            <Field label="Email address"><input required type="email" autoComplete="email" className={inputClass} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" hint={mode === 'signup' ? 'Use at least 8 characters.' : 'Your password is managed securely by Supabase Auth.'}>
              <div className="relative"><input required minLength={mode === 'signup' ? 8 : 1} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={`${inputClass} pr-12`} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </Field>
            <Button type="submit" disabled={busy} className="mt-2 w-full py-3.5">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in securely' : 'Create free account'} {!busy && <ArrowRight size={17} />}</Button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><div className="h-px flex-1 bg-slate-200 dark:bg-white/10" /><span>PRIVATE BY DESIGN</span><div className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3.5 dark:bg-white/5"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-mint-600 dark:text-mint-100" /><p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Your family data is protected by database-level access policies. Each family member has their own login, while shared transactions and budgets sync through the cloud.</p></div>
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{mode === 'signin' ? 'New to SmartSpend?' : 'Already have an account?'} <button type="button" onClick={() => { setMode((current) => current === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess(''); }} className="font-bold text-mint-600 hover:text-mint-500 dark:text-mint-100">{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
        </section>
      </div>
    </main>
  );
}
