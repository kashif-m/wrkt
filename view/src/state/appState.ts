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
  Tag,
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
import { FitNotesImportSummary } from '../import/fitnotes';

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

// O(1) Indexes
export type EventIndexes = {
  byId: Record<EventId, WorkoutEvent>;
  byExercise: Record<ExerciseName, EventId[]>;
};

const buildIndexes = (events: WorkoutEvent[]): EventIndexes => {
  const byId: Record<EventId, WorkoutEvent> = {};
  const byExercise: Record<ExerciseName, EventId[]> = {};

  for (const event of events) {
    byId[event.event_id] = event;
    const exercise = asExerciseName(String(event.payload['exercise'] ?? ''));
    if (!byExercise[exercise]) {
      byExercise[exercise] = [];
    }
    byExercise[exercise].push(event.event_id);
  }

  return { byId, byExercise };
};

// Helper: Add event to index O(1)
const addToIndex = (
  indexes: EventIndexes,
  event: WorkoutEvent,
): EventIndexes => {
  const exercise = asExerciseName(String(event.payload['exercise'] ?? ''));
  const list = indexes.byExercise[exercise] || [];
  return {
    byId: { ...indexes.byId, [event.event_id]: event },
    byExercise: {
      ...indexes.byExercise,
      [exercise]: [...list, event.event_id],
    },
  };
};

// Helper: Update event in index O(1)
const updateInIndex = (
  indexes: EventIndexes,
  event: WorkoutEvent,
  oldEvent: WorkoutEvent | undefined,
): EventIndexes => {
  const newExercise = asExerciseName(String(event.payload['exercise'] ?? ''));
  const oldExercise = oldEvent
    ? asExerciseName(String(oldEvent.payload['exercise'] ?? ''))
    : undefined;

  let byExercise = { ...indexes.byExercise };

  // If exercise name changed, remove from old list
  if (oldExercise && oldExercise !== newExercise && byExercise[oldExercise]) {
    byExercise[oldExercise] = byExercise[oldExercise].filter(
      id => id !== event.event_id,
    );
  }

  // Add/Update in new list
  const list = byExercise[newExercise] || [];
  if (!list.includes(event.event_id)) {
    byExercise[newExercise] = [...list, event.event_id];
  }

  return {
    byId: { ...indexes.byId, [event.event_id]: event },
    byExercise,
  };
};

// Helper: Remove from index O(1)
const removeFromIndex = (
  indexes: EventIndexes,
  eventId: EventId,
): EventIndexes => {
  const event = indexes.byId[eventId];
  if (!event) return indexes;

  const exercise = asExerciseName(String(event.payload['exercise'] ?? ''));
  const nextById = { ...indexes.byId };
  delete nextById[eventId];

  const nextByExercise = { ...indexes.byExercise };
  if (nextByExercise[exercise]) {
    nextByExercise[exercise] = nextByExercise[exercise].filter(
      id => id !== eventId,
    );
  }

  return { byId: nextById, byExercise: nextByExercise };
};

export type RootState = {
  nav: { screen: ScreenKey; stack: ScreenKey[] };
  selectedDate: Date;
  events: WorkoutEvent[];
  indexes: EventIndexes;
  catalog: {
    entries: ExerciseCatalogEntry[];
    favorites: ExerciseSlug[];
    custom: ExerciseCatalogEntry[];
  };
  browser: {
    mode: BrowserMode;
    returnMode: BrowserMode;
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
      tags: Tag[];
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
  importSummary: {
    source: 'fitnotes';
    summary: FitNotesImportSummary;
    warnings: Array<{ kind: string; message: string }>;
  } | null;
};

export type Action =
  | { type: 'nav/replace'; screen: ScreenKey }
  | { type: 'nav/push'; screen: ScreenKey }
  | { type: 'nav/pop' }
  | { type: 'date/set'; date: Date }
  | { type: 'date/shift'; deltaDays: number }
  | { type: 'events/set'; events: WorkoutEvent[] }
  | { type: 'catalog/set'; entries: ExerciseCatalogEntry[] }
  | { type: 'catalog/favorites'; favorites: ExerciseSlug[] }
  | { type: 'catalog/custom'; custom: ExerciseCatalogEntry[] }
  | { type: 'browser/mode'; mode: BrowserMode }
  | { type: 'browser/returnMode'; mode: BrowserMode }
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
  | { type: 'suggestions/items'; items: PlanSuggestion[] }
  | {
      type: 'import/summary';
      summary: RootState['importSummary'];
    }
  | { type: 'events/add'; event: WorkoutEvent }
  | { type: 'events/update'; event: WorkoutEvent }
  | { type: 'events/delete'; eventId: EventId };

export const initialFields: LoggingFields = {
  reps: asNumericInput(''),
  weight: asNumericInput(''),
  duration: asNumericInput(''),
  distance: asNumericInput(''),
};

export const createInitialState = (): RootState => {
  const today = new Date();
  return {
    nav: { screen: asScreenKey('home'), stack: [asScreenKey('home')] },
    selectedDate: today,
    events: [],
    indexes: { byId: {}, byExercise: {} },
    catalog: { entries: [], favorites: [], custom: [] },
    browser: {
      mode: 'groups',
      returnMode: 'groups',
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
        tags: [],
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
    importSummary: null,
  };
};

export const reducer = (state: RootState, action: Action): RootState => {
  switch (action.type) {
    case 'nav/replace':
      return {
        ...state,
        nav: { screen: action.screen, stack: [action.screen] },
      };
    case 'nav/push':
      return {
        ...state,
        nav: {
          screen: action.screen,
          stack: [...state.nav.stack, action.screen],
        },
      };
    case 'nav/pop': {
      if (state.nav.stack.length <= 1) return state;
      const nextStack = state.nav.stack.slice(0, -1);
      return {
        ...state,
        nav: {
          screen: nextStack[nextStack.length - 1],
          stack: nextStack,
        },
      };
    }
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
      return {
        ...state,
        events: action.events,
        indexes: buildIndexes(action.events),
      };

    // O(1) Granular Updates
    case 'events/add':
      if (state.indexes.byId[action.event.event_id]) return state; // Idempotent
      return {
        ...state,
        events: [...state.events, action.event],
        indexes: addToIndex(state.indexes, action.event),
      };

    case 'events/update': {
      const oldEvent = state.indexes.byId[action.event.event_id];
      if (!oldEvent) return state;
      return {
        ...state,
        events: state.events.map(e =>
          e.event_id === action.event.event_id ? action.event : e,
        ),
        indexes: updateInIndex(state.indexes, action.event, oldEvent),
      };
    }

    case 'events/delete':
      return {
        ...state,
        events: state.events.filter(e => e.event_id !== action.eventId),
        indexes: removeFromIndex(state.indexes, action.eventId),
      };

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
    case 'browser/returnMode':
      return {
        ...state,
        browser: { ...state.browser, returnMode: action.mode },
      };
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
    case 'import/summary':
      return { ...state, importSummary: action.summary };
    default:
      return state;
  }
};
