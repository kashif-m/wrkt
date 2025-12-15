# Workout Planning & Suggestion Design

## Goals

* Keep Strata core generic: planning = simulate hypothetical events + compute metric deltas.
* Domain-specific logic lives in workout pack as “strategy modules”.
* Suggestions remain deterministic and explainable (what changed, why it helps).

## Key Concepts

### Strategy Profiles

Each workout style maps to a simple strategy that prioritizes certain metrics:

* **Strength**: maximize `est_1rm`, highlight heavier loads with steady rep counts.
* **Hypertrophy**: maximize volume (`sum(weight * reps)`), focus on moderate load/reps.
* **Conditioning**: maximize `duration_sec`/`distance_m` improvements, reduce rest.

### Candidate Generator

Given a baseline session, generate hypotheses per exercise:

1. `+weight` (e.g., +2.5 kg) keeping reps constant.
2. `+reps` (e.g., +1 rep per set) at current weight.
3. `+set` (add one additional set matching last set load).
4. Conditioning variant: increase duration/distance, reduce time.

For each candidate, construct hypothetical events (same schema) and run `simulate()`.

### Scoring & Ranking

* Compute delta metrics for the candidate (from `SimulationOutput.delta.metrics`).
* Strategy-specific scoring function (e.g., `strengthScore = delta.est_1rm`).
* Filter out negative or zero improvements unless suggestion is about recovery.
* Return top N suggestions with:
  * `title`: e.g., “Add 2.5 kg to Bench Press”
  * `explanation`: e.g., “Estimated 1RM +3 kg if you keep 5 reps.”
  * `delta`: structured JSON for UI.

### Data Flow

1. RN requests `trackerPlanning.getSuggestions(trackerId, exerciseSlug, strategy)`.
2. Native (JSI) module:
   * Fetch recent events for the exercise.
   * Build baseline `NormalizedEvent` slice.
   * Generate candidates via `workout_pack::strategies`.
   * Call Strata `simulate` per candidate.
   * Score + return sorted suggestions.

## Next Steps

* Implement `workout_pack::strategies::{StrengthPlanner, HypertrophyPlanner, ConditioningPlanner}`.
* Each planner exposes `fn suggestions(events: &[NormalizedEvent]) -> Vec<PlanSuggestion>`.
* `PlanSuggestion` holds the candidate events, a label, and scoring metadata.
* Hook the planner into a new Strata planning module or expose via workout pack FFI.
