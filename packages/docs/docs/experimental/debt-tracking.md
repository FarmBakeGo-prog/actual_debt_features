# Debt Tracking

:::warning Experimental Feature
This feature is experimental and under active development. The interface and functionality may change.
:::

Debt tracking provides enhanced support for managing loans and other debt accounts in Actual. This includes mortgages, auto loans, student loans, personal loans, and lines of credit.

## Overview

Traditional budgeting apps treat debt accounts like regular accounts, showing only the total balance. Debt tracking enhances this by:

- **Identifying debt account types** - Mark accounts as specific debt types (mortgage, auto loan, student loan, etc.)
- **Breaking down payments** - See how each payment splits into principal, interest, and fees
- **Tracking payoff progress** - Monitor your principal balance over time

## Enabling Debt Tracking

Debt tracking is currently enabled automatically when you create or convert an account to a debt type.

### Creating a New Debt Account

When adding a new account, you can select a debt type:

- Auto Loan
- Student Loan
- Mortgage
- Personal Loan
- Line of Credit

### Converting an Existing Account

If you have existing accounts that represent loans or debt:

1. Navigate to the account
2. Click the account menu (three dots)
3. Select **Convert to Debt Account**
4. Choose the appropriate debt type

## Transaction Breakdown

For debt accounts, each transaction can optionally include a breakdown showing:

| Column | Description |
|--------|-------------|
| **Principal** | The portion of the payment reducing the loan balance |
| **Interest** | The interest charge portion |
| **Fee** | Any fees associated with the transaction |

These columns appear automatically for debt accounts in the transaction list.

### Entering Payment Breakdowns

When entering or editing a transaction in a debt account, you can specify:

- The total transaction amount (as usual)
- The principal portion
- The interest portion
- Any fees

:::tip
Your loan statement typically shows this breakdown. Enter the values from your statement to track exactly how your payments are applied.
:::

## Bank Sync Integration

When linking a debt account via bank sync (GoCardless, SimpleFin, or PluggyAI), Actual will:

1. Detect the account type from your bank's data
2. Automatically mark it as a debt account with the appropriate type
3. Display the principal/interest/fee breakdown if provided by your bank

## Reports

Debt accounts integrate with Actual's reporting features:

- **Net Worth Report** - Debt accounts are included in your net worth calculation
- **Debt Payoff Progress** - Track your principal balance reduction over time

## Limitations

Current limitations of the experimental debt tracking feature:

- Interest calculations are not automated - you must enter the breakdown manually or rely on bank sync data
- Amortization schedules are not yet supported
- Debt payoff projections are not yet available

## Feedback

This is an experimental feature and we welcome feedback! Please report any issues or suggestions on the [Actual GitHub repository](https://github.com/actualbudget/actual/issues).
