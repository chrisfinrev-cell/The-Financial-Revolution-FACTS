'use client';

import { Zap } from 'lucide-react';

type DashboardEmptyStateProps = {
  onConnectClick?: () => void;
  onAccountLinked?: () => void;
};

export default function DashboardEmptyState({ onConnectClick }: DashboardEmptyStateProps) {
  return (
    <div className="relative my-6 overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-8 text-center shadow-2xl">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl" />

      <div className="relative mx-auto max-w-xl space-y-4">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-xl font-bold text-emerald-400">
          <Zap className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Welcome to your FACTS Dashboard
        </h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Your allocation engine is ready. Connect your primary financial institutions securely
          via Plaid to start flowing real transaction data into your buckets automatically.
        </p>

        <div className="pt-2">
          <button
            type="button"
            onClick={onConnectClick}
            className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 active:translate-y-0"
          >
            Connect Bank Account via Plaid
          </button>
        </div>
      </div>
    </div>
  );
}
