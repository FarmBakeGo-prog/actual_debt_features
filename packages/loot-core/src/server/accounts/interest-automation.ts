/**
 * Interest Automation for Debt Accounts
 *
 * This module handles automatic interest calculation and posting for debt accounts.
 * It creates scheduled transactions that calculate interest dynamically based on
 * the current balance, APR, and compounding settings.
 */

import { v4 as uuidv4 } from 'uuid';

import * as monthUtils from '../../shared/months';
import { type AccountEntity } from '../../types/models';
import * as db from '../db';

type InterestScheduleParams = {
  accountId: AccountEntity['id'];
  apr: number;
  interestScheme: string;
  compoundingFrequency: string;
  interestPostingDay: number | null;
  interestCategoryId: string;
};

/**
 * Calculate APR from known interest charge and principal balance.
 * This reverse-calculates the annual percentage rate when you know
 * how much interest was charged for a given balance.
 *
 * ⚠️ IMPORTANT LIMITATIONS:
 * This calculation assumes simple interest formulas and may NOT match your
 * bank's actual APR due to:
 * - Amortization: Loans use fixed payments with changing interest/principal splits
 * - Daily balance methods: Credit cards use average daily balance calculations
 * - Front-loaded interest: Early loan payments are mostly interest
 * - Grace periods, fees, and other bank-specific policies
 *
 * RECOMMENDATION: Use your bank's quoted APR when available. This calculator
 * is only for estimating APR when the bank doesn't disclose it.
 *
 * @param interestCharged - The actual interest amount charged (in cents)
 * @param principal - The principal balance (in cents, positive value)
 * @param interestScheme - How interest is calculated
 * @returns Calculated APR as percentage, or null if calculation fails
 */
export function calculateAPRFromInterest(
  interestCharged: number,
  principal: number,
  interestScheme: string,
): number | null {
  if (principal === 0 || interestCharged === 0) {
    return null;
  }

  // All calculations assume one month period
  const absPrincipal = Math.abs(principal);
  const absInterest = Math.abs(interestCharged);

  try {
    switch (interestScheme) {
      case 'simple': {
        // Simple interest: I = P * r * t, where t = 1/12
        // Solving for r: r = (I / P) * 12
        const rate = (absInterest / absPrincipal) * 12;
        return Math.round(rate * 100 * 100) / 100; // Round to 2 decimal places
      }

      case 'compound_monthly': {
        // Compound monthly: I = P * (r/12)
        // Solving for r: r = (I / P) * 12
        const rate = (absInterest / absPrincipal) * 12;
        return Math.round(rate * 100 * 100) / 100;
      }

      case 'compound_daily': {
        // Compound daily: A = P(1 + r/365)^30
        // I = A - P = P[(1 + r/365)^30 - 1]
        // Solving for r: r = 365 * [(1 + I/P)^(1/30) - 1]
        const ratio = 1 + absInterest / absPrincipal;
        const dailyRate = Math.pow(ratio, 1 / 30) - 1;
        const rate = dailyRate * 365;
        return Math.round(rate * 100 * 100) / 100;
      }

      case 'compound_annually': {
        // Compound annually: A = P(1 + r)^(1/12)
        // I = A - P = P[(1 + r)^(1/12) - 1]
        // Solving for r: r = (1 + I/P)^12 - 1
        const ratio = 1 + absInterest / absPrincipal;
        const rate = Math.pow(ratio, 12) - 1;
        return Math.round(rate * 100 * 100) / 100;
      }

      default:
        // Default to simple calculation
        const rate = (absInterest / absPrincipal) * 12;
        return Math.round(rate * 100 * 100) / 100;
    }
  } catch {
    // Return null if calculation fails (e.g., Math.pow domain errors)
    return null;
  }
}

/**
 * Calculate monthly interest for a debt account.
 *
 * @param balance - Current account balance (negative for debt)
 * @param apr - Annual Percentage Rate (as percentage, e.g., 18.5 for 18.5%)
 * @param interestScheme - How interest is calculated
 * @param compoundingFrequency - How often interest compounds
 * @returns Interest amount in integer cents
 */
