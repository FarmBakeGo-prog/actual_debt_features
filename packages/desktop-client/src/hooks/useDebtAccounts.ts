import { useMemo } from 'react';

import { useAccounts } from './useAccounts';

export function useDebtAccounts() {
  const accounts = useAccounts();
  return useMemo(
    () =>
      accounts.filter(account => account.closed === 0 && account.is_debt === 1),
    [accounts],
  );
}
