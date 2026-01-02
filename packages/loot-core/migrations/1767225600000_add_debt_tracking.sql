ALTER TABLE accounts ADD COLUMN is_debt integer DEFAULT 0;
ALTER TABLE accounts ADD COLUMN debt_original_balance integer;
ALTER TABLE accounts ADD COLUMN debt_interest_rate real;
ALTER TABLE accounts ADD COLUMN debt_minimum_payment integer;
