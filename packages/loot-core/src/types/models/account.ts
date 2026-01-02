export type DebtType =
  | 'credit_card'
  | 'auto_loan'
  | 'student_loan'
  | 'mortgage'
  | 'personal_loan'
  | 'line_of_credit';

export type InterestScheme =
  | 'simple'
  | 'compound_monthly'
  | 'compound_daily'
  | 'compound_annually';

export type CompoundingFrequency =
  | 'daily'
  | 'monthly'
  | 'quarterly'
  | 'annually';

export type AccountEntity = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
  sort_order: number;
  last_reconciled: string | null;
  tombstone: 0 | 1;
  is_debt: 0 | 1;
  debt_type: DebtType | null;
  debt_original_balance: number | null;
  debt_interest_rate: number | null; // Legacy field, use apr instead
  apr: number | null; // Annual percentage rate
  debt_minimum_payment: number | null;
  interest_scheme: InterestScheme | null;
  compounding_frequency: CompoundingFrequency | null;
  interest_posting_day: number | null; // 1-31 for specific day, 0/null for last day
  apr_last_updated: string | null; // For variable rate loans
} & (_SyncFields<true> | _SyncFields<false>);

export type _SyncFields<T> = {
  account_id: T extends true ? string : null;
  bank: T extends true ? string : null;
  bankName: T extends true ? string : null;
  bankId: T extends true ? number : null;
  mask: T extends true ? string : null; // end of bank account number
  official_name: T extends true ? string : null;
  balance_current: T extends true ? number : null;
  balance_available: T extends true ? number : null;
  balance_limit: T extends true ? number : null;
  account_sync_source: T extends true ? AccountSyncSource : null;
  last_sync: T extends true ? string : null;
};

export type AccountSyncSource = 'simpleFin' | 'goCardless' | 'pluggyai';
