// Auto-generated from Rust error definitions
// Do not edit manually
// Regenerate with: cargo run -p tracker_ir --bin generate_ts

/**
 * Stable error codes for FFI boundaries.
 * These codes are guaranteed to never change between releases.
 */
export enum ErrorCode {
  /** Operation completed successfully */
  Success = 0,
  /** General DSL parsing error */
  DslParseError = 1000,
  /** DSL syntax violation */
  DslSyntaxError = 1001,
  /** Invalid tracker version specified */
  DslInvalidVersion = 1002,
  /** Unknown type in field definition */
  DslUnknownType = 1003,
  /** Invalid expression in derive/metric/alert */
  DslInvalidExpression = 1004,
  /** Unclosed brace or parenthesis */
  DslUnclosedDelimiter = 1005,
  /** Unexpected token */
  DslUnexpectedToken = 1006,
  /** Event validation failed */
  EventValidationFailed = 1100,
  /** Tracker ID mismatch between definition and event */
  TrackerMismatch = 1101,
  /** State tracker ID doesn't match definition */
  StateMismatch = 1102,
  /** Referenced field not found in schema */
  FieldNotFound = 1103,
  /** Type mismatch in expression or field */
  TypeMismatch = 1104,
  /** Required field missing from event */
  RequiredFieldMissing = 1105,
  /** Field value is invalid */
  InvalidFieldValue = 1106,
  /** Schema validation failed */
  SchemaValidationFailed = 1107,
  /** Invalid timestamp format */
  InvalidTimestamp = 1108,
  /** Event ID is empty or invalid */
  InvalidEventId = 1109,
  /** Metric evaluation failed */
  MetricEvaluationFailed = 1200,
  /** Division by zero in expression */
  DivisionByZero = 1201,
  /** Aggregation computation error */
  AggregationError = 1202,
  /** Expression evaluation error */
  ExpressionError = 1203,
  /** Circular dependency detected in derived fields */
  CircularDependency = 1204,
  /** Invalid aggregation function */
  InvalidAggregation = 1205,
  /** Time window is invalid */
  InvalidTimeWindow = 1206,
  /** Catalog entry not found */
  CatalogEntryNotFound = 1300,
  /** Catalog entry already exists */
  CatalogEntryExists = 1301,
  /** Catalog validation failed */
  CatalogValidationFailed = 1302,
  /** Catalog migration failed */
  CatalogMigrationFailed = 1303,
  /** Invalid catalog version */
  CatalogVersionMismatch = 1304,
  /** No baseline events for planning */
  PlanningNoBaseline = 1400,
  /** Invalid planning strategy */
  PlanningInvalidStrategy = 1401,
  /** Planning simulation failed */
  PlanningSimulationFailed = 1402,
  /** No candidates generated */
  PlanningNoCandidates = 1403,
  /** JSON serialization failed */
  SerializationFailed = 1500,
  /** JSON deserialization failed */
  DeserializationFailed = 1501,
  /** Storage operation failed */
  StorageError = 1502,
  /** FFI binding error */
  FfiBindingError = 1503,
  /** SQLite operation failed */
  SqliteError = 1504,
  /** File I/O error */
  FileIoError = 1505,
  /** Unknown or unclassified error */
  Unknown = 65535,
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  Success = 'success',
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Fatal = 'fatal',
}

/**
 * Structured error type from Rust
 */
export interface TrackerError {
  /** Stable numeric error code */
  code: ErrorCode;

  /** Human-readable error message */
  message: string;

  /** Machine-readable context */
  context: Record<string, unknown>;

  /** Error severity */
  severity: ErrorSeverity;

  /** Source location (file:line) */
  sourceLocation?: string;

  /** Timestamp when error occurred */
  timestampMs?: number;
}

/**
 * Error categories
 */
export type ErrorCategory = 'success' | 'parsing' | 'validation' | 'evaluation' | 'catalog' | 'planning' | 'storage' | 'unknown';

