'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState
} from 'react';
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { Landmark, LoaderCircle } from 'lucide-react';
import { api, apiRoutes } from '@/lib/api';

type PlaidLinkButtonProps = {
  /** Called after a successful public_token exchange */
  onAccountLinked?: () => void;
  /** @deprecated Prefer onAccountLinked */
  onLinked?: () => void;
  className?: string;
  /** Hide the visible button; still exposes open() via ref */
  hidden?: boolean;
};

export type PlaidLinkButtonHandle = {
  open: () => void;
  ready: boolean;
};

async function createLinkToken(): Promise<string> {
  // Prefer mod_plaid; fall back to /api/plaid and /api/v1 aliases
  const routes = [
    apiRoutes.plaidCreateLinkToken,
    apiRoutes.plaidCreateLinkTokenAlias,
    apiRoutes.plaidCreateLinkTokenV1
  ];
  let lastError: unknown;
  for (const route of routes) {
    try {
      const { data } = await api.post<{ link_token: string }>(route);
      if (data?.link_token) return data.link_token;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Failed to create Plaid link token');
}

async function exchangePublicToken(
  publicToken: string,
  metadata?: PlaidLinkOnSuccessMetadata
): Promise<void> {
  const body = {
    public_token: publicToken,
    institution_id: metadata?.institution?.institution_id,
    institution_name: metadata?.institution?.name
  };
  const routes = [
    apiRoutes.plaidExchangeToken,
    apiRoutes.plaidExchangeTokenAlias,
    apiRoutes.plaidExchangeTokenV1
  ];
  let lastError: unknown;
  for (const route of routes) {
    try {
      await api.post(route, body);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Failed to exchange public token');
}

export const PlaidLinkButton = forwardRef<PlaidLinkButtonHandle, PlaidLinkButtonProps>(
  function PlaidLinkButton({ onAccountLinked, onLinked, className, hidden }, ref) {
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 1. Fetch short-lived link_token from backend on mount
    useEffect(() => {
      let cancelled = false;
      async function fetchLinkToken() {
        try {
          const token = await createLinkToken();
          if (!cancelled) setLinkToken(token);
        } catch (err) {
          console.error('Failed to create Plaid link token:', err);
          if (!cancelled) setError('Could not start Plaid Link.');
        }
      }
      fetchLinkToken();
      return () => {
        cancelled = true;
      };
    }, []);

    // 2–3. On success, exchange public_token (never store access_token client-side)
    const onSuccess = useCallback(
      async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
        setBusy(true);
        setError(null);
        try {
          await exchangePublicToken(publicToken, metadata);
          onAccountLinked?.();
          onLinked?.();
        } catch (err) {
          console.error('Error exchanging public token:', err);
          setError('Could not connect the bank account.');
        } finally {
          setBusy(false);
          // Force a fresh link_token for the next open (tokens are short-lived)
          try {
            const token = await createLinkToken();
            setLinkToken(token);
          } catch {
            setLinkToken(null);
          }
        }
      },
      [onAccountLinked, onLinked]
    );

    const { open, ready } = usePlaidLink({
      token: linkToken,
      onSuccess
    });

    useImperativeHandle(
      ref,
      () => ({
        open: () => {
          if (ready && linkToken && !busy) open();
        },
        ready: Boolean(ready && linkToken && !busy)
      }),
      [ready, linkToken, busy, open]
    );

    if (hidden) {
      return error ? <p className="mt-2 text-sm text-amber-300">{error}</p> : null;
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => open()}
          disabled={!ready || !linkToken || busy}
          className={
            className
            || 'inline-flex items-center gap-2 rounded-lg bg-facts-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
          Connect Bank via Plaid
        </button>
        {error ? <p className="mt-2 text-sm text-amber-300">{error}</p> : null}
      </div>
    );
  }
);

export default PlaidLinkButton;
