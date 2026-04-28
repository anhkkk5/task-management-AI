# Bugfix Requirements Document

## Introduction

The `calculateHourlyScores()` function in the productivity service incorrectly calculates productivity scores for hours with zero task completion. When an hour has 0% completion rate (e.g., 0 out of 2 tasks completed), the score calculates to approximately 0.64 instead of being below 0.5 as expected. This occurs because the current weight distribution (70% completion rate, 30% duration score) allows the duration component to artificially inflate scores even when no tasks are completed.

The bug impacts the accuracy of productivity scoring and scheduling recommendations, potentially suggesting time slots where the user has historically failed to complete any tasks.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an hour has 0% completion rate (0 completed tasks out of N total tasks) AND the average duration score is high (~1.0) THEN the system calculates an observed score of approximately 0.3 (0 _ 0.7 + 1.0 _ 0.3)

1.2 WHEN the observed score is 0.3 AND Bayesian smoothing is applied with a circadian prior of 0.75 THEN the system produces a final score of approximately 0.64, which incorrectly suggests moderate productivity

1.3 WHEN hour 14 has 0 completed tasks out of 2 total tasks THEN the test assertion `expect(scores.get(14)?.score).toBeLessThan(0.5)` fails because the actual score is ~0.64

### Expected Behavior (Correct)

2.1 WHEN an hour has 0% completion rate (0 completed tasks out of N total tasks) THEN the system SHALL calculate a low observed score that heavily reflects the zero completion rate

2.2 WHEN the observed score for 0% completion is calculated AND Bayesian smoothing is applied THEN the system SHALL produce a final score below 0.5, accurately reflecting poor productivity

2.3 WHEN hour 14 has 0 completed tasks out of 2 total tasks THEN the system SHALL return a score less than 0.5, satisfying the test assertion `expect(scores.get(14)?.score).toBeLessThan(0.5)`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an hour has a high completion rate (e.g., 2 out of 3 tasks completed, ~67%) THEN the system SHALL CONTINUE TO return a score greater than 0.5

3.2 WHEN an hour has no historical data (0 tasks) THEN the system SHALL CONTINUE TO return the circadian rhythm prior score with 0 confidence

3.3 WHEN calculating confidence based on sample size THEN the system SHALL CONTINUE TO use the decay-weighted sum divided by 8, capped at 1.0

3.4 WHEN applying Bayesian smoothing THEN the system SHALL CONTINUE TO blend the observed score with the circadian prior based on confidence level

3.5 WHEN calculating scores for hours with positive completion rates and varying durations THEN the system SHALL CONTINUE TO produce scores that appropriately reflect both completion rate and duration
