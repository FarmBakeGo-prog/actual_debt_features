import { describe, it, expect } from 'vitest';

import {
  calculateInterest,
  calculateAPRFromInterest,
  getNextInterestDate,
} from './interest-automation';

describe('Interest Automation', () => {
  describe('calculateInterest', () => {
    describe('simple interest', () => {
      it('should calculate simple monthly interest correctly', () => {
        const balance = -250000; // $2,500 debt
        const apr = 18.5;
        const scheme = 'simple';

        // Expected: 2500 * 0.185 / 12 = 38.54 per month
        const interest = calculateInterest(balance, apr, scheme, 'monthly');
        expect(interest).toBe(3854); // 38.54 in cents
      });

      it('should return 0 for zero balance', () => {
        const interest = calculateInterest(0, 18.5, 'simple', 'monthly');
        expect(interest).toBe(0);
      });

      it('should return 0 for zero APR', () => {
        const interest = calculateInterest(-250000, 0, 'simple', 'monthly');
        expect(interest).toBe(0);
      });

      it('should handle positive balance (savings) correctly', () => {
        const balance = 250000; // $2,500 positive
        const apr = 2.5;
        const scheme = 'simple';

        // Expected: 2500 * 0.025 / 12 = 5.21 per month
        const interest = calculateInterest(balance, apr, scheme, 'monthly');
        expect(interest).toBe(521); // 5.21 in cents
      });
    });

    describe('compound monthly interest', () => {
      it('should calculate compound monthly interest correctly', () => {
        const balance = -250000; // $2,500 debt
        const apr = 18.0;
        const scheme = 'compound_monthly';

        // Expected: 2500 * (0.18 / 12) = 37.50 per month
        const interest = calculateInterest(balance, apr, scheme, 'monthly');
        expect(interest).toBe(3750); // 37.50 in cents
      });

      it('should match simple interest for monthly compounding', () => {
        const balance = -100000;
        const apr = 12.0;

        const simpleInterest = calculateInterest(
          balance,
          apr,
          'simple',
          'monthly',
        );
        const compoundInterest = calculateInterest(
          balance,
          apr,
          'compound_monthly',
          'monthly',
        );

        expect(simpleInterest).toBe(compoundInterest);
      });
    });

    describe('compound daily interest', () => {
      it('should calculate compound daily interest correctly', () => {
        const balance = -250000; // $2,500 debt
        const apr = 18.0;
        const scheme = 'compound_daily';

        // Daily rate: 0.18 / 365 = 0.000493151
        // For 30 days: 2500 * (1.000493151)^30 - 2500 ≈ 37.73
        const interest = calculateInterest(balance, apr, scheme, 'daily');
        expect(interest).toBeGreaterThan(3700); // > $37.00
        expect(interest).toBeLessThan(3800); // < $38.00
      });

      it('should calculate differently than simple interest', () => {
        const balance = -100000;
        const apr = 15.0;

        const simpleInterest = calculateInterest(
          balance,
          apr,
          'simple',
          'daily',
        );
        const dailyInterest = calculateInterest(
          balance,
          apr,
          'compound_daily',
          'daily',
        );

        // Daily compounding calculation produces slightly different result
        expect(dailyInterest).not.toBe(simpleInterest);
        expect(dailyInterest).toBeGreaterThan(0);
      });
    });

    describe('compound annually interest', () => {
      it('should calculate compound annually interest correctly', () => {
        const balance = -250000; // $2,500 debt
        const apr = 18.0;
        const scheme = 'compound_annually';

        // (1 + 0.18)^(1/12) - 1 = 0.0139 per month
        // 2500 * 0.0139 ≈ 34.75
        const interest = calculateInterest(balance, apr, scheme, 'annually');
        expect(interest).toBeGreaterThan(3400); // > $34.00
        expect(interest).toBeLessThan(3500); // < $35.00
      });

      it('should be lower than simple interest due to annual compounding', () => {
        const balance = -100000;
        const apr = 12.0;

        const simpleInterest = calculateInterest(
          balance,
          apr,
          'simple',
          'annually',
        );
        const annualInterest = calculateInterest(
          balance,
          apr,
          'compound_annually',
          'annually',
        );

        expect(annualInterest).toBeLessThan(simpleInterest);
      });
    });

    describe('edge cases', () => {
      it('should handle very small balances', () => {
        const interest = calculateInterest(-100, 18.5, 'simple', 'monthly');
        expect(interest).toBeGreaterThanOrEqual(0);
      });

      it('should handle very high APR', () => {
        const interest = calculateInterest(-100000, 99.9, 'simple', 'monthly');
        expect(interest).toBeGreaterThan(8000); // > $80
      });

      it('should use simple interest as default for unknown scheme', () => {
        const balance = -100000;
        const apr = 12.0;

        const unknownScheme = calculateInterest(
          balance,
          apr,
          'unknown_scheme',
          'monthly',
        );
        const simpleScheme = calculateInterest(
          balance,
          apr,
          'simple',
          'monthly',
        );

        expect(unknownScheme).toBe(simpleScheme);
      });
    });
  });

  describe('calculateAPRFromInterest', () => {
    describe('simple interest reverse calculation', () => {
      it('should reverse calculate APR from interest charge', () => {
        const principal = 250000; // $2,500
        const interestCharged = 3854; // $38.54
        const scheme = 'simple';

        // Expected: (38.54 / 2500) * 12 * 100 = 18.5%
        const apr = calculateAPRFromInterest(
          interestCharged,
          principal,
          scheme,
        );
        expect(apr).toBeCloseTo(18.5, 1);
      });

      it('should match forward calculation', () => {
        const balance = -250000;
        const originalAPR = 15.75;

        // Forward: calculate interest from APR
        const interest = calculateInterest(
          balance,
          originalAPR,
          'simple',
          'monthly',
        );

        // Reverse: calculate APR from interest
        const calculatedAPR = calculateAPRFromInterest(
          interest,
          Math.abs(balance),
          'simple',
        );

        expect(calculatedAPR).toBeCloseTo(originalAPR, 1);
      });
    });

    describe('compound monthly reverse calculation', () => {
      it('should reverse calculate APR from compound monthly interest', () => {
        const principal = 250000;
        const interestCharged = 3750; // $37.50
        const scheme = 'compound_monthly';

        // Expected: (37.50 / 2500) * 12 * 100 = 18.0%
        const apr = calculateAPRFromInterest(
          interestCharged,
          principal,
          scheme,
        );
        expect(apr).toBeCloseTo(18.0, 1);
      });
    });

    describe('compound daily reverse calculation', () => {
      it('should reverse calculate APR from compound daily interest', () => {
        const balance = -250000;
        const originalAPR = 18.0;

        // Forward calculation
        const interest = calculateInterest(
          balance,
          originalAPR,
          'compound_daily',
          'daily',
        );

        // Reverse calculation
        const calculatedAPR = calculateAPRFromInterest(
          interest,
          Math.abs(balance),
          'compound_daily',
        );

        expect(calculatedAPR).toBeCloseTo(originalAPR, 0);
      });
    });

    describe('compound annually reverse calculation', () => {
      it('should reverse calculate APR from compound annually interest', () => {
        const balance = -250000;
        const originalAPR = 12.0;

        // Forward calculation
        const interest = calculateInterest(
          balance,
          originalAPR,
          'compound_annually',
          'annually',
        );

        // Reverse calculation
        const calculatedAPR = calculateAPRFromInterest(
          interest,
          Math.abs(balance),
          'compound_annually',
        );

        expect(calculatedAPR).toBeCloseTo(originalAPR, 0);
      });
    });

    describe('edge cases', () => {
      it('should return null for zero principal', () => {
        const apr = calculateAPRFromInterest(1000, 0, 'simple');
        expect(apr).toBeNull();
      });

      it('should return null for zero interest', () => {
        const apr = calculateAPRFromInterest(0, 100000, 'simple');
        expect(apr).toBeNull();
      });

      it('should handle negative values (convert to positive)', () => {
        const apr = calculateAPRFromInterest(-3854, -250000, 'simple');
        expect(apr).toBeCloseTo(18.5, 1);
      });

      it('should handle extreme values gracefully', () => {
        // Very large interest charge should still calculate
        const apr = calculateAPRFromInterest(999999999, 100000, 'simple');
        expect(apr).toBeGreaterThan(0);
      });
    });
  });

  describe('getNextInterestDate', () => {
    it('should return next month with same day for specific posting day', () => {
      const currentDate = '2024-01-15';
      const postingDay = 15;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2024-02-15');
    });

    it('should return last day of next month when posting day is null', () => {
      const currentDate = '2024-01-15';
      const postingDay = null;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2024-02-29'); // 2024 is leap year
    });

    it('should handle posting day 31 in months with 30 days', () => {
      const currentDate = '2024-01-31';
      const postingDay = 31;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      // April has 30 days, so should use April 30
      expect(nextDate).toBe('2024-02-29'); // But next month is Feb (29 in leap year)
    });

    it('should handle posting day 1 (first of month)', () => {
      const currentDate = '2024-05-15';
      const postingDay = 1;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2024-06-01');
    });

    it('should handle year rollover', () => {
      const currentDate = '2024-12-15';
      const postingDay = 15;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2025-01-15');
    });

    it('should handle February in non-leap year with posting day 30', () => {
      const currentDate = '2025-01-30';
      const postingDay = 30;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2025-02-28'); // 2025 is not a leap year
    });

    it('should handle last day of month (null) in leap year', () => {
      const currentDate = '2024-01-31';
      const postingDay = null;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2024-02-29');
    });

    it('should handle last day of month (null) in non-leap year', () => {
      const currentDate = '2025-01-31';
      const postingDay = null;

      const nextDate = getNextInterestDate(postingDay, currentDate);
      expect(nextDate).toBe('2025-02-28');
    });
  });
});
