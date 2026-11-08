export type FactsUser = {
  id: number;
  email: string;
  name?: string | null;
  display_name?: string | null;
  referral_code?: string | null;
  affiliate_code?: string | null;
  affiliate_tier?: string | null;
  is_affiliate_disabled?: boolean;
  affiliate_eligible?: boolean;
  nda_required?: boolean;
  nda_accepted?: boolean;
  nda_accepted_at?: string | null;
  is_admin?: boolean;
  can_join_income_programs?: boolean;
  pricing_tier?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  plan?: string | null;
};

export type AuthMeResponse = {
  authenticated: boolean;
  user?: FactsUser;
  token?: string;
};

export type BucketSlug =
  | 'necessities'
  | 'reserve'
  | 'velocity'
  | 'growth'
  | 'lifestyle'
  | 'legacy';

export type BucketState = {
  slug: BucketSlug;
  name: string;
  target_pct: number;
  deposited_cents: number;
  spent_cents: number;
  remaining_cents: number;
};