/**
 * Get category for an error code
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
  if (code === ErrorCode.Success) return 'success';
  if (code >= 1000 && code <= 1099) return 'parsing';
  if (code >= 1100 && code <= 1199) return 'validation';
  if (code >= 1200 && code <= 1299) return 'evaluation';
  if (code >= 1300 && code <= 1399) return 'catalog';
  if (code >= 1400 && code <= 1499) return 'planning';
  if (code >= 1500 && code <= 1599) return 'storage';
  return 'unknown';
}

/**
 * Get severity for an error code
 */
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  if (code === ErrorCode.Success) return ErrorSeverity.Success;
  if (code === ErrorCode.FieldNotFound || code === ErrorCode.CatalogEntryNotFound) {
    return ErrorSeverity.Warning;
  }
  if (code === ErrorCode.DivisionByZero || code === ErrorCode.CircularDependency || code === ErrorCode.SqliteError || code === ErrorCode.FileIoError) {
    return ErrorSeverity.Fatal;
  }
  return ErrorSeverity.Error;
}

/**
 * Check if error code represents success
 */
export function isSuccess(code: ErrorCode): boolean {
  return code === ErrorCode.Success;
}

/**
 * Check if error code represents an error
 */
export function isError(code: ErrorCode): boolean {
  return code !== ErrorCode.Success;
}

/**
 * Format error for display
 */
export function formatError(error: TrackerError): string {
  let result = `[${error.code}] ${error.message}`;
  if (error.sourceLocation) {
    result += ` at ${error.sourceLocation}`;
  }
  return result;
}

/**
 * Parse error from JSON string (from Rust FFI)
 */
export function parseError(json: string): TrackerError {
  const parsed = JSON.parse(json);
  return {
    code: parsed.code as ErrorCode,
    message: parsed.message,
    context: parsed.context || {},
    severity: (parsed.severity as ErrorSeverity) || getErrorSeverity(parsed.code),
    sourceLocation: parsed.source_location,
    timestampMs: parsed.timestamp_ms,
  };
}

/**
 * Adapter for legacy string errors during transition
 */
export function adaptLegacyError(errorString: string): TrackerError {
  const lower = errorString.toLowerCase();

  if (lower.includes('dsl parse')) {
    return {
      code: ErrorCode.DslParseError,
      message: errorString,
      context: { legacy: true, patternMatched: 'dsl_parse' },
      severity: ErrorSeverity.Error,
    };
  }

  if (lower.includes('event validation')) {
    return {
      code: ErrorCode.EventValidationFailed,
      message: errorString,
      context: { legacy: true, patternMatched: 'validation' },
      severity: ErrorSeverity.Error,
    };
  }

  if (lower.includes('tracker mismatch')) {
    return {
      code: ErrorCode.TrackerMismatch,
      message: errorString,
      context: { legacy: true, patternMatched: 'tracker_mismatch' },
      severity: ErrorSeverity.Error,
    };
  }

  if (lower.includes('division by zero')) {
    return {
      code: ErrorCode.DivisionByZero,
      message: errorString,
      context: { legacy: true, patternMatched: 'division_by_zero' },
      severity: ErrorSeverity.Fatal,
    };
  }

  return {
    code: ErrorCode.Unknown,
    message: errorString,
    context: { legacy: true, unmapped: true },
    severity: ErrorSeverity.Error,
  };
}

/**
 * Convert structured error to legacy string format
 */
export function toLegacyString(error: TrackerError): string {
  return `[${error.code}] ${error.message}`;
}

/**
 * Check if string looks like legacy error (not JSON)
 */
export function isLegacyError(s: string): boolean {
  const trimmed = s.trimStart();
  return !trimmed.startsWith('{');
}

/**
 * Check if string looks like structured error (JSON)
 */
export function isStructuredError(s: string): boolean {
  const trimmed = s.trimStart();
  return trimmed.startsWith('{') && trimmed.includes('code');
}

/**
 * Parse either legacy or structured error
 */
export function parseAnyError(s: string): TrackerError {
  if (isStructuredError(s)) {
    return parseError(s);
  }
  return adaptLegacyError(s);
}
