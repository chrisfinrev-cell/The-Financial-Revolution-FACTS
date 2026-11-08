'use client';

import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { PlaidLinkButton } from '@/components/PlaidLinkButton';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();
  const [linkedNote, setLinkedNote] = useState<string | null>(null);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-wide text-slate-400">Account</p>
          <h1 className="text-3xl font-semibold text-white">Settings</h1>
          <p className="mt-1 text-slate-400">{user?.email}</p>
        </header>

        <section
          id="bank-accounts"
          className="rounded-xl border border-facts-line bg-facts-card p-6"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Bank connections</h2>
              <p className="mt-1 text-sm text-slate-400">
                Link a checking, savings, or credit account with Plaid. Read-only — FACTS never
                moves money or stores account/routing numbers.
              </p>
            </div>
          </div>

          <PlaidLinkButton
            onAccountLinked={() =>
              setLinkedNote('Bank linked successfully. Balances will appear after the next sync.')
            }
          />

          {linkedNote ? (
            <p className="mt-3 text-sm text-emerald-300">{linkedNote}</p>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
