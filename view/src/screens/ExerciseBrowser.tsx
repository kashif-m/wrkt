import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ListRenderItemInfo,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Reanimated, {
  SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
  analyticsUi,
  cardShadowStyle,
  getContrastTextColor,
  palette,
  spacing,
  radius,
} from '../ui/theme';
import { addAlpha } from '../ui/color';
import { muscleColorMap } from '../ui/muscleColors';
import {
  exerciseSearchScore,
  normalizeSearchText,
} from '../exercise/search';
import ScreenHeader from '../ui/ScreenHeader';
import { BottomSheet, SectionHeading } from '../ui/components';
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
  const { selectedGroup, query, searchExpanded, activeTab } =
    state.browser;
  const listPagerRef = useRef<PagerView | null>(null);
  const listPagerIndexRef = useRef(activeTab === 'all' ? 0 : 1);
  const listRequestedIndexRef = useRef(activeTab === 'all' ? 0 : 1);
  const listTabPressAnimatingRef = useRef(false);
  const listTabProgress = useSharedValue(activeTab === 'all' ? 0 : 1);
  const [searchViewportHeight, setSearchViewportHeight] = useState(0);
  const [searchContentHeight, setSearchContentHeight] = useState(0);
  const searchCardHeight = useSharedValue(0);
  const [allViewportHeight, setAllViewportHeight] = useState(0);
  const [allContentHeight, setAllContentHeight] = useState(0);
  const [favoritesViewportHeight, setFavoritesViewportHeight] = useState(0);
  const [favoritesContentHeight, setFavoritesContentHeight] = useState(0);

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'groups' });
    }, [dispatch]),
  );

  useEffect(() => {
    const targetIndex = activeTab === 'all' ? 0 : 1;
    listRequestedIndexRef.current = targetIndex;
    listTabProgress.value = targetIndex;
    const pager = listPagerRef.current;
    if (!pager) return;
    if (listPagerIndexRef.current === targetIndex) return;
    pager.setPageWithoutAnimation(targetIndex);
    listPagerIndexRef.current = targetIndex;
  }, [activeTab, listTabProgress]);

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
  const searchListHeight = useMemo(() => {
    if (searchViewportHeight <= 0 || searchContentHeight <= 0) return 0;
    return Math.min(searchContentHeight, searchViewportHeight);
  }, [searchContentHeight, searchViewportHeight]);
  const searchListScrollEnabled =
    searchViewportHeight > 0 && searchContentHeight > searchViewportHeight;
  const allListHeight = useMemo(() => {
    const headerHeight = allFilteredGroups.length > 0 ? 96 : 46;
    const rowHeight = 72;
    const emptyHeight = 44;
    const separators = Math.max(0, allVisibleExercises.length - 1);
    const estimatedContentHeight =
      headerHeight +
      (allVisibleExercises.length > 0
        ? allVisibleExercises.length * rowHeight + separators
        : emptyHeight) +
      spacing(2.5);
    if (allViewportHeight <= 0) return estimatedContentHeight;
    const measuredHeight =
      allContentHeight > 0 ? allContentHeight : estimatedContentHeight;
    return Math.min(measuredHeight, allViewportHeight);
  }, [
    allContentHeight,
    allViewportHeight,
    allVisibleExercises.length,
    allFilteredGroups.length,
  ]);
  const favoritesListHeight = useMemo(() => {
    const headerHeight = favoriteFilteredGroups.length > 0 ? 96 : 46;
    const rowHeight = 72;
    const emptyHeight = 44;
    const separators = Math.max(0, favoriteVisibleExercises.length - 1);
    const estimatedContentHeight =
      headerHeight +
      (favoriteVisibleExercises.length > 0
        ? favoriteVisibleExercises.length * rowHeight + separators
        : emptyHeight) +
      spacing(2.5);
    if (favoritesViewportHeight <= 0) return estimatedContentHeight;
    const measuredHeight =
      favoritesContentHeight > 0
        ? favoritesContentHeight
        : estimatedContentHeight;
    return Math.min(measuredHeight, favoritesViewportHeight);
  }, [
    favoriteVisibleExercises.length,
    favoritesContentHeight,
    favoritesViewportHeight,
    favoriteFilteredGroups.length,
  ]);
  const allListScrollEnabled =
    allViewportHeight > 0 && allContentHeight > allViewportHeight;
  const favoritesListScrollEnabled =
    favoritesViewportHeight > 0 && favoritesContentHeight > favoritesViewportHeight;

  useEffect(() => {
    if (!selectedGroup) return;
    const groupStillAvailable = tabExercises.some(
      entry => entry.primary_muscle_group === selectedGroup,
    );
    if (!groupStillAvailable) {
      dispatch({ type: 'browser/group', group: null });
    }
  }, [dispatch, selectedGroup, tabExercises]);

  useEffect(() => {
    if (!searchExpanded || query.trim().length === 0 || searchListHeight <= 0) {
      searchCardHeight.value = 0;
      return;
    }
    searchCardHeight.value = withTiming(searchListHeight, { duration: 200 });
  }, [query, searchCardHeight, searchExpanded, searchListHeight]);

  const searchCardStyle = useAnimatedStyle(() => {
    if (searchCardHeight.value <= 0) {
      return {};
    }
    return { height: searchCardHeight.value };
  });

  const collapseSearch = () => {
    dispatch({ type: 'browser/search', expanded: false });
    dispatch({ type: 'browser/query', query: asSearchQuery('') });
  };

  const handleListTabSelect = useCallback(
    (tab: 'all' | 'favorites') => {
      if (tab === activeTab) return;
      const nextIndex = tab === 'all' ? 0 : 1;
      listTabPressAnimatingRef.current = true;
      listRequestedIndexRef.current = nextIndex;
      listTabProgress.value = withTiming(nextIndex, {
        duration: analyticsUi.tabTapAnimationMs,
      });
      listPagerRef.current?.setPage(nextIndex);
      listPagerIndexRef.current = nextIndex;
    },
    [activeTab, listTabProgress],
  );

  const handleListPageSelected = useCallback(
    (event: NativeSyntheticEvent<{ position: number }>) => {
      const position = event.nativeEvent.position;
      if (listTabPressAnimatingRef.current && position !== listRequestedIndexRef.current) {
        listPagerRef.current?.setPage(listRequestedIndexRef.current);
        return;
      }
      const nextTab = position === 0 ? 'all' : 'favorites';
      listTabPressAnimatingRef.current = false;
      listRequestedIndexRef.current = position;
      listTabProgress.value = position;
      listPagerIndexRef.current = position;
      if (nextTab !== activeTab) {
        dispatch({ type: 'browser/tab', tab: nextTab });
      }
    },
    [activeTab, dispatch, listTabProgress],
  );

  const handleListPageScroll = useCallback(
    (event: NativeSyntheticEvent<{ position: number; offset: number }>) => {
      if (listTabPressAnimatingRef.current) return;
      const { position, offset } = event.nativeEvent;
      listTabProgress.value = position + offset;
    },
    [listTabProgress],
  );

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
        dispatch({ type: 'browser/context', context: { entry: item } });
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
                  paddingBottom: spacing(8),
                }}
              >
                <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                  Search muscle groups or exercises.
                </Text>
              </View>
            ) : (
              <View
                style={{ flex: 1 }}
                onLayout={event => {
                  const next = event.nativeEvent.layout.height;
                  if (next > 0 && Math.abs(next - searchViewportHeight) > 1) {
                    setSearchViewportHeight(next);
                  }
                }}
              >
                <Reanimated.View
                  style={[
                    listSurface(),
                    { marginTop: spacing(1.25) },
                    searchCardStyle,
                  ]}
                >
                  <FlatList<ExerciseCatalogEntry>
                    data={searchExercises}
                    keyExtractor={item => item.slug}
                    renderItem={renderExerciseRow}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    automaticallyAdjustKeyboardInsets
                    style={{ flex: 1 }}
                    scrollEnabled={searchListScrollEnabled}
                    contentContainerStyle={[
                      {
                        paddingHorizontal: spacing(1.25),
                        paddingTop: spacing(0.5),
                        paddingBottom: spacing(2),
                      },
                      !searchListScrollEnabled ? { flexGrow: 0 } : null,
                    ]}
                    onContentSizeChange={(_width, height) => {
                      if (height > 0 && Math.abs(height - searchContentHeight) > 1) {
                        setSearchContentHeight(height);
                      }
                    }}
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
                              {filteredSearchGroups.map(group => renderGroupTag(group))}
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
                    ItemSeparatorComponent={() => <View style={listDivider()} />}
                    initialNumToRender={18}
                    maxToRenderPerBatch={20}
                    windowSize={8}
                    removeClippedSubviews
                  />
                </Reanimated.View>
              </View>
            )}
          </View>
        )}
        {!searchExpanded && (
          <>
            <PagerTabsRail
              tabs={[
                { key: 'all', label: 'All' },
                { key: 'favorites', label: 'Favorites' },
              ]}
              activeKey={activeTab}
              progress={listTabProgress}
              onSelect={key => handleListTabSelect(key as 'all' | 'favorites')}
            />
            <PagerView
              ref={listPagerRef}
              style={{ flex: 1 }}
              initialPage={activeTab === 'all' ? 0 : 1}
              overdrag={false}
              onPageSelected={handleListPageSelected}
              onPageScroll={handleListPageScroll}
            >
              <View
                key="all"
                style={{ flex: 1 }}
                onLayout={event => {
                  const next = event.nativeEvent.layout.height;
                  if (next > 0 && Math.abs(next - allViewportHeight) > 1) {
                    setAllViewportHeight(next);
                  }
                }}
              >
                <View style={[listSurface(), allListHeight ? { height: allListHeight } : null]}>
                  <FlatList<ExerciseCatalogEntry>
                    data={allVisibleExercises}
                    keyExtractor={item => item.slug}
                    renderItem={renderExerciseRow}
                    style={{ flex: 1 }}
                    scrollEnabled={allListScrollEnabled}
                    contentContainerStyle={[
                      {
                        paddingHorizontal: spacing(1.25),
                        paddingTop: spacing(0.5),
                        paddingBottom: spacing(2),
                      },
                      !allListScrollEnabled ? { flexGrow: 0 } : null,
                    ]}
                    onContentSizeChange={(_width, height) => {
                      if (height > 0 && Math.abs(height - allContentHeight) > 1) {
                        setAllContentHeight(height);
                      }
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    automaticallyAdjustKeyboardInsets
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
                    ItemSeparatorComponent={() => <View style={listDivider()} />}
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
                onLayout={event => {
                  const next = event.nativeEvent.layout.height;
                  if (
                    next > 0 &&
                    Math.abs(next - favoritesViewportHeight) > 1
                  ) {
                    setFavoritesViewportHeight(next);
                  }
                }}
              >
                <View
                  style={[
                    listSurface(),
                    favoritesListHeight ? { height: favoritesListHeight } : null,
                  ]}
                >
                  <FlatList<ExerciseCatalogEntry>
                    data={favoriteVisibleExercises}
                    keyExtractor={item => item.slug}
                    renderItem={renderExerciseRow}
                    style={{ flex: 1 }}
                    scrollEnabled={favoritesListScrollEnabled}
                    contentContainerStyle={[
                      {
                        paddingHorizontal: spacing(1.25),
                        paddingTop: spacing(0.5),
                        paddingBottom: spacing(2),
                      },
                      !favoritesListScrollEnabled ? { flexGrow: 0 } : null,
                    ]}
                    onContentSizeChange={(_width, height) => {
                      if (height > 0 && Math.abs(height - favoritesContentHeight) > 1) {
                        setFavoritesContentHeight(height);
                      }
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    automaticallyAdjustKeyboardInsets
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
                    ItemSeparatorComponent={() => <View style={listDivider()} />}
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
      </KeyboardAvoidingView>
    </View>
  );
};

const ExerciseContextSheet = ({
  onFormNavigate,
}: {
  onFormNavigate: () => void;
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const favoriteSlugs = state.catalog.favorites;
  const contextEntry = state.browser.contextEntry;
  if (!contextEntry) return null;
  const isArchived = Boolean(contextEntry.archived);

  const handleFavoriteToggle = async (slug: ExerciseSlug) => {
    const isFavorite = favoriteSlugs.includes(slug);
    await actions.toggleFavorite(slug, !isFavorite);
  };

  return (
    <BottomSheet
      visible={Boolean(contextEntry)}
      onClose={() => dispatch({ type: 'browser/context', context: null })}
    >
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

            {!isArchived ? (
              <TouchableOpacity
                onPress={() => {
                  actions.openLogForExercise(
                    contextEntry.entry.display_name,
                    state.selectedDate,
                    'Track',
                  );
                  dispatch({ type: 'browser/context', context: null });
                }}
                style={sheetAction()}
              >
                <Text style={sheetActionLabel()}>Select exercise</Text>
              </TouchableOpacity>
            ) : null}
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
              style={sheetAction()}
            >
              <Text style={sheetActionLabel()}>Edit exercise</Text>
            </TouchableOpacity>
            {!isArchived ? (
              <TouchableOpacity
                onPress={() => {
                  handleFavoriteToggle(contextEntry.entry.slug);
                  dispatch({ type: 'browser/context', context: null });
                }}
                style={sheetAction()}
              >
                <Text style={sheetActionLabel()}>
                  {favoriteSlugs.includes(contextEntry.entry.slug)
                    ? 'Remove favorite'
                    : 'Add to favorites'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={async () => {
                if (contextEntry.custom) {
                  await actions.archiveCustomExercise(
                    contextEntry.entry.slug,
                    !contextEntry.archived,
                  );
                } else {
                  if (!contextEntry.archived && favoriteSlugs.includes(contextEntry.entry.slug)) {
                    await actions.toggleFavorite(contextEntry.entry.slug, false);
                  }
                  await setExerciseHidden(
                    contextEntry.entry.slug,
                    !contextEntry.archived,
                  );
                  await actions.refreshAll();
                }
                dispatch({ type: 'browser/context', context: null });
              }}
              style={sheetAction()}
            >
              <Text style={sheetActionLabel()}>
                {contextEntry.archived ? 'Restore exercise' : 'Archive exercise'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                await actions.deleteExercise(contextEntry.entry);
                dispatch({ type: 'browser/context', context: null });
              }}
              style={sheetAction()}
            >
              <Text style={[sheetActionLabel(), { color: palette.danger }]}>
                Delete exercise
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                dispatch({ type: 'browser/context', context: null })
              }
              style={[sheetAction(), { marginTop: spacing(0.5) }]}
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
    </BottomSheet>
  );
};

const ExerciseBrowserManageScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
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

  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'browser/mode', mode: 'manage' });
      void refreshManageEntries();
    }, [dispatch, refreshManageEntries]),
  );

  useEffect(() => {
    void refreshManageEntries();
  }, [refreshManageEntries, state.catalogRevision]);

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ManageCustomExercises
          entries={manageEntries.active}
          archivedEntries={manageEntries.archived}
          searchQuery={state.browser.query}
          onSearch={value =>
            dispatch({ type: 'browser/query', query: asSearchQuery(value) })
          }
          onSelectEntry={(entry, archived, archiveSource) => {
            dispatch({
              type: 'browser/context',
              context: {
                entry,
                archived,
                custom: entry.source === asExerciseSource('custom'),
                archiveSource,
              },
            });
          }}
        />
        <View style={{ padding: spacing(2) }}>
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
      </KeyboardAvoidingView>
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
          selectedGroup ? `${formatLabel(selectedGroup)} exercises` : 'Exercises',
        )}
      />
    </View>
  </View>
);

