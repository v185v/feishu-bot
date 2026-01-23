// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_SIGNATURE: 'Invalid webhook signature',
  MISSING_SIGNATURE: 'Missing X-Hub-Signature-256 header',
  REPOSITORY_NOT_FOUND: 'Repository not found in configuration',
  CONFIGURATION_ERROR: 'Configuration error',
  MALFORMED_EVENT: 'Malformed webhook event',
  FEISHU_API_FAILURE: 'Failed to send message to Feishu after retries',
  PROCESSING_ERROR: 'Error processing webhook event',
  AUTHENTICATION_ERROR: 'Authentication failed',
  UNKNOWN_ENDPOINT: 'Endpoint not found',
};

// Log Levels
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

// Log Level Priority (for filtering)
export const LOG_LEVEL_PRIORITY = {
  [LOG_LEVELS.DEBUG]: 0,
  [LOG_LEVELS.INFO]: 1,
  [LOG_LEVELS.WARN]: 2,
  [LOG_LEVELS.ERROR]: 3,
};
