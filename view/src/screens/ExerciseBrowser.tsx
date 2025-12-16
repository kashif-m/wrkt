import React, { useEffect, useMemo, useState } from "react"
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
} from "react-native"
import { ExerciseCatalogEntry, fetchMergedCatalog } from "../exercise/catalogStorage"
import { palette, spacing, radius, typography } from "../ui/theme"

type ViewMode = "groups" | "exercises"

type Props = {
  onSelectExercise?: (exercise: ExerciseCatalogEntry) => void
  onClose?: () => void
}

const ExerciseBrowser = ({ onSelectExercise, onClose }: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const [mode, setMode] = useState<ViewMode>("groups")
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    fetchMergedCatalog().then(setCatalog).catch(console.warn)
  }, [])

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

  const headerTitle =
    mode === "groups" ? "All Exercises" : selectedGroup?.replace(/_/g, " ") ?? "Exercises"

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
      <Text style={rowMeta}>{item.modality}</Text>
    </TouchableOpacity>
  )

  return (
    <View style={{ flex: 1 }}>
      <Toolbar
        title={headerTitle}
        showBack={mode === "exercises"}
        onBack={() => {
          setMode("groups")
          setQuery("")
        }}
        onClose={onClose}
      />

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

      {mode === "groups" ? (
        <FlatList<string>
          data={filteredGroups}
          keyExtractor={(item) => item}
          renderItem={renderGroupRow}
          ItemSeparatorComponent={() => <View style={separator} />}
          contentContainerStyle={{ paddingBottom: spacing(8) }}
          ListEmptyComponent={
            <View style={{ padding: spacing(2) }}>
              <Text style={{ color: palette.mutedText }}>
                No muscle groups match your search.
              </Text>
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
              <Text style={{ color: palette.mutedText }}>
                No exercises found for this group.
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const Toolbar = ({
  title,
  showBack,
  onBack,
  onClose,
}: {
  title: string
  showBack: boolean
  onBack: () => void
  onClose?: () => void
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
      <TouchableOpacity style={iconButton}>
        <Text style={{ color: palette.text }}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity style={iconButton}>
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

const separator = {
  height: 1,
  backgroundColor: palette.border,
}

export default ExerciseBrowser
