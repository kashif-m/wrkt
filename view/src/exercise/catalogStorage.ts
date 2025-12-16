import AsyncStorage from "@react-native-async-storage/async-storage"
import { JsonArray, JsonObject, getExerciseCatalog, validateExercise } from "../TrackerEngine"

const CUSTOM_EXERCISES_KEY = "strata.workout.customExercises"

export interface BaseExerciseCatalogEntry {
  slug: string
  display_name: string
  primary_muscle_group: string
  secondary_groups: string[]
  modality: string
  logging_mode: string
  suggested_load_range: { min: number; max: number }
  tags?: string[]
}

export type ExerciseCatalogEntry = BaseExerciseCatalogEntry & { source: "default" | "custom" }

const readCustomExercises = async (): Promise<ExerciseCatalogEntry[]> => {
  const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY)
  if (!raw) {
    return []
  }
  try {
    return JSON.parse(raw) as ExerciseCatalogEntry[]
  } catch (error) {
    console.warn("Failed to parse custom catalog", error)
    return []
  }
}

const writeCustomExercises = async (items: ExerciseCatalogEntry[]) => {
  await AsyncStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(items))
}

const normalizeEntry = (entry: JsonObject): BaseExerciseCatalogEntry => {
  const toArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item)) : []
  const rangeValue = (value: unknown): { min: number; max: number } => {
    if (value && typeof value === "object" && "min" in (value as any) && "max" in (value as any)) {
      return {
        min: Number((value as any).min) || 0,
        max: Number((value as any).max) || 0,
      }
    }
    return { min: 0, max: 0 }
  }
  return {
    slug: String(entry.slug ?? ""),
    display_name: String(entry.display_name ?? ""),
    primary_muscle_group: String(entry.primary_muscle_group ?? ""),
    secondary_groups: toArray(entry.secondary_groups),
    modality: String(entry.modality ?? ""),
    logging_mode: String(entry.logging_mode ?? ""),
    suggested_load_range: rangeValue(entry.suggested_load_range),
    tags: toArray(entry.tags),
  }
}

const parseCatalog = (data: JsonArray | string | undefined): Array<BaseExerciseCatalogEntry> => {
  console.log("parseCatalog: raw payload type", typeof data, Array.isArray(data) ? data.length : undefined)
  let normalizedPayload: JsonArray | undefined = undefined
  if (typeof data === "string") {
    try {
      normalizedPayload = JSON.parse(data) as JsonArray
    } catch (error) {
      console.warn("parseCatalog: failed to parse string payload", error)
      normalizedPayload = undefined
    }
  } else if (Array.isArray(data)) {
    normalizedPayload = data
  }
  if (!Array.isArray(normalizedPayload)) {
    console.warn("parseCatalog: expected array but got", data)
    return []
  }
  const normalized = normalizedPayload
    .map((entry) => normalizeEntry(entry as JsonObject))
    .filter((entry) => entry.slug.length > 0 && entry.display_name.length > 0)
  console.log("parseCatalog: normalized entries", normalized.length)
  return normalized
}

export const fetchMergedCatalog = async (): Promise<ExerciseCatalogEntry[]> => {
  const baseData = await getExerciseCatalog().catch((error) => {
    console.warn("Failed to load catalog from Rust", error)
    return undefined
  })
  console.debug("Fetched catalog from Rust", baseData)
  const base = parseCatalog(baseData)
  const custom = await readCustomExercises()
  console.debug("Merged default and custom catalog", { baseCount: base.length, customCount: custom.length })
  const merged = [
    ...base.map((entry) => ({ ...entry, source: "default" as const })),
    ...custom.map((entry) => ({ ...entry, source: "custom" as const })),
  ]
  return merged
}

export const addCustomExercise = async (entry: BaseExerciseCatalogEntry) => {
  const validated = normalizeEntry(await validateExercise(entry as unknown as JsonObject))
  const candidates = await readCustomExercises()
  const slug = String(validated.slug)
  if (candidates.some((item) => item.slug === slug)) {
    throw new Error("Exercise already exists")
  }
  const merged: ExerciseCatalogEntry[] = [
    ...candidates,
    {
      ...validated,
      slug,
      source: "custom" as const,
    },
  ]
  await writeCustomExercises(merged)
  return merged
}

export const removeCustomExercise = async (slug: string) => {
  const existing = await readCustomExercises()
  const filtered = existing.filter((entry) => entry.slug !== slug)
  await writeCustomExercises(filtered)
  return filtered
}
