import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import {
  AnalyticsMetricKey,
  AnalyticsRangeKey,
  ErrorMessage,
  EventId,
  ExerciseName,
  ExerciseSlug,
  LoggingMode,
  Modality,
  MuscleGroup,
  NumericInput,
  ScreenKey,
  SearchQuery,
  asAnalyticsMetricKey,
  asAnalyticsRangeKey,
  asExerciseName,
  asExerciseSlug,
  asLoggingMode,
  asModality,
  asMuscleGroup,
  asNumericInput,
  asPlannerKind,
  asScreenKey,
  asSearchQuery,
} from '../domain/types';
import { PlanSuggestion, WorkoutEvent } from '../workoutFlows';
import { PlannerKind } from '../domain/types';

import { ToastText, ToastTone } from '../domain/types';

export type BrowserMode = 'groups' | 'exercises' | 'manage' | 'form';
export type BrowserTab = 'all' | 'favorites';

export type SessionTab = 'Track' | 'History' | 'Trends';
export type TrendRangeKey = '1m' | '3m' | '6m' | '1y' | 'all';
export type TrendMetricKey =
  | 'estimated_1rm'
  | 'max_weight'
  | 'max_reps'
  | 'max_volume'
  | 'workout_volume'
  | 'workout_reps';


export type LoggingFields = {
  reps: NumericInput;
  weight: NumericInput;
  duration: NumericInput;
  distance: NumericInput;
};

export type RootState = {
    nav: { screen: ScreenKey };
  selectedDate: Date;
  events: WorkoutEvent[];
  catalog: {
    entries: ExerciseCatalogEntry[];
    favorites: ExerciseSlug[];
    custom: ExerciseCatalogEntry[];
  };
  browser: {
    mode: BrowserMode;
    selectedGroup: MuscleGroup | null;
    query: SearchQuery;
    searchExpanded: boolean;
    menuOpen: boolean;
    contextEntry: {
      entry: ExerciseCatalogEntry;
      archived?: boolean;
      custom?: boolean;
    } | null;
    activeTab: BrowserTab;
    formEditing: ExerciseCatalogEntry | null;
    formDraft: {
      displayName: ExerciseName;
      slug: ExerciseSlug;
      primary: MuscleGroup;
      secondary: MuscleGroup[];
      modality: Modality;
      loggingMode: LoggingMode;
      minLoad: NumericInput;
      maxLoad: NumericInput;
      saving: boolean;
      error: ErrorMessage | null;
    };
  };
  calendar: {
    visibleMonth: Date;
    legendExpanded: boolean;
    yearSheetOpen: boolean;
  };
  logging: {
    logDate: Date;
    exerciseName?: ExerciseName;
    fields: LoggingFields;
    tab: SessionTab;
    selectedTrendRange: TrendRangeKey;
    selectedMetric: TrendMetricKey;
    editingEventId: EventId | null;
    status: { text: ToastText; tone: ToastTone } | null;
  };
  analytics: {
    selectedRange: AnalyticsRangeKey;
    selectedMetric: AnalyticsMetricKey;
  };
  suggestions: {
    planner: PlannerKind;
    loading: boolean;
    items: PlanSuggestion[];
  };
};

export type Action =
  | { type: 'nav/set'; screen: ScreenKey }
  | { type: 'date/set'; date: Date }
  | { type: 'date/shift'; deltaDays: number }
  | { type: 'events/set'; events: WorkoutEvent[] }
  | { type: 'catalog/set'; entries: ExerciseCatalogEntry[] }
  | { type: 'catalog/favorites'; favorites: ExerciseSlug[] }
  | { type: 'catalog/custom'; custom: ExerciseCatalogEntry[] }
  | { type: 'browser/mode'; mode: BrowserMode }
  | { type: 'browser/group'; group: MuscleGroup | null }
  | { type: 'browser/query'; query: SearchQuery }
  | { type: 'browser/search'; expanded: boolean }
  | { type: 'browser/menu'; open: boolean }
  | { type: 'browser/context'; context: RootState['browser']['contextEntry'] }
  | { type: 'browser/tab'; tab: BrowserTab }
  | { type: 'browser/form'; entry: ExerciseCatalogEntry | null }
  | {
      type: 'browser/formDraft';
      draft: RootState['browser']['formDraft'];
    }
  | { type: 'calendar/visibleMonth'; date: Date }
  | { type: 'calendar/legend'; expanded: boolean }
  | { type: 'calendar/yearSheet'; open: boolean }
  | { type: 'log/date'; date: Date }
  | { type: 'log/exercise'; exerciseName?: ExerciseName }
  | { type: 'log/fields'; fields: LoggingFields }
  | { type: 'log/tab'; tab: SessionTab }
  | { type: 'log/trendRange'; range: TrendRangeKey }
  | { type: 'log/trendMetric'; metric: TrendMetricKey }
  | { type: 'log/editing'; eventId: EventId | null }
  | { type: 'log/status'; status: RootState['logging']['status'] }
  | { type: 'analytics/range'; range: AnalyticsRangeKey }
  | { type: 'analytics/metric'; metric: AnalyticsMetricKey }
  | { type: 'suggestions/planner'; planner: PlannerKind }
  | { type: 'suggestions/loading'; loading: boolean }
  | { type: 'suggestions/items'; items: PlanSuggestion[] };

