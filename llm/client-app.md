# React Native Client – Design & Implementation Notes

## High-Level UX Goals

1. **Home / Day View**
   - Header with date selector (`Today` default) and CTA to open the calendar picker.
   - Card list of completed workouts (grouped by exercise) for the selected date; tapping one opens the logging screen in “history” mode.
   - CTA row: `Start New Exercise`, `View Calendar`, (future: `Copy previous workout`, `Import plan`).

2. **New Exercise Wizard**
   - Step 1: Muscle group list (FitNotes-style plain list, search bar up top, kebab icon placeholder).
   - Step 2: Exercise list filtered by selected group.
   - Step 3: Logging sheet (Track / History / Graph tabs).

3. **Logging Sheet**
   - Track tab: numeric steppers (weight, reps, time, distance) based on `logging_mode`, save/clear buttons, today’s set table.
   - History tab: grouped timeline (date headers, per-set rows).
   - Graph tab: simple line chart with quick range chips (1m/3m/6m/1y/all).

4. **Calendar**
   - Scrollable month view with color-coded dots per muscle group.
   - Selecting a day returns to Home with that date active.

## Screens & Components

| Screen / Component | Path | Status | Notes |
| --- | --- | --- | --- |
| App shell | `view/src/App.tsx` | WIP | Currently swaps between `ExerciseBrowser` and legacy tabs; needs new Home view described above. |
| Exercise browser | `view/src/screens/ExerciseBrowser.tsx` | Draft | Handles muscle group + exercise list; integrate into “Start new exercise” flow. |
| Logging screen | `view/src/screens/LoggingScreen.tsx` | Draft | Has steppers + Track/History/Trends tabs; style to match FitNotes. |
| History screen | `view/src/screens/HistoryScreen.tsx` | Legacy | Needs redesign to match FitNotes history tab. |
| Analytics screen | `view/src/screens/AnalyticsScreen.tsx` | Legacy | Replace with donut + charts, link from future toolbar. |
| Calendar screen | _(new)_ | Not started | Month view with colored dots, loops back to Home. |

## Task Breakdown (Phase 4)

1. **Home Screen Rewrite**
   - [ ] Build date header with arrows, calendar CTA, and “Workout log empty / Completed workouts” list.
   - [ ] Hook `Start New Exercise` button to open the muscle-group browser.
   - [ ] Render completed exercises for the selected day using `state.events` + `selectedDate`.

2. **Wizard Integration**
   - [ ] Embed `ExerciseBrowser` as a modal/stack screen triggered from Home.
   - [ ] Pass selected exercise to `LoggingScreen` (prop for pre-selection).
   - [ ] Ensure completed exercises also navigate to the same logging screen (pre-filled exercise + history tab).

3. **Calendar Flow**
   - [ ] Implement calendar screen (React Native calendar component or custom grid).
   - [ ] Color dots via muscle groups for that day.
   - [ ] On day select, set `selectedDate` and return to Home.

4. **Logging Screen Polish**
   - [ ] Restyle controls (FitNotes vibe, icons, highlight colors).
   - [ ] Add Save/Clear buttons, toast feedback.
   - [ ] History tab uses grouped separators + icons.
   - [ ] Graph tab with quick range filters.

5. **Analytics / History Overhaul**
   - [ ] Replace history list with FitNotes stacked cards.
   - [ ] Build actual charts (volume, max weight, etc.) similar to references.

## Data / Integration Notes

- Exercise catalog supplied by `workout-pack` via Rust; UI uses `fetchMergedCatalog()` / `addCustomExercise()`.
- Event logging delegates to `logSet` (DSL-backed validator) and `insertEvent` for persistence.
- Calendar + home need `selectedDate` state and helper to filter `state.events` by local day (use `roundToLocalDay`).
- Keep TypeScript definitions minimal; heavy logic stays in Rust DSL / tracker core.

## Hand-off Checklist

- [ ] `selectedDate` state + filtered event selectors in `App.tsx`.
- [ ] Navigation primitives (modal/stack) for `ExerciseBrowser`, `LoggingScreen`, `Calendar`.
- [ ] Styling tokens (colors, spacing) to match FitNotes palette (dark background, cyan accents, grey cards).
- [ ] Placeholder icons ready (menu, add, calendar, back arrows).
- [ ] Update `llm/tasks.md` Phase 4 items as each chunk lands.
