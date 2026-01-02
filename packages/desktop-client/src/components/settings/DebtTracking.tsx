import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Setting } from './UI';

import { useLocalPref } from '@desktop-client/hooks/useLocalPref';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

export function DebtTrackingSettings() {
  const dispatch = useDispatch();
  const [debtTrackingEnabled] = useLocalPref('flags.debtTrackingEnabled');

  const openWizard = () => {
    dispatch(
      pushModal({
        modal: { name: 'debt-migration-wizard', options: {} },
      }),
    );
  };

  return (
    <Setting
      primaryAction={
        <Button onPress={openWizard}>
          {debtTrackingEnabled ? (
            <Trans>Manage Debt Accounts</Trans>
          ) : (
            <Trans>Enable Debt Tracking</Trans>
          )}
        </Button>
      }
    >
      <View style={{ gap: 10 }}>
        <Text>
          <strong>
            <Trans>Debt Tracking</Trans>
          </strong>
        </Text>
        {debtTrackingEnabled ? (
          <Text style={{ color: theme.noticeText }}>
            <Trans>
              Debt tracking is enabled. You can manage your debt accounts and
              view interest breakdowns in your transactions.
            </Trans>
          </Text>
        ) : (
          <Text>
            <Trans>
              Enable debt tracking to manage credit cards, loans, and mortgages.
              This feature adds the ability to track principal, interest, and
              fee breakdowns for debt payments.
            </Trans>
          </Text>
        )}
      </View>
    </Setting>
  );
}
