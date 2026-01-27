import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import {
  ExerciseName,
  ExerciseSlug,
  LabelText,
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
  asLabelText,
  asLoggingMode,
  asModality,
  asMuscleGroup,
  asNumericInput,
  asSearchQuery,
  asErrorMessage,
  asTag,
} from '../domain/types';
import { palette, spacing, radius } from '../ui/theme';
import { muscleColorMap } from '../ui/muscleColors';
import ScreenHeader from '../ui/ScreenHeader';
import { SectionHeading } from '../ui/components';
import SearchIcon from '../assets/search.svg';
import SettingsIcon from '../assets/settings.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { RootState } from '../state/appState';

type BrowserStackParamList = {
  list: undefined;
  manage: undefined;
  form: undefined;
};

const BrowserStack = createNativeStackNavigator<BrowserStackParamList>();

const ExerciseBrowserListScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const navigation =
    useNavigation<NativeStackNavigationProp<BrowserStackParamList>>();
  const catalog = state.catalog.entries;
  const favoriteSlugs = state.catalog.favorites;
  const { selectedGroup, query, searchExpanded, menuOpen, activeTab } =
    state.browser;

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'groups' });
    }, [dispatch]),
  );

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

  const searchExercises = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter(entry => entry.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [catalog, query]);

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

  const allExercises = useMemo(
    () =>
      catalog
        .slice()
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [catalog],
  );

  const isGroupView = !selectedGroup;

  const visibleExercises = useMemo(() => {
    if (activeTab === 'favorites') return favoriteExercises;
    if (selectedGroup) return filteredExercises;
    return allExercises;
  }, [
    activeTab,
    allExercises,
    favoriteExercises,
    filteredExercises,
    selectedGroup,
  ]);

  const headerTitle = useMemo((): LabelText => {
    if (selectedGroup) return asLabelText(formatLabel(selectedGroup));
    return asLabelText('Exercises');
  }, [selectedGroup]);

  const collapseSearch = () => {
    dispatch({ type: 'browser/search', expanded: false });
    dispatch({ type: 'browser/query', query: asSearchQuery('') });
  };

  const renderGroupTag = (group: MuscleGroup) => {
    const groupColor = muscleColorMap[group] ?? palette.primary;
    const isActive = selectedGroup === group;
    return (
      <TouchableOpacity
        key={group}
        onPress={() => {
          dispatch({
            type: 'browser/group',
            group: selectedGroup === group ? null : group,
          });
          dispatch({ type: 'browser/query', query: asSearchQuery('') });
        }}
      >
        <View
          style={[
            groupTag,
            {
              backgroundColor: isActive
                ? groupColor
                : addAlpha(groupColor, 0.2),
              borderColor: isActive ? groupColor : addAlpha(groupColor, 0.45),
            },
          ]}
        >
          <Text
            style={{
              color: isActive ? '#0f172a' : groupColor,
              fontWeight: '600',
              fontSize: 12,
            }}
          >
            {formatLabel(group)}
          </Text>
        </View>
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
      onLongPress={() => {
        dispatch({ type: 'browser/menu', open: false });
        dispatch({ type: 'browser/search', expanded: false });
        dispatch({ type: 'browser/context', context: { entry: item } });
      }}
      style={rowStyle}
    >
      <View style={{ flex: 1, gap: spacing(0.25) }}>
        <Text style={rowText}>{item.display_name}</Text>
        <Text style={rowMeta}>{`${formatLabel(
          item.primary_muscle_group,
        )} • ${formatLabel(item.modality)}`}</Text>
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

  const showSearch = true;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title={headerTitle}
        subtitle={
          isGroupView
            ? activeTab === 'favorites'
              ? asLabelText('Favorites')
              : asLabelText('All exercises')
            : undefined
        }
        onBack={actions.handleBack}
        rightSlot={
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            {showSearch ? (
              <TouchableOpacity
                onPress={() => {
                  if (searchExpanded) {
                    dispatch({
                      type: 'browser/query',
                      query: asSearchQuery(''),
                    });
                  }
                  dispatch({ type: 'browser/menu', open: false });
                  dispatch({
                    type: 'browser/search',
                    expanded: !searchExpanded,
                  });
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
            ) : null}
            {isGroupView ? (
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

      {menuOpen && isGroupView && !searchExpanded && (
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
                  navigation.navigate('manage');
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

      <ExerciseContextSheet
        onManageNavigate={() => navigation.navigate('manage')}
        onFormNavigate={() => navigation.navigate('form')}
      />

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
            <ScrollView
              contentContainerStyle={{
                paddingTop: spacing(1.5),
                paddingBottom: spacing(8),
                gap: spacing(1.5),
              }}
              keyboardShouldPersistTaps="handled"
            >
              {query.trim().length === 0 ? (
                <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                  Search muscle groups or exercises.
                </Text>
              ) : (
                <>
                  <View style={{ gap: spacing(1) }}>
                    {filteredGroups.length === 0 ? (
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                        No muscle groups found.
                      </Text>
                    ) : (
                      <View style={groupTagWrap}>
                        {filteredGroups.map(group => renderGroupTag(group))}
                      </View>
                    )}
                  </View>
                  <View style={{ gap: spacing(1) }}>
                    <SectionHeading label={asLabelText('Exercises')} />
                    {searchExercises.length === 0 ? (
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                        No exercises found.
                      </Text>
                    ) : (
                      searchExercises.map(item => (
                        <View
                          key={item.slug}
                          style={{ marginBottom: spacing(0.5) }}
                        >
                          {renderExerciseRow({
                            item,
                          } as ListRenderItemInfo<ExerciseCatalogEntry>)}
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        )}
        {isGroupView && !searchExpanded && (
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
        {!searchExpanded ? (
          <FlatList<ExerciseCatalogEntry>
            data={selectedGroup ? filteredExercises : visibleExercises}
            keyExtractor={item => item.slug}
            renderItem={renderExerciseRow}
            contentContainerStyle={{
              paddingHorizontal: spacing(2),
              paddingBottom: spacing(8),
              gap: spacing(1.5),
            }}
            ListHeaderComponent={
              <>
                {activeTab === 'all' && isGroupView ? (
                  <View style={{ gap: spacing(1) }}>
                    {filteredGroups.length === 0 ? (
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                        No muscle groups available.
                      </Text>
                    ) : (
                      <View style={groupTagWrap}>
                        {filteredGroups.map(group => renderGroupTag(group))}
                      </View>
                    )}
                  </View>
                ) : null}
                <View style={{ gap: spacing(1) }}>
                  <SectionHeading
                    label={asLabelText(
                      selectedGroup
                        ? `${formatLabel(selectedGroup)} exercises`
                        : 'Exercises',
                    )}
                  />
                </View>
              </>
            }
            ListEmptyComponent={
              <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                {selectedGroup
                  ? 'No exercises found for this group.'
                  : 'No exercises available.'}
              </Text>
            }
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={7}
            removeClippedSubviews
          />
        ) : null}
      </>
      {isGroupView && !searchExpanded && (
        <View style={{ padding: spacing(2) }}>
          <TouchableOpacity
            onPress={() => {
              dispatch({ type: 'browser/form', entry: null });
              dispatch({ type: 'browser/search', expanded: false });
              dispatch({ type: 'browser/menu', open: false });
              dispatch({
                type: 'browser/formDraft',
                draft: emptyFormDraft(),
              });
              navigation.navigate('form');
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

const ExerciseContextSheet = ({
  onManageNavigate,
  onFormNavigate,
}: {
  onManageNavigate: () => void;
  onFormNavigate: () => void;
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const favoriteSlugs = state.catalog.favorites;
  const contextEntry = state.browser.contextEntry;
  if (!contextEntry) return null;

  const handleFavoriteToggle = async (slug: ExerciseSlug) => {
    const isFavorite = favoriteSlugs.includes(slug);
    await actions.toggleFavorite(slug, !isFavorite);
  };

  return (
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
                  onPress={() => handleFavoriteToggle(contextEntry.entry.slug)}
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
                    onManageNavigate();
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
                <TouchableOpacity
                  onPress={async () => {
                    await actions.deleteExercise(contextEntry.entry);
                    dispatch({ type: 'browser/context', context: null });
                  }}
                  style={sheetAction}
                >
                  <Text style={[sheetActionLabel, { color: palette.danger }]}>
                    Hide exercise
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
                    onFormNavigate();
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
                <TouchableOpacity
                  onPress={async () => {
                    await actions.deleteExercise(contextEntry.entry);
                    dispatch({ type: 'browser/context', context: null });
                  }}
                  style={sheetAction}
                >
                  <Text style={[sheetActionLabel, { color: palette.danger }]}>
                    Delete exercise
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
  );
};

const ExerciseBrowserManageScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigation =
    useNavigation<NativeStackNavigationProp<BrowserStackParamList>>();
  const customExercises = state.catalog.custom;

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'manage' });
    }, [dispatch]),
  );

  const handleAdd = () => {
    dispatch({ type: 'browser/form', entry: null });
    dispatch({ type: 'browser/search', expanded: false });
    dispatch({ type: 'browser/menu', open: false });
    dispatch({
      type: 'browser/formDraft',
      draft: emptyFormDraft(),
    });
    navigation.navigate('form');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title={asLabelText('Manage Exercises')}
        onBack={() => navigation.goBack()}
      />
      <ExerciseContextSheet
        onManageNavigate={() => navigation.navigate('manage')}
        onFormNavigate={() => navigation.navigate('form')}
      />
      <ManageCustomExercises
        active={customExercises
          .filter(entry => !entry.archived)
          .sort((a, b) => a.display_name.localeCompare(b.display_name))}
        archived={customExercises
          .filter(entry => entry.archived)
          .sort((a, b) => a.display_name.localeCompare(b.display_name))}
        searchQuery={state.browser.query}
        onSearch={value =>
          dispatch({ type: 'browser/query', query: asSearchQuery(value) })
        }
        onAdd={handleAdd}
        onLongPress={(entry, archived) => {
          dispatch({ type: 'browser/menu', open: false });
          dispatch({ type: 'browser/search', expanded: false });
          dispatch({
            type: 'browser/context',
            context: { entry, archived, custom: true },
          });
        }}
      />
    </View>
  );
};

const ExerciseBrowserFormScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const navigation =
    useNavigation<NativeStackNavigationProp<BrowserStackParamList>>();
  const formDraft = state.browser.formDraft;
  const formEditing = state.browser.formEditing;

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'form' });
    }, [dispatch]),
  );

  const updateFormDraft = useCallback(
    (partial: Partial<typeof formDraft>) => {
      dispatch({
        type: 'browser/formDraft',
        draft: { ...formDraft, ...partial },
      });
    },
    [dispatch, formDraft],
  );

  const handleCancel = () => {
    dispatch({ type: 'browser/form', entry: null });
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title={asLabelText(formEditing ? 'Edit Exercise' : 'Add Exercise')}
        onBack={handleCancel}
      />
      <ExerciseForm
        draft={formDraft}
        updateDraft={updateFormDraft}
        customPrimaryGroups={collectCustomGroups(state.catalog.entries)}
        onCancel={handleCancel}
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
            updateFormDraft(emptyFormDraft());
            navigation.goBack();
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
    </View>
  );
};

const ExerciseBrowserStack = () => (
  <BrowserStack.Navigator screenOptions={{ headerShown: false }}>
    <BrowserStack.Screen name="list" component={ExerciseBrowserListScreen} />
    <BrowserStack.Screen
      name="manage"
      component={ExerciseBrowserManageScreen}
    />
    <BrowserStack.Screen name="form" component={ExerciseBrowserFormScreen} />
  </BrowserStack.Navigator>
);

const formatLabel = (
  label: ExerciseName | MuscleGroup | SearchQuery | Modality | LoggingMode,
) =>
  label
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const formatExerciseNameInput = (value: string) =>
  value.replace(
    /(^|\s)(\S)/g,
    (_match: string, spacer: string, char: string) =>
      `${spacer}${char.toUpperCase()}`,
  );

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

const addAlpha = (hex: string, alpha: number) => {
  const normalized = Math.max(0, Math.min(1, alpha));
  const alphaHex = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`;
};

const normalizeMuscleGroup = (value: string) => slugify(value);

const collectCustomGroups = (entries: ExerciseCatalogEntry[]) => {
  const baseGroups = new Set(Object.keys(muscleColorMap));
  const customGroups = new Set<string>();
  entries.forEach(entry => {
    const group = String(entry.primary_muscle_group);
    if (!baseGroups.has(group)) customGroups.add(group);
  });
  return Array.from(customGroups).map(group => asMuscleGroup(group));
};

const upsertTag = (tags: Tag[], tag: Tag) =>
  tags.some(existing => existing === tag) ? tags : [...tags, tag];

const ensureCustomPrimaryTag = (primary: MuscleGroup, tags: Tag[]) => {
  if (primary in muscleColorMap) return tags;
  return upsertTag(tags, asTag(formatLabel(primary)));
};

const emptyFormDraft = (): BrowserFormDraft => ({
  displayName: asExerciseName(''),
  slug: asExerciseSlug(''),
  primary: asMuscleGroup('chest'),
  secondary: [],
  modality: asModality('strength'),
  loggingMode: asLoggingMode('reps_weight'),
  minLoad: asNumericInput(''),
  maxLoad: asNumericInput(''),
  tags: [],
  saving: false,
  error: null,
});

const draftFromEntry = (entry: ExerciseCatalogEntry): BrowserFormDraft => ({
  displayName: entry.display_name ?? asExerciseName(''),
  slug: entry.slug ?? asExerciseSlug(''),
  primary: entry.primary_muscle_group ?? asMuscleGroup('chest'),
  secondary: entry.secondary_groups ?? [],
  modality: entry.modality ?? asModality('strength'),
  loggingMode: entry.logging_mode ?? asLoggingMode('reps_weight'),
  minLoad: asNumericInput(entry.suggested_load_range?.min?.toString() ?? ''),
  maxLoad: asNumericInput(entry.suggested_load_range?.max?.toString() ?? ''),
  tags: entry.tags ?? [],
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
  zIndex: 3,
};

const searchInput = {
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.pill,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
};

const tabRow = {
  flexDirection: 'row' as const,
  gap: spacing(1),
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(0.75),
  marginHorizontal: spacing(2),
  marginBottom: spacing(1),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
};

const tabButton = {
  flex: 1,
  borderRadius: radius.card,
  paddingVertical: spacing(0.75),
  alignItems: 'center' as const,
  backgroundColor: 'transparent',
};

const tabButtonActive = {
  backgroundColor: palette.primary,
  borderColor: palette.primary,
};

const rowStyle = {
  paddingHorizontal: spacing(1.5),
  paddingVertical: spacing(1.25),
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  backgroundColor: palette.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  marginBottom: spacing(0.5),
};

const rowText = {
  color: palette.text,
  fontSize: 16,
};

const rowMeta = {
  color: palette.mutedText,
  fontSize: 12,
};

const groupTagWrap = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing(0.75),
};

const groupTag = {
  borderRadius: radius.pill,
  borderWidth: 1,
  paddingVertical: spacing(0.5),
  paddingHorizontal: spacing(1),
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
  customPrimaryGroups,
  onSubmit,
  onCancel,
}: {
  draft: BrowserFormDraft;
  updateDraft: (partial: Partial<BrowserFormDraft>) => void;
  customPrimaryGroups: MuscleGroup[];
  onSubmit: (values: ExerciseFormValues) => Promise<void>;
  onCancel: () => void;
}) => {
  const {
    displayName,
    slug,
    primary,
    modality,
    loggingMode,
    tags,
    saving,
    error,
  } = draft;
  const [displayNameInput, setDisplayNameInput] = useState(
    displayName as string,
  );
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [localCustomGroups, setLocalCustomGroups] = useState<MuscleGroup[]>([]);

  useEffect(() => {
    setDisplayNameInput(displayName as string);
  }, [displayName]);

  const muscleOptions = useMemo(() => {
    const baseGroups = Object.keys(muscleColorMap);
    const combined = new Set<string>([
      ...baseGroups,
      ...customPrimaryGroups.map(group => String(group)),
      ...localCustomGroups.map(group => String(group)),
      String(primary),
    ]);
    return Array.from(combined).map(group => asMuscleGroup(group));
  }, [customPrimaryGroups, localCustomGroups, primary]);
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
    'time',
    'distance',
    'time_distance',
    'distance_weight',
  ];

  const commitDisplayName = (value: string) => {
    const formatted = formatExerciseNameInput(value);
    updateDraft({
      displayName: asExerciseName(formatted),
      slug: asExerciseSlug(slugify(formatted)),
    });
  };

  const handleAddCustomGroup = () => {
    const raw = customGroupInput.trim();
    if (!raw) return;
    const normalized = normalizeMuscleGroup(raw);
    if (!normalized) return;
    const nextGroup = asMuscleGroup(normalized);
    if (!localCustomGroups.includes(nextGroup)) {
      setLocalCustomGroups([...localCustomGroups, nextGroup]);
    }
    const nextTags = upsertTag(tags, asTag(formatExerciseNameInput(raw)));
    updateDraft({ primary: nextGroup, tags: nextTags });
    setCustomGroupInput('');
  };

  const handleSave = async () => {
    updateDraft({ error: null });
    const normalizedName = formatExerciseNameInput(displayNameInput.trim());
    if (!normalizedName) {
      updateDraft({ error: asErrorMessage('Exercise name is required.') });
      return;
    }
    if (!primary) {
      updateDraft({
        error: asErrorMessage('Primary muscle group is required.'),
      });
      return;
    }
    const generatedSlug = slugify(normalizedName);
    updateDraft({
      displayName: asExerciseName(normalizedName),
      slug: asExerciseSlug(generatedSlug || slugify(String(slug))),
    });
    const nextTags = ensureCustomPrimaryTag(primary, tags);
    await onSubmit({
      display_name: asExerciseName(normalizedName),
      slug: asExerciseSlug(generatedSlug || slugify(String(slug))),
      primary_muscle_group: primary,
      secondary_groups: [],
      modality,
      logging_mode: loggingMode,
      suggested_load_range: {
        min: 0,
        max: 0,
      },
      tags: nextTags.length ? nextTags : undefined,
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing(2), gap: spacing(1.5) }}
      >
        <Text style={formLabel}>Exercise name</Text>
        <TextInput
          value={displayNameInput}
          onChangeText={setDisplayNameInput}
          onEndEditing={() => commitDisplayName(displayNameInput)}
          autoCapitalize="words"
          style={formInput}
          placeholder="Back Squat"
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
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          <TextInput
            value={customGroupInput}
            onChangeText={setCustomGroupInput}
            style={[formInput, { flex: 1 }]}
            placeholder="Add custom primary group"
          />
          <TouchableOpacity
            onPress={handleAddCustomGroup}
            style={chipAddButton}
          >
            <Text style={{ color: '#0f172a', fontWeight: '600' as const }}>
              Add
            </Text>
          </TouchableOpacity>
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
                    color:
                      loggingMode === typedOption ? '#0f172a' : palette.text,
                  }}
                >
                  {formatLabel(typedOption)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
      </ScrollView>

      <View style={formFooter}>
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
          <Text
            style={{ color: palette.mutedText, fontWeight: '600' as const }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ManageCustomExercises = ({
  active,
  archived,
  searchQuery,
  onSearch,
  onAdd,
  onLongPress,
}: {
  active: ExerciseCatalogEntry[];
  archived: ExerciseCatalogEntry[];
  searchQuery: SearchQuery;
  onSearch: (value: string) => void;
  onAdd: () => void;
  onLongPress: (entry: ExerciseCatalogEntry, archived: boolean) => void;
}) => {
  const query = searchQuery.trim().toLowerCase();
  const activeFiltered = query
    ? active.filter(entry => entry.display_name.toLowerCase().includes(query))
    : active;
  const archivedFiltered = query
    ? archived.filter(entry => entry.display_name.toLowerCase().includes(query))
    : archived;
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
      <View>
        <Text style={formLabel}>Search</Text>
        <TextInput
          value={searchQuery}
          onChangeText={onSearch}
          placeholder="Search exercises"
          placeholderTextColor={palette.mutedText}
          style={formInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Text style={sectionLabel}>Active</Text>
      {activeFiltered.length === 0 ? (
        <Text style={{ color: palette.mutedText }}>
          No custom exercises yet.
        </Text>
      ) : (
        activeFiltered.map(entry => renderRow(entry, false))
      )}
      {archivedFiltered.length > 0 && (
        <>
          <Text style={sectionLabel}>Archived</Text>
          {archivedFiltered.map(entry => renderRow(entry, true))}
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

const formFooter = {
  padding: spacing(2),
  borderTopWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.background,
  gap: spacing(1),
};

const chipAddButton = {
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.primary,
  backgroundColor: palette.primary,
  paddingHorizontal: spacing(1.5),
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
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
  zIndex: 2,
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
  zIndex: 4,
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

export default ExerciseBrowserStack;
