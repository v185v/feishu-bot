/**
 * GitHub Feishu Bot - Cloudflare Worker Entry Point
 * Main entry point for handling HTTP requests and routing
 */

import { HTTP_STATUS, ERROR_MESSAGES } from './constants.js';
import { Logger, generateRequestId } from './utils/logger.js';
import { ConfigManager } from './config.js';
import { 
  ConfigurationError, 
  ProcessingError, 
  formatErrorResponse, 
  logError 
} from './utils/errors.js';
import { handleGitHubWebhook, registerEventHandler } from './handlers/github-webhook.js';
import { handlePullRequestEvent } from './handlers/events/pull-request.js';
import { sendToFeishu } from './handlers/feishu-sender.js';

// Register event handlers
registerEventHandler('pull_request', handlePullRequestEventWithFeishu);

/**
 * Wrapper for pull request handler that sends to Feishu
 * @param {object} event - GitHub webhook event
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance
 * @returns {Promise<object>} Handler result
 */
async function handlePullRequestEventWithFeishu(event, config, logger) {
  const result = await handlePullRequestEvent(event, config, logger);

  if (result.shouldNotify && result.message) {
    try {
      await sendToFeishu(config.feishu_webhook, result.message, {
        retryAttempts: config.global_settings?.retry_attempts ?? 3,
        timeoutMs: config.global_settings?.timeout_ms ?? 5000,
        logger,
      });
      logger.info('Feishu notification sent successfully');
    } catch (error) {
      // Log with full context for Feishu API failures
      logError(logger, error, {
        repository: `${config.owner}/${config.repo}`,
        eventType: 'pull_request',
        action: result.message?.action,
        phase: 'feishu_notification',
      });
      throw error;
    }
  }

  return result;
}

/**
 * Create JSON response helper
 * @param {object} body - Response body
 * @param {number} status - HTTP status code
 * @param {object} headers - Additional headers
 * @returns {Response} HTTP Response
 */
function jsonResponse(body, status = HTTP_STATUS.OK, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}


/**
 * Handle POST /webhook endpoint for GitHub webhooks
 * @param {Request} request - Incoming request
 * @param {object} env - Environment variables/bindings
 * @param {Logger} logger - Logger instance
 * @returns {Promise<Response>} HTTP Response
 */
async function handleWebhook(request, env, logger) {
  const configManager = new ConfigManager();

  try {
    // Load configuration
    await configManager.loadConfig(env);
    const globalSettings = configManager.getGlobalSettings();

    // Attach global settings to config for handlers
    const repositories = configManager.getAllRepositories();
    repositories.forEach(repo => {
      repo.global_settings = globalSettings;
    });

    logger.info('Configuration loaded successfully', {
      repositoryCount: repositories.length,
    });

  } catch (error) {
    if (error instanceof ConfigurationError) {
      logError(logger, error, { phase: 'configuration_loading' });
      const { status, body } = error.toResponse();
      return jsonResponse(body, status);
    }
    throw error;
  }

  // Process the webhook
  const result = await handleGitHubWebhook(request, configManager, logger);

  return jsonResponse(result.body, result.status);
}

/**
 * Handle GET /health endpoint for health checks
 * @param {Logger} logger - Logger instance
 * @returns {Response} HTTP Response
 */
function handleHealth(logger) {
  logger.debug('Health check requested');

  return jsonResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'github-feishu-bot',
  });
}

/**
 * Handle GET / endpoint for root info
 * @param {Logger} logger - Logger instance
 * @returns {Response} HTTP Response
 */
function handleRoot(logger) {
  logger.debug('Root endpoint requested');

  return jsonResponse({
    name: 'GitHub Feishu Bot',
    description: 'Cloudflare Worker that monitors GitHub repositories and sends notifications to Feishu',
    version: '1.0.0',
    endpoints: {
      'POST /webhook': 'GitHub webhook receiver',
      'GET /health': 'Health check endpoint',
      'GET /': 'This info endpoint',
    },
  });
}

/**
 * Handle 404 Not Found
 * @param {string} path - Requested path
 * @param {Logger} logger - Logger instance
 * @returns {Response} HTTP Response
 */
function handleNotFound(path, logger) {
  logger.warn('Unknown endpoint requested', { path });

  return jsonResponse(
    { error: 'Not Found', message: `Endpoint ${path} not found` },
    HTTP_STATUS.NOT_FOUND
  );
}


/**
 * Main request handler - routes requests to appropriate handlers
 * @param {Request} request - Incoming request
 * @param {object} env - Environment variables/bindings
 * @param {object} ctx - Execution context
 * @returns {Promise<Response>} HTTP Response
 */
async function handleRequest(request, env, ctx) {
  // Generate unique request ID for tracing
  const requestId = generateRequestId();

  // Get log level from environment or default to 'info'
  const logLevel = env.LOG_LEVEL || 'info';
  const logger = new Logger(requestId, logLevel);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  logger.info('Request received', {
    method,
    path,
    userAgent: request.headers.get('User-Agent'),
  });

  try {
    // Route: POST /webhook
    if (method === 'POST' && path === '/webhook') {
      return await handleWebhook(request, env, logger);
    }

    // Route: GET /health
    if (method === 'GET' && path === '/health') {
      return handleHealth(logger);
    }

    // Route: GET /
    if (method === 'GET' && path === '/') {
      return handleRoot(logger);
    }

    // 404 for unknown routes
    return handleNotFound(path, logger);

  } catch (error) {
    // Log error with full context including request ID (from logger)
    logError(logger, error, {
      path,
      method,
      phase: 'request_handling',
    });

    // Wrap in ProcessingError if not already an AppError
    const processingError = new ProcessingError(
      'An unexpected error occurred',
      error
    );
    
    const { status, body } = formatErrorResponse(processingError);
    return jsonResponse(body, status);
  }
}

/**
 * Cloudflare Workers export
 */
export default {
  fetch: handleRequest,
};

// Export for testing
export {
  handleRequest,
  handleWebhook,
  handleHealth,
  handleRoot,
  handleNotFound,
  jsonResponse,
  handlePullRequestEventWithFeishu,
};
