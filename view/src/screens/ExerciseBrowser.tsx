import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
  ScrollView,
  Keyboard,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated from 'react-native-reanimated';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  ExerciseCatalogEntry,
  ManageCatalogEntry,
  fetchManageCatalogEntries,
  setExerciseHidden,
} from '../exercise/catalogStorage';
import {
  ExerciseName,
  ExerciseSlug,
  LabelText,
  LoggingMode,
  LoggingModeValue,
  Modality,
  ModalityValue,
  MuscleGroup,
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
import {
  cardShadowStyle,
  getContrastTextColor,
  palette,
  spacing,
  radius,
} from '../ui/theme';
import { addAlpha } from '../ui/color';
import { muscleColorMap } from '../ui/muscleColors';
import { exerciseSearchScore, normalizeSearchText } from '../exercise/search';
import ScreenHeader from '../ui/ScreenHeader';
import { BottomSheet, SectionHeading } from '../ui/components';
import SearchIcon from '../assets/search.svg';
import SettingsIcon from '../assets/settings.svg';
import PagerTabsRail from '../ui/pager/PagerTabsRail';
import { usePagerTabsController } from '../ui/pager/usePagerTabsController';
import { useMeasuredCardHeight } from '../ui/lists/useMeasuredCardHeight';
import {
  KEYBOARD_GAP,
  resolveFooterLayout,
  useKeyboardViewportInset,
} from '../ui/useKeyboardViewportInset';
import {
  AppDispatch,
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { RootState } from '../state/appState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BrowserStackParamList = {
  list: undefined;
  manage: undefined;
  form: undefined;
};

const BrowserStack = createNativeStackNavigator<BrowserStackParamList>();
const exerciseListTabs = ['all', 'favorites'] as const;
type ExerciseListTab = (typeof exerciseListTabs)[number];
const exerciseListTabDefinitions: ReadonlyArray<{
  key: ExerciseListTab;
  label: string;
}> = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: 'Favorites' },
];
const manageTabs = ['active', 'archived'] as const;
type ManageTab = (typeof manageTabs)[number];
const manageTabDefinitions: ReadonlyArray<{
  key: ManageTab;
  label: string;
}> = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
];

const estimateExerciseListHeight = ({
  rowCount,
  groupCount,
}: {
  rowCount: number;
  groupCount: number;
}) => {
  const headerHeight = groupCount > 0 ? 96 : 46;
  const rowHeight = 72;
  const emptyHeight = 44;
  const separators = Math.max(0, rowCount - 1);
  return (
    headerHeight +
    (rowCount > 0 ? rowCount * rowHeight + separators : emptyHeight) +
    spacing(2.5)
  );
};

const estimateManageListHeight = (rowCount: number) => {
  const rowHeight = 72;
  const emptyHeight = 52;
  const separators = Math.max(0, rowCount - 1);
  return (
    (rowCount > 0 ? rowCount * rowHeight + separators : emptyHeight) +
    spacing(2)
  );
};

type ExerciseContextEntry = NonNullable<RootState['browser']['contextEntry']>;

const buildExerciseContextEntry = (
  entry: ExerciseCatalogEntry,
  options?: {
    archived?: boolean;
    archiveSource?: ExerciseContextEntry['archiveSource'];
  },
): ExerciseContextEntry => ({
  entry,
  archived: Boolean(options?.archived),
  custom: entry.source === asExerciseSource('custom'),
  archiveSource: options?.archiveSource,
});

const openExerciseContext = (
  dispatch: AppDispatch,
  entry: ExerciseCatalogEntry,
  options?: {
    archived?: boolean;
    archiveSource?: ExerciseContextEntry['archiveSource'];
  },
) => {
  dispatch({
    type: 'browser/context',
    context: buildExerciseContextEntry(entry, options),
  });
};

