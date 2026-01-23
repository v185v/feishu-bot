import { HTTP_STATUS, ERROR_MESSAGES } from '../constants.js';
import { validateWebhookRequest } from '../utils/validator.js';
import { 
  WebhookParseError, 
  RepositoryNotFoundError, 
  AuthenticationError,
  ProcessingError,
  logError 
} from '../utils/errors.js';

/**
 * GitHub Webhook Handler
 * Handles incoming GitHub webhook events, validates signatures,
 * and dispatches to appropriate event handlers
 */

/**
 * Registry of event handlers
 * Maps event type to handler function
 */
const eventHandlers = new Map();

/**
 * Register an event handler
 * @param {string} eventType - GitHub event type (e.g., 'pull_request')
 * @param {Function} handler - Handler function
 */
export function registerEventHandler(eventType, handler) {
  eventHandlers.set(eventType, handler);
}

/**
 * Get registered event handler
 * @param {string} eventType - GitHub event type
 * @returns {Function|null} Handler function or null
 */
export function getEventHandler(eventType) {
  return eventHandlers.get(eventType) || null;
}

/**
 * Clear all registered handlers (useful for testing)
 */
export function clearEventHandlers() {
  eventHandlers.clear();
}

/**
 * Parse GitHub webhook event from request
 * @param {Request} request - Incoming request
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{eventType: string, event: object, body: string}>} Parsed event data
 * @throws {WebhookParseError} If parsing fails
 */
export async function parseWebhookEvent(request, logger) {
  // Get event type from header
  const eventType = request.headers.get('X-GitHub-Event');
  
  if (!eventType) {
    logger.warn('Missing X-GitHub-Event header');
    throw new WebhookParseError('Missing X-GitHub-Event header');
  }

  // Read and parse body
  let body;
  let event;
  
  try {
    body = await request.text();
  } catch (error) {
    logger.error('Failed to read request body', { error: error.message });
    throw new WebhookParseError('Failed to read request body');
  }

  if (!body || body.trim() === '') {
    logger.warn('Empty request body');
    throw new WebhookParseError('Empty request body');
  }

  try {
    event = JSON.parse(body);
  } catch (error) {
    logger.error('Failed to parse JSON body', { error: error.message });
    throw new WebhookParseError('Invalid JSON in request body');
  }

  // Validate basic event structure
  if (!event || typeof event !== 'object') {
    logger.warn('Invalid event structure');
    throw new WebhookParseError('Invalid event structure');
  }

  logger.debug('Parsed webhook event', { eventType });

  return { eventType, event, body };
}

/**
 * Extract repository information from webhook event
 * @param {object} event - GitHub webhook event
 * @returns {{owner: string, repo: string}|null} Repository info or null
 */
export function extractRepositoryInfo(event) {
  if (!event.repository) {
    return null;
  }

  const { repository } = event;
  
  // Try to get owner from repository.owner.login or repository.owner.name
  let owner = null;
  if (repository.owner) {
    owner = repository.owner.login || repository.owner.name;
  }

  const repo = repository.name;

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

/**
 * Check if event type is enabled for repository
 * @param {string} eventType - GitHub event type
 * @param {object} repoConfig - Repository configuration
 * @returns {boolean} True if event type is enabled
 */
export function isEventTypeEnabled(eventType, repoConfig) {
  if (!repoConfig.events || !Array.isArray(repoConfig.events)) {
    return false;
  }
  return repoConfig.events.includes(eventType);
}


/**
 * Process GitHub webhook request
 * Main entry point for webhook handling
 * @param {Request} request - Incoming request
 * @param {ConfigManager} configManager - Configuration manager instance
 * @param {Logger} logger - Logger instance
 * @returns {Promise<{status: number, body: object}>} Response data
 */
export async function handleGitHubWebhook(request, configManager, logger) {
  let eventType = null;
  let repoInfo = null;

  try {
    // Parse the webhook event
    const { eventType: parsedEventType, event, body } = await parseWebhookEvent(request, logger);
    eventType = parsedEventType;

    logger.info('Processing webhook event', { eventType });

    // Extract repository information
    repoInfo = extractRepositoryInfo(event);
    
    if (!repoInfo) {
      logger.warn('Could not extract repository information from event');
      const error = new WebhookParseError('Missing repository information in event');
      return error.toResponse();
    }

    logger.debug('Repository info extracted', { 
      owner: repoInfo.owner, 
      repo: repoInfo.repo 
    });

    // Look up repository configuration
    const repoConfig = configManager.getRepository(repoInfo.owner, repoInfo.repo);
    
    if (!repoConfig) {
      const error = new RepositoryNotFoundError(repoInfo.owner, repoInfo.repo);
      logError(logger, error, { eventType });
      return error.toResponse();
    }

    // Verify webhook signature
    const validationResult = await validateWebhookRequest(
      request, 
      body, 
      repoConfig.secret, 
      logger
    );

    if (!validationResult.isValid) {
      const error = new AuthenticationError(
        validationResult.error,
        `${repoInfo.owner}/${repoInfo.repo}`
      );
      logError(logger, error, { eventType, repository: `${repoInfo.owner}/${repoInfo.repo}` });
      return error.toResponse();
    }

    // Check if event type is enabled for this repository
    if (!isEventTypeEnabled(eventType, repoConfig)) {
      logger.info('Event type not enabled for repository', {
        eventType,
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        enabledEvents: repoConfig.events
      });
      return {
        status: HTTP_STATUS.OK,
        body: { 
          message: 'Event type not configured for this repository',
          eventType,
          repository: `${repoInfo.owner}/${repoInfo.repo}`
        }
      };
    }

    // Dispatch to event handler
    const result = await dispatchEvent(eventType, event, repoConfig, logger);

    return {
      status: HTTP_STATUS.OK,
      body: result
    };

  } catch (error) {
    const repository = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'unknown';
    
    // Handle specific error types
    if (error instanceof WebhookParseError) {
      logError(logger, error, { eventType, repository });
      return error.toResponse();
    }

    // Wrap unexpected errors in ProcessingError
    const processingError = new ProcessingError(
      'An unexpected error occurred while processing the webhook',
      error
    );
    
    logError(logger, error, { 
      eventType, 
      repository,
      originalError: error.message 
    });

    return processingError.toResponse();
  }
}

/**
 * Dispatch event to appropriate handler
 * @param {string} eventType - GitHub event type
 * @param {object} event - GitHub webhook event
 * @param {object} repoConfig - Repository configuration
 * @param {Logger} logger - Logger instance
 * @returns {Promise<object>} Handler result
 */
export async function dispatchEvent(eventType, event, repoConfig, logger) {
  const handler = getEventHandler(eventType);

  if (!handler) {
    logger.info('No handler registered for event type', { eventType });
    return {
      message: 'Event received but no handler registered',
      eventType,
      processed: false
    };
  }

  logger.debug('Dispatching to event handler', { eventType });

  try {
    const result = await handler(event, repoConfig, logger);
    
    logger.info('Event handler completed', {
      eventType,
      shouldNotify: result?.shouldNotify ?? false
    });

    return {
      message: 'Event processed successfully',
      eventType,
      processed: true,
      ...result
    };
  } catch (error) {
    logger.error('Event handler error', {
      eventType,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Re-export WebhookParseError for backward compatibility
export { WebhookParseError } from '../utils/errors.js';
