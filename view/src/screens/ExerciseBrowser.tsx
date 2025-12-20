import React, { useCallback, useEffect, useMemo, useState } from "react"
import { View, Text, TextInput, FlatList, TouchableOpacity, ListRenderItemInfo, ScrollView } from "react-native"
import {
  ExerciseCatalogEntry,
  fetchMergedCatalog,
  listCustomExercises,
  saveCustomExercise,
  setCustomExerciseArchived,
  loadFavoriteExercises,
  setExerciseFavorite,
} from "../exercise/catalogStorage"
import { palette, spacing, radius, typography } from "../ui/theme"
import { muscleColorMap } from "../ui/muscleColors"

type ViewMode = "groups" | "exercises" | "favorites" | "manage" | "form"

type Props = {
  onSelectExercise?: (exercise: ExerciseCatalogEntry) => void
  onClose?: () => void
}

const ExerciseBrowser = ({ onSelectExercise, onClose }: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const [mode, setMode] = useState<ViewMode>("groups")
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [customExercises, setCustomExercises] = useState<ExerciseCatalogEntry[]>([])
  const [favoriteSlugs, setFavoriteSlugs] = useState<string[]>([])
  const [formEditing, setFormEditing] = useState<ExerciseCatalogEntry | null>(null)

  const refreshData = useCallback(async () => {
    try {
      const merged = await fetchMergedCatalog()
      setCatalog(merged)
      const customList = await listCustomExercises(true)
      setCustomExercises(customList)
      const favorites = await loadFavoriteExercises()
      setFavoriteSlugs(favorites)
    } catch (error) {
      console.warn("ExerciseBrowser: failed to refresh catalog", error)
    }
  }, [])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const muscleGroups = useMemo(() => {
    const groups = Array.from(new Set(catalog.map((entry) => entry.primary_muscle_group)))
    return groups.sort((a, b) => a.localeCompare(b))
  }, [catalog])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return muscleGroups
    return muscleGroups.filter((group) => group.toLowerCase().includes(q))
  }, [muscleGroups, query])

  const filteredExercises = useMemo(() => {
    if (!selectedGroup) return []
    const q = query.trim().toLowerCase()
    return catalog
      .filter((entry) => entry.primary_muscle_group === selectedGroup)
      .filter((entry) => entry.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
  }, [catalog, selectedGroup, query])

  const favoriteExercises = useMemo(
    () =>
      catalog
        .filter((entry) => favoriteSlugs.includes(entry.slug))
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [catalog, favoriteSlugs],
  )

  const headerTitle = useMemo(() => {
    switch (mode) {
      case "groups":
        return "All Exercises"
      case "exercises":
        return selectedGroup?.replace(/_/g, " ") ?? "Exercises"
      case "favorites":
        return "Favorites"
      case "manage":
        return "Manage Exercises"
      case "form":
        return formEditing ? "Edit Exercise" : "Add Exercise"
      default:
        return "All Exercises"
    }
  }, [mode, selectedGroup, formEditing])

  const goBack = () => {
    if (mode === "exercises") {
      setMode("groups")
      setQuery("")
      return
    }
    if (mode === "favorites") {
      setMode("groups")
      return
    }
    if (mode === "manage") {
      setMode("groups")
      return
    }
    if (mode === "form") {
      setMode(customExercises.length ? "manage" : "groups")
      return
    }
    onClose?.()
  }

  const handleFavoriteToggle = async (slug: string) => {
    const isFavorite = favoriteSlugs.includes(slug)
    const next = await setExerciseFavorite(slug, !isFavorite)
    setFavoriteSlugs(next)
  }

  const renderGroupRow = ({ item }: ListRenderItemInfo<string>) => (
    <TouchableOpacity
      onPress={() => {
        console.log("Browser: muscle group selected", item)
        setSelectedGroup(item)
        setMode("exercises")
        setQuery("")
      }}
      style={rowStyle}
    >
      <Text style={rowText}>{formatLabel(item)}</Text>
      <Text style={rowMeta}>⋮</Text>
    </TouchableOpacity>
  )

  const renderExerciseRow = ({ item }: ListRenderItemInfo<ExerciseCatalogEntry>) => (
    <TouchableOpacity
      onPress={() => {
        console.log("Browser: exercise selected", item.display_name, item.primary_muscle_group)
        onSelectExercise?.(item)
      }}
      style={rowStyle}
    >
      <Text style={rowText}>{item.display_name}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
        <Text style={rowMeta}>{item.modality}</Text>
        <TouchableOpacity onPress={() => handleFavoriteToggle(item.slug)} style={favoriteButton}>
          <Text style={{ color: favoriteSlugs.includes(item.slug) ? palette.primary : palette.mutedText }}>
            {favoriteSlugs.includes(item.slug) ? "★" : "☆"}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={{ flex: 1 }}>
      <Toolbar
        title={headerTitle}
        showBack={mode !== "groups"}
        favoritesActive={mode === "favorites"}
        onBack={goBack}
        onClose={onClose}
        onAddExercise={() => {
          setFormEditing(null)
          setMode("form")
        }}
        onOpenManage={() => setMode("manage")}
        onToggleFavorites={() => setMode((value) => (value === "favorites" ? "groups" : "favorites"))}
      />

      {mode === "manage" ? (
        <ManageCustomExercises
          active={customExercises.filter((entry) => !entry.archived)}
          archived={customExercises.filter((entry) => entry.archived)}
          onAdd={() => {
            setFormEditing(null)
            setMode("form")
          }}
          onEdit={(entry) => {
            setFormEditing(entry)
            setMode("form")
          }}
          onToggleArchive={async (entry, archived) => {
            await setCustomExerciseArchived(entry.slug, archived)
            refreshData()
          }}
        />
      ) : mode === "form" ? (
        <ExerciseForm
          initial={formEditing ?? undefined}
          onCancel={() => setMode(customExercises.length ? "manage" : "groups")}
          onSubmit={async (values) => {
            await saveCustomExercise(values, { originalSlug: formEditing?.slug })
            setFormEditing(null)
            await refreshData()
            setMode("manage")
          }}
        />
      ) : (
        <>
          <View style={searchContainer}>
            <TextInput
              placeholder="Search"
              placeholderTextColor={palette.mutedText}
              value={query}
              onChangeText={(value) => {
                console.log("Browser: search query", value)
                setQuery(value)
              }}
              style={searchInput}
            />
          </View>
          {mode === "favorites" ? (
            <FlatList<ExerciseCatalogEntry>
              data={favoriteExercises.filter((entry) => entry.display_name.toLowerCase().includes(query.toLowerCase()))}
              keyExtractor={(item) => item.slug}
              renderItem={renderExerciseRow}
              ItemSeparatorComponent={() => <View style={separator} />}
              ListEmptyComponent={
                <View style={{ padding: spacing(2) }}>
                  <Text style={{ color: palette.mutedText }}>No favorites yet. Tap ☆ next to an exercise to star it.</Text>
                </View>
              }
            />
          ) : mode === "groups" ? (
            <FlatList<string>
              data={filteredGroups}
              keyExtractor={(item) => item}
              renderItem={renderGroupRow}
              ItemSeparatorComponent={() => <View style={separator} />}
              contentContainerStyle={{ paddingBottom: spacing(8) }}
              ListEmptyComponent={
                <View style={{ padding: spacing(2) }}>
                  <Text style={{ color: palette.mutedText }}>No muscle groups match your search.</Text>
                </View>
              }
            />
          ) : (
            <FlatList<ExerciseCatalogEntry>
              data={filteredExercises}
              keyExtractor={(item) => item.slug}
              renderItem={renderExerciseRow}
              ItemSeparatorComponent={() => <View style={separator} />}
              contentContainerStyle={{ paddingBottom: spacing(8) }}
              ListEmptyComponent={
                <View style={{ padding: spacing(2) }}>
                  <Text style={{ color: palette.mutedText }}>No exercises found for this group.</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  )
}

const Toolbar = ({
  title,
  showBack,
  onBack,
  onClose,
  onAddExercise,
  onOpenManage,
  onToggleFavorites,
  favoritesActive,
}: {
  title: string
  showBack: boolean
  onBack: () => void
  onClose?: () => void
  onAddExercise: () => void
  onOpenManage: () => void
  onToggleFavorites: () => void
  favoritesActive: boolean
}) => (
  <View style={toolbarContainer}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
      {showBack ? (
        <TouchableOpacity onPress={onBack} style={iconButton}>
          <Text style={{ color: palette.text }}>{"<"}</Text>
        </TouchableOpacity>
      ) : onClose ? (
        <TouchableOpacity onPress={onClose} style={iconButton}>
          <Text style={{ color: palette.text }}>{"<"}</Text>
        </TouchableOpacity>
      ) : (
        <View style={iconButton}>
          <Text style={{ color: palette.text, fontWeight: "600" }}>☰</Text>
        </View>
      )}
      <Text style={[typography.title, { fontSize: 20 }]}>{title}</Text>
    </View>
    <View style={{ flexDirection: "row", gap: spacing(1) }}>
      <TouchableOpacity
        onPress={onToggleFavorites}
        style={[iconButton, favoritesActive && { backgroundColor: palette.primary }]}
      >
        <Text style={{ color: favoritesActive ? "#0f172a" : palette.text }}>{favoritesActive ? "★" : "☆"}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onAddExercise} style={iconButton}>
        <Text style={{ color: palette.text }}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onOpenManage} style={iconButton}>
        <Text style={{ color: palette.text }}>⋮</Text>
      </TouchableOpacity>
    </View>
  </View>
)

const formatLabel = (label: string) =>
  label
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")

const toolbarContainer = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const iconButton = {
  padding: spacing(0.5),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
}

const searchContainer = {
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const searchInput = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
}

const rowStyle = {
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.25),
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "center" as const,
  backgroundColor: palette.surface,
}

const rowText = {
  color: palette.text,
  fontSize: 16,
}

const rowMeta = {
  color: palette.mutedText,
  fontSize: 12,
}

const favoriteButton = {
  paddingHorizontal: spacing(0.5),
  paddingVertical: spacing(0.25),
}

const separator = {
  height: 1,
  backgroundColor: palette.border,
}

type ExerciseFormValues = {
  display_name: string
  slug: string
  primary_muscle_group: string
  secondary_groups: string[]
  modality: string
  logging_mode: string
  suggested_load_range: { min: number; max: number }
  tags?: string[]
}

const ExerciseForm = ({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: ExerciseCatalogEntry
  onSubmit: (values: ExerciseFormValues) => Promise<void>
  onCancel: () => void
}) => {
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "")
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [primary, setPrimary] = useState(initial?.primary_muscle_group ?? "chest")
  const [secondary, setSecondary] = useState<string[]>(initial?.secondary_groups ?? [])
  const [modality, setModality] = useState(initial?.modality ?? "strength")
  const [loggingMode, setLoggingMode] = useState(initial?.logging_mode ?? "reps_weight")
  const [minLoad, setMinLoad] = useState(initial?.suggested_load_range.min?.toString() ?? "")
  const [maxLoad, setMaxLoad] = useState(initial?.suggested_load_range.max?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const muscleOptions = Object.keys(muscleColorMap)
  const modalityOptions = ["strength", "hypertrophy", "conditioning", "bodyweight", "mobility"]
  const loggingOptions = ["reps_weight", "reps", "time_distance", "distance_time"]

  const toggleSecondary = (group: string) => {
    setSecondary((prev) => (prev.includes(group) ? prev.filter((item) => item !== group) : [...prev, group]))
  }

  const handleSave = async () => {
    setError(null)
    if (!displayName.trim()) {
      setError("Display name is required.")
      return
    }
    if (!primary) {
      setError("Primary muscle group is required.")
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        display_name: displayName.trim(),
        slug: slug.trim().length ? slug.trim() : displayName.trim(),
        primary_muscle_group: primary,
        secondary_groups: secondary,
        modality,
        logging_mode: loggingMode,
        suggested_load_range: {
          min: Number(minLoad) || 0,
          max: Number(maxLoad) || 0,
        },
      })
    } catch (err) {
      console.warn("ExerciseForm: failed to save", err)
      setError(err instanceof Error ? err.message : "Failed to save exercise.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(1.5) }}>
      <Text style={formLabel}>Display name</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} style={formInput} placeholder="Back Squat" />

      <Text style={formLabel}>Slug</Text>
      <TextInput value={slug} onChangeText={setSlug} style={formInput} placeholder="back_squat" />

      <Text style={formLabel}>Primary muscle group</Text>
      <View style={chipGrid}>
        {muscleOptions.map((group) => (
          <TouchableOpacity
            key={group}
            onPress={() => setPrimary(group)}
            style={[chip, primary === group && chipActive]}
          >
            <Text style={{ color: primary === group ? "#0f172a" : palette.text }}>{formatLabel(group)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={formLabel}>Secondary groups</Text>
      <View style={chipGrid}>
        {muscleOptions.map((group) => (
          <TouchableOpacity
            key={`secondary-${group}`}
            onPress={() => toggleSecondary(group)}
            style={[chip, secondary.includes(group) && chipActive]}
          >
            <Text style={{ color: secondary.includes(group) ? "#0f172a" : palette.text }}>{formatLabel(group)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={formLabel}>Modality</Text>
      <View style={chipRow}>
        {modalityOptions.map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setModality(option)}
            style={[chip, modality === option && chipActive]}
          >
            <Text style={{ color: modality === option ? "#0f172a" : palette.text }}>{formatLabel(option)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={formLabel}>Logging mode</Text>
      <View style={chipRow}>
        {loggingOptions.map((option) => (
          <TouchableOpacity
            key={option}
            onPress={() => setLoggingMode(option)}
            style={[chip, loggingMode === option && chipActive]}
          >
            <Text style={{ color: loggingMode === option ? "#0f172a" : palette.text }}>{formatLabel(option)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing(1) }}>
        <View style={{ flex: 1 }}>
          <Text style={formLabel}>Suggested min (kg)</Text>
          <TextInput value={minLoad} onChangeText={setMinLoad} style={formInput} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={formLabel}>Suggested max (kg)</Text>
          <TextInput value={maxLoad} onChangeText={setMaxLoad} style={formInput} keyboardType="numeric" />
        </View>
      </View>

      {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}

      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={[
          {
            borderRadius: radius.card,
            paddingVertical: spacing(1.5),
            alignItems: "center",
          },
          saving ? { backgroundColor: palette.mutedSurface } : { backgroundColor: palette.primary },
        ]}
      >
        <Text style={{ color: saving ? palette.mutedText : "#0f172a", fontWeight: "600" }}>
          {saving ? "Saving..." : "Save exercise"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel} style={secondaryButton}>
        <Text style={{ color: palette.mutedText, fontWeight: "600" }}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const ManageCustomExercises = ({
  active,
  archived,
  onAdd,
  onEdit,
  onToggleArchive,
}: {
  active: ExerciseCatalogEntry[]
  archived: ExerciseCatalogEntry[]
  onAdd: () => void
  onEdit: (entry: ExerciseCatalogEntry) => void
  onToggleArchive: (entry: ExerciseCatalogEntry, archived: boolean) => Promise<void>
}) => (
  <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }}>
    <TouchableOpacity onPress={onAdd} style={primaryButton}>
      <Text style={{ color: "#0f172a", fontWeight: "700" }}>+ Add Exercise</Text>
    </TouchableOpacity>
    <Text style={sectionLabel}>Active</Text>
    {active.length === 0 ? (
      <Text style={{ color: palette.mutedText }}>No custom exercises yet.</Text>
    ) : (
      active.map((entry) => (
        <View key={entry.slug} style={manageRow}>
          <View>
            <Text style={{ color: palette.text, fontWeight: "600" }}>{entry.display_name}</Text>
            <Text style={{ color: palette.mutedText, fontSize: 12 }}>{formatLabel(entry.primary_muscle_group)}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing(1) }}>
            <TouchableOpacity onPress={() => onEdit(entry)} style={iconButton}>
              <Text style={{ color: palette.text }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onToggleArchive(entry, true)} style={iconButton}>
              <Text style={{ color: palette.text }}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))
    )}
    {archived.length > 0 && (
      <>
        <Text style={sectionLabel}>Archived</Text>
        {archived.map((entry) => (
          <View key={`archived-${entry.slug}`} style={manageRow}>
            <View>
              <Text style={{ color: palette.text, fontWeight: "600" }}>{entry.display_name}</Text>
              <Text style={{ color: palette.mutedText, fontSize: 12 }}>Archived</Text>
            </View>
            <TouchableOpacity onPress={() => onToggleArchive(entry, false)} style={iconButton}>
              <Text style={{ color: palette.text }}>Restore</Text>
            </TouchableOpacity>
          </View>
        ))}
      </>
    )}
  </ScrollView>
)

const formLabel = {
  color: palette.mutedText,
  fontSize: 12,
  letterSpacing: 0.5,
}

const formInput = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
}

const chipGrid = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: spacing(0.75),
}

const chipRow = chipGrid

const chip = {
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(0.5),
  paddingHorizontal: spacing(1.25),
  backgroundColor: palette.mutedSurface,
}

const chipActive = {
  backgroundColor: palette.primary,
  borderColor: palette.primary,
}

const primaryButton = {
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.primary,
  backgroundColor: palette.primary,
  paddingVertical: spacing(1.25),
  alignItems: "center" as const,
}

const secondaryButton = {
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(1.25),
  alignItems: "center" as const,
}

const sectionLabel = {
  color: palette.mutedText,
  fontSize: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
}

const manageRow = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  padding: spacing(1.25),
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "center" as const,
}

export default ExerciseBrowser
