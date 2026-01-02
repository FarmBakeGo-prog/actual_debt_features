import { type DebtType } from '../../types/models';
import * as db from '../db';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DebtCandidate = {
  accountId: string;
  accountName: string;
  balance: number;
  currentlyOffBudget: boolean;
  confidence: ConfidenceLevel;
  score: number;
  reasons: string[];
  suggestedDebtType: DebtType;
  detectedAPR?: number;
};

type PaymentPattern = {
  accountId: string;
  averagePayment: number;
  paymentFrequency: 'monthly' | 'biweekly' | 'irregular';
  consistency: number; // 0-1, how consistent amounts are
  paymentCount: number;
};

/**
 * Detect potential debt accounts based on account characteristics and transaction patterns.
 * This is a pure read-only scoring function with no side effects.
 *
 * Scoring criteria:
 * - REQUIRED: Negative account balance (positive = asset, skip entirely)
 * - High confidence (auto-suggest):
 *   - Off-budget + negative balance + debt keywords in name
 *   - Transaction history shows interest charges
 *   - Account type is credit or loan
 * - Medium confidence (show but don't auto-check):
 *   - On-budget + negative balance + regular payment patterns
 *   - Category names suggest debt
 * - Low confidence (hide):
 *   - Positive balance
 *   - Off-budget without debt keywords
 */
