import type { ScreenKeyValue } from '../../domain/types';

/**
 * Action types for browser state
 */
export type BrowserAction =
  | { type: 'browser/mode'; mode: string }
  | { type: 'browser/returnMode'; mode: string }
  | { type: 'browser/group'; group: string | null }
  | { type: 'browser/query'; query: string }
  | { type: 'browser/search'; expanded: boolean }
  | { type: 'browser/menu'; open: boolean }
  | { type: 'browser/context'; context: string | null }
  | { type: 'browser/tab'; tab: string }
  | { type: 'browser/form'; entry: unknown }
  | { type: 'browser/formDraft'; draft: unknown }
  | { type: 'browser/reset' };

/**
 * Reset browser UI state to defaults
 */
export const resetBrowserState = (): BrowserAction[] => [
  { type: 'browser/mode', mode: 'groups' },
  { type: 'browser/returnMode', mode: 'groups' },
  { type: 'browser/group', group: null },
  { type: 'browser/query', query: '' },
  { type: 'browser/search', expanded: false },
  { type: 'browser/menu', open: false },
  { type: 'browser/context', context: null },
  { type: 'browser/tab', tab: 'all' },
  { type: 'browser/form', entry: null },
];

/**
 * Navigation actions
 */
export const navigateTo = (screen: ScreenKeyValue): { type: 'navigate'; screen: ScreenKeyValue } => ({
  type: 'navigate',
  screen,
});

export const goBack = (): { type: 'navigate/back' } => ({
  type: 'navigate/back',
});
