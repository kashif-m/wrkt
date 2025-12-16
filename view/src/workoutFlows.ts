import { compute, suggest, validateEvent, JsonObject } from "./TrackerEngine"
import { getLocalOffsetMinutes, roundToLocalDay, roundToLocalWeek, sortEventsByDeterministicOrder, TimeGrain } from "./timePolicy"

export type WorkoutEvent = JsonObject & {
  event_id: string
  tracker_id: string
  ts: number
  payload: JsonObject
  meta: JsonObject
}

export type WorkoutState = { events: WorkoutEvent[] }

export const WORKOUT_DSL = "tracker \"workout\" v1 {\n  fields {\n    exercise: text\n    reps: int optional\n    weight: float optional\n  }\n}"

export const initialEvents: WorkoutEvent[] = [
  {
    event_id: "evt-1",
    tracker_id: "workout",
    ts: 1700000000,
    payload: { exercise: "Bench Press", reps: 5, weight: 80 },
    meta: {},
  },
]

export const initialState: WorkoutState = { events: initialEvents }

const annotateEvent = (event: WorkoutEvent): WorkoutEvent => {
  const offsetMinutes = getLocalOffsetMinutes()
  return {
    ...event,
    meta: {
      ...(event.meta ?? {}),
      timezone_offset_minutes: offsetMinutes,
      day_bucket: roundToLocalDay(event.ts, offsetMinutes),
      week_bucket: roundToLocalWeek(event.ts, offsetMinutes),
    },
  }
}

export const logSet = async (state: WorkoutState, eventJson: WorkoutEvent): Promise<WorkoutState> => {
  let normalized = eventJson
  try {
    normalized = (await validateEvent(WORKOUT_DSL, eventJson)) as WorkoutEvent
  } catch (error) {
    console.warn("TrackerEngine validateEvent unavailable, persisting raw payload", error)
  }
  const annotated = annotateEvent(normalized)
  return { events: sortEventsByDeterministicOrder([...state.events, annotated]) }
}

export const history = (state: WorkoutState) => sortEventsByDeterministicOrder(state.events)

export const computeAnalytics = (state: WorkoutState, query: JsonObject) =>
  compute(WORKOUT_DSL, state.events, query)

export const suggestNext = (state: WorkoutState, planner: string) => suggest(WORKOUT_DSL, state.events, planner)

export const buildVolumeQuery = (grain: TimeGrain): JsonObject => {
  const bucketField = grain === "week" ? "week_bucket" : "day_bucket"
  return {
    metric: "total_volume",
    group_by: ["exercise", bucketField],
  }
}
