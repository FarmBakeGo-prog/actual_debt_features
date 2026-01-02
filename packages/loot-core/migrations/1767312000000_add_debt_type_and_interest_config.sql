BEGIN TRANSACTION;

-- Add debt type field (credit_card, auto_loan, student_loan, mortgage, personal_loan, line_of_credit)
ALTER TABLE accounts ADD COLUMN debt_type TEXT;

-- Add interest rate scheme configuration fields
-- interest_scheme: 'simple', 'compound_monthly', 'compound_daily', 'compound_annually'
ALTER TABLE accounts ADD COLUMN interest_scheme TEXT DEFAULT 'compound_monthly';

-- For configurable interest posting
-- interest_posting_day: 1-31 for specific day, 0 or null for last day of month
ALTER TABLE accounts ADD COLUMN interest_posting_day INTEGER;

-- For variable/adjustable rate loans
-- apr: replaces debt_interest_rate for consistency, stored as percentage (e.g., 5.25 for 5.25%)
ALTER TABLE accounts ADD COLUMN apr REAL;

-- For compound interest calculations
-- compounding_frequency: 'daily', 'monthly', 'quarterly', 'annually'
ALTER TABLE accounts ADD COLUMN compounding_frequency TEXT DEFAULT 'monthly';

-- For tracking when rates change (variable rate loans)
ALTER TABLE accounts ADD COLUMN apr_last_updated TEXT;

COMMIT;