const PagerTabText = ({
  label,
  index,
  progress,
  inactiveTextColor,
  activeTextColor,
  textStyle,
}: {
  label: string;
  index: number;
  progress: SharedValue<number>;
  inactiveTextColor: string;
  activeTextColor: string;
  textStyle: ReturnType<typeof tabLabel>;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(progress.value - index);
    const mix = Math.max(0, Math.min(1, 1 - distance / 0.6));
    return {
      color: interpolateColor(
        mix,
        [0, 1],
        [inactiveTextColor, activeTextColor],
      ) as string,
    };
  });
  return <Reanimated.Text style={[textStyle, animatedStyle]}>{label}</Reanimated.Text>;
};

const PagerTabsRail = ({
  tabs,
  activeKey,
  progress,
  onSelect,
}: {
  tabs: ReadonlyArray<{ key: string; label: string }>;
  activeKey: string;
  progress: SharedValue<number>;
  onSelect: (key: string) => void;
}) => {
  const [railWidth, setRailWidth] = useState(0);
  const gap = analyticsUi.selectorRailGap;
  const railPadding = analyticsUi.selectorRailPadding;
  const inactiveTextColor = palette.mutedText;
  const activeTextColor = getContrastTextColor(palette.primary);
  const segmentWidth = useMemo(() => {
    if (railWidth <= 0) return 0;
    const contentWidth = Math.max(0, railWidth - railPadding * 2);
    return (contentWidth - gap * (tabs.length - 1)) / tabs.length;
  }, [gap, railPadding, railWidth, tabs.length]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (segmentWidth + gap) }],
  }));

  const onRailLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== railWidth) {
      setRailWidth(next);
    }
  };

  return (
    <View style={tabRow()}>
      <View onLayout={onRailLayout} style={tabRail()}>
        {segmentWidth > 0 ? (
          <Reanimated.View
            pointerEvents="none"
            style={[tabIndicator(segmentWidth), indicatorStyle]}
          />
        ) : null}
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeKey === tab.key }}
            style={tabButton()}
          >
            <PagerTabText
              label={tab.label}
              index={index}
              progress={progress}
              inactiveTextColor={inactiveTextColor}
              activeTextColor={activeTextColor}
              textStyle={tabLabel()}
            />
          </TouchableOpacity>
        ))}
      </View>
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

