import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { type AccountEntity } from 'loot-core/types/models';

import { PrivacyFilter } from '@desktop-client/components/PrivacyFilter';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { useFormat } from '@desktop-client/hooks/useFormat';

type PayoffTimelineCardProps = {
  widgetId: string;
  isEditing?: boolean;
  account: AccountEntity;
  meta?: { name?: string };
  onMetaChange: (newMeta: { name?: string }) => void;
  onRemove: () => void;
};

// Calculate months until payoff based on current balance, interest rate, and payment
function calculatePayoffMonths(
  balance: number,
  interestRate: number,
  monthlyPayment: number,
): number {
  if (monthlyPayment <= 0 || balance <= 0) return 0;

  const monthlyRate = interestRate / 100 / 12;

  // If payment doesn't cover interest, debt will never be paid off
  if (monthlyPayment <= balance * monthlyRate) {
    return Infinity;
  }

  // Formula: n = -log(1 - (P * r / M)) / log(1 + r)
  // where P = principal, r = monthly rate, M = monthly payment
  const numerator = Math.log(1 - (balance * monthlyRate) / monthlyPayment);
  const denominator = Math.log(1 + monthlyRate);

  return Math.ceil(-numerator / denominator);
}

export function PayoffTimelineCard({
  widgetId,
  isEditing,
  account,
  meta = {},
  onMetaChange,
  onRemove,
}: PayoffTimelineCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [nameMenuOpen, setNameMenuOpen] = useState(false);

  const payoffData = useMemo(() => {
    const currentBalance = Math.abs(account.balance_current || 0);
    const interestRate = account.debt_interest_rate || 0;
    const minimumPayment = account.debt_minimum_payment || 0;

    const months = calculatePayoffMonths(
      currentBalance,
      interestRate,
      minimumPayment,
    );

    const today = new Date();
    const payoffDate = new Date(
      today.getFullYear(),
      today.getMonth() + months,
      1,
    );

    // Calculate total interest
    const totalPaid = minimumPayment * months;
    const totalInterest = totalPaid - currentBalance;

    return {
      months,
      payoffDate,
      currentBalance,
      totalInterest,
      isPayable: months !== Infinity && months > 0,
    };
  }, [account]);

  return (
    <ReportCard
      isEditing={isEditing}
      to={`/reports/payoff-timeline/${widgetId}`}
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
          name={
            meta?.name ||
            t('Payoff Timeline - {{name}}', { name: account.name })
          }
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

        <View
          style={{
            marginTop: 20,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 20,
          }}
        >
          <Block style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
              {t('Current Balance')}
            </Text>
            <PrivacyFilter>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: theme.errorText,
                }}
              >
                {format(payoffData.currentBalance, 'financial')}
              </Text>
            </PrivacyFilter>
          </Block>

          <Block style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
              {t('Payoff Date')}
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: payoffData.isPayable
                  ? theme.noticeText
                  : theme.errorText,
              }}
            >
              {payoffData.isPayable
                ? payoffData.payoffDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                  })
                : t('Never')}
            </Text>
          </Block>

          <Block style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
              {t('Months Remaining')}
            </Text>
            <Text style={{ fontSize: 24, fontWeight: 600 }}>
              {payoffData.isPayable ? payoffData.months : '∞'}
            </Text>
          </Block>

          <Block style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
              {t('Total Interest')}
            </Text>
            <PrivacyFilter>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: theme.warningText,
                }}
              >
                {payoffData.isPayable
                  ? format(Math.max(0, payoffData.totalInterest), 'financial')
                  : '—'}
              </Text>
            </PrivacyFilter>
          </Block>
        </View>

        {!payoffData.isPayable && (
          <View
            style={{
              marginTop: 15,
              padding: 10,
              backgroundColor: theme.errorBackground,
              borderRadius: 4,
            }}
          >
            <Text style={{ color: theme.errorText }}>
              {t(
                'Warning: Minimum payment does not cover interest. Debt will not be paid off.',
              )}
            </Text>
          </View>
        )}
      </View>
    </ReportCard>
  );
}