export function calculateInterest(
  balance: number,
  apr: number,
  interestScheme: string,
  _compoundingFrequency: string,
): number {
  // Balance is negative for debt, convert to positive principal
  const principal = Math.abs(balance);

  if (principal === 0 || apr === 0) {
    return 0;
  }

  const rate = apr / 100; // Convert percentage to decimal

  switch (interestScheme) {
    case 'simple': {
      // Simple interest: I = P * r * t (t = 1 month = 1/12 year)
      return Math.round((principal * rate) / 12);
    }

    case 'compound_monthly': {
      // Compound monthly: A = P(1 + r/n)^(nt) - P
      // n = 12 (monthly), t = 1/12 (one month)
      const monthlyRate = rate / 12;
      const interest = principal * monthlyRate;
      return Math.round(interest);
    }

    case 'compound_daily': {
      // Compound daily: A = P(1 + r/365)^(days) - P
      // Approximate 30 days per month
      const dailyRate = rate / 365;
      const daysInMonth = 30;
      const amount = principal * Math.pow(1 + dailyRate, daysInMonth);
      const interest = amount - principal;
      return Math.round(interest);
    }

    case 'compound_annually': {
      // Compound annually: A = P(1 + r)^(t) - P
      // For one month, t = 1/12
      const amount = principal * Math.pow(1 + rate, 1 / 12);
      const interest = amount - principal;
      return Math.round(interest);
    }

    default:
      // Default to simple monthly
      return Math.round((principal * rate) / 12);
  }
}

/**
 * Get the next interest posting date based on the posting day preference.
 *
 * @param interestPostingDay - Day of month (1-31) or null for last day
 * @param fromDate - Starting date (defaults to current day)
 * @returns Next posting date in YYYY-MM-DD format
 */