const tabRow = () => ({
  paddingHorizontal: spacing(2),
  marginTop: spacing(0.75),
  marginBottom: spacing(1.25),
});

const tabRail = () => ({
  borderRadius: radius.pill,
  backgroundColor: palette.mutedSurface,
  padding: analyticsUi.selectorRailPadding,
  flexDirection: 'row' as const,
  gap: analyticsUi.selectorRailGap,
  overflow: 'hidden' as const,
});

const tabButton = () => ({
  flex: 1,
  borderRadius: radius.pill,
  minHeight: analyticsUi.controlHeight,
  paddingVertical: analyticsUi.controlPaddingY,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: 'transparent',
});

const tabIndicator = (segmentWidth: number) => ({
  position: 'absolute' as const,
  left: analyticsUi.selectorRailPadding,
  top: analyticsUi.selectorRailPadding,
  bottom: analyticsUi.selectorRailPadding,
  width: segmentWidth,
  borderRadius: radius.pill,
  backgroundColor: palette.primary,
});

const tabLabel = () => ({
  fontSize: 12,
  fontWeight: '600' as const,
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
  paddingHorizontal: spacing(0.75),
  paddingBottom: spacing(0.5),
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
  onSearch,
  onSelectEntry,
}: {
  entries: ManageCatalogEntry[];
  archivedEntries: ManageCatalogEntry[];
  searchQuery: SearchQuery;
  onSearch: (value: string) => void;
  onSelectEntry: (
    entry: ManageCatalogEntry,
    archived: boolean,
    archiveSource?: 'hidden_default' | 'archived_custom',
  ) => void;
}) => {
  const pagerRef = useRef<PagerView | null>(null);
  const tabRequestedIndexRef = useRef(0);
  const tabPressAnimatingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const tabProgress = useSharedValue(0);
  const [activeViewportHeight, setActiveViewportHeight] = useState(0);
  const [activeContentHeight, setActiveContentHeight] = useState(0);
  const [archivedViewportHeight, setArchivedViewportHeight] = useState(0);
  const [archivedContentHeight, setArchivedContentHeight] = useState(0);
  const query = normalizeSearchText(searchQuery);

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

  const handleTabChange = useCallback(
    (next: 'active' | 'archived') => {
      const index = next === 'active' ? 0 : 1;
      tabPressAnimatingRef.current = true;
      tabRequestedIndexRef.current = index;
      tabProgress.value = withTiming(index, {
        duration: analyticsUi.tabTapAnimationMs,
      });
      pagerRef.current?.setPage(index);
    },
    [tabProgress],
  );

  const handlePageSelected = useCallback(
    (event: NativeSyntheticEvent<{ position: number }>) => {
      const position = event.nativeEvent.position;
      if (tabPressAnimatingRef.current && position !== tabRequestedIndexRef.current) {
        pagerRef.current?.setPage(tabRequestedIndexRef.current);
        return;
      }
      tabPressAnimatingRef.current = false;
      tabRequestedIndexRef.current = position;
      tabProgress.value = position;
      setActiveTab(position === 0 ? 'active' : 'archived');
    },
    [tabProgress],
  );

  const handlePageScroll = useCallback(
    (event: NativeSyntheticEvent<{ position: number; offset: number }>) => {
      if (tabPressAnimatingRef.current) return;
      const { position, offset } = event.nativeEvent;
      tabProgress.value = position + offset;
    },
    [tabProgress],
  );

  const activeListHeight = useMemo(() => {
    const rowHeight = 72;
    const emptyHeight = 52;
    const separators = Math.max(0, activeFiltered.length - 1);
    const estimatedContentHeight =
      (activeFiltered.length > 0
        ? activeFiltered.length * rowHeight + separators
        : emptyHeight) + spacing(2);
    if (activeViewportHeight <= 0) return estimatedContentHeight;
    const measuredHeight =
      activeContentHeight > 0 ? activeContentHeight : estimatedContentHeight;
    return Math.min(measuredHeight, activeViewportHeight);
  }, [activeContentHeight, activeFiltered.length, activeViewportHeight]);

  const archivedListHeight = useMemo(() => {
    const rowHeight = 72;
    const emptyHeight = 52;
    const separators = Math.max(0, archivedFiltered.length - 1);
    const estimatedContentHeight =
      (archivedFiltered.length > 0
        ? archivedFiltered.length * rowHeight + separators
        : emptyHeight) + spacing(2);
    if (archivedViewportHeight <= 0) return estimatedContentHeight;
    const measuredHeight =
      archivedContentHeight > 0
        ? archivedContentHeight
        : estimatedContentHeight;
    return Math.min(measuredHeight, archivedViewportHeight);
  }, [archivedContentHeight, archivedFiltered.length, archivedViewportHeight]);

  const activeScrollEnabled =
    activeViewportHeight > 0 && activeContentHeight > activeViewportHeight;
  const archivedScrollEnabled =
    archivedViewportHeight > 0 &&
    archivedContentHeight > archivedViewportHeight;

  const renderManageRow = useCallback(
    ({
      item,
      archived,
    }: {
      item: ManageCatalogEntry;
      archived: boolean;
    }) => {
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
          onPress={() =>
            onSelectEntry(item, archived, archived ? item.archiveSource : undefined)
          }
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
        tabs={[
          { key: 'active', label: 'Active' },
          { key: 'archived', label: 'Archived' },
        ]}
        activeKey={activeTab}
        progress={tabProgress}
        onSelect={key => handleTabChange(key as 'active' | 'archived')}
      />
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        overdrag={false}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
      >
        <View
          key="active"
          style={{ flex: 1 }}
          onLayout={event => {
            const next = event.nativeEvent.layout.height;
            if (next > 0 && Math.abs(next - activeViewportHeight) > 1) {
              setActiveViewportHeight(next);
            }
          }}
        >
          <View style={[manageListSurface(), activeListHeight ? { height: activeListHeight } : null]}>
            <FlatList
              data={activeFiltered}
              keyExtractor={item => `active-${item.slug}`}
              renderItem={(info: ListRenderItemInfo<ManageCatalogEntry>) =>
                renderManageRow({ item: info.item, archived: false })
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              scrollEnabled={activeScrollEnabled}
              contentContainerStyle={[
                {
                  paddingHorizontal: spacing(1.25),
                  paddingTop: spacing(0.75),
                  paddingBottom: spacing(2),
                },
                !activeScrollEnabled ? { flexGrow: 0 } : null,
              ]}
              onContentSizeChange={(_width, height) => {
                if (height > 0 && Math.abs(height - activeContentHeight) > 1) {
                  setActiveContentHeight(height);
                }
              }}
              ItemSeparatorComponent={() => <View style={listDivider()} />}
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
        <View
          key="archived"
          style={{ flex: 1 }}
          onLayout={event => {
            const next = event.nativeEvent.layout.height;
            if (next > 0 && Math.abs(next - archivedViewportHeight) > 1) {
              setArchivedViewportHeight(next);
            }
          }}
        >
          <View
            style={[
              manageListSurface(),
              archivedListHeight ? { height: archivedListHeight } : null,
            ]}
          >
            <FlatList
              data={archivedFiltered}
              keyExtractor={item => `archived-${item.slug}`}
              renderItem={(info: ListRenderItemInfo<ManageCatalogEntry>) =>
                renderManageRow({ item: info.item, archived: true })
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              scrollEnabled={archivedScrollEnabled}
              contentContainerStyle={[
                {
                  paddingHorizontal: spacing(1.25),
                  paddingTop: spacing(0.75),
                  paddingBottom: spacing(2),
                },
                !archivedScrollEnabled ? { flexGrow: 0 } : null,
              ]}
              onContentSizeChange={(_width, height) => {
                if (height > 0 && Math.abs(height - archivedContentHeight) > 1) {
                  setArchivedContentHeight(height);
                }
              }}
              ItemSeparatorComponent={() => <View style={listDivider()} />}
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

const sectionLabel = () => ({
  color: palette.mutedText,
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
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