const ExerciseBrowserListScreen = () => {
  const insets = useSafeAreaInsets();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const navigation =
    useNavigation<NativeStackNavigationProp<BrowserStackParamList>>();
  const catalog = state.catalog.entries;
  const favoriteSlugs = state.catalog.favorites;
  const { selectedGroup, query, searchExpanded, activeTab } = state.browser;
  const listTabController = usePagerTabsController({
    tabs: exerciseListTabs,
    selectedTab: activeTab,
    onTabChange: nextTab => {
      dispatch({ type: 'browser/tab', tab: nextTab });
    },
  });

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'groups' });
    }, [dispatch]),
  );

  const searchExercises = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return [];
    return catalog
      .map(entry => ({
        entry,
        score: exerciseSearchScore(
          q,
          entry.display_name,
          entry.primary_muscle_group,
          entry.modality,
        ),
      }))
      .filter(result => result.score !== null)
      .sort((a, b) => {
        if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
        return a.entry.display_name.localeCompare(b.entry.display_name);
      })
      .map(result => result.entry);
  }, [catalog, query]);

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

  const allVisibleExercises = useMemo(() => {
    if (!selectedGroup) return allExercises;
    return allExercises.filter(
      entry => entry.primary_muscle_group === selectedGroup,
    );
  }, [allExercises, selectedGroup]);

  const favoriteVisibleExercises = useMemo(() => {
    if (!selectedGroup) return favoriteExercises;
    return favoriteExercises.filter(
      entry => entry.primary_muscle_group === selectedGroup,
    );
  }, [favoriteExercises, selectedGroup]);

  const tabExercises = useMemo(
    () => (activeTab === 'favorites' ? favoriteExercises : allExercises),
    [activeTab, allExercises, favoriteExercises],
  );

  const allMuscleGroups = useMemo(() => {
    const groups = Array.from(
      new Set(allExercises.map(entry => entry.primary_muscle_group)),
    ) as MuscleGroup[];
    return groups.sort((a, b) => a.localeCompare(b));
  }, [allExercises]);

  const favoriteMuscleGroups = useMemo(() => {
    const groups = Array.from(
      new Set(favoriteExercises.map(entry => entry.primary_muscle_group)),
    ) as MuscleGroup[];
    return groups.sort((a, b) => a.localeCompare(b));
  }, [favoriteExercises]);

  const muscleGroups = useMemo(
    () => (activeTab === 'favorites' ? favoriteMuscleGroups : allMuscleGroups),
    [activeTab, allMuscleGroups, favoriteMuscleGroups],
  );

  const filterGroupsByQuery = useCallback(
    (groups: MuscleGroup[]) => {
      const q = normalizeSearchText(query);
      if (!q) return groups;
      return groups
        .map(group => ({ group, score: exerciseSearchScore(q, group) }))
        .filter(entry => entry.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .map(entry => entry.group);
    },
    [query],
  );

  const allFilteredGroups = useMemo(() => {
    return filterGroupsByQuery(allMuscleGroups);
  }, [allMuscleGroups, filterGroupsByQuery]);

  const favoriteFilteredGroups = useMemo(() => {
    return filterGroupsByQuery(favoriteMuscleGroups);
  }, [favoriteMuscleGroups, filterGroupsByQuery]);

  const filteredSearchGroups = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return muscleGroups;
    return muscleGroups
      .map(group => ({ group, score: exerciseSearchScore(q, group) }))
      .filter(entry => entry.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(entry => entry.group);
  }, [muscleGroups, query]);

  const headerSubtitle = useMemo((): LabelText => {
    const tabLabel = activeTab === 'favorites' ? 'Favorites' : 'All exercises';
    if (!selectedGroup) return asLabelText(tabLabel);
    return asLabelText(`${tabLabel} • ${formatLabel(selectedGroup)}`);
  }, [activeTab, selectedGroup]);
  const keyboardGap = KEYBOARD_GAP;
  const { keyboardOverlap } = useKeyboardViewportInset({
    safeAreaBottom: insets.bottom,
    keyboardGap,
  });
  const listFooterVisible = !searchExpanded;
  const listFooterLayout = resolveFooterLayout({
    insetsBottom: insets.bottom,
    keyboardOverlap,
    footerHeight: 52,
    keyboardGap,
    visible: listFooterVisible,
  });
  const listFooterBottomPadding = listFooterLayout.footerBottomPadding;
  const listFooterLift = listFooterLayout.footerLift;
  const listViewportBottomInset = listFooterLayout.viewportBottomInset;
  const searchEstimatedHeight = useMemo(
    () =>
      estimateExerciseListHeight({
        rowCount: searchExercises.length,
        groupCount: filteredSearchGroups.length,
      }),
    [filteredSearchGroups.length, searchExercises.length],
  );
  const searchCardMeasure = useMeasuredCardHeight({
    estimatedContentHeight: searchEstimatedHeight,
    viewportBottomInset: listViewportBottomInset,
    collapsed: !searchExpanded || query.trim().length === 0,
    animated: true,
    animationDurationMs: 200,
  });
  const allCardMeasure = useMeasuredCardHeight({
    estimatedContentHeight: estimateExerciseListHeight({
      rowCount: allVisibleExercises.length,
      groupCount: allFilteredGroups.length,
    }),
    viewportBottomInset: listViewportBottomInset,
  });
  const favoritesCardMeasure = useMeasuredCardHeight({
    estimatedContentHeight: estimateExerciseListHeight({
      rowCount: favoriteVisibleExercises.length,
      groupCount: favoriteFilteredGroups.length,
    }),
    viewportBottomInset: listViewportBottomInset,
  });

  useEffect(() => {
    if (!selectedGroup) return;
    const groupStillAvailable = tabExercises.some(
      entry => entry.primary_muscle_group === selectedGroup,
    );
    if (!groupStillAvailable) {
      dispatch({ type: 'browser/group', group: null });
    }
  }, [dispatch, selectedGroup, tabExercises]);

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
              color: isActive ? getContrastTextColor(groupColor) : groupColor,
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
        openExerciseContext(dispatch, item);
      }}
      style={rowStyle()}
    >
      <View style={{ flex: 1, gap: spacing(0.25) }}>
        <Text style={rowText()}>{item.display_name}</Text>
        <Text style={rowMeta()}>{`${formatLabel(
          item.primary_muscle_group,
        )} • ${formatLabel(item.modality)}`}</Text>
      </View>
      <Text
        style={[
          rowMeta(),
          {
            color: favoriteSlugs.includes(item.slug)
              ? palette.primary
              : palette.mutedText,
            fontSize: 16,
            lineHeight: 18,
          },
        ]}
      >
        {favoriteSlugs.includes(item.slug) ? '★' : ''}
      </Text>
    </TouchableOpacity>
  );
  const listDividerComponent = useCallback(
    () => <View style={listDivider()} />,
    [],
  );

  const showSearch = true;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title={asLabelText('Exercises')}
        subtitle={headerSubtitle}
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
                  iconButton(),
                  searchExpanded && { backgroundColor: palette.primary },
                ]}
                accessibilityRole="button"
                accessibilityLabel={asLabelText('Search exercises')}
              >
                <SearchIcon
                  width={16}
                  height={16}
                  color={
                    searchExpanded
                      ? getContrastTextColor(palette.primary)
                      : palette.text
                  }
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                dispatch({ type: 'browser/menu', open: false });
                navigation.navigate('manage');
              }}
              style={iconButton()}
              accessibilityRole="button"
              accessibilityLabel={asLabelText('Manage exercises')}
            >
              <SettingsIcon width={16} height={16} color={palette.text} />
            </TouchableOpacity>
          </View>
        }
      />

      <ExerciseContextSheet
        onFormNavigate={() => navigation.navigate('form')}
      />

      <View style={{ flex: 1 }}>
        {searchExpanded && (
          <View style={searchContainer()}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing(1),
                paddingHorizontal: spacing(2),
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
                style={[searchInput(), { flex: 1 }]}
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
            {query.trim().length === 0 ? (
              <View
                style={{
                  paddingHorizontal: spacing(2),
                  paddingTop: spacing(1.5),
                  paddingBottom: spacing(2),
                }}
              >
                <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                  Search muscle groups or exercises.
                </Text>
              </View>
            ) : (
              <View
                style={{ flex: 1 }}
                onLayout={searchCardMeasure.onViewportLayout}
              >
                <Animated.View
                  style={[
                    listSurface(),
                    { marginTop: spacing(1.25) },
                    searchCardMeasure.heightStyle,
                  ]}
                >
                  <FlatList<ExerciseCatalogEntry>
                    data={searchExercises}
                    keyExtractor={item => item.slug}
                    renderItem={renderExerciseRow}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    style={{ flex: 1 }}
                    scrollEnabled={searchCardMeasure.scrollEnabled}
                    contentContainerStyle={[
                      {
                        paddingHorizontal: spacing(1.25),
                        paddingTop: spacing(0.5),
                        paddingBottom: spacing(2),
                      },
                      !searchCardMeasure.scrollEnabled ? { flexGrow: 0 } : null,
                    ]}
                    onContentSizeChange={searchCardMeasure.onContentSizeChange}
                    ListHeaderComponent={
                      <View style={listHeaderWrap()}>
                        <View style={groupSectionWrap()}>
                          {filteredSearchGroups.length === 0 ? (
                            <Text
                              style={{ color: palette.mutedText, fontSize: 12 }}
                            >
                              No muscle groups found.
                            </Text>
                          ) : (
                            <View style={groupTagWrap}>
                              {filteredSearchGroups.map(group =>
                                renderGroupTag(group),
                              )}
                            </View>
                          )}
                        </View>
                        <View style={{ marginTop: spacing(0.5) }}>
                          <SectionHeading label={asLabelText('Exercises')} />
                        </View>
                      </View>
                    }
                    ListEmptyComponent={
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                        No exercises found.
                      </Text>
                    }
                    ItemSeparatorComponent={listDividerComponent}
                    initialNumToRender={18}
                    maxToRenderPerBatch={20}
                    windowSize={8}
                    removeClippedSubviews
                  />
                </Animated.View>
              </View>
            )}
          </View>
        )}
        {!searchExpanded && (
          <>
            <PagerTabsRail
              tabs={exerciseListTabDefinitions}
              activeKey={activeTab}
              progress={listTabController.progress}
              onSelect={key =>
                listTabController.onTabPress(key as ExerciseListTab)
              }
            />
            <PagerView
              ref={listTabController.pagerRef}
              style={{ flex: 1 }}
              initialPage={listTabController.selectedIndex}
              overdrag={false}
              onPageSelected={listTabController.onPageSelected}
              onPageScroll={listTabController.onPageScroll}
              onPageScrollStateChanged={
                listTabController.onPageScrollStateChanged
              }
            >
              <View
                key="all"
                style={{ flex: 1 }}
                onLayout={allCardMeasure.onViewportLayout}
              >
                <View style={[listSurface(), allCardMeasure.heightStyle]}>
                  <FlatList<ExerciseCatalogEntry>
                    data={allVisibleExercises}
                    keyExtractor={item => item.slug}
                    renderItem={renderExerciseRow}
                    style={{ flex: 1 }}
                    scrollEnabled={allCardMeasure.scrollEnabled}
                    contentContainerStyle={[
                      {
                        paddingHorizontal: spacing(1.25),
                        paddingTop: spacing(0.5),
                        paddingBottom: spacing(2),
                      },
                      !allCardMeasure.scrollEnabled ? { flexGrow: 0 } : null,
                    ]}
                    onContentSizeChange={allCardMeasure.onContentSizeChange}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    ListHeaderComponent={
                      <ExerciseListHeader
                        filteredGroups={allFilteredGroups}
                        selectedGroup={selectedGroup}
                        renderGroupTag={renderGroupTag}
                      />
                    }
                    ListEmptyComponent={
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                        {selectedGroup
                          ? 'No exercises found for this group.'
                          : 'No exercises available.'}
                      </Text>
                    }
                    ItemSeparatorComponent={listDividerComponent}
                    initialNumToRender={20}
                    maxToRenderPerBatch={20}
                    windowSize={7}
                    removeClippedSubviews
                  />
                </View>
              </View>
              <View
                key="favorites"
                style={{ flex: 1 }}
                onLayout={favoritesCardMeasure.onViewportLayout}
              >
                <View style={[listSurface(), favoritesCardMeasure.heightStyle]}>
                  <FlatList<ExerciseCatalogEntry>
                    data={favoriteVisibleExercises}
                    keyExtractor={item => item.slug}
                    renderItem={renderExerciseRow}
                    style={{ flex: 1 }}
                    scrollEnabled={favoritesCardMeasure.scrollEnabled}
                    contentContainerStyle={[
                      {
                        paddingHorizontal: spacing(1.25),
                        paddingTop: spacing(0.5),
                        paddingBottom: spacing(2),
                      },
                      !favoritesCardMeasure.scrollEnabled
                        ? { flexGrow: 0 }
                        : null,
                    ]}
                    onContentSizeChange={
                      favoritesCardMeasure.onContentSizeChange
                    }
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                    ListHeaderComponent={
                      <ExerciseListHeader
                        filteredGroups={favoriteFilteredGroups}
                        selectedGroup={selectedGroup}
                        renderGroupTag={renderGroupTag}
                      />
                    }
                    ListEmptyComponent={
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                        {selectedGroup
                          ? 'No favorites found for this group.'
                          : 'Mark favorites to see them here.'}
                      </Text>
                    }
                    ItemSeparatorComponent={listDividerComponent}
                    initialNumToRender={20}
                    maxToRenderPerBatch={20}
                    windowSize={7}
                    removeClippedSubviews
                  />
                </View>
              </View>
            </PagerView>
          </>
        )}
        {!searchExpanded && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: spacing(2),
              paddingBottom: listFooterBottomPadding,
              paddingTop: 0,
              backgroundColor: palette.background,
              transform: [{ translateY: -listFooterLift }],
            }}
          >
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
              style={[
                primaryButton(),
                {
                  borderColor: palette.primary,
                  backgroundColor: palette.primary,
                },
              ]}
            >
              <Text
                style={{
                  color: getContrastTextColor(palette.primary),
                  fontWeight: '700' as const,
                }}
              >
                + Add Exercise
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const ExerciseContextSheet = ({
  onFormNavigate,
}: {
  onFormNavigate: () => void;
}) => {
  const isFocused = useIsFocused();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const favoriteSlugs = state.catalog.favorites;
  const contextEntry = state.browser.contextEntry;
  if (!isFocused) return null;
  if (!contextEntry) return null;
  const isArchived = contextEntry.archived;
  const isFavorite = favoriteSlugs.includes(contextEntry.entry.slug);

  const closeContext = () => {
    Keyboard.dismiss();
    dispatch({ type: 'browser/context', context: null });
  };

  const handleFavoriteToggle = async () => {
    await actions.toggleFavorite(contextEntry.entry.slug, !isFavorite);
  };

  const handleArchiveToggle = async () => {
    const nextArchived = !isArchived;
    if (contextEntry.custom) {
      await actions.archiveCustomExercise(
        contextEntry.entry.slug,
        nextArchived,
      );
      return;
    }
    if (nextArchived && isFavorite) {
      await actions.toggleFavorite(contextEntry.entry.slug, false);
    }
    await setExerciseHidden(contextEntry.entry.slug, nextArchived);
    await actions.refreshAll();
  };

  type SheetActionDescriptor = {
    key: string;
    label: string;
    tone?: 'default' | 'danger' | 'muted';
    hidden?: boolean;
    onPress: () => void | Promise<void>;
  };

  const actionDescriptors: SheetActionDescriptor[] = [
    {
      key: 'select',
      label: 'Select exercise',
      hidden: isArchived,
      onPress: () =>
        actions.openLogForExercise(
          contextEntry.entry.display_name,
          state.selectedDate,
          'Track',
        ),
    },
    {
      key: 'edit',
      label: 'Edit exercise',
      onPress: () => {
        dispatch({
          type: 'browser/form',
          entry: contextEntry.entry,
        });
        dispatch({
          type: 'browser/formDraft',
          draft: draftFromEntry(contextEntry.entry),
        });
        onFormNavigate();
      },
    },
    {
      key: 'favorite',
      label: isFavorite ? 'Remove favorite' : 'Add to favorites',
      hidden: isArchived,
      onPress: handleFavoriteToggle,
    },
    {
      key: 'archive',
      label: isArchived ? 'Restore exercise' : 'Archive exercise',
      onPress: handleArchiveToggle,
    },
    {
      key: 'delete',
      label: 'Delete exercise',
      tone: 'danger',
      onPress: () => actions.deleteExercise(contextEntry.entry),
    },
    {
      key: 'cancel',
      label: 'Cancel',
      tone: 'muted',
      onPress: closeContext,
    },
  ];

  return (
    <BottomSheet visible={Boolean(contextEntry)} onClose={closeContext}>
      <View style={sheetCard()}>
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
          {!isArchived ? (
            <TouchableOpacity onPress={handleFavoriteToggle}>
              <Text
                style={{
                  color: isFavorite ? palette.primary : palette.mutedText,
                  fontSize: 18,
                }}
              >
                {isFavorite ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {actionDescriptors
          .filter(action => !action.hidden)
          .map(action => (
            <TouchableOpacity
              key={action.key}
              onPress={async () => {
                await action.onPress();
                if (action.key !== 'cancel') {
                  closeContext();
                }
              }}
              style={[
                sheetAction(),
                action.tone === 'muted' ? { marginTop: spacing(0.5) } : null,
              ]}
            >
              <Text
                style={[
                  sheetActionLabel(),
                  action.tone === 'danger' ? { color: palette.danger } : null,
                  action.tone === 'muted'
                    ? {
                        color: palette.primary,
                        textAlign: 'center',
                      }
                    : null,
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
      </View>
    </BottomSheet>
  );
};

const ExerciseBrowserManageScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<BrowserStackParamList>>();
  const [manageEntries, setManageEntries] = useState<{
    active: ManageCatalogEntry[];
    archived: ManageCatalogEntry[];
  }>({
    active: [],
    archived: [],
  });

  const refreshManageEntries = useCallback(async () => {
    const snapshot = await fetchManageCatalogEntries();
    setManageEntries({
      active: snapshot.active
        .slice()
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
      archived: snapshot.archived
        .slice()
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    });
  }, []);

  const refreshManageEntriesSafe = useCallback(() => {
    refreshManageEntries().catch(error => {
      console.warn('Failed to refresh manage exercise entries', error);
    });
  }, [refreshManageEntries]);

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'manage' });
      refreshManageEntriesSafe();
    }, [dispatch, refreshManageEntriesSafe]),
  );

  useEffect(() => {
    refreshManageEntriesSafe();
  }, [refreshManageEntriesSafe, state.catalogRevision]);

  const keyboardGap = KEYBOARD_GAP;
  const { keyboardOverlap } = useKeyboardViewportInset({
    safeAreaBottom: insets.bottom,
    keyboardGap,
  });
  const footerLayout = resolveFooterLayout({
    insetsBottom: insets.bottom,
    keyboardOverlap,
    footerHeight: 52,
    keyboardGap,
  });
  const footerBottomPadding = footerLayout.footerBottomPadding;
  const footerLift = footerLayout.footerLift;
  const keyboardBackdropHeight = footerLayout.keyboardBackdropHeight;
  const viewportBottomInset = footerLayout.viewportBottomInset;

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
        onFormNavigate={() => navigation.navigate('form')}
      />
      <View style={{ flex: 1 }}>
        <ManageCustomExercises
          entries={manageEntries.active}
          archivedEntries={manageEntries.archived}
          searchQuery={state.browser.query}
          viewportBottomInset={viewportBottomInset}
          onSearch={value =>
            dispatch({ type: 'browser/query', query: asSearchQuery(value) })
          }
          onSelectEntry={(entry, archived, archiveSource) => {
            openExerciseContext(dispatch, entry, {
              archived,
              archiveSource,
            });
          }}
        />
        {keyboardBackdropHeight > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: keyboardBackdropHeight,
              backgroundColor: palette.background,
            }}
          />
        ) : null}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: palette.background,
            paddingHorizontal: spacing(2),
            paddingBottom: footerBottomPadding,
            transform: [{ translateY: -footerLift }],
          }}
        >
          <TouchableOpacity
            onPress={handleAdd}
            style={[
              primaryButton(),
              {
                borderColor: palette.primary,
                backgroundColor: palette.primary,
              },
            ]}
          >
            <Text
              style={{
                color: getContrastTextColor(palette.primary),
                fontWeight: '700' as const,
              }}
            >
              + Add Exercise
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
                source: formEditing?.source ?? asExerciseSource('custom'),
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

