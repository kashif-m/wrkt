import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Platform } from 'react-native';
import PagerView, {
  PageScrollStateChangedNativeEvent,
  PagerViewOnPageScrollEvent,
  PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import {
  SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { analyticsUi } from '../theme';

type UsePagerTabsControllerArgs<T extends string> = {
  tabs: readonly T[];
  selectedTab: T;
  onTabChange: (tab: T) => void;
};

type UsePagerTabsControllerResult<T extends string> = {
  pagerRef: MutableRefObject<PagerView | null>;
  selectedIndex: number;
  progress: SharedValue<number>;
  onTabPress: (tab: T) => void;
  onPageSelected: (event: PagerViewOnPageSelectedEvent) => void;
  onPageScroll: (event: PagerViewOnPageScrollEvent) => void;
  onPageScrollStateChanged: (event: PageScrollStateChangedNativeEvent) => void;
};

type PagerScrollState = 'idle' | 'dragging' | 'settling';

export const usePagerTabsController = <T extends string>({
  tabs,
  selectedTab,
  onTabChange,
}: UsePagerTabsControllerArgs<T>): UsePagerTabsControllerResult<T> => {
  const isIos = Platform.OS === 'ios';
  const pagerRef = useRef<PagerView | null>(null);
  const indexByTab = useMemo(() => {
    const next = new Map<T, number>();
    tabs.forEach((tab, index) => {
      next.set(tab, index);
    });
    return next;
  }, [tabs]);

  const selectedIndex = Math.max(indexByTab.get(selectedTab) ?? 0, 0);
  const committedIndexRef = useRef(selectedIndex);
  const scrollStateRef = useRef<PagerScrollState>('idle');

  // Android branch refs: keep behavior identical to current baseline.
  const androidRequestedIndexRef = useRef<number | null>(null);
  const androidSettledIndexRef = useRef(selectedIndex);

  // iOS branch refs: drop-in behavior from pre-dedup implementation.
  const iosRequestedIndexRef = useRef(selectedIndex);
  const iosSettledIndexRef = useRef(selectedIndex);
  const iosTapAnimatingRef = useRef(false);

  const progress = useSharedValue(selectedIndex);

  const movePagerToIndex = useCallback((index: number, animated: boolean) => {
    const pager = pagerRef.current;
    if (!pager) return;
    if (animated) {
      pager.setPage(index);
    } else {
      pager.setPageWithoutAnimation(index);
    }
  }, []);

  const commitTabIndex = useCallback(
    (index: number) => {
      if (committedIndexRef.current === index) return;
      committedIndexRef.current = index;
      const nextTab = tabs[index];
      if (nextTab && nextTab !== selectedTab) {
        onTabChange(nextTab);
      }
    },
    [onTabChange, selectedTab, tabs],
  );

  useEffect(() => {
    if (isIos) {
      if (selectedIndex === committedIndexRef.current) {
        return;
      }
      iosRequestedIndexRef.current = selectedIndex;
      if (iosTapAnimatingRef.current || scrollStateRef.current !== 'idle') {
        return;
      }
      committedIndexRef.current = selectedIndex;
      progress.value = selectedIndex;
      movePagerToIndex(selectedIndex, false);
      return;
    }

    if (
      androidRequestedIndexRef.current === null &&
      androidSettledIndexRef.current === selectedIndex &&
      committedIndexRef.current === selectedIndex
    ) {
      return;
    }
    androidRequestedIndexRef.current = null;
    androidSettledIndexRef.current = selectedIndex;
    committedIndexRef.current = selectedIndex;
    progress.value = selectedIndex;
    movePagerToIndex(selectedIndex, false);
  }, [isIos, movePagerToIndex, progress, selectedIndex, selectedTab]);

  const onTabPress = useCallback(
    (tab: T) => {
      const nextIndex = indexByTab.get(tab);
      if (typeof nextIndex !== 'number') return;

      if (isIos) {
        if (
          iosTapAnimatingRef.current &&
          nextIndex === iosRequestedIndexRef.current
        ) {
          return;
        }
        if (
          !iosTapAnimatingRef.current &&
          scrollStateRef.current === 'idle' &&
          nextIndex === iosSettledIndexRef.current
        ) {
          return;
        }
        iosRequestedIndexRef.current = nextIndex;
        iosTapAnimatingRef.current = true;
        progress.value = withTiming(nextIndex, {
          duration: analyticsUi.tabTapAnimationMs,
        });
        movePagerToIndex(nextIndex, true);
        return;
      }

      if (
        androidRequestedIndexRef.current === nextIndex ||
        (androidRequestedIndexRef.current === null &&
          androidSettledIndexRef.current === nextIndex)
      ) {
        return;
      }
      androidRequestedIndexRef.current = nextIndex;
      movePagerToIndex(nextIndex, true);
    },
    [indexByTab, isIos, movePagerToIndex, progress],
  );

  const onPageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const nextIndex = event.nativeEvent.position;

      if (isIos) {
        const requestedIndex = iosRequestedIndexRef.current;
        iosSettledIndexRef.current = nextIndex;
        if (
          iosTapAnimatingRef.current &&
          nextIndex !== requestedIndex &&
          scrollStateRef.current !== 'dragging'
        ) {
          return;
        }
        if (nextIndex === requestedIndex) {
          iosTapAnimatingRef.current = false;
          commitTabIndex(nextIndex);
        }
        iosRequestedIndexRef.current = nextIndex;
        progress.value = nextIndex;
        return;
      }

      const requestedIndex = androidRequestedIndexRef.current;
      if (
        requestedIndex !== null &&
        nextIndex !== requestedIndex &&
        scrollStateRef.current !== 'dragging'
      ) {
        return;
      }
      androidSettledIndexRef.current = nextIndex;
      if (requestedIndex !== null && nextIndex === requestedIndex) {
        androidRequestedIndexRef.current = null;
      }
    },
    [commitTabIndex, isIos, progress],
  );

  const onPageScroll = useCallback(
    (event: PagerViewOnPageScrollEvent) => {
      const { position, offset } = event.nativeEvent;
      if (isIos && iosTapAnimatingRef.current) {
        return;
      }
      progress.value = position + offset;
    },
    [isIos, progress],
  );

  const onPageScrollStateChanged = useCallback(
    (event: PageScrollStateChangedNativeEvent) => {
      const nextState = event.nativeEvent.pageScrollState as PagerScrollState;
      scrollStateRef.current = nextState;

      if (isIos) {
        if (nextState === 'dragging') {
          iosTapAnimatingRef.current = false;
          return;
        }
        if (nextState !== 'idle') return;
        const requestedIndex = iosRequestedIndexRef.current;
        const settledIndex = iosSettledIndexRef.current;
        if (iosTapAnimatingRef.current) {
          if (requestedIndex !== settledIndex) {
            movePagerToIndex(requestedIndex, true);
            return;
          }
          iosTapAnimatingRef.current = false;
        }
        progress.value = settledIndex;
        commitTabIndex(settledIndex);
        return;
      }

      if (nextState === 'dragging') {
        androidRequestedIndexRef.current = null;
        return;
      }
      if (nextState !== 'idle') return;

      const requestedIndex = androidRequestedIndexRef.current;
      if (requestedIndex !== null) {
        if (androidSettledIndexRef.current !== requestedIndex) {
          movePagerToIndex(requestedIndex, true);
          return;
        }
        androidRequestedIndexRef.current = null;
      }

      const settledIndex = androidSettledIndexRef.current;
      progress.value = settledIndex;
      commitTabIndex(settledIndex);
    },
    [commitTabIndex, isIos, movePagerToIndex, progress],
  );

  return {
    pagerRef,
    selectedIndex,
    progress,
    onTabPress,
    onPageSelected,
    onPageScroll,
    onPageScrollStateChanged,
  };
};
