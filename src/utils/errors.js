/**
 * Error Handling Utilities
 * Centralized error classes and response formatting for the GitHub Feishu Bot
 */

import { HTTP_STATUS, ERROR_MESSAGES } from '../constants.js';

/**
 * Base error class for application errors
 */
export class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert error to response object
   * @returns {object} Response object with status and body
   */
  toResponse() {
    return {
      status: this.statusCode,
      body: {
        error: this.code || this.name,
        message: this.message,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * Configuration error (400 Bad Request)
 * Used for missing/malformed configuration files or invalid settings
 */
export class ConfigurationError extends AppError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.CONFIGURATION_ERROR);
    this.name = 'ConfigurationError';
    this.details = details;
  }

  toResponse() {
    const response = super.toResponse();
    if (this.details) {
      response.body.details = this.details;
    }
    return response;
  }
}

/**
 * Authentication error (401 Unauthorized)
 * Used for invalid or missing webhook signatures
 */
export class AuthenticationError extends AppError {
  constructor(message, repository = null) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.INVALID_SIGNATURE);
    this.name = 'AuthenticationError';
    this.repository = repository;
  }

  toResponse() {
    const response = super.toResponse();
    if (this.repository) {
      response.body.repository = this.repository;
    }
    return response;
  }
}

/**
 * Webhook parse error (400 Bad Request)
 * Used for malformed webhook events
 */
export class WebhookParseError extends AppError {
  constructor(message) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.MALFORMED_EVENT);
    this.name = 'WebhookParseError';
  }
}

/**
 * Repository not found error (404 Not Found)
 * Used when webhook is received for unconfigured repository
 */
export class RepositoryNotFoundError extends AppError {
  constructor(owner, repo) {
    super(`Repository ${owner}/${repo} not found in configuration`, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.REPOSITORY_NOT_FOUND);
    this.name = 'RepositoryNotFoundError';
    this.owner = owner;
    this.repo = repo;
  }

  toResponse() {
    const response = super.toResponse();
    response.body.repository = `${this.owner}/${this.repo}`;
    return response;
  }
}

/**
 * Processing error (500 Internal Server Error)
 * Used for unexpected errors during webhook processing
 */
export class ProcessingError extends AppError {
  constructor(message, cause = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.PROCESSING_ERROR);
    this.name = 'ProcessingError';
    this.cause = cause;
  }
}

/**
 * Feishu API error (500 Internal Server Error)
 * Used when Feishu API calls fail after retries
 */
export class FeishuApiError extends AppError {
  constructor(message, statusCode = null, response = null, isRetryable = false) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_MESSAGES.FEISHU_API_FAILURE);
    this.name = 'FeishuApiError';
    this.statusCode = statusCode; // Keep for backward compatibility with existing code
    this.apiStatusCode = statusCode;
    this.apiResponse = response;
    this.response = response; // Keep for backward compatibility
    this.isRetryable = isRetryable;
  }
}

/**
 * Format error for JSON response
 * @param {Error} error - Error object
 * @param {boolean} includeStack - Whether to include stack trace (for debug mode)
 * @returns {object} Formatted error response
 */
export function formatErrorResponse(error, includeStack = false) {
  // Handle AppError and its subclasses
  if (error instanceof AppError) {
    const response = error.toResponse();
    if (includeStack && error.stack) {
      response.body.stack = error.stack;
    }
    return response;
  }

  // Handle generic errors
  return {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    body: {
      error: ERROR_MESSAGES.PROCESSING_ERROR,
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
    },
  };
}

/**
 * Create JSON response from error
 * @param {Error} error - Error object
 * @param {boolean} includeStack - Whether to include stack trace
 * @returns {Response} HTTP Response object
 */
export function createErrorResponse(error, includeStack = false) {
  const { status, body } = formatErrorResponse(error, includeStack);
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Log error with full context
 * @param {Logger} logger - Logger instance
 * @param {Error} error - Error object
 * @param {object} context - Additional context (repository, eventType, etc.)
 */
export function logError(logger, error, context = {}) {
  const errorInfo = {
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    ...context,
  };

  // Add error-specific details
  if (error instanceof AppError) {
    errorInfo.statusCode = error.statusCode;
    errorInfo.code = error.code;
  }

  if (error instanceof ConfigurationError && error.details) {
    errorInfo.details = error.details;
  }

  if (error instanceof AuthenticationError && error.repository) {
    errorInfo.repository = error.repository;
  }

  if (error instanceof RepositoryNotFoundError) {
    errorInfo.repository = `${error.owner}/${error.repo}`;
  }

  if (error instanceof FeishuApiError) {
    errorInfo.apiStatusCode = error.apiStatusCode;
    errorInfo.apiResponse = error.apiResponse;
    errorInfo.isRetryable = error.isRetryable;
  }

  logger.error('Error occurred', errorInfo);
}

/**
 * Determine if an error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
  if (error instanceof FeishuApiError) {
    return error.isRetryable;
  }
  // Network errors and timeouts are generally retryable
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return true;
  }
  return false;
}
