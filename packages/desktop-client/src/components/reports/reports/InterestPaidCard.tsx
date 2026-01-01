import React, { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import { q } from 'loot-core/shared/query';
import * as monthUtils from 'loot-core/shared/months';
import { type AccountEntity } from 'loot-core/types/models';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { useFormat } from '@desktop-client/hooks/useFormat';

type InterestPaidCardProps = {
  widgetId: string;
  isEditing?: boolean;
  accounts: AccountEntity[];
  meta?: { name?: string; timeFrame?: string };
  onMetaChange: (newMeta: { name?: string; timeFrame?: string }) => void;
  onRemove: () => void;
};

export function InterestPaidCard({
  widgetId,
  isEditing,
  accounts,
  meta = {},
  onMetaChange,
  onRemove,
}: InterestPaidCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [interestData, setInterestData] = useState<Array<{ accountName: string; interestPaid: number }>>([]);

  // Filter to only debt accounts
  const debtAccounts = useMemo(
    () => accounts.filter(account => account.is_debt === 1),
    [accounts],
  );

  // Calculate date range
  const { startDate, endDate, label } = useMemo(() => {
    const today = monthUtils.currentDay();
    const timeFrame = meta?.timeFrame || 'Year to Date';

    switch (timeFrame) {
      case 'This Month':
        return {
          startDate: monthUtils.firstDayOfMonth(today),
          endDate: monthUtils.lastDayOfMonth(today),
          label: t('This Month'),
        };
      case 'Last Month': {
        const lastMonth = monthUtils.addMonths(today, -1);
        return {
          startDate: monthUtils.firstDayOfMonth(lastMonth),
          endDate: monthUtils.lastDayOfMonth(lastMonth),
          label: t('Last Month'),
        };
      }
      case 'Year to Date':
        return {
          startDate: `${monthUtils.getYear(today)}-01-01`,
          endDate: today,
          label: t('Year to Date'),
        };
      case 'Last Year': {
        const currentYear = parseInt(monthUtils.getYear(today), 10);
        const lastYear = currentYear - 1;
        return {
          startDate: `${lastYear}-01-01`,
          endDate: `${lastYear}-12-31`,
          label: t('Last Year'),
        };
      }
      default:
        return {
          startDate: `${monthUtils.getYear(today)}-01-01`,
          endDate: today,
          label: t('Year to Date'),
        };
    }
  }, [meta?.timeFrame, t]);

  // Load interest data for each account
  React.useEffect(() => {
    async function loadInterestData() {
      const data = await Promise.all(
        debtAccounts.map(async account => {
          // Query for interest transactions from "Interest Accrual" payee
          const interestQuery = q('transactions')
            .filter({
              account: account.id,
              date: { $gte: startDate, $lte: endDate },
            })
            .calculate({ $sum: '$amount' });

          try {
            const result = await send('api/query', {
              query: interestQuery.serialize(),
            });
            const amount = typeof result === 'number' ? result : 0;
            
            return {
              accountName: account.name,
              interestPaid: Math.abs(amount),
            };
          } catch {
            return {
              accountName: account.name,
              interestPaid: 0,
            };
          }
        }),
      );
      setInterestData(data);
    }
    
    loadInterestData();
  }, [debtAccounts, startDate, endDate]);

  const totalInterest = useMemo(
    () => interestData.reduce((sum, item) => sum + item.interestPaid, 0),
    [interestData],
  );

  return (
    <ReportCard
      isEditing={isEditing}
      to={`/reports/interest-paid/${widgetId}`}
      menuItems={[
        {
          name: 'rename',
          text: t('Rename'),
        },
        {
          name: 'remove',
          text: t('Remove'),
        },
      ]}
      onMenuSelect={item => {
        switch (item) {
          case 'rename':
            setNameMenuOpen(true);
            break;
          case 'remove':
            onRemove();
            break;
          default:
            throw new Error(`Unrecognized selection: ${item}`);
        }
      }}
    >
      <View style={{ flex: 1, padding: 20 }}>
        <ReportCardName
          name={meta?.name || t('Interest Paid')}
          isEditing={nameMenuOpen}
          onChange={newName => {
            onMetaChange({
              ...meta,
              name: newName,
            });
            setNameMenuOpen(false);
          }}
          onClose={() => setNameMenuOpen(false)}
        />

        <Text
          style={{
            color: theme.pageTextLight,
            fontSize: 13,
            marginTop: 5,
          }}
        >
          {label}
        </Text>

        <View style={{ marginTop: 20 }}>
          <Block>
            <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
              {t('Total Interest Paid')}
            </Text>
            <PrivacyFilter>
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: 600,
                  color: theme.errorText,
                  marginTop: 5,
                }}
              >
                {format(totalInterest, 'financial')}
              </Text>
            </PrivacyFilter>
          </Block>

          <View style={{ marginTop: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              {t('By Account')}
            </Text>
            {interestData.length === 0 ? (
              <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
                <Trans>No debt accounts found</Trans>
              </Text>
            ) : (
              interestData.map((item, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    borderBottom:
                      index < interestData.length - 1
                        ? `1px solid ${theme.tableBorder}`
                        : 'none',
                  }}
                >
                  <Text>{item.accountName}</Text>
                  <PrivacyFilter>
                    <Text
                      style={{
                        fontWeight: 500,
                        color:
                          item.interestPaid > 0
                            ? theme.errorText
                            : theme.pageText,
                      }}
                    >
                      {format(item.interestPaid, 'financial')}
                    </Text>
                  </PrivacyFilter>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </ReportCard>
  );
}
