import unittest

from backend.app.services.norm_confidence import (
    ConfidenceLevel,
    ConfidenceThresholds,
    MaturityLevel,
    NormEvidence,
    NormSourceType,
    classify_maturity,
    confidence_rank,
    evaluate_confidence,
    is_eligible_for_resolution,
    maturity_rank,
)

T = ConfidenceThresholds()  # дефолти: n_min=30, n_validated=150, n_high=300, cov 0.34/0.66, seasons=2


class ClassifyMaturityTests(unittest.TestCase):
    def test_below_n_min_is_seed_tier(self):
        self.assertEqual(classify_maturity(0, 0, 0.0), MaturityLevel.SEED)
        self.assertEqual(classify_maturity(T.n_min - 1, 5, 1.0), MaturityLevel.SEED)

    def test_provisional_at_n_min(self):
        self.assertEqual(classify_maturity(T.n_min, 1, 0.1), MaturityLevel.PROVISIONAL)

    def test_validated_requires_n_and_coverage(self):
        self.assertEqual(classify_maturity(T.n_validated, 1, T.coverage_min), MaturityLevel.VALIDATED)
        # достатъчно n, но тясно покритие → пада до PROVISIONAL
        self.assertEqual(
            classify_maturity(T.n_validated, 1, T.coverage_min - 0.01), MaturityLevel.PROVISIONAL
        )

    def test_mature_requires_n_seasons_and_coverage(self):
        self.assertEqual(
            classify_maturity(T.n_high, T.seasons_for_mature, T.coverage_high), MaturityLevel.MATURE
        )
        # липсва втори сезон → VALIDATED
        self.assertEqual(
            classify_maturity(T.n_high, 1, T.coverage_high), MaturityLevel.VALIDATED
        )
        # широко покритие, но малко сезони и средно n → VALIDATED
        self.assertEqual(
            classify_maturity(T.n_validated, 1, T.coverage_high), MaturityLevel.VALIDATED
        )


class EvaluateConfidenceTests(unittest.TestCase):
    def test_external_reference_is_indicative(self):
        for src in (NormSourceType.SEED, NormSourceType.HISTORICAL):
            ev = NormEvidence(source_type=src, sample_size=10_000, coverage=1.0, season_count=10)
            self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.INDICATIVE)

    def test_neutral_is_indicative(self):
        ev = NormEvidence(source_type=NormSourceType.NEUTRAL)
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.INDICATIVE)

    def test_cohort_is_low(self):
        ev = NormEvidence(source_type=NormSourceType.COHORT, sample_size=5)
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.LOW)

    def test_federation_is_medium(self):
        ev = NormEvidence(source_type=NormSourceType.FEDERATION, coverage=1.0)
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.MEDIUM)

    def test_national_mature_is_high(self):
        ev = NormEvidence(
            source_type=NormSourceType.NATIONAL,
            sample_size=T.n_high,
            coverage=T.coverage_high,
            season_count=T.seasons_for_mature,
        )
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.HIGH)

    def test_national_validated_is_medium(self):
        ev = NormEvidence(
            source_type=NormSourceType.NATIONAL,
            sample_size=T.n_validated,
            coverage=T.coverage_min,
            season_count=1,
        )
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.MEDIUM)

    def test_national_provisional_is_low(self):
        ev = NormEvidence(
            source_type=NormSourceType.NATIONAL, sample_size=T.n_min, coverage=T.coverage_min
        )
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.LOW)

    def test_national_below_n_min_is_indicative(self):
        ev = NormEvidence(source_type=NormSourceType.NATIONAL, sample_size=T.n_min - 1, coverage=1.0)
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.INDICATIVE)

    def test_coverage_cap_downgrades_high(self):
        # голяма извадка и 2 сезона, но тясно покритие → не може HIGH/MEDIUM, cap LOW
        ev = NormEvidence(
            source_type=NormSourceType.NATIONAL,
            sample_size=T.n_high,
            coverage=T.coverage_min - 0.01,
            season_count=T.seasons_for_mature,
        )
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.LOW)

    def test_thresholds_are_configurable(self):
        strict = ConfidenceThresholds(n_high=1000, coverage_high=0.9, seasons_for_mature=3)
        ev = NormEvidence(
            source_type=NormSourceType.NATIONAL,
            sample_size=300,
            coverage=0.7,
            season_count=2,
        )
        # с дефолти би било HIGH; със строги прагове — не е MATURE/HIGH
        self.assertEqual(evaluate_confidence(ev), ConfidenceLevel.HIGH)
        self.assertNotEqual(evaluate_confidence(ev, strict), ConfidenceLevel.HIGH)


class EligibilityTests(unittest.TestCase):
    def test_external_and_federation_always_eligible(self):
        for src in (NormSourceType.SEED, NormSourceType.HISTORICAL, NormSourceType.FEDERATION):
            self.assertTrue(is_eligible_for_resolution(src, MaturityLevel.SEED))

    def test_data_derived_requires_provisional(self):
        self.assertFalse(is_eligible_for_resolution(NormSourceType.NATIONAL, MaturityLevel.SEED))
        self.assertTrue(
            is_eligible_for_resolution(NormSourceType.NATIONAL, MaturityLevel.PROVISIONAL)
        )
        self.assertTrue(is_eligible_for_resolution(NormSourceType.NATIONAL, MaturityLevel.MATURE))

    def test_cohort_and_neutral_not_norm_eligible(self):
        self.assertFalse(is_eligible_for_resolution(NormSourceType.COHORT, None))
        self.assertFalse(is_eligible_for_resolution(NormSourceType.NEUTRAL, None))


class RankHelpersTests(unittest.TestCase):
    def test_orderings(self):
        self.assertLess(maturity_rank(MaturityLevel.SEED), maturity_rank(MaturityLevel.MATURE))
        self.assertLess(
            confidence_rank(ConfidenceLevel.INDICATIVE), confidence_rank(ConfidenceLevel.HIGH)
        )


if __name__ == "__main__":
    unittest.main()