export function getNextInterestDate(
  interestPostingDay: number | null,
  fromDate?: string,
): string {
  const current = fromDate || monthUtils.currentDay();
  const nextMonth = monthUtils.addMonths(current, 1);

  if (interestPostingDay === null) {
    // Post on last day of month
    return monthUtils.lastDayOfMonth(nextMonth);
  }

  // Post on specific day of month
  const year = parseInt(nextMonth.slice(0, 4));
  const month = parseInt(nextMonth.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();

  // If requested day doesn't exist in month (e.g., 31st in February), use last day
  const day = Math.min(interestPostingDay, lastDay);

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Create or update interest posting schedule for a debt account.
 *
 * This creates a scheduled transaction that will automatically post interest
 * charges each month. The interest amount is calculated dynamically based on
 * the current balance when the schedule executes.
 *
 * @param params - Schedule configuration parameters
 * @returns Schedule ID
 */
export async function setupInterestSchedule({
  accountId,
  apr,
  interestScheme,
  compoundingFrequency,
  interestPostingDay,
  interestCategoryId,
}: InterestScheduleParams): Promise<string> {
  // Check if schedule already exists for this account
  const existingSchedule = await db.first<{ id: string; rule: string }>(
    `SELECT s.id, s.rule FROM schedules s
     JOIN rules r ON r.id = s.rule
     JOIN rule_conditions rc ON rc.rule = r.id
     WHERE rc.field = 'acct' AND rc.value = ?
     AND r.stage IS NULL
     LIMIT 1`,
    [accountId],
  );

  if (existingSchedule) {
    // Update existing schedule
    await updateInterestSchedule({
      scheduleId: existingSchedule.id,
      ruleId: existingSchedule.rule,
      apr,
      interestScheme,
      compoundingFrequency,
      interestPostingDay,
      interestCategoryId,
    });
    return existingSchedule.id;
  }

  // Create new schedule
  const scheduleId = uuidv4();
  const ruleId = uuidv4();

  // Create a payee for interest
  const interestPayee = await db.first<{ id: string }>(
    'SELECT id FROM payees WHERE name = ? LIMIT 1',
    ['Interest Charge'],
  );

  let interestPayeeId: string;
  if (interestPayee) {
    interestPayeeId = interestPayee.id;
  } else {
    interestPayeeId = await db.insertPayee({
      name: 'Interest Charge',
    });
  }

  // Create rule with conditions and actions
  await db.insert('rules', {
    id: ruleId,
    stage: null,
  });

  // Add condition: match account
  await db.insert('rule_conditions', {
    rule: ruleId,
    field: 'acct',
    op: 'is',
    value: accountId,
  });

  // Add actions: set payee and category
  await db.insert('rule_actions', {
    rule: ruleId,
    field: 'payee',
    op: 'set',
    value: interestPayeeId,
  });

  await db.insert('rule_actions', {
    rule: ruleId,
    field: 'category',
    op: 'set',
    value: interestCategoryId,
  });

  // Store interest calculation metadata in rule_actions as JSON
  // This will be used by the schedule executor to calculate dynamic amounts
  await db.insert('rule_actions', {
    rule: ruleId,
    field: 'debt_interest_config',
    op: 'set',
    value: JSON.stringify({
      apr,
      interestScheme,
      compoundingFrequency,
    }),
  });

  // Calculate next posting date
  const nextDate = getNextInterestDate(interestPostingDay);

  // Create schedule
  await db.insert('schedules', {
    id: scheduleId,
    rule: ruleId,
    active: 1,
    completed: 0,
    posts_transaction: 1,
    name: `Interest for Account ${accountId}`,
  });

  // Set next date
  const now = Date.now();
  await db.insertWithUUID('schedules_next_date', {
    schedule_id: scheduleId,
    local_next_date: db.toDateRepr(monthUtils.dayFromDate(nextDate)),
    local_next_date_ts: now,
    base_next_date: db.toDateRepr(monthUtils.dayFromDate(nextDate)),
    base_next_date_ts: now,
  });

  return scheduleId;
}

/**
 * Update an existing interest schedule with new parameters.
 */
async function updateInterestSchedule({
  scheduleId,
  ruleId,
  apr,
  interestScheme,
  compoundingFrequency,
  interestPostingDay,
  interestCategoryId,
}: Omit<InterestScheduleParams, 'accountId'> & {
  scheduleId: string;
  ruleId: string;
}): Promise<void> {
  // Update the interest config in rule_actions
  const configAction = await db.first<{ id: string }>(
    'SELECT id FROM rule_actions WHERE rule = ? AND field = ?',
    [ruleId, 'debt_interest_config'],
  );

  if (configAction) {
    await db.update('rule_actions', {
      id: configAction.id,
      value: JSON.stringify({
        apr,
        interestScheme,
        compoundingFrequency,
      }),
    });
  }

  // Update category
  const categoryAction = await db.first<{ id: string }>(
    'SELECT id FROM rule_actions WHERE rule = ? AND field = ?',
    [ruleId, 'category'],
  );

  if (categoryAction) {
    await db.update('rule_actions', {
      id: categoryAction.id,
      value: interestCategoryId,
    });
  }

  // Update next date if needed
  const nextDate = getNextInterestDate(interestPostingDay);
  const now = Date.now();

  await db.runQuery(
    `UPDATE schedules_next_date 
     SET local_next_date = ?, local_next_date_ts = ?,
         base_next_date = ?, base_next_date_ts = ?
     WHERE schedule_id = ?`,
    [
      db.toDateRepr(monthUtils.dayFromDate(nextDate)),
      now,
      db.toDateRepr(monthUtils.dayFromDate(nextDate)),
      now,
      scheduleId,
    ],
  );
}

/**
 * Delete interest schedule for an account.
 * Called when converting away from debt or closing account.
 */
export async function deleteInterestSchedule(
  accountId: AccountEntity['id'],
): Promise<void> {
  const schedule = await db.first<{ id: string; rule: string }>(
    `SELECT s.id, s.rule FROM schedules s
     JOIN rules r ON r.id = s.rule
     JOIN rule_conditions rc ON rc.rule = r.id
     WHERE rc.field = 'acct' AND rc.value = ?
     AND r.stage IS NULL
     LIMIT 1`,
    [accountId],
  );

  if (schedule) {
    // Delete schedule and rule
    await db.delete_('schedules_next_date', schedule.id);
    await db.delete_('schedules', schedule.id);
    await db.delete_('rule_conditions', { rule: schedule.rule });
    await db.delete_('rule_actions', { rule: schedule.rule });
    await db.delete_('rules', schedule.rule);
  }
}

/**
 * Calculate and post interest for a debt account manually.
 * This can be used for one-time interest postings or testing.
 */
export async function postInterestTransaction({
  accountId,
  apr,
  interestScheme,
  compoundingFrequency,
  interestCategoryId,
  date,
}: Omit<InterestScheduleParams, 'interestPostingDay'> & {
  date?: string;
}): Promise<string> {
  // Get current balance
  const balanceResult = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND tombstone = 0',
    [accountId],
  );

  const balance = balanceResult?.balance || 0;

  // Calculate interest
  const interestAmount = calculateInterest(
    balance,
    apr,
    interestScheme,
    compoundingFrequency,
  );

  if (interestAmount === 0) {
    throw new Error('No interest to post (balance is zero or APR is zero)');
  }

  // Get or create interest payee
  const interestPayee = await db.first<{ id: string }>(
    'SELECT id FROM payees WHERE name = ? LIMIT 1',
    ['Interest Charge'],
  );

  let interestPayeeId: string;
  if (interestPayee) {
    interestPayeeId = interestPayee.id;
  } else {
    interestPayeeId = await db.insertPayee({
      name: 'Interest Charge',
    });
  }

  // Create interest transaction (negative amount = charge to debt)
  const transactionId = await db.insertTransaction({
    account: accountId,
    amount: -interestAmount, // Negative because it increases debt
    payee: interestPayeeId,
    category: interestCategoryId,
    date: date || monthUtils.currentDay(),
    cleared: true,
    notes: `Interest charge (${apr}% APR, ${interestScheme})`,
  });

  return transactionId;
}