export async function detectDebtAccounts(): Promise<DebtCandidate[]> {
  const candidates: DebtCandidate[] = [];

  // Get all non-debt, non-closed accounts
  const accounts = await db.all<db.DbAccount>(
    'SELECT * FROM accounts WHERE is_debt = 0 AND closed = 0 AND tombstone = 0',
  );

  for (const account of accounts) {
    // REQUIRED: Account must have negative balance
    const balance = await getAccountBalance(account.id);
    if (balance >= 0) {
      continue; // Skip positive balances (assets)
    }

    let score = 0;
    const reasons: string[] = [];

    // Score based on balance magnitude
    if (balance < -100000) {
      // < -$1,000
      score += 30;
      reasons.push(`Significant negative balance: ${formatCurrency(balance)}`);
    } else if (balance < -10000) {
      // < -$100
      score += 15;
      reasons.push(`Negative balance: ${formatCurrency(balance)}`);
    }

    // Check account name for debt keywords
    const debtKeywords = [
      'credit card',
      'visa',
      'mastercard',
      'discover',
      'amex',
      'american express',
      'loan',
      'mortgage',
      'student',
      'auto',
      'car payment',
      'debt',
      'line of credit',
      'loc',
      'heloc',
    ];

    const nameLower = account.name.toLowerCase();
    const hasDebtKeyword = debtKeywords.some(keyword =>
      nameLower.includes(keyword),
    );

    if (hasDebtKeyword) {
      score += 25;
      reasons.push(`Account name suggests debt: "${account.name}"`);
    }

    // Off-budget accounts with debt keywords are highly likely to be debt
    if (account.offbudget === 1) {
      score += 10;
      reasons.push('Currently off-budget');

      if (hasDebtKeyword) {
        score += 15; // Bonus for off-budget + debt keywords
        reasons.push('Off-budget account with debt-related name');
      }
    }

    // Analyze payment patterns
    const pattern = await analyzePaymentPatterns(account.id);
    if (pattern.paymentCount >= 3) {
      if (pattern.paymentFrequency === 'monthly' && pattern.consistency > 0.8) {
        score += 20;
        reasons.push(
          `Regular monthly payments (~${formatCurrency(pattern.averagePayment)})`,
        );
      } else if (
        pattern.paymentFrequency === 'monthly' &&
        pattern.consistency > 0.6
      ) {
        score += 10;
        reasons.push(`Semi-regular payments (${pattern.paymentCount} found)`);
      }
    }

    // Check for interest-related transactions
    const interestInfo = await detectInterestTransactions(account.id);
    if (interestInfo.hasInterest) {
      score += 25;
      reasons.push(
        `Interest charges detected (${interestInfo.count} transactions)`,
      );

      if (interestInfo.estimatedAPR) {
        reasons.push(`Estimated APR: ${interestInfo.estimatedAPR.toFixed(2)}%`);
      }
    }

    // Check for debt-related categories
    const hasDebtCategory = await checkDebtCategories(account.id);
    if (hasDebtCategory) {
      score += 15;
      reasons.push('Transactions categorized to debt-related categories');
    }

    // Determine suggested debt type based on name and characteristics
    const suggestedType = suggestDebtType(account.name, balance, pattern);

    // Determine confidence level
    const confidence: ConfidenceLevel =
      score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';

    // Only include if score is reasonable (>= 40)
    if (score >= 40) {
      candidates.push({
        accountId: account.id,
        accountName: account.name,
        balance,
        currentlyOffBudget: account.offbudget === 1,
        confidence,
        score,
        reasons,
        suggestedDebtType: suggestedType,
        detectedAPR: interestInfo.estimatedAPR,
      });
    }
  }

  // Sort by score (highest first)
  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Get the current balance for an account
 */
async function getAccountBalance(accountId: string): Promise<number> {
  const result = await db.first<{ balance: number }>(
    'SELECT SUM(amount) as balance FROM transactions WHERE acct = ? AND tombstone = 0',
    [accountId],
  );
  return result?.balance || 0;
}

/**
 * Analyze payment patterns to detect regular debt payments
 */
async function analyzePaymentPatterns(
  accountId: string,
): Promise<PaymentPattern> {
  // Get positive transactions (payments) from the last 12 months
  const payments = await db.all<{ date: string; amount: number }>(
    `SELECT date, amount FROM transactions 
     WHERE acct = ? AND amount > 0 AND tombstone = 0
     ORDER BY date DESC LIMIT 12`,
    [accountId],
  );

  if (payments.length < 2) {
    return {
      accountId,
      averagePayment: 0,
      paymentFrequency: 'irregular',
      consistency: 0,
      paymentCount: payments.length,
    };
  }

  // Calculate day gaps between payments
  const gaps: number[] = [];
  for (let i = 0; i < payments.length - 1; i++) {
    const days = daysBetween(payments[i].date, payments[i + 1].date);
    gaps.push(days);
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const frequency =
    avgGap < 18 ? 'biweekly' : avgGap < 35 ? 'monthly' : 'irregular';

  // Calculate amount consistency (coefficient of variation)
  const amounts = payments.map(p => p.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance =
    amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) /
    amounts.length;
  const stdDev = Math.sqrt(variance);
  const consistency = avgAmount > 0 ? 1 - Math.min(stdDev / avgAmount, 1) : 0;

  return {
    accountId,
    averagePayment: avgAmount,
    paymentFrequency: frequency,
    consistency,
    paymentCount: payments.length,
  };
}

/**
 * Detect interest-related transactions and estimate APR
 */
async function detectInterestTransactions(accountId: string): Promise<{
  hasInterest: boolean;
  count: number;
  estimatedAPR?: number;
}> {
  // Look for transactions with interest-related keywords in notes or payee names
  const interestKeywords = [
    'interest',
    'finance charge',
    'apr',
    'interest charge',
    'monthly interest',
  ];

  const interestTransactions = await db.all<{
    amount: number;
    date: string;
  }>(
    `SELECT t.amount, t.date 
     FROM transactions t
     LEFT JOIN payees p ON t.payee = p.id
     WHERE t.acct = ? AND t.tombstone = 0 AND t.amount < 0
     AND (
       ${interestKeywords.map(_ => 'LOWER(p.name) LIKE ?').join(' OR ')}
       OR ${interestKeywords.map(_ => 'LOWER(t.notes) LIKE ?').join(' OR ')}
     )
     ORDER BY t.date DESC
     LIMIT 12`,
    [
      accountId,
      ...interestKeywords.map(k => `%${k}%`),
      ...interestKeywords.map(k => `%${k}%`),
    ],
  );

  if (interestTransactions.length === 0) {
    return { hasInterest: false, count: 0 };
  }

  // Estimate APR based on average monthly interest and balance
  let estimatedAPR: number | undefined;
  if (interestTransactions.length >= 3) {
    const avgMonthlyInterest =
      Math.abs(
        interestTransactions.reduce((sum, t) => sum + t.amount, 0) /
          interestTransactions.length,
      ) / 100; // Convert from cents to dollars

    const balance = Math.abs((await getAccountBalance(accountId)) / 100);

    if (balance > 0 && avgMonthlyInterest > 0) {
      const monthlyRate = avgMonthlyInterest / balance;
      estimatedAPR = monthlyRate * 12 * 100; // Convert to annual percentage

      // Cap at reasonable range (0.1% to 50%)
      if (estimatedAPR >= 0.1 && estimatedAPR <= 50) {
        // Round to 2 decimals
        estimatedAPR = Math.round(estimatedAPR * 100) / 100;
      } else {
        estimatedAPR = undefined; // Unrealistic value, ignore
      }
    }
  }

  return {
    hasInterest: true,
    count: interestTransactions.length,
    estimatedAPR,
  };
}

/**
 * Check if transactions are categorized to debt-related categories
 */
async function checkDebtCategories(accountId: string): Promise<boolean> {
  const debtCategoryKeywords = [
    'debt',
    'loan',
    'mortgage',
    'credit card',
    'interest',
  ];

  const result = await db.first<{ count: number }>(
    `SELECT COUNT(DISTINCT t.id) as count
     FROM transactions t
     JOIN categories c ON t.category = c.id
     WHERE t.acct = ? AND t.tombstone = 0 AND c.tombstone = 0
     AND (
       ${debtCategoryKeywords.map(_ => 'LOWER(c.name) LIKE ?').join(' OR ')}
     )
     LIMIT 1`,
    [accountId, ...debtCategoryKeywords.map(k => `%${k}%`)],
  );

  return (result?.count || 0) > 0;
}

/**
 * Suggest a debt type based on account characteristics
 */
function suggestDebtType(
  accountName: string,
  balance: number,
  pattern: PaymentPattern,
): DebtType {
  const nameLower = accountName.toLowerCase();

  // Credit cards
  if (
    nameLower.includes('credit card') ||
    nameLower.includes('visa') ||
    nameLower.includes('mastercard') ||
    nameLower.includes('discover') ||
    nameLower.includes('amex') ||
    nameLower.includes('american express')
  ) {
    return 'credit_card';
  }

  // Mortgages (large balances)
  if (
    nameLower.includes('mortgage') ||
    nameLower.includes('home loan') ||
    (balance < -10000000 && pattern.paymentFrequency === 'monthly')
  ) {
    // < -$100k
    return 'mortgage';
  }

  // Auto loans
  if (
    nameLower.includes('auto') ||
    nameLower.includes('car') ||
    nameLower.includes('vehicle')
  ) {
    return 'auto_loan';
  }

  // Student loans
  if (
    nameLower.includes('student') ||
    nameLower.includes('education') ||
    nameLower.includes('tuition')
  ) {
    return 'student_loan';
  }

  // Line of credit
  if (
    nameLower.includes('line of credit') ||
    nameLower.includes('loc') ||
    nameLower.includes('heloc')
  ) {
    return 'line_of_credit';
  }

  // Default to personal loan
  return 'personal_loan';
}

/**
 * Calculate days between two date strings (YYYY-MM-DD format)
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d1.getTime() - d2.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format currency for display (converts from cents)
 */
function formatCurrency(amountInCents: number): string {
  const dollars = Math.abs(amountInCents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}
