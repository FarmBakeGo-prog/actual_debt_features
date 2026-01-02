import React, { useState, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { SvgAlertTriangle } from '@actual-app/components/icons/v2/AlertTriangle';
import { SvgCheckCircle1 } from '@actual-app/components/icons/v2/CheckCircle1';
import { SvgDownloadThickBottom } from '@actual-app/components/icons/v2/DownloadThickBottom';
import { Progress } from '@actual-app/components/progress';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { format } from 'date-fns';

import { send } from 'loot-core/platform/client/fetch';
import { type DebtCandidate } from 'loot-core/server/accounts/debt-detection';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '@desktop-client/components/common/Modal';
import { Checkbox } from '@desktop-client/components/forms';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useLocalPref } from '@desktop-client/hooks/useLocalPref';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { closeModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type WizardStep = 'welcome' | 'backup' | 'detect' | 'apply' | 'complete';

type AccountConfig = {
  accountId: string;
  accountName: string;
  balance: number;
  debtType: string;
  apr: string;
};

export function DebtMigrationWizard() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const formatCurrency = useFormat();
  const [budgetName] = useMetadataPref('budgetName');
  const [, setDebtTrackingEnabled] = useLocalPref('flags.debtTrackingEnabled');
  const [, setDebtTrackingDismissed] = useLocalPref(
    'flags.debtTrackingDismissed',
  );

  const [step, setStep] = useState<WizardStep>('welcome');
  const [backupCreated, setBackupCreated] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DebtCandidate[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set(),
  );
  const [accountConfigs, setAccountConfigs] = useState<
    Map<string, AccountConfig>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyStatus, setApplyStatus] = useState<
    'idle' | 'running' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load candidates when reaching detect step
  useEffect(() => {
    if (step === 'detect') {
      loadCandidates();
    }
  }, [step]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const detected = await send('debt-detect-accounts');
      setCandidates(detected);

      // Pre-select high confidence accounts
      const highConfidence = detected
        .filter(
          (c: DebtCandidate) =>
            c.confidence === 'high' || c.confidence === 'medium',
        )
        .map((c: DebtCandidate) => c.accountId);
      setSelectedAccounts(new Set(highConfidence));

      // Initialize configs
      const configs = new Map<string, AccountConfig>();
      detected.forEach((c: DebtCandidate) => {
        configs.set(c.accountId, {
          accountId: c.accountId,
          accountName: c.accountName,
          balance: c.currentBalance,
          debtType: c.suggestedType || 'credit_card',
          apr: '',
        });
      });
      setAccountConfigs(configs);
    } catch (e) {
      console.error('Failed to load debt candidates:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupError(null);

    try {
      const response = await send('export-budget');

      if ('error' in response && response.error) {
        setBackupError(response.error);
        setBackupLoading(false);
        return;
      }

      if (response.data) {
        window.Actual.saveFile(
          response.data,
          `${format(new Date(), 'yyyy-MM-dd')}-${budgetName}-pre-debt-migration.zip`,
          t('Create Backup'),
        );
        setBackupCreated(true);
      }
    } catch (e) {
      setBackupError(String(e));
    } finally {
      setBackupLoading(false);
    }
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const updateConfig = (
    accountId: string,
    field: keyof AccountConfig,
    value: string,
  ) => {
    setAccountConfigs(prev => {
      const next = new Map(prev);
      const config = next.get(accountId);
      if (config) {
        next.set(accountId, { ...config, [field]: value });
      }
      return next;
    });
  };

  const handleApply = async () => {
    setApplyStatus('running');
    setApplyProgress(0);
    setErrorMessage(null);

    try {
      // Step 1: Run schema migration (30%)
      setApplyProgress(10);
      const migrationResult = await send('debt-run-migration');

      if (migrationResult.error) {
        throw new Error(migrationResult.error);
      }
      setApplyProgress(30);

      // Step 2: Convert selected accounts (30-90%)
      const selectedList = Array.from(selectedAccounts);
      const progressPerAccount =
        selectedList.length > 0 ? 60 / selectedList.length : 60;

      for (let i = 0; i < selectedList.length; i++) {
        const accountId = selectedList[i];
        const config = accountConfigs.get(accountId);

        if (config) {
          await send('account-convert-to-debt', {
            id: accountId,
            isDebt: true,
            debtType: config.debtType,
            apr: config.apr ? parseFloat(config.apr) : null,
          });
        }

        setApplyProgress(30 + (i + 1) * progressPerAccount);
      }

      // Step 3: Set preference (90-100%)
      setApplyProgress(90);
      setDebtTrackingEnabled(true);
      setApplyProgress(100);

      setApplyStatus('success');
      setStep('complete');
    } catch (e) {
      setApplyStatus('error');
      setErrorMessage(String(e));
    }
  };

  const handleSkip = () => {
    setDebtTrackingDismissed(true);
    dispatch(closeModal({ modal: { name: 'debt-migration-wizard' } }));
  };

  const handleClose = () => {
    dispatch(closeModal({ modal: { name: 'debt-migration-wizard' } }));
  };

  const renderWelcome = () => (
    <View style={{ gap: 15 }}>
      <Text style={{ fontSize: 14, lineHeight: 1.5 }}>
        <Trans>
          Debt Tracking allows you to manage credit cards, loans, mortgages, and
          other debt accounts with enhanced features:
        </Trans>
      </Text>
      <View style={{ paddingLeft: 20, gap: 8 }}>
        <Text>• Track principal, interest, and fee breakdowns</Text>
        <Text>• Automatically detect potential debt accounts</Text>
        <Text>• View payment history with interest analysis</Text>
        <Text>• Set up interest rate tracking</Text>
      </View>
      <View
        style={{
          backgroundColor: theme.warningBackground,
          padding: 12,
          borderRadius: 6,
          borderLeft: `3px solid ${theme.warningText}`,
        }}
      >
        <Text style={{ fontWeight: 600, marginBottom: 5 }}>
          <Trans>Before you begin</Trans>
        </Text>
        <Text style={{ fontSize: 13 }}>
          <Trans>
            This feature modifies your database schema. While we include
            safeguards and rollback capabilities, we strongly recommend creating
            a backup first. You control every step of this process.
          </Trans>
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Button variant="primary" onPress={() => setStep('backup')}>
          <Trans>Get Started</Trans>
        </Button>
        <Button variant="bare" onPress={handleSkip}>
          <Trans>Not Now</Trans>
        </Button>
      </View>
    </View>
  );

  const renderBackup = () => (
    <View style={{ gap: 15 }}>
      <Text style={{ fontSize: 14, lineHeight: 1.5 }}>
        <Trans>
          Before making any changes, please create a backup of your budget. This
          ensures you can restore your data if anything goes wrong.
        </Trans>
      </Text>

      <View
        style={{
          padding: 20,
          backgroundColor: theme.tableBackground,
          borderRadius: 8,
          alignItems: 'center',
          gap: 15,
        }}
      >
        <SvgDownloadThickBottom
          style={{ width: 48, height: 48, color: theme.pageTextSubdued }}
        />
        <ButtonWithLoading
          variant="primary"
          isLoading={backupLoading}
          onPress={handleBackup}
        >
          <Trans>Download Backup</Trans>
        </ButtonWithLoading>
        {backupCreated && (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <SvgCheckCircle1
              style={{ width: 16, height: 16, color: theme.noticeTextDark }}
            />
            <Text style={{ color: theme.noticeTextDark }}>
              <Trans>Backup created successfully</Trans>
            </Text>
          </View>
        )}
        {backupError && (
          <Text style={{ color: theme.errorText }}>{backupError}</Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Button
          variant="primary"
          onPress={() => setStep('detect')}
          isDisabled={!backupCreated}
        >
          <Trans>Continue</Trans>
        </Button>
        <Button variant="bare" onPress={() => setStep('welcome')}>
          <Trans>Back</Trans>
        </Button>
      </View>
      {!backupCreated && (
        <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
          <Trans>Please create a backup to continue</Trans>
        </Text>
      )}
    </View>
  );

  const renderDetect = () => (
    <View style={{ gap: 15 }}>
      <Text style={{ fontSize: 14, lineHeight: 1.5 }}>
        <Trans>
          We've scanned your accounts for potential debt accounts. Select the
          ones you want to enable debt tracking for:
        </Trans>
      </Text>

      {loading ? (
        <Text>
          <Trans>Analyzing accounts...</Trans>
        </Text>
      ) : candidates.length === 0 ? (
        <View
          style={{
            padding: 20,
            backgroundColor: theme.tableBackground,
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <Text>
            <Trans>
              No potential debt accounts detected. You can still enable debt
              tracking and manually convert accounts later.
            </Trans>
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8, maxHeight: 300, overflow: 'auto' }}>
          {candidates.map((candidate: DebtCandidate) => {
            const config = accountConfigs.get(candidate.accountId);
            const isSelected = selectedAccounts.has(candidate.accountId);

            return (
              <View
                key={candidate.accountId}
                style={{
                  padding: 12,
                  backgroundColor: isSelected
                    ? theme.tableRowBackgroundHover
                    : theme.tableBackground,
                  borderRadius: 6,
                  border: `1px solid ${isSelected ? theme.buttonPrimaryBackground : theme.tableBorder}`,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleAccount(candidate.accountId)}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 600 }}>
                      {candidate.accountName}
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: theme.pageTextSubdued }}
                    >
                      Balance: {formatCurrency(candidate.currentBalance)} •
                      Confidence: {candidate.confidence}
                    </Text>
                  </View>
                  {isSelected && config && (
                    <Select
                      value={config.debtType}
                      options={[
                        { value: 'credit_card', label: t('Credit Card') },
                        { value: 'mortgage', label: t('Mortgage') },
                        { value: 'auto_loan', label: t('Auto Loan') },
                        { value: 'student_loan', label: t('Student Loan') },
                        { value: 'personal_loan', label: t('Personal Loan') },
                        {
                          value: 'line_of_credit',
                          label: t('Line of Credit'),
                        },
                        { value: 'other', label: t('Other') },
                      ]}
                      onChange={value =>
                        updateConfig(candidate.accountId, 'debtType', value)
                      }
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Button variant="primary" onPress={() => setStep('apply')}>
          <Trans>Continue</Trans>
        </Button>
        <Button variant="bare" onPress={() => setStep('backup')}>
          <Trans>Back</Trans>
        </Button>
      </View>
    </View>
  );

  const renderApply = () => (
    <View style={{ gap: 15 }}>
      {applyStatus === 'idle' && (
        <>
          <Text style={{ fontSize: 14, lineHeight: 1.5 }}>
            <Trans>Ready to apply changes:</Trans>
          </Text>
          <View style={{ paddingLeft: 20, gap: 5 }}>
            <Text>• Add debt tracking columns to database</Text>
            <Text>
              • Convert {selectedAccounts.size} account(s) to debt accounts
            </Text>
            <Text>• Enable debt tracking features</Text>
          </View>
          <View
            style={{
              backgroundColor: theme.warningBackground,
              padding: 12,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 13 }}>
              <Trans>
                All changes are wrapped in a transaction. If anything fails,
                your database will be automatically rolled back to its previous
                state.
              </Trans>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Button variant="primary" onPress={handleApply}>
              <Trans>Apply Changes</Trans>
            </Button>
            <Button variant="bare" onPress={() => setStep('detect')}>
              <Trans>Back</Trans>
            </Button>
          </View>
        </>
      )}

      {applyStatus === 'running' && (
        <View style={{ gap: 15, alignItems: 'center', padding: 20 }}>
          <Text style={{ fontWeight: 600 }}>
            <Trans>Applying changes...</Trans>
          </Text>
          <Progress value={applyProgress} />
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {applyProgress < 30
              ? t('Updating database schema...')
              : applyProgress < 90
                ? t('Converting accounts...')
                : t('Finalizing...')}
          </Text>
        </View>
      )}

      {applyStatus === 'error' && (
        <View style={{ gap: 15 }}>
          <View
            style={{
              backgroundColor: theme.errorBackground,
              padding: 15,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <SvgAlertTriangle
              style={{ width: 24, height: 24, color: theme.errorText }}
            />
            <View>
              <Text style={{ fontWeight: 600, color: theme.errorText }}>
                <Trans>Migration Failed</Trans>
              </Text>
              <Text style={{ fontSize: 12 }}>{errorMessage}</Text>
            </View>
          </View>
          <Text>
            <Trans>
              Your database has been rolled back to its previous state. Your
              data is safe.
            </Trans>
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="primary" onPress={handleApply}>
              <Trans>Retry</Trans>
            </Button>
            <Button variant="bare" onPress={handleClose}>
              <Trans>Close</Trans>
            </Button>
          </View>
        </View>
      )}
    </View>
  );

  const renderComplete = () => (
    <View style={{ gap: 15, alignItems: 'center', padding: 20 }}>
      <SvgCheckCircle1
        style={{ width: 64, height: 64, color: theme.noticeTextDark }}
      />
      <Text style={{ fontSize: 18, fontWeight: 600 }}>
        <Trans>Debt Tracking Enabled!</Trans>
      </Text>
      <Text style={{ textAlign: 'center', color: theme.pageTextSubdued }}>
        <Trans>
          You can now view debt accounts in the sidebar, see payment breakdowns,
          and manage interest tracking for your debt accounts.
        </Trans>
      </Text>
      <Button variant="primary" onPress={handleClose}>
        <Trans>Get Started</Trans>
      </Button>
    </View>
  );

  const stepTitles: Record<WizardStep, string> = {
    welcome: t('Welcome to Debt Tracking'),
    backup: t('Create a Backup'),
    detect: t('Select Debt Accounts'),
    apply: t('Apply Changes'),
    complete: t('Setup Complete'),
  };

  return (
    <Modal name="debt-migration-wizard" containerProps={{ style: { width: 550 } }}>
      <ModalHeader
        title={<ModalTitle title={stepTitles[step]} shrinkOnOverflow />}
        rightContent={<ModalCloseButton onPress={handleClose} />}
      />
      <View style={{ padding: 20 }}>
        {step === 'welcome' && renderWelcome()}
        {step === 'backup' && renderBackup()}
        {step === 'detect' && renderDetect()}
        {step === 'apply' && renderApply()}
        {step === 'complete' && renderComplete()}
      </View>
    </Modal>
  );
}