export const initialFields: LoggingFields = {
  reps: asNumericInput(''),
  weight: asNumericInput(''),
  duration: asNumericInput(''),
  distance: asNumericInput(''),
};

export const createInitialState = (): RootState => {
  const today = new Date();
  return {
    nav: { screen: asScreenKey('home') },
    selectedDate: today,
    events: [],
    catalog: { entries: [], favorites: [], custom: [] },
    browser: {
      mode: 'groups',
      selectedGroup: null,
      query: asSearchQuery(''),
      searchExpanded: false,
      menuOpen: false,
      contextEntry: null,
      activeTab: 'all',
      formEditing: null,
      formDraft: {
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
    },
    calendar: {
      visibleMonth: today,
      legendExpanded: false,
      yearSheetOpen: false,
    },
    logging: {
      logDate: today,
      exerciseName: undefined,
      fields: { ...initialFields },
      tab: 'Track',
      selectedTrendRange: '3m',
      selectedMetric: 'estimated_1rm',
      editingEventId: null,
      status: null,
    },
    analytics: {
      selectedRange: asAnalyticsRangeKey('16w'),
      selectedMetric: asAnalyticsMetricKey('volume'),
    },
    suggestions: {
      planner: asPlannerKind('strength'),
      loading: false,
      items: [],
    },
  };
};

export const reducer = (state: RootState, action: Action): RootState => {
  switch (action.type) {
    case 'nav/set':
      return { ...state, nav: { screen: action.screen } };
    case 'date/set':
      return {
        ...state,
        selectedDate: action.date,
        calendar: { ...state.calendar, visibleMonth: action.date },
      };
    case 'date/shift': {
      const nextDate = new Date(
        state.selectedDate.getTime() + action.deltaDays * 24 * 60 * 60 * 1000,
      );
      return {
        ...state,
        selectedDate: nextDate,
        calendar: { ...state.calendar, visibleMonth: nextDate },
      };
    }
    case 'events/set':
      return { ...state, events: action.events };
    case 'catalog/set':
      return {
        ...state,
        catalog: { ...state.catalog, entries: action.entries },
      };
    case 'catalog/favorites':
      return {
        ...state,
        catalog: { ...state.catalog, favorites: action.favorites },
      };
    case 'catalog/custom':
      return { ...state, catalog: { ...state.catalog, custom: action.custom } };
    case 'browser/mode':
      return { ...state, browser: { ...state.browser, mode: action.mode } };
    case 'browser/group':
      return {
        ...state,
        browser: { ...state.browser, selectedGroup: action.group },
      };
    case 'browser/query':
      return { ...state, browser: { ...state.browser, query: action.query } };
    case 'browser/search':
      return {
        ...state,
        browser: { ...state.browser, searchExpanded: action.expanded },
      };
    case 'browser/menu':
      return { ...state, browser: { ...state.browser, menuOpen: action.open } };
    case 'browser/context':
      return {
        ...state,
        browser: { ...state.browser, contextEntry: action.context },
      };
    case 'browser/tab':
      return { ...state, browser: { ...state.browser, activeTab: action.tab } };
    case 'browser/form':
      return {
        ...state,
        browser: { ...state.browser, formEditing: action.entry },
      };
    case 'browser/formDraft':
      return {
        ...state,
        browser: { ...state.browser, formDraft: action.draft },
      };
    case 'calendar/visibleMonth':
      return {
        ...state,
        calendar: { ...state.calendar, visibleMonth: action.date },
      };
    case 'calendar/legend':
      return {
        ...state,
        calendar: { ...state.calendar, legendExpanded: action.expanded },
      };
    case 'calendar/yearSheet':
      return {
        ...state,
        calendar: { ...state.calendar, yearSheetOpen: action.open },
      };
    case 'log/date':
      return { ...state, logging: { ...state.logging, logDate: action.date } };
    case 'log/exercise':
      return {
        ...state,
        logging: { ...state.logging, exerciseName: action.exerciseName },
      };
    case 'log/fields':
      return { ...state, logging: { ...state.logging, fields: action.fields } };
    case 'log/tab':
      return { ...state, logging: { ...state.logging, tab: action.tab } };
    case 'log/trendRange':
      return {
        ...state,
        logging: { ...state.logging, selectedTrendRange: action.range },
      };
    case 'log/trendMetric':
      return {
        ...state,
        logging: { ...state.logging, selectedMetric: action.metric },
      };
    case 'log/editing':
      return {
        ...state,
        logging: { ...state.logging, editingEventId: action.eventId },
      };
    case 'log/status':
      return { ...state, logging: { ...state.logging, status: action.status } };
    case 'analytics/range':
      return {
        ...state,
        analytics: { ...state.analytics, selectedRange: action.range },
      };
    case 'analytics/metric':
      return {
        ...state,
        analytics: { ...state.analytics, selectedMetric: action.metric },
      };
    case 'suggestions/planner':
      return {
        ...state,
        suggestions: { ...state.suggestions, planner: action.planner },
      };
    case 'suggestions/loading':
      return {
        ...state,
        suggestions: { ...state.suggestions, loading: action.loading },
      };
    case 'suggestions/items':
      return {
        ...state,
        suggestions: { ...state.suggestions, items: action.items },
      };
    default:
      return state;
  }
};
