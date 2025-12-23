import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import {
  ExerciseName,
  ExerciseSlug,
  LoggingMode,
  LoggingModeValue,
  Modality,
  ModalityValue,
  MuscleGroup,
  NumericInput,
  SearchQuery,
  Tag,
  asExerciseSource,
  asExerciseName,
  asExerciseSlug,
  asLoggingMode,
  asModality,
  asMuscleGroup,
  asNumericInput,
  asSearchQuery,
  asErrorMessage,
} from '../domain/types';
import { palette, spacing, radius } from '../ui/theme';
import { muscleColorMap } from '../ui/muscleColors';
import ScreenHeader from '../ui/ScreenHeader';
import SearchIcon from '../assets/search.svg';
import SettingsIcon from '../assets/settings.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { RootState } from '../state/appState';

const ExerciseBrowser = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const catalog = state.catalog.entries;
  const customExercises = state.catalog.custom;
  const favoriteSlugs = state.catalog.favorites;
  const {
    mode,
    selectedGroup,
    query,
    formEditing,
    searchExpanded,
    menuOpen,
    contextEntry,
    activeTab,
    formDraft,
  } = state.browser;

  const muscleGroups = useMemo(() => {
    const groups = Array.from(
      new Set(catalog.map(entry => entry.primary_muscle_group)),
    ) as MuscleGroup[];
    return groups.sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return muscleGroups;
    return muscleGroups.filter(group => group.toLowerCase().includes(q));
  }, [muscleGroups, query]);

  const filteredExercises = useMemo(() => {
    if (!selectedGroup) return [];
    const q = query.trim().toLowerCase();
    return catalog
      .filter(entry => entry.primary_muscle_group === selectedGroup)
      .filter(entry => entry.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [catalog, selectedGroup, query]);

  const favoriteExercises = useMemo(
    () =>
      catalog
        .filter(entry => favoriteSlugs.includes(entry.slug))
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [catalog, favoriteSlugs],
  );

  const filteredFavoriteExercises = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return favoriteExercises;
    return favoriteExercises.filter(entry =>
      entry.display_name.toLowerCase().includes(q),
    );
  }, [favoriteExercises, query]);

  const headerTitle = useMemo(() => {
    if (mode === 'manage') return 'Manage Exercises';
    if (mode === 'form') return formEditing ? 'Edit Exercise' : 'Add Exercise';
    if (mode === 'exercises')
      return selectedGroup?.replace(/_/g, ' ') ?? 'Exercises';
    return 'Exercises';
  }, [mode, selectedGroup, formEditing]);

  const updateFormDraft = useCallback(
    (partial: Partial<typeof formDraft>) => {
      dispatch({
        type: 'browser/formDraft',
        draft: { ...formDraft, ...partial },
      });
    },
    [dispatch, formDraft],
  );

  const goBack = () => {
    if (mode === 'exercises') {
      dispatch({ type: 'browser/mode', mode: 'groups' });
      dispatch({ type: 'browser/query', query: asSearchQuery('') });
      return;
    }
    if (mode === 'manage') {
      dispatch({ type: 'browser/mode', mode: 'groups' });
      return;
    }
    if (mode === 'form') {
      dispatch({
        type: 'browser/mode',
        mode: customExercises.length ? 'manage' : 'groups',
      });
      return;
    }
    actions.navigate('home');
  };

  const collapseSearch = () => {
    dispatch({ type: 'browser/search', expanded: false });
    dispatch({ type: 'browser/query', query: asSearchQuery('') });
  };

  const handleFavoriteToggle = async (slug: ExerciseSlug) => {
    const isFavorite = favoriteSlugs.includes(slug);
    await actions.toggleFavorite(slug, !isFavorite);
  };

  const renderGroupRow = ({ item }: ListRenderItemInfo<MuscleGroup>) => {
    const group = asMuscleGroup(item);
    return (
      <TouchableOpacity
        onPress={() => {
          dispatch({ type: 'browser/group', group });
          dispatch({ type: 'browser/mode', mode: 'exercises' });
          dispatch({ type: 'browser/query', query: asSearchQuery('') });
        }}
        style={rowStyle}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing(1),
          }}
        >
          <View
            style={[
              chip,
              {
                backgroundColor: muscleColorMap[group] ?? palette.mutedSurface,
              },
            ]}
          >
            <Text
              style={{
                color: '#0f172a',
                fontWeight: '700' as const,
                fontSize: 12,
              }}
            >
              {formatLabel(group)}
            </Text>
          </View>
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>
            {countExercises(group, catalog)} exercises
          </Text>
        </View>
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>Open</Text>
      </TouchableOpacity>
    );
  };

  const renderExerciseRow = ({
    item,
  }: ListRenderItemInfo<ExerciseCatalogEntry>) => (
    <TouchableOpacity
      onPress={() =>
        actions.openLogForExercise(
          item.display_name,
          state.selectedDate,
          'Track',
        )
      }
      onLongPress={() =>
        dispatch({ type: 'browser/context', context: { entry: item } })
      }
      style={rowStyle}
    >
      <View style={{ flex: 1, gap: spacing(0.25) }}>
        <Text style={rowText}>{item.display_name}</Text>
        <Text style={rowMeta}>{`${formatLabel(item.primary_muscle_group)} • ${
          item.modality
        }`}</Text>
      </View>
      <Text
        style={[
          rowMeta,
          {
            color: favoriteSlugs.includes(item.slug)
              ? palette.primary
              : palette.mutedText,
          },
        ]}
      >
        {favoriteSlugs.includes(item.slug) ? 'Favorite' : ''}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={headerTitle}
        subtitle={
          mode === 'groups'
            ? activeTab === 'favorites'
              ? 'Favorites'
              : 'All exercises'
            : undefined
        }
        onBack={goBack}
        rightSlot={
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            <TouchableOpacity
              onPress={() => {
                if (searchExpanded) {
                  dispatch({ type: 'browser/query', query: asSearchQuery('') });
                }
                dispatch({ type: 'browser/search', expanded: !searchExpanded });
              }}
              style={[
                iconButton,
                searchExpanded && { backgroundColor: palette.primary },
              ]}
            >
              <SearchIcon
                width={16}
                height={16}
                color={searchExpanded ? '#0f172a' : palette.text}
              />
            </TouchableOpacity>
            {mode === 'groups' ? (
              <TouchableOpacity
                onPress={() => dispatch({ type: 'browser/menu', open: true })}
                style={iconButton}
              >
                <SettingsIcon width={16} height={16} color={palette.text} />
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />

      {menuOpen && mode === 'groups' && (
        <TouchableWithoutFeedback
          onPress={() => dispatch({ type: 'browser/menu', open: false })}
        >
          <View style={menuOverlay}>
            <View style={menuCard}>
              <TouchableOpacity
                onPress={() => {
                  dispatch({
                    type: 'browser/tab',
                    tab: activeTab === 'favorites' ? 'all' : 'favorites',
                  });
                  dispatch({ type: 'browser/menu', open: false });
                }}
                style={menuItem}
              >
                <Text
                  style={{ color: palette.text, fontWeight: '600' as const }}
                >
                  {activeTab === 'favorites' ? 'Show all' : 'Show favorites'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  dispatch({ type: 'browser/menu', open: false });
                  dispatch({ type: 'browser/mode', mode: 'manage' });
                }}
                style={menuItem}
              >
                <Text
                  style={{ color: palette.text, fontWeight: '600' as const }}
                >
                  Manage custom exercises
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}

      {contextEntry ? (
        <TouchableWithoutFeedback
          onPress={() => dispatch({ type: 'browser/context', context: null })}
        >
          <View style={sheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={sheetCard}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    style={{
                      color: palette.text,
                      fontWeight: '700' as const,
                      fontSize: 16,
                    }}
                  >
                    {contextEntry.entry.display_name}
                  </Text>
                  {!contextEntry.custom ? (
                    <TouchableOpacity
                      onPress={() =>
                        handleFavoriteToggle(contextEntry.entry.slug)
                      }
                    >
                      <Text
                        style={{
                          color: favoriteSlugs.includes(contextEntry.entry.slug)
                            ? palette.primary
                            : palette.mutedText,
                          fontSize: 18,
                        }}
                      >
                        {favoriteSlugs.includes(contextEntry.entry.slug)
                          ? '★'
                          : '☆'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {!contextEntry.custom ? (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        actions.openLogForExercise(
                          contextEntry.entry.display_name,
                          state.selectedDate,
                          'Track',
                        );
                        dispatch({ type: 'browser/context', context: null });
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>Select exercise</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        dispatch({ type: 'browser/mode', mode: 'manage' });
                        dispatch({ type: 'browser/menu', open: false });
                        dispatch({ type: 'browser/context', context: null });
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>Manage custom</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        handleFavoriteToggle(contextEntry.entry.slug);
                        dispatch({ type: 'browser/context', context: null });
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>
                        {favoriteSlugs.includes(contextEntry.entry.slug)
                          ? 'Remove favorite'
                          : 'Add to favorites'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        dispatch({
                          type: 'browser/form',
                          entry: contextEntry.entry,
                        });
                        dispatch({
                          type: 'browser/formDraft',
                          draft: draftFromEntry(contextEntry.entry),
                        });
                        dispatch({ type: 'browser/mode', mode: 'form' });
                        dispatch({ type: 'browser/context', context: null });
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>Edit exercise</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        await actions.archiveCustomExercise(
                          contextEntry.entry.slug,
                          !contextEntry.archived,
                        );
                        dispatch({ type: 'browser/context', context: null });
                      }}
                      style={sheetAction}
                    >
                      <Text style={sheetActionLabel}>
                        {contextEntry.archived ? 'Restore' : 'Archive'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  onPress={() =>
                    dispatch({ type: 'browser/context', context: null })
                  }
                  style={[sheetAction, { marginTop: spacing(0.5) }]}
                >
                  <Text
                    style={{
                      color: palette.mutedText,
                      fontWeight: '600' as const,
                      textAlign: 'center',
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      ) : null}

      {mode === 'manage' ? (
        <ManageCustomExercises
          active={customExercises.filter(entry => !entry.archived)}
          archived={customExercises.filter(entry => entry.archived)}
          onAdd={() => {
            dispatch({ type: 'browser/form', entry: null });
            dispatch({
              type: 'browser/formDraft',
              draft: {
                displayName: asExerciseName(''),
                slug: asExerciseSlug(''),
                primary: asMuscleGroup('chest'),
                secondary: [],
                modality: asModality('strength'),
                loggingMode: asLoggingMode('reps_weight'),
                minLoad: asNumericInput(''),
                maxLoad: asNumericInput(''),
                saving: false,
                error: null,
              },
            });
            dispatch({ type: 'browser/mode', mode: 'form' });
          }}
          onLongPress={(entry, archived) =>
            dispatch({
              type: 'browser/context',
              context: { entry, archived, custom: true },
            })
          }
        />
      ) : mode === 'form' ? (
        <ExerciseForm
          draft={formDraft}
          updateDraft={updateFormDraft}
          onCancel={() =>
            dispatch({
              type: 'browser/mode',
              mode: customExercises.length ? 'manage' : 'groups',
            })
          }
          onSubmit={async values => {
            updateFormDraft({ saving: true, error: null });
            try {
              await actions.saveCustomExercise(
                {
                  ...values,
                  source: asExerciseSource('custom'),
                  archived: formEditing?.archived,
                },
                formEditing?.slug,
              );
              dispatch({ type: 'browser/form', entry: null });
              dispatch({ type: 'browser/mode', mode: 'manage' });
              updateFormDraft({
                displayName: asExerciseName(''),
                slug: asExerciseSlug(''),
                primary: asMuscleGroup('chest'),
                secondary: [],
                modality: asModality('strength'),
                loggingMode: asLoggingMode('reps_weight'),
                minLoad: asNumericInput(''),
                maxLoad: asNumericInput(''),
                saving: false,
                error: null,
              });
            } catch (error) {
              updateFormDraft({
                saving: false,
                error: asErrorMessage(
                  error instanceof Error
                    ? error.message
                    : 'Failed to save exercise.',
                ),
              });
            }
          }}
        />
      ) : (
        <>
          {searchExpanded && (
            <View style={searchContainer}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing(1),
                }}
              >
                <TextInput
                  placeholder="Search"
                  placeholderTextColor={palette.mutedText}
                  value={query}
                  onChangeText={value =>
                    dispatch({
                      type: 'browser/query',
                      query: asSearchQuery(value),
                    })
                  }
                  style={[searchInput, { flex: 1 }]}
                  autoFocus
                />
                <TouchableOpacity onPress={collapseSearch}>
                  <Text
                    style={{
                      color: palette.primary,
                      fontWeight: '700' as const,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {mode === 'groups' && (
            <View style={tabRow}>
              {(['all', 'favorites'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => dispatch({ type: 'browser/tab', tab })}
                  style={[tabButton, activeTab === tab && tabButtonActive]}
                >
                  <Text
                    style={{
                      color: activeTab === tab ? '#0f172a' : palette.text,
                      fontWeight: '600' as const,
                    }}
                  >
                    {tab === 'all' ? 'All' : 'Favorites'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {mode === 'groups' ? (
            activeTab === 'favorites' ? (
              <FlatList<ExerciseCatalogEntry>
                data={filteredFavoriteExercises}
                keyExtractor={item => item.slug}
                renderItem={renderExerciseRow}
                ItemSeparatorComponent={() => <View style={separator} />}
                ListEmptyComponent={
                  <View style={{ padding: spacing(2) }}>
                    <Text style={{ color: palette.mutedText }}>
                      No favorites yet. Long-press an exercise to add it here.
                    </Text>
                  </View>
                }
              />
            ) : (
              <FlatList<MuscleGroup>
                data={filteredGroups}
                keyExtractor={item => item}
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
            )
          ) : (
            <FlatList<ExerciseCatalogEntry>
              data={filteredExercises}
              keyExtractor={item => item.slug}
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
        </>
      )}
      {mode === 'groups' && (
        <View style={{ padding: spacing(2) }}>
          <TouchableOpacity
            onPress={() => {
              dispatch({ type: 'browser/form', entry: null });
              dispatch({
                type: 'browser/formDraft',
                draft: {
                  displayName: asExerciseName(''),
                  slug: asExerciseSlug(''),
                  primary: asMuscleGroup('chest'),
                  secondary: [],
                  modality: asModality('strength'),
                  loggingMode: asLoggingMode('reps_weight'),
                  minLoad: asNumericInput(''),
                  maxLoad: asNumericInput(''),
                  saving: false,
                  error: null,
                },
              });
              dispatch({ type: 'browser/mode', mode: 'form' });
            }}
            style={primaryButton}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700' as const }}>
              + Add Exercise
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const formatLabel = (
  label: ExerciseName | MuscleGroup | SearchQuery | Modality | LoggingMode,
) =>
  label
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const draftFromEntry = (entry: ExerciseCatalogEntry): BrowserFormDraft => ({
  displayName: entry.display_name ?? asExerciseName(''),
  slug: entry.slug ?? asExerciseSlug(''),
  primary: entry.primary_muscle_group ?? asMuscleGroup('chest'),
  secondary: entry.secondary_groups ?? [],
  modality: entry.modality ?? asModality('strength'),
  loggingMode: entry.logging_mode ?? asLoggingMode('reps_weight'),
  minLoad: asNumericInput(entry.suggested_load_range?.min?.toString() ?? ''),
  maxLoad: asNumericInput(entry.suggested_load_range?.max?.toString() ?? ''),
  saving: false,
  error: null,
});

const iconButton = {
  padding: spacing(0.5),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
};

const searchContainer = {
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
};

const searchInput = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
};

const tabRow = {
  flexDirection: 'row' as const,
  gap: spacing(1),
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(1),
};

const tabButton = {
  flex: 1,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(0.75),
  alignItems: 'center' as const,
  backgroundColor: palette.surface,
};

const tabButtonActive = {
  backgroundColor: palette.primary,
  borderColor: palette.primary,
};

const rowStyle = {
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.25),
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  backgroundColor: palette.surface,
};

const rowText = {
  color: palette.text,
  fontSize: 16,
};

const rowMeta = {
  color: palette.mutedText,
  fontSize: 12,
};

const favoriteButton = {
  paddingHorizontal: spacing(0.5),
  paddingVertical: spacing(0.25),
};

const separator = {
  height: 1,
  backgroundColor: palette.border,
};

type ExerciseFormValues = {
  display_name: ExerciseName;
  slug: ExerciseSlug;
  primary_muscle_group: MuscleGroup;
  secondary_groups: MuscleGroup[];
  modality: Modality;
  logging_mode: LoggingMode;
  suggested_load_range: { min: number; max: number };
  tags?: Tag[];
};

type BrowserFormDraft = RootState['browser']['formDraft'];

const ExerciseForm = ({
  draft,
  updateDraft,
  onSubmit,
  onCancel,
}: {
  draft: BrowserFormDraft;
  updateDraft: (partial: Partial<BrowserFormDraft>) => void;
  onSubmit: (values: ExerciseFormValues) => Promise<void>;
  onCancel: () => void;
}) => {
  const {
    displayName,
    slug,
    primary,
    secondary,
    modality,
    loggingMode,
    minLoad,
    maxLoad,
    saving,
    error,
  } = draft;

  const muscleOptions = Object.keys(muscleColorMap).map(group =>
    asMuscleGroup(group),
  );
  const modalityOptions: ModalityValue[] = [
    'strength',
    'hypertrophy',
    'conditioning',
    'bodyweight',
    'mobility',
  ];
  const loggingOptions: LoggingModeValue[] = [
    'reps_weight',
    'reps',
    'time_distance',
    'distance_time',
  ];

  const toggleSecondary = (group: MuscleGroup) => {
    updateDraft({
      secondary: secondary.includes(group)
        ? secondary.filter(item => item !== group)
        : [...secondary, group],
    });
  };

  const handleSave = async () => {
    updateDraft({ error: null });
    if (!displayName.trim()) {
      updateDraft({ error: asErrorMessage('Display name is required.') });
      return;
    }
    if (!primary) {
      updateDraft({
        error: asErrorMessage('Primary muscle group is required.'),
      });
      return;
    }
    await onSubmit({
      display_name: asExerciseName(displayName.trim()),
      slug: asExerciseSlug(
        slug.trim().length ? slug.trim() : displayName.trim(),
      ),
      primary_muscle_group: primary,
      secondary_groups: secondary,
      modality,
      logging_mode: loggingMode,
      suggested_load_range: {
        min: Number(minLoad) || 0,
        max: Number(maxLoad) || 0,
      },
    });
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing(2), gap: spacing(1.5) }}
    >
      <Text style={formLabel}>Display name</Text>
      <TextInput
        value={displayName}
        onChangeText={value =>
          updateDraft({ displayName: asExerciseName(value) })
        }
        style={formInput}
        placeholder="Back Squat"
      />

      <Text style={formLabel}>Slug</Text>
      <TextInput
        value={slug}
        onChangeText={value => updateDraft({ slug: asExerciseSlug(value) })}
        style={formInput}
        placeholder="back_squat"
      />

      <Text style={formLabel}>Primary muscle group</Text>
      <View style={chipGrid}>
        {muscleOptions.map(group => (
          <TouchableOpacity
            key={group}
            onPress={() => updateDraft({ primary: group })}
            style={[chip, primary === group && chipActive]}
          >
            <Text
              style={{ color: primary === group ? '#0f172a' : palette.text }}
            >
              {formatLabel(group)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={formLabel}>Secondary groups</Text>
      <View style={chipGrid}>
        {muscleOptions.map(group => (
          <TouchableOpacity
            key={`secondary-${group}`}
            onPress={() => toggleSecondary(group)}
            style={[chip, secondary.includes(group) && chipActive]}
          >
            <Text
              style={{
                color: secondary.includes(group) ? '#0f172a' : palette.text,
              }}
            >
              {formatLabel(group)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={formLabel}>Modality</Text>
      <View style={chipRow}>
        {modalityOptions.map(option => {
          const typedOption = asModality(option);
          return (
            <TouchableOpacity
              key={option}
              onPress={() => updateDraft({ modality: typedOption })}
              style={[chip, modality === typedOption && chipActive]}
            >
              <Text
                style={{
                  color: modality === typedOption ? '#0f172a' : palette.text,
                }}
              >
                {formatLabel(typedOption)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={formLabel}>Logging mode</Text>
      <View style={chipRow}>
        {loggingOptions.map(option => {
          const typedOption = asLoggingMode(option);
          return (
            <TouchableOpacity
              key={option}
              onPress={() => updateDraft({ loggingMode: typedOption })}
              style={[chip, loggingMode === typedOption && chipActive]}
            >
              <Text
                style={{
                  color: loggingMode === typedOption ? '#0f172a' : palette.text,
                }}
              >
                {formatLabel(typedOption)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing(1) }}>
        <View style={{ flex: 1 }}>
          <Text style={formLabel}>Suggested min (kg)</Text>
          <TextInput
            value={minLoad}
            onChangeText={value =>
              updateDraft({ minLoad: asNumericInput(value) })
            }
            style={formInput}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={formLabel}>Suggested max (kg)</Text>
          <TextInput
            value={maxLoad}
            onChangeText={value =>
              updateDraft({ maxLoad: asNumericInput(value) })
            }
            style={formInput}
            keyboardType="numeric"
          />
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
            alignItems: 'center',
          },
          saving
            ? { backgroundColor: palette.mutedSurface }
            : { backgroundColor: palette.primary },
        ]}
      >
        <Text
          style={{
            color: saving ? palette.mutedText : '#0f172a',
            fontWeight: '600' as const,
          }}
        >
          {saving ? 'Saving...' : 'Save exercise'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel} style={secondaryButton}>
        <Text style={{ color: palette.mutedText, fontWeight: '600' as const }}>
          Cancel
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const ManageCustomExercises = ({
  active,
  archived,
  onAdd,
  onLongPress,
}: {
  active: ExerciseCatalogEntry[];
  archived: ExerciseCatalogEntry[];
  onAdd: () => void;
  onLongPress: (entry: ExerciseCatalogEntry, archived: boolean) => void;
}) => {
  const renderRow = (entry: ExerciseCatalogEntry, archivedFlag: boolean) => (
    <TouchableOpacity
      key={`${archivedFlag ? 'archived-' : ''}${entry.slug}`}
      onPress={() => onLongPress(entry, archivedFlag)}
      onLongPress={() => onLongPress(entry, archivedFlag)}
      style={manageRow}
    >
      <View>
        <Text style={{ color: palette.text, fontWeight: '600' as const }}>
          {entry.display_name}
        </Text>
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>
          {archivedFlag ? 'Archived' : formatLabel(entry.primary_muscle_group)}
        </Text>
      </View>
      <Text style={{ color: palette.mutedText, fontSize: 12 }}>Long-press</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing(2), gap: spacing(2) }}
    >
      <TouchableOpacity onPress={onAdd} style={primaryButton}>
        <Text style={{ color: '#0f172a', fontWeight: '700' as const }}>
          + Add Exercise
        </Text>
      </TouchableOpacity>
      <Text style={sectionLabel}>Active</Text>
      {active.length === 0 ? (
        <Text style={{ color: palette.mutedText }}>
          No custom exercises yet.
        </Text>
      ) : (
        active.map(entry => renderRow(entry, false))
      )}
      {archived.length > 0 && (
        <>
          <Text style={sectionLabel}>Archived</Text>
          {archived.map(entry => renderRow(entry, true))}
        </>
      )}
    </ScrollView>
  );
};

const formLabel = {
  color: palette.mutedText,
  fontSize: 12,
  letterSpacing: 0.5,
};

const formInput = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
};

const chipGrid = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing(0.75),
};

const chipRow = chipGrid;

const chip = {
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(0.5),
  paddingHorizontal: spacing(1.25),
  backgroundColor: palette.mutedSurface,
};

const chipActive = {
  backgroundColor: palette.primary,
  borderColor: palette.primary,
};

const primaryButton = {
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.primary,
  backgroundColor: palette.primary,
  paddingVertical: spacing(1.25),
  alignItems: 'center' as const,
};

const secondaryButton = {
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(1.25),
  alignItems: 'center' as const,
};

const sectionLabel = {
  color: palette.mutedText,
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
};

const manageRow = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  padding: spacing(1.25),
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
};

const menuOverlay = {
  position: 'absolute' as const,
  top: spacing(7),
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15,23,42,0.55)',
};

const menuCard = {
  marginTop: spacing(2),
  marginHorizontal: spacing(2),
  alignSelf: 'flex-end' as const,
  width: 220,
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(1),
  gap: spacing(0.5),
};

const menuItem = {
  paddingHorizontal: spacing(1.5),
  paddingVertical: spacing(0.75),
};

const sheetOverlay = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15,23,42,0.55)',
  alignItems: 'center' as const,
  justifyContent: 'flex-end' as const,
  padding: spacing(2),
};

const sheetCard = {
  width: '100%' as const,
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  borderWidth: 1,
  borderColor: palette.border,
  padding: spacing(1.5),
  gap: spacing(0.5),
};

const sheetAction = {
  paddingVertical: spacing(0.75),
  paddingHorizontal: spacing(0.5),
};

const sheetActionLabel = {
  color: palette.text,
  fontWeight: '600' as const,
};

const countExercises = (group: MuscleGroup, catalog: ExerciseCatalogEntry[]) =>
  catalog.filter(entry => entry.primary_muscle_group === group).length;

export default ExerciseBrowser;
