import { LOG_LEVELS, LOG_LEVEL_PRIORITY } from '../constants.js';

/**
 * Logger class with request ID tracking and structured logging
 */
export class Logger {
  constructor(requestId, logLevel = LOG_LEVELS.INFO) {
    this.requestId = requestId;
    this.logLevel = logLevel;
    this.logLevelPriority = LOG_LEVEL_PRIORITY[logLevel] || LOG_LEVEL_PRIORITY[LOG_LEVELS.INFO];
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {object} context - Additional context
   */
  debug(message, context = {}) {
    this._log(LOG_LEVELS.DEBUG, message, context);
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {object} context - Additional context
   */
  info(message, context = {}) {
    this._log(LOG_LEVELS.INFO, message, context);
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {object} context - Additional context
   */
  warn(message, context = {}) {
    this._log(LOG_LEVELS.WARN, message, context);
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {object} context - Additional context
   */
  error(message, context = {}) {
    this._log(LOG_LEVELS.ERROR, message, context);
  }

  /**
   * Internal logging method
   * @private
   */
  _log(level, message, context) {
    // Check if this log level should be output
    if (LOG_LEVEL_PRIORITY[level] < this.logLevelPriority) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      requestId: this.requestId,
      message,
      ...context,
    };

    // Output to console based on level
    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(JSON.stringify(logEntry));
        break;
      case LOG_LEVELS.WARN:
        console.warn(JSON.stringify(logEntry));
        break;
      case LOG_LEVELS.DEBUG:
      case LOG_LEVELS.INFO:
      default:
        console.log(JSON.stringify(logEntry));
        break;
    }
  }
}

/**
 * Generate a unique request ID
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
