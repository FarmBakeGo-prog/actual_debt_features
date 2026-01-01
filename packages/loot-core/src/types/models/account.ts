export type AccountEntity = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
  sort_order: number;
  last_reconciled: string | null;
  tombstone: 0 | 1;
  is_debt: 0 | 1;
  debt_original_balance: number | null;
  debt_interest_rate: number | null;
  debt_minimum_payment: number | null;
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