const ExerciseListHeader = ({
  filteredGroups,
  selectedGroup,
  renderGroupTag,
}: {
  filteredGroups: MuscleGroup[];
  selectedGroup: MuscleGroup | null;
  renderGroupTag: (group: MuscleGroup) => React.ReactNode;
}) => (
  <View style={listHeaderWrap()}>
    <View style={groupSectionWrap()}>
      {filteredGroups.length > 0 ? (
        <View style={groupTagWrap}>
          {filteredGroups.map(group => renderGroupTag(group))}
        </View>
      ) : null}
    </View>
    <View style={{ marginTop: spacing(0.5) }}>
      <SectionHeading
        label={asLabelText(
          selectedGroup
            ? `${formatLabel(selectedGroup)} exercises`
            : 'Exercises',
        )}
      />
    </View>
  </View>
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

const iconButton = () => ({
  padding: spacing(0.5),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
});

const searchContainer = () => ({
  flex: 1,
  paddingTop: spacing(1.5),
  paddingBottom: spacing(1),
  zIndex: 3,
});

const searchInput = () => ({
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.pill,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
});

const rowStyle = () => ({
  paddingHorizontal: spacing(0.5),
  paddingVertical: spacing(1.25),
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'flex-start' as const,
  backgroundColor: 'transparent',
});

const rowText = () => ({
  color: palette.text,
  fontSize: 15.5,
});

const rowMeta = () => ({
  color: palette.mutedText,
  fontSize: 12,
});

const listSurface = () => ({
  marginTop: spacing(0.25),
  marginHorizontal: spacing(2),
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  ...cardShadowStyle,
  paddingHorizontal: spacing(0.75),
  paddingBottom: spacing(0.5),
});

const manageSearchWrap = () => ({
  paddingHorizontal: spacing(2),
  paddingTop: spacing(1.5),
  paddingBottom: spacing(1),
});

const manageListSurface = () => ({
  marginTop: spacing(0.25),
  marginHorizontal: spacing(2),
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  ...cardShadowStyle,
  borderWidth: 1,
  borderColor: addAlpha(palette.border, 0.28),
  shadowOpacity: 0.16,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
  paddingHorizontal: spacing(0.75),
});

const listDivider = () => ({
  height: 1,
  backgroundColor: addAlpha(palette.border, 0.72),
});

const groupTagWrap = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing(0.75),
};

