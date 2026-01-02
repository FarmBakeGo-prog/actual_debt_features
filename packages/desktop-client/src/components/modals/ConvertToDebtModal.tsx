// @ts-strict-ignore
import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';
import { type DebtCandidate } from 'loot-core/server/accounts/debt-detection';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '@desktop-client/components/common/Modal';
import { Checkbox } from '@desktop-client/components/forms';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { closeModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type AccountConfig = {
  accountId: string;
  debtType: string;
  apr: string;
  interestScheme: string;
  compoundingFrequency: string;
  interestPostingDay: string;
  principalCategoryId: string;
  interestCategoryId: string;
  categorizeUncategorized: boolean;
  uncategorizedCategory: string;
  // APR Calculator fields
  calculatorInterest: string;
  calculatorBalance: string;
  showCalculator: boolean;
};

type ConversionStep = 1 | 2 | 3 | 4;

export function ConvertToDebtModal() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const format = useFormat();
  const { grouped: categoryGroups } = useCategories();

  const [step, setStep] = useState<ConversionStep>(1);
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<DebtCandidate[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set(),
  );
  const [accountConfigs, setAccountConfigs] = useState<
    Map<string, AccountConfig>
  >(new Map());
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number }>({
    success: 0,
    failed: 0,
  });

  // Load debt candidates on mount
  useEffect(() => {
    async function loadCandidates() {
      setLoading(true);
      try {
        const detected = await send('debt-detect-accounts');

        // Filter to high/medium confidence and auto-select high confidence
        const filtered = detected.filter(
          (c: DebtCandidate) =>
            c.confidence === 'high' || c.confidence === 'medium',
        );
        setCandidates(filtered);

        // Auto-select high confidence candidates
        const highConfidence = new Set(
          filtered
            .filter((c: DebtCandidate) => c.confidence === 'high')
            .map((c: DebtCandidate) => c.accountId),
        );
        setSelectedAccounts(highConfidence);

        // Initialize configs for all candidates
        const configs = new Map<string, AccountConfig>();
        filtered.forEach((candidate: DebtCandidate) => {
          configs.set(candidate.accountId, {
            accountId: candidate.accountId,
            debtType: candidate.suggestedDebtType,
            apr: candidate.detectedAPR ? String(candidate.detectedAPR) : '',
            interestScheme: 'compound_monthly',
            compoundingFrequency: 'monthly',
            interestPostingDay: '',
            calculatorInterest: '',
            calculatorBalance: '',
            showCalculator: false,
            principalCategoryId: '',
            interestCategoryId: '',
            categorizeUncategorized: true,
            uncategorizedCategory: '',
          });
        });
        setAccountConfigs(configs);
      } catch (error) {
        console.error('Failed to detect debt accounts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCandidates();
  }, []);

  const toggleAccountSelection = (accountId: string) => {
    const newSelection = new Set(selectedAccounts);
    if (newSelection.has(accountId)) {
      newSelection.delete(accountId);
    } else {
      newSelection.add(accountId);
    }
    setSelectedAccounts(newSelection);
  };

  const updateConfig = (accountId: string, updates: Partial<AccountConfig>) => {
    const newConfigs = new Map(accountConfigs);
    const existing = newConfigs.get(accountId);
    if (existing) {
      newConfigs.set(accountId, { ...existing, ...updates });
      setAccountConfigs(newConfigs);
    }
  };

  const calculateAndSetAPR = (
    accountId: string,
    interestStr: string,
    balanceStr: string,
    interestScheme: string,
  ) => {
    const interest = parseFloat(interestStr);
    const balance = parseFloat(balanceStr);

    if (isNaN(interest) || isNaN(balance) || balance === 0) {
      return;
    }

    // Convert dollars to cents for calculation
    const interestCents = Math.round(interest * 100);
    const balanceCents = Math.round(balance * 100);

    // Calculate APR using the same logic as the backend
    // This is a simplified client-side version
    let apr: number | null = null;
    const absPrincipal = Math.abs(balanceCents);
    const absInterest = Math.abs(interestCents);

    try {
      switch (interestScheme) {
        case 'simple':
        case 'compound_monthly':
          apr = (absInterest / absPrincipal) * 12 * 100;
          break;

        case 'compound_daily': {
          const ratio = 1 + absInterest / absPrincipal;
          const dailyRate = Math.pow(ratio, 1 / 30) - 1;
          apr = dailyRate * 365 * 100;
          break;
        }

        case 'compound_annually': {
          const ratio = 1 + absInterest / absPrincipal;
          apr = (Math.pow(ratio, 12) - 1) * 100;
          break;
        }

        default:
          apr = (absInterest / absPrincipal) * 12 * 100;
      }

      if (apr !== null && !isNaN(apr)) {
        const roundedAPR = Math.round(apr * 100) / 100;
        updateConfig(accountId, { apr: String(roundedAPR) });
      }
    } catch (error) {
      console.error('Failed to calculate APR:', error);
    }
  };

  const executeConversion = async () => {
    setConverting(true);
    setProgress(0);
    let successCount = 0;
    let failedCount = 0;

    const selected = Array.from(selectedAccounts);
    const total = selected.length;

    for (let i = 0; i < selected.length; i++) {
      const accountId = selected[i];
      const config = accountConfigs.get(accountId);

      if (!config) {
        failedCount++;
        continue;
      }

      try {
        await send('account-convert-to-debt', {
          id: accountId,
          debtType: config.debtType,
          apr: parseFloat(config.apr),
          interestScheme: config.interestScheme,
          compoundingFrequency: config.compoundingFrequency,
          interestPostingDay: config.interestPostingDay
            ? parseInt(config.interestPostingDay, 10)
            : null,
          categorizeUncategorized: config.categorizeUncategorized,
          uncategorizedCategory: config.uncategorizedCategory || undefined,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to convert account ${accountId}:`, error);
        failedCount++;
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResults({ success: successCount, failed: failedCount });
    setConverting(false);
  };

  const getCategoryOptions = (): Array<[string, string]> => {
    const options: Array<[string, string]> = [['', t('Select category...')]];

    categoryGroups.forEach(group => {
      if (group.categories) {
        group.categories.forEach(cat => {
          options.push([cat.id, `${group.name}: ${cat.name}`]);
        });
      }
    });

    return options;
  };

  const renderStep1 = () => (
    <View style={{ gap: 15 }}>
      <Text>
        <Trans>
          We found {candidates.length} accounts that might be debt accounts.
          Select the accounts you want to convert:
        </Trans>
      </Text>

      {loading ? (
        <Text style={{ textAlign: 'center', padding: 20 }}>
          <Trans>Analyzing accounts...</Trans>
        </Text>
      ) : candidates.length === 0 ? (
        <View
          style={{
            padding: 30,
            textAlign: 'center',
            backgroundColor: theme.tableBackground,
            borderRadius: 4,
          }}
        >
          <Text>
            <Trans>
              No potential debt accounts found. All accounts appear to be assets
              or are already marked as debt.
            </Trans>
          </Text>
        </View>
      ) : (
        <View style={{ maxHeight: 400, overflow: 'auto' }}>
          <View
            style={{
              backgroundColor: theme.tableBackground,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                padding: '8px 10px',
                borderBottom: `1px solid ${theme.tableBorder}`,
                fontWeight: 600,
                fontSize: '0.9em',
              }}
            >
              <View style={{ width: 40 }} />
              <View style={{ flex: 1 }}>
                <Trans>Account</Trans>
              </View>
              <View style={{ width: 120 }}>
                <Trans>Balance</Trans>
              </View>
              <View style={{ width: 100 }}>
                <Trans>Confidence</Trans>
              </View>
              <View style={{ width: 150 }}>
                <Trans>Type</Trans>
              </View>
            </View>

            {/* Rows */}
            {candidates.map(candidate => (
              <View
                key={candidate.accountId}
                style={{
                  flexDirection: 'row',
                  padding: '10px',
                  cursor: 'pointer',
                  backgroundColor: selectedAccounts.has(candidate.accountId)
                    ? theme.tableRowBackgroundHover
                    : theme.tableBackground,
                  borderBottom: `1px solid ${theme.tableBorder}`,
                  ':hover': {
                    backgroundColor: theme.tableRowBackgroundHover,
                  },
                }}
                onClick={() => toggleAccountSelection(candidate.accountId)}
              >
                <View
                  style={{
                    width: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Checkbox
                    checked={selectedAccounts.has(candidate.accountId)}
                    onChange={() => toggleAccountSelection(candidate.accountId)}
                  />
                </View>
                <View style={{ flex: 1 }}>{candidate.accountName}</View>
                <View style={{ width: 120 }}>
                  {format(candidate.balance, 'financial')}
                </View>
                <View style={{ width: 100 }}>
                  <View
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: '0.85em',
                      backgroundColor:
                        candidate.confidence === 'high'
                          ? theme.noticeBackgroundLight
                          : theme.pageTextLight,
                      color:
                        candidate.confidence === 'high'
                          ? theme.noticeText
                          : theme.pageText,
                    }}
                  >
                    {candidate.confidence}
                  </View>
                </View>
                <View style={{ width: 150 }}>
                  {candidate.suggestedDebtType.replace('_', ' ')}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={{ fontSize: '0.85em', color: theme.pageTextLight }}>
        <Trans>
          💡 High confidence accounts are automatically selected. Review and
          adjust selections before proceeding.
        </Trans>
      </Text>
    </View>
  );

  const renderStep2 = () => {
    const selectedCandidates = candidates.filter(c =>
      selectedAccounts.has(c.accountId),
    );

    return (
      <View style={{ gap: 15 }}>
        <Text>
          <Trans>
            Configure debt settings for each account. Default values are
            provided based on detection.
          </Trans>
        </Text>

        <View style={{ maxHeight: 500, overflow: 'auto', gap: 20 }}>
          {selectedCandidates.map(candidate => {
            const config = accountConfigs.get(candidate.accountId);
            if (!config) return null;

            return (
              <View
                key={candidate.accountId}
                style={{
                  padding: 15,
                  backgroundColor: theme.tableBackground,
                  borderRadius: 4,
                  gap: 10,
                }}
              >
                <Text style={{ fontWeight: 600, marginBottom: 10 }}>
                  {candidate.accountName}
                </Text>

                <InlineField label={t('Debt Type')} width="100%">
                  <Select
                    value={config.debtType}
                    onChange={(value: string) =>
                      updateConfig(candidate.accountId, { debtType: value })
                    }
                    options={[
                      ['credit_card', t('Credit Card')],
                      ['auto_loan', t('Auto Loan')],
                      ['student_loan', t('Student Loan')],
                      ['mortgage', t('Mortgage')],
                      ['personal_loan', t('Personal Loan')],
                      ['line_of_credit', t('Line of Credit')],
                    ]}
                  />
                </InlineField>

                <InlineField label={t('APR (%)')} width="100%">
                  <Input
                    value={config.apr}
                    onChangeValue={(value: string) =>
                      updateConfig(candidate.accountId, { apr: value })
                    }
                    placeholder={t("e.g., 18.5 (use your bank's quoted rate)")}
                  />
                </InlineField>

                {/* APR Calculator Toggle */}
                <View style={{ marginTop: 5 }}>
                  <Button
                    type="button"
                    style={{ alignSelf: 'flex-start' }}
                    onPress={() =>
                      updateConfig(candidate.accountId, {
                        showCalculator: !config.showCalculator,
                      })
                    }
                  >
                    {config.showCalculator ? (
                      <Text style={{ color: theme.pageTextSubdued }}>
                        {t('Hide APR Calculator')} ▼
                      </Text>
                    ) : (
                      <Text style={{ color: theme.pageTextSubdued }}>
                        {t("Don't know your APR? Calculate it")} ▶
                      </Text>
                    )}
                  </Button>
                </View>

                {/* APR Calculator Panel */}
                {config.showCalculator && (
                  <View
                    style={{
                      padding: 12,
                      backgroundColor: theme.tableRowHeaderBackground,
                      borderRadius: 4,
                      gap: 10,
                      marginTop: 5,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: theme.pageTextSubdued,
                      }}
                    >
                      {t('Calculate APR from Statement')}
                    </Text>
                    <View
                      style={{
                        padding: 8,
                        backgroundColor: theme.warningBackground,
                        borderRadius: 4,
                        borderLeft: `3px solid ${theme.warningBorder}`,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.warningText,
                          fontWeight: 500,
                        }}
                      >
                        {t('⚠️ This is an approximation')}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: theme.warningText,
                          marginTop: 4,
                        }}
                      >
                        {t(
                          'Banks use complex methods (amortization, daily balance, grace periods) that this calculator cannot replicate. If your bank provides a quoted APR, use that instead. This tool is only for when APR is unknown.',
                        )}
                      </Text>
                    </View>

                    <InlineField
                      label={t('Interest Charged')}
                      labelWidth={110}
                      width="100%"
                    >
                      <Input
                        value={config.calculatorInterest}
                        onChangeValue={(value: string) => {
                          updateConfig(candidate.accountId, {
                            calculatorInterest: value,
                          });
                          // Auto-calculate when both fields are filled
                          if (value && config.calculatorBalance) {
                            calculateAndSetAPR(
                              candidate.accountId,
                              value,
                              config.calculatorBalance,
                              config.interestScheme,
                            );
                          }
                        }}
                        placeholder={t('e.g., 45.32')}
                      />
                    </InlineField>

                    <InlineField
                      label={t('Balance')}
                      labelWidth={110}
                      width="100%"
                    >
                      <Input
                        value={config.calculatorBalance}
                        onChangeValue={(value: string) => {
                          updateConfig(candidate.accountId, {
                            calculatorBalance: value,
                          });
                          // Auto-calculate when both fields are filled
                          if (value && config.calculatorInterest) {
                            calculateAndSetAPR(
                              candidate.accountId,
                              config.calculatorInterest,
                              value,
                              config.interestScheme,
                            );
                          }
                        }}
                        placeholder={t('e.g., 2500.00')}
                      />
                    </InlineField>

                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.pageTextSubdued,
                        fontStyle: 'italic',
                      }}
                    >
                      {t(
                        "Calculated APR may differ from your quoted rate due to amortization, fees, or daily balance methods. When in doubt, use your bank's quoted APR above.",
                      )}
                    </Text>
                  </View>
                )}

                <InlineField label={t('Interest Calculation')} width="100%">
                  <Select
                    value={config.interestScheme}
                    onChange={(value: string) => {
                      updateConfig(candidate.accountId, {
                        interestScheme: value,
                      });
                      // Recalculate APR if calculator is active
                      if (
                        config.calculatorInterest &&
                        config.calculatorBalance
                      ) {
                        calculateAndSetAPR(
                          candidate.accountId,
                          config.calculatorInterest,
                          config.calculatorBalance,
                          value,
                        );
                      }
                    }}
                    options={[
                      ['simple', t('Simple Interest')],
                      ['compound_monthly', t('Compound Monthly')],
                      ['compound_daily', t('Compound Daily')],
                      ['compound_annually', t('Compound Annually')],
                    ]}
                  />
                </InlineField>

                <InlineField label={t('Compounding Frequency')} width="100%">
                  <Select
                    value={config.compoundingFrequency}
                    onChange={(value: string) =>
                      updateConfig(candidate.accountId, {
                        compoundingFrequency: value,
                      })
                    }
                    options={[
                      ['daily', t('Daily')],
                      ['monthly', t('Monthly')],
                      ['quarterly', t('Quarterly')],
                      ['annually', t('Annually')],
                    ]}
                  />
                </InlineField>

                <InlineField label={t('Interest Posting Day')} width="100%">
                  <Input
                    value={config.interestPostingDay}
                    onChangeValue={(value: string) =>
                      updateConfig(candidate.accountId, {
                        interestPostingDay: value,
                      })
                    }
                    placeholder={t('1-31, or blank for last day of month')}
                  />
                </InlineField>

                <View style={{ marginTop: 10 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Checkbox
                      id={`categorize-${candidate.accountId}`}
                      checked={config.categorizeUncategorized}
                      onChange={() =>
                        updateConfig(candidate.accountId, {
                          categorizeUncategorized:
                            !config.categorizeUncategorized,
                        })
                      }
                    />
                    <label htmlFor={`categorize-${candidate.accountId}`}>
                      <Trans>Categorize uncategorized transactions</Trans>
                    </label>
                  </View>

                  {config.categorizeUncategorized && (
                    <InlineField
                      label={t('Category')}
                      width="100%"
                      style={{ marginTop: 10 }}
                    >
                      <Select
                        value={config.uncategorizedCategory}
                        onChange={(value: string) =>
                          updateConfig(candidate.accountId, {
                            uncategorizedCategory: value,
                          })
                        }
                        options={getCategoryOptions()}
                      />
                    </InlineField>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderStep3 = () => {
    const selectedCandidates = candidates.filter(c =>
      selectedAccounts.has(c.accountId),
    );

    const totalOffBudgetMoving = selectedCandidates.filter(
      c => c.currentlyOffBudget,
    ).length;

    const totalDebtAmount = selectedCandidates.reduce(
      (sum, c) => sum + c.balance,
      0,
    );

    return (
      <View style={{ gap: 20 }}>
        <Text style={{ fontWeight: 600, fontSize: '1.1em' }}>
          <Trans>Preview Budget Impact</Trans>
        </Text>

        <View
          style={{
            padding: 20,
            backgroundColor: theme.tableBackground,
            borderRadius: 4,
            gap: 15,
          }}
        >
          <SpaceBetween>
            <Text>
              <Trans>Accounts to convert:</Trans>
            </Text>
            <Text style={{ fontWeight: 600 }}>{selectedCandidates.length}</Text>
          </SpaceBetween>

          <SpaceBetween>
            <Text>
              <Trans>Currently off-budget:</Trans>
            </Text>
            <Text style={{ fontWeight: 600 }}>{totalOffBudgetMoving}</Text>
          </SpaceBetween>

          <SpaceBetween>
            <Text>
              <Trans>Total debt amount:</Trans>
            </Text>
            <Text
              style={{
                fontWeight: 600,
                color: theme.errorText,
              }}
            >
              {format(totalDebtAmount, 'financial')}
            </Text>
          </SpaceBetween>
        </View>

        {totalOffBudgetMoving > 0 && (
          <View
            style={{
              padding: 15,
              backgroundColor: theme.warningBackground,
              borderRadius: 4,
              border: `1px solid ${theme.warningBorder}`,
            }}
          >
            <Text style={{ fontWeight: 600, marginBottom: 8 }}>
              ⚠️ <Trans>Important Budget Changes</Trans>
            </Text>
            <Text>
              <Trans>
                {totalOffBudgetMoving} account(s) will move from off-budget to
                on-budget. This will affect your budget categories and available
                cash. Make sure you have enough budget allocated to cover these
                debts.
              </Trans>
            </Text>
          </View>
        )}

        <View
          style={{
            padding: 15,
            backgroundColor: theme.noticeBackgroundLight,
            borderRadius: 4,
          }}
        >
          <Text style={{ fontWeight: 600, marginBottom: 8 }}>
            💡 <Trans>What happens next:</Trans>
          </Text>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <Trans>Accounts will be marked as debt and moved on-budget</Trans>
            </li>
            <li>
              <Trans>
                "Debt Payments" category group will be created with Principal
                and Interest categories
              </Trans>
            </li>
            <li>
              <Trans>
                Interest will be calculated based on your APR settings
              </Trans>
            </li>
            <li>
              <Trans>
                Uncategorized transactions will be categorized (if selected)
              </Trans>
            </li>
          </ul>
        </View>
      </View>
    );
  };

  const renderStep4 = () => {
    if (converting) {
      return (
        <View style={{ gap: 20, textAlign: 'center', padding: 40 }}>
          <Text style={{ fontSize: '1.1em', fontWeight: 600 }}>
            <Trans>Converting Accounts...</Trans>
          </Text>

          <View
            style={{
              width: '100%',
              height: 30,
              backgroundColor: theme.tableBackground,
              borderRadius: 15,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${progress}%`,
                backgroundColor: theme.noticeBackground,
                transition: 'width 0.3s ease',
              }}
            />
            <Text
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontWeight: 600,
              }}
            >
              {progress}%
            </Text>
          </View>

          <Text style={{ color: theme.pageTextLight }}>
            <Trans>Please wait while we convert your accounts...</Trans>
          </Text>
        </View>
      );
    }

    return (
      <View style={{ gap: 20, textAlign: 'center', padding: 40 }}>
        <Text style={{ fontSize: '1.5em' }}>
          {results.failed === 0 ? '✅' : '⚠️'}
        </Text>

        <Text style={{ fontSize: '1.2em', fontWeight: 600 }}>
          {results.failed === 0 ? (
            <Trans>Conversion Complete!</Trans>
          ) : (
            <Trans>Conversion Completed with Issues</Trans>
          )}
        </Text>

        <View
          style={{
            padding: 20,
            backgroundColor: theme.tableBackground,
            borderRadius: 4,
            gap: 10,
          }}
        >
          <SpaceBetween>
            <Text>
              <Trans>Successfully converted:</Trans>
            </Text>
            <Text style={{ fontWeight: 600, color: theme.noticeText }}>
              {results.success}
            </Text>
          </SpaceBetween>

          {results.failed > 0 && (
            <SpaceBetween>
              <Text>
                <Trans>Failed:</Trans>
              </Text>
              <Text style={{ fontWeight: 600, color: theme.errorText }}>
                {results.failed}
              </Text>
            </SpaceBetween>
          )}
        </View>

        <Text style={{ color: theme.pageTextLight }}>
          <Trans>
            Your debt accounts are now set up and will track interest
            automatically.
          </Trans>
        </Text>
      </View>
    );
  };

  const canProceed = () => {
    if (step === 1) {
      return selectedAccounts.size > 0;
    }
    if (step === 2) {
      // Check that all selected accounts have required config
      return Array.from(selectedAccounts).every(accountId => {
        const config = accountConfigs.get(accountId);
        return config && config.apr && parseFloat(config.apr) > 0;
      });
    }
    return true;
  };

  const handleNext = () => {
    if (step === 3) {
      executeConversion();
    }
    setStep((step + 1) as ConversionStep);
  };

  const handleBack = () => {
    setStep((step - 1) as ConversionStep);
  };

  const handleClose = () => {
    dispatch(closeModal());
  };

  return (
    <Modal name="convert-to-debt" containerProps={{ style: { width: 800 } }}>
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={t('Convert to Debt Accounts')}
                getStyle={() => ({ fontSize: 20 })}
              />
            }
            rightContent={<ModalCloseButton onPress={close} />}
          />

          <View style={{ padding: 20, gap: 20 }}>
            {/* Step indicator */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              {[1, 2, 3, 4].map(s => (
                <View
                  key={s}
                  style={{
                    flex: 1,
                    height: 4,
                    backgroundColor:
                      s <= step
                        ? theme.noticeBackground
                        : theme.tableBackground,
                    borderRadius: 2,
                  }}
                />
              ))}
            </View>

            <Text
              style={{
                fontSize: '0.9em',
                color: theme.pageTextLight,
                marginBottom: 10,
              }}
            >
              <Trans>
                Step {step} of 4:
                {step === 1 && ' Select Accounts'}
                {step === 2 && ' Configure Settings'}
                {step === 3 && ' Review Changes'}
                {step === 4 && ' Complete'}
              </Trans>
            </Text>

            {/* Step content */}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </View>

          <ModalButtons>
            {step > 1 && step < 4 && !converting && (
              <Button onPress={handleBack}>
                <Trans>Back</Trans>
              </Button>
            )}

            {step < 4 && (
              <Button
                variant="primary"
                onPress={handleNext}
                isDisabled={!canProceed() || loading}
                style={{ marginLeft: step > 1 ? 10 : 0 }}
              >
                {step === 3 ? <Trans>Convert</Trans> : <Trans>Next</Trans>}
              </Button>
            )}

            {step === 4 && !converting && (
              <Button variant="primary" onPress={handleClose}>
                <Trans>Done</Trans>
              </Button>
            )}
          </ModalButtons>
        </>
      )}
    </Modal>
  );
}
