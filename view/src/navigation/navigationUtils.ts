import type { ScreenKeyValue } from '../domain/types';

/**
 * Get active route name from navigation state
 */
export const getActiveRouteName = (state: unknown): ScreenKeyValue => {
  const navState = state as {
    index?: number;
    routes?: Array<{ name: string; state?: unknown }>;
  };
  if (!navState?.routes?.length) return 'home';
  const index = navState.index ?? 0;
  const route = navState.routes[index];
  if (route?.name === 'browser') return 'browser';
  if (route?.state) return getActiveRouteName(route.state);
  return route?.name as ScreenKeyValue;
};

/**
 * Check if route is a primary tab route
 */
export const isPrimaryRoute = (route: ScreenKeyValue) =>
  route === 'home' ||
  route === 'calendar' ||
  route === 'analytics' ||
  route === 'more';
