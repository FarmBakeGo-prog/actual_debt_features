// @ts-strict-ignore
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useTranslation, Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { toRelaxedNumber } from 'loot-core/shared/util';

import { createAccount } from '@desktop-client/accounts/accountsSlice';
import { Link } from '@desktop-client/components/common/Link';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '@desktop-client/components/common/Modal';
import { Checkbox } from '@desktop-client/components/forms';
import { validateAccountName } from '@desktop-client/components/util/accountValidation';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { closeModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

export function CreateLocalAccountModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const accounts = useAccounts();
  const [name, setName] = useState('');
  const [offbudget, setOffbudget] = useState(false);
  const [balance, setBalance] = useState('0');
  const [isDebt, setIsDebt] = useState(false);
  const [debtType, setDebtType] = useState<string>('credit_card');
  const [debtOriginalBalance, setDebtOriginalBalance] = useState('');
  const [apr, setApr] = useState('');
  const [debtMinimumPayment, setDebtMinimumPayment] = useState('');
  const [interestScheme, setInterestScheme] =
    useState<string>('compound_monthly');
  const [compoundingFrequency, setCompoundingFrequency] =
    useState<string>('monthly');
  const [interestPostingDay, setInterestPostingDay] = useState<string>('');

  const [nameError, setNameError] = useState(null);
  const [balanceError, setBalanceError] = useState(false);

  const validateBalance = balance => !isNaN(parseFloat(balance));

  const validateAndSetName = (name: string) => {
    const nameError = validateAccountName(name, '', accounts);
    if (nameError) {
      setNameError(nameError);
    } else {
      setName(name);
      setNameError(null);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nameError = validateAccountName(name, '', accounts);

    const balanceError = !validateBalance(balance);
    setBalanceError(balanceError);

    if (!nameError && !balanceError) {
      dispatch(closeModal());
      const id = await dispatch(
        createAccount({
          name,
          balance: toRelaxedNumber(balance),
          offBudget: isDebt ? false : offbudget, // Force on-budget for debt accounts
          isDebt,
          debtType: isDebt ? debtType : undefined,
          debtOriginalBalance: debtOriginalBalance
            ? toRelaxedNumber(debtOriginalBalance)
            : undefined,
          apr: apr ? parseFloat(apr) : undefined,
          debtMinimumPayment: debtMinimumPayment
            ? toRelaxedNumber(debtMinimumPayment)
            : undefined,
          interestScheme: isDebt && apr ? interestScheme : undefined,
          compoundingFrequency:
            isDebt && apr ? compoundingFrequency : undefined,
          interestPostingDay: interestPostingDay
            ? parseInt(interestPostingDay, 10)
            : undefined,
        }),
      ).unwrap();
      navigate('/accounts/' + id);
    }
  };
  return (
    <Modal name="add-local-account">
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle title={t('Create Local Account')} shrinkOnOverflow />
            }
            rightContent={<ModalCloseButton onPress={close} />}
          />
          <View>
            <Form onSubmit={onSubmit}>
              <InlineField label={t('Name')} width="100%">
                <InitialFocus>
                  <Input
                    name="name"
                    value={name}
                    onChangeValue={setName}
                    onUpdate={value => {
                      const name = value.trim();
                      validateAndSetName(name);
                    }}
                    style={{ flex: 1 }}
                  />
                </InitialFocus>
              </InlineField>
              {nameError && (
                <FormError style={{ marginLeft: 75, color: theme.warningText }}>
                  {nameError}
                </FormError>
              )}

              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
              >
                {/* LAYER 2: UI Validation - Hide off-budget when debt is selected */}
                {!isDebt && (
                  <View style={{ flexDirection: 'column' }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Checkbox
                        id="offbudget"
                        name="offbudget"
                        checked={offbudget}
                        onChange={() => setOffbudget(!offbudget)}
                      />
                      <label
                        htmlFor="offbudget"
                        style={{
                          userSelect: 'none',
                          verticalAlign: 'center',
                        }}
                      >
                        <Trans>Off budget</Trans>
                      </label>
                    </View>
                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: '0.7em',
                        color: theme.pageTextLight,
                        marginTop: 3,
                      }}
                    >
                      <Text>
                        <Trans>
                          This cannot be changed later. See{' '}
                          <Link
                            variant="external"
                            linkColor="muted"
                            to="https://actualbudget.org/docs/accounts/#off-budget-accounts"
                          >
                            Accounts Overview
                          </Link>{' '}
                          for more information.
                        </Trans>
                      </Text>
                    </div>
                  </View>
                )}
              </View>

              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  marginTop: 10,
                }}
              >
                <View style={{ flexDirection: 'column' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Checkbox
                      id="isdebt"
                      name="isdebt"
                      checked={isDebt}
                      onChange={() => setIsDebt(!isDebt)}
                    />
                    <label
                      htmlFor="isdebt"
                      style={{
                        userSelect: 'none',
                        verticalAlign: 'center',
                      }}
                    >
                      <Trans>Debt Account</Trans>
                    </label>
                  </View>
                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: '0.7em',
                      color: theme.pageTextLight,
                      marginTop: 3,
                    }}
                  >
                    <Text>
                      <Trans>
                        Track loans with interest and payment schedules
                      </Trans>
                    </Text>
                  </div>
                </View>
              </View>

              {isDebt && (
                <>
                  <InlineField label={t('Debt Type')} width="100%">
                    <Select
                      value={debtType}
                      onChange={setDebtType}
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

                  <InlineField label={t('Original Balance')} width="100%">
                    <Input
                      name="debtOriginalBalance"
                      inputMode="decimal"
                      value={debtOriginalBalance}
                      onChangeValue={setDebtOriginalBalance}
                      style={{ flex: 1 }}
                    />
                  </InlineField>

                  <InlineField label={t('APR (%)')} width="100%">
                    <Input
                      name="apr"
                      inputMode="decimal"
                      value={apr}
                      onChangeValue={setApr}
                      style={{ flex: 1 }}
                      placeholder={t('Annual Percentage Rate')}
                    />
                  </InlineField>

                  <InlineField label={t('Interest Calculation')} width="100%">
                    <Select
                      value={interestScheme}
                      onChange={setInterestScheme}
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
                      value={compoundingFrequency}
                      onChange={setCompoundingFrequency}
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
                      name="interestPostingDay"
                      inputMode="numeric"
                      value={interestPostingDay}
                      onChangeValue={setInterestPostingDay}
                      style={{ flex: 1 }}
                      placeholder={t('1-31, or blank for last day of month')}
                    />
                  </InlineField>

                  <InlineField label={t('Minimum Payment')} width="100%">
                    <Input
                      name="debtMinimumPayment"
                      inputMode="decimal"
                      value={debtMinimumPayment}
                      onChangeValue={setDebtMinimumPayment}
                      style={{ flex: 1 }}
                    />
                  </InlineField>

                  <View
                    style={{
                      fontSize: '0.8em',
                      color: theme.pageTextLight,
                      padding: 10,
                      backgroundColor: theme.tableBackground,
                      borderRadius: 4,
                      marginTop: 10,
                    }}
                  >
                    <Text>
                      <Trans>
                        💡 Debt accounts are always on-budget. Interest will be
                        calculated and posted automatically based on your APR
                        and compounding settings.
                      </Trans>
                    </Text>
                  </View>
                </>
              )}

              <InlineField label={t('Balance')} width="100%">
                <Input
                  name="balance"
                  inputMode="decimal"
                  value={balance}
                  onChangeValue={setBalance}
                  onUpdate={value => {
                    const balance = value.trim();
                    setBalance(balance);
                    if (validateBalance(balance) && balanceError) {
                      setBalanceError(false);
                    }
                  }}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {balanceError && (
                <FormError style={{ marginLeft: 75 }}>
                  <Trans>Balance must be a number</Trans>
                </FormError>
              )}

              <ModalButtons>
                <Button onPress={close}>
                  <Trans>Back</Trans>
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  style={{ marginLeft: 10 }}
                >
                  <Trans>Create</Trans>
                </Button>
              </ModalButtons>
            </Form>
          </View>
        </>
      )}
    </Modal>
  );
}
