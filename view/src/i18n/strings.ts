/**
 * Internationalization strings
 * Centralized location for all UI text to enable translation
 */

export const strings = {
  // Navigation
  navigation: {
    home: 'Home',
    calendar: 'Calendar',
    trends: 'Trends',
    more: 'More',
    startWorkout: 'Start workout',
  },

  // Common actions
  actions: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    apply: 'Apply',
    back: 'Back',
    done: 'Done',
    close: 'Close',
    search: 'Search',
    tryAgain: 'Try Again',
  },

  // Common labels
  labels: {
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    info: 'Info',
  },

  // Empty states
  empty: {
    noWorkouts: 'No workouts yet',
    noWorkoutsSubtitle: 'Log a session to start building your history.',
    noExercises: 'No exercises found',
    noFavorites: 'Mark favorites to see them here.',
    noData: 'No data available',
    noSets: 'No sets logged',
    noSetsToday: 'No workouts today',
    noSetsSubtitle: 'Track your first set to start building your fitness journey.',
  },

  // Exercise browser
  exercise: {
    exercises: 'Exercises',
    exerciseName: 'Exercise name',
    searchExercises: 'Search exercises',
    manageExercises: 'Manage exercises',
    primaryMuscleGroup: 'Primary muscle group',
    modality: 'Modality',
    loggingMode: 'Logging mode',
    addCustomGroup: 'Add custom primary group',
    all: 'All',
    favorites: 'Favorites',
    active: 'Active',
    archived: 'Archived',
  },

  // Logging
  logging: {
    weight: 'Weight',
    reps: 'Reps',
    time: 'Time',
    distance: 'Distance',
    kg: 'kg',
    min: 'min',
    m: 'm',
    logSet: 'Log set',
    updateSet: 'Update set',
    deleteSet: 'Delete set',
    selectExercise: 'Select an exercise to log sets.',
    noSetsToday: 'No sets logged today.',
    logToUnlock: 'Log sets to unlock history.',
    today: 'Today',
    yesterday: 'Yesterday',
    tomorrow: 'Tomorrow',
  },

  // Analytics
  analytics: {
    insights: 'Insights',
    trainingAnalytics: 'Training analytics',
    consistency: 'Consistency',
    sessions: 'Sessions',
    restDays: 'Rest days',
    focusBalance: 'Focus Balance',
    volumeDistribution: 'Volume distribution by muscle group',
    openBreakdown: 'Open Breakdown',
    muscleGroups: 'Muscle groups',
    thisMonth: 'This month',
    last30Days: 'Last 30 days',
    workouts: 'Workouts',
    graph: 'Graph',
    filter: 'Filter',
    exercise: 'Exercise',
    breakdown: 'Breakdown',
    metric: 'Metric',
    group: 'Group',
    totals: 'Totals',
    volume: 'Volume',
    activeDuration: 'Active duration',
    loadDistance: 'Load distance',
    personalRecords: 'Personal Records',
    rmLadder: 'RM Ladder',
    estimated1RM: 'Estimated 1RM',
    maxWeight: 'Max weight',
    maxReps: 'Max reps',
    bestSetVolume: 'Best set volume',
  },

  // Calendar
  calendar: {
    today: 'Today',
    selectYear: 'Select year',
    monthlySummary: 'Monthly summary',
    topMuscleGroups: 'Top muscle groups',
    showAll: 'Show all',
    showLess: 'Show less',
    showFewer: 'Show fewer',
    noSessions: 'No sessions logged yet',
    computingStats: 'Computing month stats...',
  },

  // Home
  home: {
    today: 'Today',
    muscleSplit: 'Muscle Split',
    volumeSplit: 'Volume Split',
    setsLogged: 'Sets logged',
    set: 'set',
    sets: 'sets',
    more: 'more',
  },

  // More screen
  more: {
    more: 'More',
    toolsAndSettings: 'Tools and settings',
    data: 'Data',
    manageData: 'Manage data',
    importOrExport: 'Import or export your logs',
    theme: 'Theme',
    appearance: 'Appearance',
    import: 'Import',
    export: 'Export',
    bringWorkouts: 'Bring workouts from another app',
    shareSnapshot: 'Share SQL snapshot',
    importFrom: 'Import from',
    fitNotes: 'FitNotes',
    importExercises: 'Import exercises and logs',
    customColor: 'Custom color',
    hue: 'Hue',
    hex: 'Hex',
    mode: 'Mode',
    accent: 'Accent',
    invalidColor: 'Invalid color',
    invalidColorMessage: 'Enter a valid hex color like #7A5AF8.',
    exportFailed: 'Export failed',
    couldNotExport: 'Could not export data',
  },

  // Import
  import: {
    summary: 'Import summary',
    noRecentImports: 'No recent imports found.',
    backToMore: 'Back to more',
    importComplete: 'Import complete',
    fitNotesBackup: 'FitNotes backup',
    eventsImported: 'Events imported',
    exercisesAdded: 'Exercises added',
    exercisesSkipped: 'Exercises skipped',
    favoritesAdded: 'Favorites added',
    warnings: 'Warnings',
    moreWarnings: 'more warning(s) in logs.',
  },

  // Theme modes
  theme: {
    dark: 'Dark',
    light: 'Light',
    midnight: 'Midnight',
    charcoal: 'Charcoal',
    burgundy: 'Burgundy',
    forest: 'Forest',
    slateBlue: 'Slate Blue',
    sepia: 'Sepia',
  },

  // Error messages
  errors: {
    generic: 'An error occurred',
    failedToSave: 'Failed to save data. Please try again.',
    failedToLoad: 'Failed to load data.',
    invalidInput: 'Invalid input',
    incompleteSet: 'Set incomplete',
    setIncomplete: 'Set incomplete',
    somethingWentWrong: 'Something went wrong',
    tryAgain: 'Try Again',
  },

  // Success messages
  success: {
    savedChanges: 'Saved changes',
    setDeleted: 'Set deleted',
    exerciseDeleted: 'Exercise deleted',
  },
} as const;

export type Strings = typeof strings;