const groupSectionWrap = () => ({
  paddingTop: spacing(0.75),
  paddingHorizontal: spacing(0.25),
});

const listHeaderWrap = () => ({
  gap: spacing(0.5),
  paddingBottom: spacing(0.25),
});

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
        <Text style={formLabel()}>Exercise name</Text>
        <TextInput
          value={displayNameInput}
          onChangeText={setDisplayNameInput}
          onEndEditing={() => commitDisplayName(displayNameInput)}
          autoCapitalize="words"
          style={formInput()}
          placeholder="Back Squat"
        />

        <Text style={formLabel()}>Primary muscle group</Text>
        <View style={chipGrid}>
          {muscleOptions.map(group => (
            <TouchableOpacity
              key={group}
              onPress={() => updateDraft({ primary: group })}
              style={[
                chip(),
                primary === group && chipActive(),
                primary === group
                  ? {
                      backgroundColor: palette.primary,
                      borderColor: palette.primary,
                    }
                  : null,
              ]}
            >
              <Text
                style={{
                  color:
                    primary === group
                      ? getContrastTextColor(palette.primary)
                      : palette.text,
                }}
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
            style={[formInput(), { flex: 1 }]}
            placeholder="Add custom primary group"
          />
          <TouchableOpacity
            onPress={handleAddCustomGroup}
            style={[
              chipAddButton(),
              {
                borderColor: palette.primary,
                backgroundColor: palette.primary,
              },
            ]}
          >
            <Text
              style={{
                color: getContrastTextColor(palette.primary),
                fontWeight: '600' as const,
              }}
            >
              Add
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={formLabel()}>Modality</Text>
        <View style={chipRow}>
          {modalityOptions.map(option => {
            const typedOption = asModality(option);
            return (
              <TouchableOpacity
                key={option}
                onPress={() => updateDraft({ modality: typedOption })}
                style={[
                  chip(),
                  modality === typedOption && chipActive(),
                  modality === typedOption
                    ? {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                      }
                    : null,
                ]}
              >
                <Text
                  style={{
                    color:
                      modality === typedOption
                        ? getContrastTextColor(palette.primary)
                        : palette.text,
                  }}
                >
                  {formatLabel(typedOption)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={formLabel()}>Logging mode</Text>
        <View style={chipRow}>
          {loggingOptions.map(option => {
            const typedOption = asLoggingMode(option);
            return (
              <TouchableOpacity
                key={option}
                onPress={() => updateDraft({ loggingMode: typedOption })}
                style={[
                  chip(),
                  loggingMode === typedOption && chipActive(),
                  loggingMode === typedOption
                    ? {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                      }
                    : null,
                ]}
              >
                <Text
                  style={{
                    color:
                      loggingMode === typedOption
                        ? getContrastTextColor(palette.primary)
                        : palette.text,
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

      <View style={formFooter()}>
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
              color: saving
                ? palette.mutedText
                : getContrastTextColor(palette.primary),
              fontWeight: '600' as const,
            }}
          >
            {saving ? 'Saving...' : 'Save exercise'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} style={secondaryButton()}>
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
  entries,
  archivedEntries,
  searchQuery,
  viewportBottomInset,
  onSearch,
  onSelectEntry,
}: {
  entries: ManageCatalogEntry[];
  archivedEntries: ManageCatalogEntry[];
  searchQuery: SearchQuery;
  viewportBottomInset: number;
  onSearch: (value: string) => void;
  onSelectEntry: (
    entry: ManageCatalogEntry,
    archived: boolean,
    archiveSource?: 'hidden_default' | 'archived_custom',
  ) => void;
}) => {
  const [activeTab, setActiveTab] = useState<ManageTab>('active');
  const query = normalizeSearchText(searchQuery);
  const tabController = usePagerTabsController({
    tabs: manageTabs,
    selectedTab: activeTab,
    onTabChange: setActiveTab,
  });

  const activeFiltered = useMemo(
    () =>
      query
        ? entries
            .map(entry => ({
              entry,
              score: exerciseSearchScore(
                query,
                entry.display_name,
                entry.primary_muscle_group,
                entry.modality,
                entry.source,
              ),
            }))
            .filter(result => result.score !== null)
            .sort((a, b) => {
              if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
              return a.entry.display_name.localeCompare(b.entry.display_name);
            })
            .map(result => result.entry)
        : entries,
    [entries, query],
  );

  const archivedFiltered = useMemo(
    () =>
      query
        ? archivedEntries
            .map(entry => ({
              entry,
              score: exerciseSearchScore(
                query,
                entry.display_name,
                entry.primary_muscle_group,
                entry.modality,
              ),
            }))
            .filter(result => result.score !== null)
            .sort((a, b) => {
              if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
              return a.entry.display_name.localeCompare(b.entry.display_name);
            })
            .map(result => result.entry)
        : archivedEntries,
    [archivedEntries, query],
  );

  const [listViewportHeight, setListViewportHeight] = useState(0);
  const handleListViewportLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (nextHeight > 0) {
        setListViewportHeight(prev =>
          Math.abs(prev - nextHeight) > 1 ? nextHeight : prev,
        );
      }
    },
    [],
  );
  const listDividerComponent = useCallback(
    () => <View style={listDivider()} />,
    [],
  );
  const availableListHeight =
    listViewportHeight > 0
      ? Math.max(0, listViewportHeight - viewportBottomInset)
      : 0;

  const renderManageRow = useCallback(
    ({ item, archived }: { item: ManageCatalogEntry; archived: boolean }) => {
      const sourceLabel = archived
        ? item.archiveSource === 'hidden_default'
          ? 'Archived default'
          : 'Archived custom'
        : item.source === asExerciseSource('default')
        ? 'Default'
        : 'Custom';
      const subtitle = `${sourceLabel} • ${formatLabel(
        item.primary_muscle_group,
      )}`;

      return (
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            onSelectEntry(
              item,
              archived,
              archived ? item.archiveSource : undefined,
            );
          }}
          style={rowStyle()}
        >
          <View style={{ flex: 1, gap: spacing(0.25) }}>
            <Text style={rowText()}>{item.display_name}</Text>
            <Text style={rowMeta()}>{subtitle}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [onSelectEntry],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={manageSearchWrap()}>
        <TextInput
          value={searchQuery}
          onChangeText={onSearch}
          placeholder="Search exercises"
          placeholderTextColor={palette.mutedText}
          style={searchInput()}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <PagerTabsRail
        tabs={manageTabDefinitions}
        activeKey={activeTab}
        progress={tabController.progress}
        onSelect={key => tabController.onTabPress(key as ManageTab)}
      />
      <View
        style={{ flex: 1 }}
        onLayout={handleListViewportLayout}
      >
        <PagerView
          ref={tabController.pagerRef}
          style={{ flex: 1 }}
          initialPage={tabController.selectedIndex}
          overdrag={false}
          onPageSelected={tabController.onPageSelected}
          onPageScroll={tabController.onPageScroll}
          onPageScrollStateChanged={tabController.onPageScrollStateChanged}
        >
          <View key="active" style={{ flex: 1 }}>
            <View style={manageListSurface()}>
              <FlatList
                data={activeFiltered}
                keyExtractor={item => `active-${item.slug}`}
                renderItem={(info: ListRenderItemInfo<ManageCatalogEntry>) =>
                  renderManageRow({ item: info.item, archived: false })
                }
                style={{
                  maxHeight: availableListHeight,
                  flexGrow: 0,
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                scrollEnabled
                contentContainerStyle={[
                  {
                    paddingHorizontal: spacing(1.25),
                    paddingTop: spacing(0.75),
                    paddingBottom: spacing(2),
                  },
                ]}
                ItemSeparatorComponent={listDividerComponent}
                ListEmptyComponent={
                  <Text
                    style={{
                      color: palette.mutedText,
                      fontSize: 12,
                      paddingHorizontal: spacing(0.5),
                    }}
                  >
                    {query
                      ? 'No active exercises match your search.'
                      : 'No active exercises right now.'}
                  </Text>
                }
                initialNumToRender={20}
                maxToRenderPerBatch={24}
                windowSize={8}
                removeClippedSubviews
              />
            </View>
          </View>
          <View key="archived" style={{ flex: 1 }}>
            <View style={manageListSurface()}>
              <FlatList
                data={archivedFiltered}
                keyExtractor={item => `archived-${item.slug}`}
                renderItem={(info: ListRenderItemInfo<ManageCatalogEntry>) =>
                  renderManageRow({ item: info.item, archived: true })
                }
                style={{
                  maxHeight: availableListHeight,
                  flexGrow: 0,
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                scrollEnabled
                contentContainerStyle={[
                  {
                    paddingHorizontal: spacing(1.25),
                    paddingVertical: spacing(0.75),
                  },
                ]}
                ItemSeparatorComponent={listDividerComponent}
                ListEmptyComponent={
                  <Text
                    style={{
                      color: palette.mutedText,
                      fontSize: 12,
                      paddingHorizontal: spacing(0.5),
                    }}
                  >
                    {query
                      ? 'No archived exercises match your search.'
                      : 'Archive exercises to manage them here.'}
                  </Text>
                }
                initialNumToRender={20}
                maxToRenderPerBatch={24}
                windowSize={8}
                removeClippedSubviews
              />
            </View>
          </View>
        </PagerView>
      </View>
    </View>
  );
};

const formLabel = () => ({
  color: palette.mutedText,
  fontSize: 12,
  letterSpacing: 0.5,
});

const formInput = () => ({
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(1.5),
  color: palette.text,
  backgroundColor: palette.mutedSurface,
});

const chipGrid = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing(0.75),
};

const chipRow = chipGrid;

const chip = () => ({
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(0.5),
  paddingHorizontal: spacing(1.25),
  backgroundColor: palette.mutedSurface,
});

const chipActive = () => ({
  backgroundColor: palette.primary,
  borderColor: palette.primary,
});

const primaryButton = () => ({
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.primary,
  backgroundColor: palette.primary,
  paddingVertical: spacing(1.25),
  alignItems: 'center' as const,
});

const secondaryButton = () => ({
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(1.25),
  alignItems: 'center' as const,
});

const formFooter = () => ({
  padding: spacing(2),
  borderTopWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.background,
  gap: spacing(1),
});

const chipAddButton = () => ({
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.primary,
  backgroundColor: palette.primary,
  paddingHorizontal: spacing(1.5),
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
});

const sheetCard = () => ({
  width: '100%' as const,
  borderRadius: radius.card,
  backgroundColor: palette.surface,
  borderWidth: 0,
  borderColor: 'transparent',
  ...cardShadowStyle,
  padding: spacing(1.5),
  gap: spacing(0.5),
});

const sheetAction = () => ({
  paddingVertical: spacing(0.75),
  paddingHorizontal: spacing(0.5),
});

const sheetActionLabel = () => ({
  color: palette.text,
  fontWeight: '600' as const,
});

export default ExerciseBrowserStack;
