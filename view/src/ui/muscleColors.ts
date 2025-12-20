export const muscleColorMap: Record<string, string> = {
  chest: "#f472b6",
  back: "#22d3ee",
  legs: "#34d399",
  shoulders: "#f97316",
  triceps: "#fb7185",
  biceps: "#a78bfa",
  posterior_chain: "#38bdf8",
  cardio: "#2dd4bf",
  core: "#fbbf24",
  glutes: "#f472b6",
  grip: "#67e8f9",
}

export const getMuscleColor = (group?: string | null, fallback = "#60a5fa") => {
  if (!group) return fallback
  return muscleColorMap[group] ?? fallback
}
