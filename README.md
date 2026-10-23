# SmartSpend — Family Budget Tracker

SmartSpend is a responsive React + TypeScript PWA for household expense tracking, budgets, categories, analytics, CSV import/export, and family data sharing. Each family member signs in with their own email/password account. A family administrator creates a time-limited invite code; the members who join share family transactions and budgets across devices.

## Stack

- React 18, TypeScript, Vite
- Tailwind CSS, Lucide, Recharts
- Supabase Auth + PostgreSQL + Row Level Security + Realtime
- Vite PWA plugin for installability and static app-shell caching
- Vitest unit tests and Playwright smoke-test scaffold
- Vercel static hosting (free Hobby tier) or another static host

## Requirements

- Node.js 20+ (Node 22 recommended)
- A free Supabase project
- npm

## 1. Run locally

1. Extract this project and open a terminal inside the `smartspend` folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a free project at <https://supabase.com/dashboard>.
4. In the Supabase project dashboard, open **SQL Editor**, create a query, paste the complete contents of `supabase/migrations/202610230001_initial_schema.sql`, and run it. It creates the schema, starter categories, signup trigger, family invite RPCs, indexes, RLS, and Realtime publication entries.
5. In Supabase, open **Project Settings → API** (or the API Keys section) and copy the Project URL plus the public `anon` / publishable key. Never copy a `service_role` or secret key into the frontend.
6. Copy `.env.example` to `.env` and fill in:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   VITE_APP_NAME=SmartSpend
   ```

7. In Supabase **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173`. Add local and production callback URLs to Redirect URLs, e.g. `http://localhost:5173/**` and `https://YOUR-DEPLOYMENT.vercel.app/**`.
8. Start the dev server:

   ```bash
   npm run dev
   ```

9. Register with an email/password. New accounts receive a private starter family and the default categories. If email confirmation is enabled, confirm the email before signing in.

## 2. Authentication and email delivery

SmartSpend uses Supabase Auth email/password login; this does not require a paid identity-provider subscription or an Azure tenant. Important: Supabase's built-in email sender is for testing only. Its current documentation says it sends only to addresses associated with your project team and is limited to **2 emails per hour**. That means real family members may not receive signup confirmations by default, and repeated signup attempts can trigger `email rate limit exceeded`. For a family deployment, configure a supported custom SMTP provider in **Authentication → SMTP Settings** before inviting members. Provider quotas and terms vary, and “free” should not be assumed to mean unlimited email. For local-only testing you can temporarily disable email confirmation in Supabase Auth settings, but don't use that as a substitute for reliable email verification in a public deployment.

Passwords are handled by Supabase Auth. The app does not store passwords in its own tables. This frontend only uses the public anon/publishable key; database Row Level Security is the security boundary.

## 3. Family accounts and sync

- The first account becomes the family administrator.
- In **Settings → Family sharing**, the administrator can create an invite code. It expires after 7 days and supports up to 10 uses.
- A new member creates their own account first, signs in, opens **Joining another family?**, and submits the code. Their empty starter family is replaced with the invited family.
- An account that already has transactions or budgets cannot change families automatically. Export its backup first; move data deliberately rather than accidentally losing records.
- Transactions and budgets are family-shared. The authoring member is retained as the transaction `user_id`.
- Realtime events refresh the active device when publication/RLS configuration allows it. Reloading the app also fetches the cloud state.

## 4. Test and build

```bash
npm run typecheck
npm test
npm run build
```

For the Playwright smoke test (which checks the unconfigured start screen):

```bash
npx playwright install chromium
npm run test:e2e
```

The regular build is intended to work before you configure `.env`; in that state the app deliberately displays the setup instructions. Authentication, family queries, and data flows require your own Supabase project and the migration to be applied. The Playwright check does not test a live Supabase backend, production SMTP delivery, or multi-user isolation end to end.

## 5. Deploy to Vercel free Hobby

1. Push the `smartspend` folder to a private or public GitHub repository.
2. Sign in to <https://vercel.com>, select **Add New → Project**, and import that repository.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`. Install command: `npm install`.
4. Add environment variables in Vercel Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_NAME` (optional)
5. Deploy. Copy the actual deployed domain into Supabase **Authentication → URL Configuration** and add it to **Redirect URLs**. Trigger a fresh Vercel deployment after changing environment variables.
6. Open the actual URL, create a test account, verify email confirmation/sign-in, add a transaction, reload the page, and confirm it persists. Create a second account and test joining with a family invite. The app is **not considered deployed or production-verified** until you perform these steps against your own project.

You can also run `npm run build` and deploy the `dist/` folder to Cloudflare Pages. Use the same environment variables and allow SPA fallback to `/index.html`.

## 6. Free-tier notes (verify before a real rollout)

As checked on 23 October 2026, Supabase's pricing page lists a $0 Free plan, 500 MB database size per project, 50,000 monthly active users, 5 GB egress, and 1 GB storage. Supabase may pause low-activity free projects after 7 days, and automatic database backups are not included in the Free plan, so use SmartSpend's CSV/JSON exports as independent copies. Vercel Hobby is free for personal projects and includes usage quotas; do not assume it is eligible for commercial usage. Plan limits, fair-use rules, email limits, or eligibility may change, so re-check:

- <https://supabase.com/pricing>
- <https://supabase.com/docs/guides/platform/billing-on-supabase>
- <https://supabase.com/docs/guides/auth/auth-smtp>
- <https://supabase.com/docs/guides/auth/rate-limits>
- <https://vercel.com/docs/plans/hobby>

Free-tier hosting and email are not an uptime guarantee. For financial records you cannot afford to lose, export backups regularly and consider a paid database plan with managed backups before depending on it as the only archive.

## 7. Security notes

- RLS is enabled on profiles, households, memberships, categories, transactions, budgets, and household invites.
- `is_household_member` / `is_household_admin` are `SECURITY DEFINER` membership helpers with a fixed search path.
- Invite codes are returned only once to the creator; the database stores their SHA-256 digest, not the raw code.
- The transaction table has check constraints for positive amounts, supported transaction type/payment method, family-owned category foreign keys, timestamps, and reporting indexes.
- Categories referenced by transactions cannot be hard-deleted. Archive them instead.
- This is a production-oriented starter, not a substitute for a security audit, privacy/legal review, load testing, database backup strategy, or an end-to-end test on your actual Supabase deployment.

## Features included

- Email/password authentication
- Responsive dashboard, mobile bottom navigation and desktop sidebar
- Expense/income create, edit, delete, categories and nested subcategories
- Daily, weekly and monthly budgets, plus category-specific budgets
- Daily/weekly/monthly/custom-range analytics and category doughnut charts
- Searchable/filterable transaction history
- CSV export; JSON backup export; validated CSV import and duplicate skipping
- Family invitation and joining, separate user accounts and household-shared financial data
- INR default household currency; optional alternate currency display settings shared by the family (no exchange-rate conversion)
- Light/dark appearance, installable PWA icon, offline app shell and connectivity messaging
- Unit tests for period boundaries, budget calculations and expense aggregation

## Known limitations

- Offline writes are intentionally disabled rather than queued; uncommitted data will not be silently saved locally.
- Data is shared at household level; there are not separate private ledgers or individual budgets by family member in this version.
- CSV import requires category/subcategory names already present in the family workspace. JSON backup import and automated restore are not included.
- No automated invite email is sent; share the invite code through a trusted channel.
- Supabase's database maximum row response is handled by client pagination, but rendering very large histories still uses client memory.
- Production verification depends on credentials and account configuration that only you can supply. This package has no live demo URL or preconfigured source repository.
