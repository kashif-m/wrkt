import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native"
import {
  ExerciseCatalogEntry,
  fetchMergedCatalog,
  listCustomExercises,
  saveCustomExercise,
  setCustomExerciseArchived,
  loadFavoriteExercises,
  setExerciseFavorite,
} from "../exercise/catalogStorage"
import { palette, spacing, radius } from "../ui/theme"
import { muscleColorMap } from "../ui/muscleColors"
import ScreenHeader from "../ui/ScreenHeader"
import SearchIcon from "../assets/search.svg"
import SettingsIcon from "../assets/settings.svg"

type ViewMode = "groups" | "exercises" | "manage" | "form"
type BrowserTab = "all" | "favorites"

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
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextEntry, setContextEntry] = useState<{
    entry: ExerciseCatalogEntry
    archived?: boolean
    custom?: boolean
  } | null>(null)
  const [activeTab, setActiveTab] = useState<BrowserTab>("all")

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

  const filteredFavoriteExercises = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return favoriteExercises
    return favoriteExercises.filter((entry) => entry.display_name.toLowerCase().includes(q))
  }, [favoriteExercises, query])

  const headerTitle = useMemo(() => {
    if (mode === "manage") return "Manage Exercises"
    if (mode === "form") return formEditing ? "Edit Exercise" : "Add Exercise"
    if (mode === "exercises") return selectedGroup?.replace(/_/g, " ") ?? "Exercises"
    return "Exercises"
  }, [mode, selectedGroup, formEditing])

  const goBack = () => {
    if (mode === "exercises") {
      setMode("groups")
      setQuery("")
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

  const collapseSearch = () => {
    setSearchExpanded(false)
    setQuery("")
  }

  const handleFavoriteToggle = async (slug: string) => {
    const isFavorite = favoriteSlugs.includes(slug)
    const next = await setExerciseFavorite(slug, !isFavorite)
    setFavoriteSlugs(next)
  }

  const renderGroupRow = ({ item }: ListRenderItemInfo<string>) => (
    <TouchableOpacity
      onPress={() => {
        setSelectedGroup(item)
        setMode("exercises")
        setQuery("")
      }}
      style={rowStyle}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
        <View style={[chip, { backgroundColor: muscleColorMap[item] ?? palette.mutedSurface }]}>
          <Text style={{ color: "#0f172a", fontWeight: "700" as const, fontSize: 12 }}>{formatLabel(item)}</Text>
        </View>
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>{countExercises(item, catalog)} exercises</Text>
      </View>
      <Text style={{ color: palette.mutedText, fontSize: 12 }}>Open</Text>
    </TouchableOpacity>
  )

  const renderExerciseRow = ({ item }: ListRenderItemInfo<ExerciseCatalogEntry>) => (
    <TouchableOpacity
      onPress={() => onSelectExercise?.(item)}
      onLongPress={() => setContextEntry({ entry: item })}
      style={rowStyle}
    >
      <View style={{ flex: 1, gap: spacing(0.25) }}>
        <Text style={rowText}>{item.display_name}</Text>
        <Text style={rowMeta}>{`${formatLabel(item.primary_muscle_group)} • ${item.modality}`}</Text>
      </View>
      <Text style={[rowMeta, { color: favoriteSlugs.includes(item.slug) ? palette.primary : palette.mutedText }]}>
        {favoriteSlugs.includes(item.slug) ? "Favorite" : ""}
      </Text>
    </TouchableOpacity>
  )

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={headerTitle}
        subtitle={mode === "groups" ? (activeTab === "favorites" ? "Favorites" : "All exercises") : undefined}
        onBack={mode !== "groups" ? goBack : onClose}
        rightSlot={
          <View style={{ flexDirection: "row", gap: spacing(1) }}>
            <TouchableOpacity
              onPress={() => {
                setSearchExpanded((prev) => {
                  if (prev) {
                    setQuery("")
                  }
                  return !prev
                })
              }}
              style={[iconButton, searchExpanded && { backgroundColor: palette.primary }]}
            >
              <SearchIcon width={16} height={16} color={searchExpanded ? "#0f172a" : palette.text} />
            </TouchableOpacity>
            {mode === "groups" ? (
              <TouchableOpacity onPress={() => setMenuOpen(true)} style={iconButton}>
                <SettingsIcon width={16} height={16} color={palette.text} />
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />

      {menuOpen && mode === "groups" && (
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={menuOverlay}>
            <View style={menuCard}>
              <TouchableOpacity
                onPress={() => {
                  setActiveTab((prev) => (prev === "favorites" ? "all" : "favorites"))
                  setMenuOpen(false)
                }}
                style={menuItem}
              >
                <Text style={{ color: palette.text, fontWeight: "600" as const }}>
                  {activeTab === "favorites" ? "Show all" : "Show favorites"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setMenuOpen(false)
                  setMode("manage")
                }}
                style={menuItem}
              >
                <Text style={{ color: palette.text, fontWeight: "600" as const }}>Manage custom exercises</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}

      {contextEntry ? (
        <TouchableWithoutFeedback onPress={() => setContextEntry(null)}>
          <View style={sheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={sheetCard}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.text, fontWeight: "700" as const, fontSize: 16 }}>
                    {contextEntry.entry.display_name}
                  </Text>
                  {!contextEntry.custom ? (
                    <TouchableOpacity onPress={() => handleFavoriteToggle(contextEntry.entry.slug)}>
                      <Text
                        style={{
                          color: favoriteSlugs.includes(contextEntry.entry.slug) ? palette.primary : palette.mutedText,
                          fontSize: 18,
                        }}
                      >
                        {favoriteSlugs.includes(contextEntry.entry.slug) ? "★" : "☆"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {!contextEntry.custom ? (
                  <>
                    {onSelectExercise ? (
                      <TouchableOpacity
                        onPress={() => {
                          onSelectExercise(contextEntry.entry)
                          setContextEntry(null)
                        }}
                        style={sheetAction}
                      >
                        <Text style={sheetActionLabel}>Select exercise</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => {
                        setMode("manage")
                        setMenuOpen(false)
                        setContextEntry(null)
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>Manage custom</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        handleFavoriteToggle(contextEntry.entry.slug)
                        setContextEntry(null)
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>
                        {favoriteSlugs.includes(contextEntry.entry.slug) ? "Remove favorite" : "Add to favorites"}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        setFormEditing(contextEntry.entry)
                        setMode("form")
                        setContextEntry(null)
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>Edit exercise</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        await setCustomExerciseArchived(contextEntry.entry.slug, !contextEntry.archived)
                        await refreshData()
                        setContextEntry(null)
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>{contextEntry.archived ? "Restore" : "Archive"}</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity onPress={() => setContextEntry(null)} style={[sheetAction, { marginTop: spacing(0.5) }]}>
                  <Text style={{ color: palette.mutedText, fontWeight: "600" as const, textAlign: "center" }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      ) : null}

      {mode === "manage" ? (
        <ManageCustomExercises
          active={customExercises.filter((entry) => !entry.archived)}
          archived={customExercises.filter((entry) => entry.archived)}
          onAdd={() => {
            setFormEditing(null)
            setMode("form")
          }}
          onLongPress={(entry, archived) => setContextEntry({ entry, archived, custom: true })}
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
          {searchExpanded && (
            <View style={searchContainer}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
                <TextInput
                  placeholder="Search"
                  placeholderTextColor={palette.mutedText}
                  value={query}
                  onChangeText={(value) => setQuery(value)}
                  style={[searchInput, { flex: 1 }]}
                  autoFocus
                />
                <TouchableOpacity onPress={collapseSearch}>
                  <Text style={{ color: palette.primary, fontWeight: "700" as const }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {mode === "groups" && (
            <View style={tabRow}>
              {(["all", "favorites"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[tabButton, activeTab === tab && tabButtonActive]}
                >
                  <Text style={{ color: activeTab === tab ? "#0f172a" : palette.text, fontWeight: "600" as const }}>
                    {tab === "all" ? "All" : "Favorites"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {mode === "groups" ? (
            activeTab === "favorites" ? (
              <FlatList<ExerciseCatalogEntry>
                data={filteredFavoriteExercises}
                keyExtractor={(item) => item.slug}
                renderItem={renderExerciseRow}
                ItemSeparatorComponent={() => <View style={separator} />}
                ListEmptyComponent={
                  <View style={{ padding: spacing(2) }}>
                    <Text style={{ color: palette.mutedText }}>No favorites yet. Tap ☆ next to an exercise to star it.</Text>
                  </View>
                }
              />
            ) : (
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
            )
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
      {mode !== "form" && (
        <View style={{ padding: spacing(2) }}>
          <TouchableOpacity
            onPress={() => {
              setFormEditing(null)
              setMode("form")
            }}
            style={primaryButton}
          >
            <Text style={{ color: "#0f172a", fontWeight: "700" as const }}>+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const formatLabel = (label: string) =>
  label
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")

const iconButton = {
  padding: spacing(0.5),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
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

const tabRow = {
  flexDirection: "row" as const,
  gap: spacing(1),
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(1),
}

const tabButton = {
  flex: 1,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(0.75),
  alignItems: "center" as const,
  backgroundColor: palette.surface,
}

const tabButtonActive = {
  backgroundColor: palette.primary,
  borderColor: palette.primary,
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
        <Text style={{ color: saving ? palette.mutedText : "#0f172a", fontWeight: "600" as const }}>
          {saving ? "Saving..." : "Save exercise"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel} style={secondaryButton}>
        <Text style={{ color: palette.mutedText, fontWeight: "600" as const }}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const ManageCustomExercises = ({
  active,
  archived,
  onAdd,
  onLongPress,
}: {
  active: ExerciseCatalogEntry[]
  archived: ExerciseCatalogEntry[]
  onAdd: () => void
  onLongPress: (entry: ExerciseCatalogEntry, archived: boolean) => void
}) => {
  const renderRow = (entry: ExerciseCatalogEntry, archivedFlag: boolean) => (
    <TouchableOpacity
      key={`${archivedFlag ? "archived-" : ""}${entry.slug}`}
      onPress={() => onLongPress(entry, archivedFlag)}
      onLongPress={() => onLongPress(entry, archivedFlag)}
      style={manageRow}
    >
      <View>
        <Text style={{ color: palette.text, fontWeight: "600" as const }}>{entry.display_name}</Text>
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>
          {archivedFlag ? "Archived" : formatLabel(entry.primary_muscle_group)}
        </Text>
      </View>
      <Text style={{ color: palette.mutedText, fontSize: 12 }}>Long-press</Text>
    </TouchableOpacity>
  )

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }}>
      <TouchableOpacity onPress={onAdd} style={primaryButton}>
        <Text style={{ color: "#0f172a", fontWeight: "700" as const }}>+ Add Exercise</Text>
      </TouchableOpacity>
      <Text style={sectionLabel}>Active</Text>
      {active.length === 0 ? (
        <Text style={{ color: palette.mutedText }}>No custom exercises yet.</Text>
      ) : (
        active.map((entry) => renderRow(entry, false))
      )}
      {archived.length > 0 && (
        <>
          <Text style={sectionLabel}>Archived</Text>
          {archived.map((entry) => renderRow(entry, true))}
        </>
      )}
    </ScrollView>
  )
}

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

const menuOverlay = {
  position: "absolute" as const,
  top: spacing(7),
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15,23,42,0.55)",
}

const menuCard = {
  marginTop: spacing(2),
  marginHorizontal: spacing(2),
  alignSelf: "flex-end" as const,
  width: 220,
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(1),
  gap: spacing(0.5),
}

const menuItem = {
  paddingHorizontal: spacing(1.5),
  paddingVertical: spacing(0.75),
}

const sheetOverlay = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(15,23,42,0.55)",
  alignItems: "center" as const,
  justifyContent: "flex-end" as const,
  padding: spacing(2),
}

const sheetCard = {
  width: "100%" as const,
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  borderWidth: 1,
  borderColor: palette.border,
  padding: spacing(1.5),
  gap: spacing(0.5),
}

const sheetAction = {
  paddingVertical: spacing(0.75),
  paddingHorizontal: spacing(0.5),
}

const sheetActionLabel = {
  color: palette.text,
  fontWeight: "600" as const,
}

const countExercises = (group: string, catalog: ExerciseCatalogEntry[]) =>
  catalog.filter((entry) => entry.primary_muscle_group === group).length


export default ExerciseBrowser
