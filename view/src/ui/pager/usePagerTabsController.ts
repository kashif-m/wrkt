import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import PagerView, {
  PagerViewOnPageScrollEvent,
  PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import { SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { analyticsUi } from '../theme';

type UsePagerTabsControllerArgs<T extends string> = {
  tabs: readonly T[];
  selectedTab: T;
  onTabChange: (tab: T) => void;
  animationMs?: number;
};

type UsePagerTabsControllerResult<T extends string> = {
  pagerRef: MutableRefObject<PagerView | null>;
  selectedIndex: number;
  progress: SharedValue<number>;
  onTabPress: (tab: T) => void;
  onPageSelected: (event: PagerViewOnPageSelectedEvent) => void;
  onPageScroll: (event: PagerViewOnPageScrollEvent) => void;
};

export const usePagerTabsController = <T extends string>({
  tabs,
  selectedTab,
  onTabChange,
  animationMs = analyticsUi.tabTapAnimationMs,
}: UsePagerTabsControllerArgs<T>): UsePagerTabsControllerResult<T> => {
  const pagerRef = useRef<PagerView | null>(null);
  const indexByTab = useMemo(() => {
    const next = new Map<T, number>();
    tabs.forEach((tab, index) => {
      next.set(tab, index);
    });
    return next;
  }, [tabs]);

  const selectedIndex = Math.max(indexByTab.get(selectedTab) ?? 0, 0);
  const currentPagerIndexRef = useRef(selectedIndex);
  const requestedIndexRef = useRef(selectedIndex);
  const tapAnimatingRef = useRef(false);
  const tapAnimationResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(selectedIndex);

  const clearTapAnimationLock = useCallback(() => {
    tapAnimatingRef.current = false;
    if (tapAnimationResetRef.current) {
      clearTimeout(tapAnimationResetRef.current);
      tapAnimationResetRef.current = null;
    }
  }, []);

  const armTapAnimationLock = useCallback(() => {
    clearTapAnimationLock();
    tapAnimatingRef.current = true;
    tapAnimationResetRef.current = setTimeout(() => {
      tapAnimatingRef.current = false;
      tapAnimationResetRef.current = null;
    }, animationMs * 3);
  }, [animationMs, clearTapAnimationLock]);

  const movePagerToIndex = useCallback((index: number, animated: boolean) => {
    const pager = pagerRef.current;
    if (!pager) return;
    if (animated) {
      pager.setPage(index);
    } else {
      pager.setPageWithoutAnimation(index);
    }
    currentPagerIndexRef.current = index;
  }, []);

  useEffect(() => {
    requestedIndexRef.current = selectedIndex;
    progress.value = selectedIndex;
    if (currentPagerIndexRef.current !== selectedIndex) {
      movePagerToIndex(selectedIndex, false);
    }
    clearTapAnimationLock();
  }, [
    clearTapAnimationLock,
    movePagerToIndex,
    progress,
    selectedIndex,
    selectedTab,
  ]);

  const onTabPress = useCallback(
    (tab: T) => {
      if (tab === selectedTab) return;
      const nextIndex = indexByTab.get(tab);
      if (typeof nextIndex !== 'number') return;
      requestedIndexRef.current = nextIndex;
      armTapAnimationLock();
      progress.value = withTiming(nextIndex, { duration: animationMs });
      movePagerToIndex(nextIndex, true);
    },
    [
      animationMs,
      armTapAnimationLock,
      indexByTab,
      movePagerToIndex,
      progress,
      selectedTab,
    ],
  );

  const onPageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const nextIndex = event.nativeEvent.position;
      if (tapAnimatingRef.current && nextIndex !== requestedIndexRef.current) {
        movePagerToIndex(requestedIndexRef.current, true);
        return;
      }

      requestedIndexRef.current = nextIndex;
      currentPagerIndexRef.current = nextIndex;
      clearTapAnimationLock();
      progress.value = nextIndex;
      const nextTab = tabs[nextIndex];
      if (nextTab && nextTab !== selectedTab) {
        onTabChange(nextTab);
      }
    },
    [
      clearTapAnimationLock,
      movePagerToIndex,
      onTabChange,
      progress,
      selectedTab,
      tabs,
    ],
  );

  const onPageScroll = useCallback(
    (event: PagerViewOnPageScrollEvent) => {
      if (tapAnimatingRef.current) return;
      progress.value = event.nativeEvent.position + event.nativeEvent.offset;
    },
    [progress],
  );

  useEffect(
    () => () => {
      clearTapAnimationLock();
    },
    [clearTapAnimationLock],
  );

  return {
    pagerRef,
    selectedIndex,
    progress,
    onTabPress,
    onPageSelected,
    onPageScroll,
  };
};
