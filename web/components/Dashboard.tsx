'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navbar from '@/components/Navbar';
import DashboardEmptyState from '@/components/DashboardEmptyState';
import { DownloadNdaButton } from '@/components/DownloadNdaButton';
import PlaidLinkButton, {
  type PlaidLinkButtonHandle
} from '@/components/PlaidLinkButton';
import { useAuth } from '@/hooks/useAuth';
import { api, apiRoutes } from '@/lib/api';
import { formatCents, normalizeBuckets } from '@/lib/buckets';

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const plaidRef = useRef<PlaidLinkButtonHandle>(null);
  const [bankLinkedMsg, setBankLinkedMsg] = useState<string | null>(null);
  const [optimisticLinked, setOptimisticLinked] = useState(false);

  const affiliateExcluded =
    user?.affiliate_tier === 'EXCLUDED' ||
    user?.is_affiliate_disabled === true ||
    user?.affiliate_eligible === false;

  const buckets = useQuery({
    queryKey: ['engine', 'transactions'],
    queryFn: async () => {
      const { data } = await api.get(apiRoutes.buckets);
      return normalizeBuckets(data);
    }
  });

  const plaidStatus = useQuery({
    queryKey: ['plaid', 'status'],
    queryFn: async () => {
      try {
        const { data } = await api.get<{ active_connections?: number }>(apiRoutes.plaidStatus);
        return data;
      } catch {
        const { data } = await api.get<{ active_connections?: number }>(
          apiRoutes.plaidStatusAlias
        );
        return data;
      }
    }
  });

  const hasLinkedAccounts =
    optimisticLinked || (plaidStatus.data?.active_connections ?? 0) > 0;

  const financials = useMemo(() => {
    const rows = buckets.data || [];
    const totalIncome = rows.reduce((sum, b) => sum + (b.deposited_cents || 0), 0) / 100;
    const totalExpenses = rows.reduce((sum, b) => sum + (b.spent_cents || 0), 0) / 100;
    return {
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses
    };
  }, [buckets.data]);

  function handleAccountLinked() {
    setOptimisticLinked(true);
    setBankLinkedMsg('Bank linked. Syncing balances…');
    void queryClient.invalidateQueries({ queryKey: ['engine', 'transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['plaid', 'status'] });
  }

  function openPlaidLink() {
    plaidRef.current?.open();
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100">
      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-6 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              Monitor your cash-flow allocations and connected financial institutions.
            </p>
            {user?.email ? (
              <p className="mt-1 text-xs text-slate-500">{user.email}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user?.id ? <DownloadNdaButton userId={String(user.id)} /> : null}
            <PlaidLinkButton ref={plaidRef} onAccountLinked={handleAccountLinked} />
          </div>
        </div>

        {bankLinkedMsg ? (
          <p className="text-sm text-emerald-300">{bankLinkedMsg}</p>
        ) : null}

        {!affiliateExcluded ? (
          <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
            <p className="font-semibold text-amber-300">Future Generation referral</p>
            <p className="mt-1 font-mono text-xs text-slate-300">
              {user?.referral_code || 'Referral code pending'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Share your code to earn standard affiliate commissions when invited members
              subscribe.
            </p>
          </section>
        ) : null}

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Income
            </span>
            <div className="mt-2 text-3xl font-bold text-white">
              {formatUsd(financials.totalIncome)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Expenses
            </span>
            <div className="mt-2 text-3xl font-bold text-white">
              {formatUsd(financials.totalExpenses)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Net Balance
            </span>
            <div
              className={`mt-2 text-3xl font-bold ${
                financials.netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {financials.netBalance >= 0
                ? `+${formatUsd(financials.netBalance)}`
                : `-${formatUsd(Math.abs(financials.netBalance))}`}
            </div>
          </div>
        </div>

        {/* Conditional Onboarding vs. Active Allocation View */}
        {!hasLinkedAccounts && !plaidStatus.isLoading ? (
          <DashboardEmptyState onConnectClick={openPlaidLink} />
        ) : (
          <>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
              <h2 className="text-xl font-bold text-white">Connected Accounts Active</h2>
              <p className="mt-2 text-sm text-slate-400">
                Your live transaction feed is now populating your FACTS allocation buckets.
              </p>
            </div>

            <section id="buckets" className="grid gap-4 md:grid-cols-2">
              {(buckets.data || []).map((bucket) => {
                const used =
                  bucket.deposited_cents > 0
                    ? Math.min(
                        100,
                        Math.round((bucket.spent_cents / bucket.deposited_cents) * 100)
                      )
                    : 0;
                return (
                  <article
                    key={bucket.slug}
                    className="rounded-xl border border-facts-line bg-facts-card p-5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-white">{bucket.name}</h2>
                      <span className="text-sm text-facts-accent">{bucket.target_pct}%</span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold">
                      {formatCents(bucket.remaining_cents)}
                    </p>
                    <p className="text-sm text-slate-400">
                      Remaining · deposited {formatCents(bucket.deposited_cents)}
                    </p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-facts-accent" style={{ width: `${used}%` }} />
                    </div>
                  </article>
                );
              })}
            </section>

            <section
              id="modules"
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-5"
            >
              <h2 className="text-sm font-semibold text-slate-200">Core program modules</h2>
              <p className="mt-1 text-xs text-slate-500">
                Focused financial planning tools — budgeting, allocation, and sovereignty
                modules.
                {affiliateExcluded
                  ? ' Affiliate / commission surfaces are disabled for this account.'
                  : ''}
              </p>
            </section>
          </>
        )}

        {/* Anchor targets used by Navbar / Settings deep-links */}
        <div id="accounts" className="sr-only" aria-hidden />
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Educational only — not financial, legal, tax, lending, or credit-repair advice. We do
        not hold user funds.
      </footer>
    </div>
  );
}
