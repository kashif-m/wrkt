import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';
import { spacing } from './theme';

type KeyboardViewportInsetArgs = {
  safeAreaBottom: number;
  keyboardGap: number;
};

type ViewportBottomInsetArgs = {
  footerHeight: number;
  keyboardOverlap: number;
  keyboardGap: number;
};

type FooterLayoutArgs = {
  insetsBottom: number;
  keyboardOverlap: number;
  footerHeight: number;
  keyboardGap?: number;
  closedReduction?: number;
  minBottom?: number;
  openBottom?: number;
  visible?: boolean;
};

export const FOOTER_CLOSED_REDUCTION = spacing(3);
export const FOOTER_MIN_BOTTOM = spacing(0.5);
export const KEYBOARD_GAP = spacing(1);

export const resolveViewportBottomInset = ({
  footerHeight,
  keyboardOverlap,
  keyboardGap,
}: ViewportBottomInsetArgs): number =>
  footerHeight + (keyboardOverlap > 0 ? keyboardOverlap + keyboardGap : 0);

export const resolveKeyboardLift = ({
  keyboardOverlap,
  keyboardGap,
}: {
  keyboardOverlap: number;
  keyboardGap: number;
}): number => (keyboardOverlap > 0 ? keyboardOverlap + keyboardGap : 0);

export const resolveFooterClosedBottomInset = ({
  insetsBottom,
  closedReduction = FOOTER_CLOSED_REDUCTION,
  minBottom = FOOTER_MIN_BOTTOM,
}: {
  insetsBottom: number;
  closedReduction?: number;
  minBottom?: number;
}): number => Math.max(insetsBottom - closedReduction, minBottom);

export const resolveFooterLayout = ({
  insetsBottom,
  keyboardOverlap,
  footerHeight,
  keyboardGap = KEYBOARD_GAP,
  closedReduction = FOOTER_CLOSED_REDUCTION,
  minBottom = FOOTER_MIN_BOTTOM,
  openBottom = 0,
  visible = true,
}: FooterLayoutArgs) => {
  const footerClosedBottom = resolveFooterClosedBottomInset({
    insetsBottom,
    closedReduction,
    minBottom,
  });
  const footerBottomPadding =
    visible && keyboardOverlap > 0 ? openBottom : visible ? footerClosedBottom : 0;
  const footerLift = visible
    ? resolveKeyboardLift({ keyboardOverlap, keyboardGap })
    : 0;
  const keyboardBackdropHeight = footerLift;
  const resolvedFooterHeight = visible ? footerHeight + footerBottomPadding : 0;
  const viewportBottomInset = resolveViewportBottomInset({
    footerHeight: resolvedFooterHeight,
    keyboardOverlap,
    keyboardGap,
  });

  return {
    footerClosedBottom,
    footerBottomPadding,
    footerLift,
    keyboardBackdropHeight,
    resolvedFooterHeight,
    viewportBottomInset,
  };
};

export const useKeyboardViewportInset = ({
  safeAreaBottom,
  keyboardGap,
}: KeyboardViewportInsetArgs) => {
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);

  useEffect(() => {
    const handleKeyboardFrame = (event: KeyboardEvent) => {
      if (Platform.OS === 'ios') {
        const overlap = Math.max(
          0,
          (event.endCoordinates?.height ?? 0) - safeAreaBottom,
        );
        setKeyboardOverlap(overlap);
        return;
      }
      setKeyboardOverlap(Math.max(0, event.endCoordinates?.height ?? 0));
    };

    const handleKeyboardHide = () => {
      setKeyboardOverlap(0);
    };

    if (Platform.OS === 'ios') {
      const frameSub = Keyboard.addListener(
        'keyboardWillChangeFrame',
        handleKeyboardFrame,
      );
      const hideSub = Keyboard.addListener(
        'keyboardWillHide',
        handleKeyboardHide,
      );
      return () => {
        frameSub.remove();
        hideSub.remove();
      };
    }

    const showSub = Keyboard.addListener(
      'keyboardDidShow',
      handleKeyboardFrame,
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [safeAreaBottom]);

  const keyboardLift = useMemo(
    () =>
      resolveKeyboardLift({
        keyboardOverlap,
        keyboardGap,
      }),
    [keyboardGap, keyboardOverlap],
  );

  return {
    keyboardOverlap,
    keyboardLift,
  };
};
