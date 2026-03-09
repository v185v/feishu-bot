/**
 * Feishu Message Sender
 * Handles message card construction and Feishu API integration
 */

import { ERROR_MESSAGES } from '../constants.js';
import { FeishuApiError } from '../utils/errors.js';

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelayMs - Base delay in milliseconds (default: 1000)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(attempt, baseDelayMs = 1000) {
  if (attempt === 0) {
    return 0; // First attempt is immediate
  }
  // Exponential backoff: baseDelay * 2^(attempt-1) + random jitter (0-500ms)
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 500;
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send message to Feishu webhook with retry logic
 * @param {string} webhookUrl - Feishu webhook URL
 * @param {object} message - Internal message object from event handler
 * @param {object} options - Options for sending
 * @param {number} options.retryAttempts - Number of retry attempts (default: 3)
 * @param {number} options.timeoutMs - Request timeout in milliseconds (default: 5000)
 * @param {object} options.logger - Logger instance for logging
 * @returns {Promise<object>} Feishu API response
 * @throws {FeishuApiError} If all retry attempts fail
 */
export async function sendToFeishu(webhookUrl, message, options = {}) {
  const {
    retryAttempts = 3,
    timeoutMs = 5000,
    logger = null,
  } = options;

  // Build the message card payload
  const payload = buildFeishuMessageCard(message);

  let lastError = null;
  const totalAttempts = retryAttempts + 1; // Initial attempt + retries

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      // Calculate and apply backoff delay
      const delay = calculateBackoffDelay(attempt);
      if (delay > 0) {
        logger?.debug(`Retry attempt ${attempt}, waiting ${delay}ms before retry`, {
          attempt,
          delay,
          webhookUrl: maskWebhookUrl(webhookUrl),
        });
        await sleep(delay);
      }

      logger?.debug(`Sending message to Feishu`, {
        attempt: attempt + 1,
        totalAttempts,
        webhookUrl: maskWebhookUrl(webhookUrl),
      });

      // Send the request with timeout
      const response = await sendFeishuRequest(webhookUrl, payload, timeoutMs);

      // Parse and validate response
      const responseData = await parseFeishuResponse(response);

      logger?.info(`Successfully sent message to Feishu`, {
        attempt: attempt + 1,
        statusCode: response.status,
        webhookUrl: maskWebhookUrl(webhookUrl),
      });

      return responseData;

    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === totalAttempts - 1;
      const errorContext = {
        attempt: attempt + 1,
        totalAttempts,
        webhookUrl: maskWebhookUrl(webhookUrl),
        errorMessage: error.message,
        errorName: error.name,
        statusCode: error.statusCode || null,
        isRetryable: error.isRetryable || false,
      };

      if (isLastAttempt) {
        logger?.error(`All retry attempts exhausted for Feishu API`, {
          ...errorContext,
          stack: error.stack,
          response: error.response,
        });
      } else if (error.isRetryable) {
        logger?.warn(`Feishu API request failed, will retry`, errorContext);
      } else {
        // Non-retryable error, stop immediately
        logger?.error(`Feishu API request failed with non-retryable error`, {
          ...errorContext,
          stack: error.stack,
          response: error.response,
        });
        break;
      }

      // If error is not retryable, don't continue
      if (!error.isRetryable) {
        break;
      }
    }
  }

  // All attempts failed
  throw new FeishuApiError(
    ERROR_MESSAGES.FEISHU_API_FAILURE,
    lastError?.statusCode,
    lastError?.response,
    false
  );
}

/**
 * Send HTTP request to Feishu webhook
 * @param {string} webhookUrl - Feishu webhook URL
 * @param {object} payload - Message payload
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<Response>} Fetch response
 * @throws {FeishuApiError} On network or timeout errors
 */
async function sendFeishuRequest(webhookUrl, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return response;

  } catch (error) {
    // Handle timeout (AbortError)
    if (error.name === 'AbortError') {
      throw new FeishuApiError(
        `Request timeout after ${timeoutMs}ms`,
        null,
        null,
        true // Timeout is retryable
      );
    }

    // Handle network errors
    throw new FeishuApiError(
      `Network error: ${error.message}`,
      null,
      null,
      true // Network errors are retryable
    );

  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse and validate Feishu API response
 * @param {Response} response - Fetch response
 * @returns {Promise<object>} Parsed response data
 * @throws {FeishuApiError} On error responses
 */
async function parseFeishuResponse(response) {
  let responseData;

  try {
    responseData = await response.json();
  } catch {
    // If response is not JSON, treat as error
    throw new FeishuApiError(
      `Invalid JSON response from Feishu`,
      response.status,
      null,
      response.status >= 500 // 5xx errors are retryable
    );
  }

  // Check HTTP status code
  if (!response.ok) {
    const isRetryable = response.status >= 500; // 5xx errors are retryable
    throw new FeishuApiError(
      `Feishu API returned HTTP ${response.status}`,
      response.status,
      responseData,
      isRetryable
    );
  }

  // Check Feishu-specific error codes
  // Feishu returns code: 0 for success
  if (responseData.code !== undefined && responseData.code !== 0) {
    // Feishu error codes >= 99000 are typically server errors (retryable)
    const isRetryable = responseData.code >= 99000;
    throw new FeishuApiError(
      `Feishu API error: ${responseData.msg || 'Unknown error'} (code: ${responseData.code})`,
      response.status,
      responseData,
      isRetryable
    );
  }

  return responseData;
}

/**
 * Mask webhook URL for logging (hide sensitive parts)
 * @param {string} url - Webhook URL
 * @returns {string} Masked URL
 */
export function maskWebhookUrl(url) {
  try {
    const urlObj = new URL(url);
    // Mask the path after the last slash (usually contains the token)
    const pathParts = urlObj.pathname.split('/');
    if (pathParts.length > 1) {
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart.length > 8) {
        pathParts[pathParts.length - 1] = lastPart.substring(0, 4) + '****' + lastPart.substring(lastPart.length - 4);
      }
    }
    urlObj.pathname = pathParts.join('/');
    return urlObj.toString();
  } catch {
    return '***masked***';
  }
}

/**
 * Action type to display text mapping
 */
const ACTION_DISPLAY_TEXT = {
  opened: '🆕 Opened',
  merged: '✅ Merged',
  closed: '❌ Closed',
  reopened: '🔄 Reopened',
  review_requested: '👀 Review Requested',
  starred: '⭐ Starred',
  unstarred: '💔 Unstarred',
  assigned: '👤 Assigned',
  labeled: '🏷️ Labeled',
};

/**
 * Action type to header color mapping (Feishu card colors)
 */
const ACTION_HEADER_COLORS = {
  opened: 'blue',
  merged: 'green',
  closed: 'red',
  reopened: 'orange',
  review_requested: 'purple',
  starred: 'yellow',
  unstarred: 'grey',
  assigned: 'turquoise',
  labeled: 'wathet',
};

/**
 * Build Feishu interactive message card from internal message object
 * @param {object} message - Internal message object from event handler
 * @returns {object} Feishu message card payload
 */
export function buildFeishuMessageCard(message) {
  const {
    type,
    action,
    repository,
    actor,
    title,
    description,
    url,
    timestamp,
    mentions,
    metadata,
  } = message;

  const headerColor = ACTION_HEADER_COLORS[action] || 'blue';
  const actionText = ACTION_DISPLAY_TEXT[action] || action;
  const eventTypeDisplay = formatEventType(type);

  // Build header
  const header = {
    title: {
      tag: 'plain_text',
      content: `[${eventTypeDisplay}] ${repository.owner}/${repository.name}`,
    },
    template: headerColor,
  };

  // Build elements array
  const elements = [];

  // Title section
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**${actionText}**: ${escapeMarkdown(title)}`,
    },
  });

  // Description section (if present)
  if (description && description.trim()) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: escapeMarkdown(description),
      },
    });
  }

  // Divider
  elements.push({ tag: 'hr' });

  // Details section
  const detailsContent = buildDetailsContent(actor, timestamp, metadata);
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: detailsContent,
    },
  });

  // Mentions section (if configured)
  if (mentions && mentions.length > 0) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: buildMentionsContent(mentions),
      },
    });
  }

  // Action button
  elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: 'View on GitHub',
        },
        type: 'primary',
        url: url,
      },
    ],
  });

  return {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true,
      },
      header,
      elements,
    },
  };
}


/**
 * Build details content string for the message card
 * @param {string} actor - Actor/author name
 * @param {string} timestamp - Event timestamp
 * @param {object} metadata - Additional metadata
 * @returns {string} Formatted details content
 */
function buildDetailsContent(actor, timestamp, metadata = {}) {
  const lines = [];

  lines.push(`**Author:** ${escapeMarkdown(actor)}`);

  // Format timestamp for display
  const formattedTime = formatTimestamp(timestamp);
  lines.push(`**Time:** ${formattedTime}`);

  // Add PR number if present
  if (metadata.prNumber) {
    lines.push(`**PR:** #${metadata.prNumber}`);
  }

  // Add issue number if present
  if (metadata.issueNumber) {
    lines.push(`**Issue:** #${metadata.issueNumber}`);
  }

  // Add reviewers if present
  if (metadata.reviewers && metadata.reviewers.length > 0) {
    const reviewerList = metadata.reviewers.map(r => `@${r}`).join(', ');
    lines.push(`**Reviewers:** ${reviewerList}`);
  }

  // Add assignees if present
  if (metadata.assignees && metadata.assignees.length > 0) {
    const assigneeList = metadata.assignees.map(a => `@${a}`).join(', ');
    lines.push(`**Assignees:** ${assigneeList}`);
  }

  // Add assigned to if present
  if (metadata.assignedTo) {
    lines.push(`**Assigned To:** @${metadata.assignedTo}`);
  }

  // Add labels if present
  if (metadata.labels && metadata.labels.length > 0) {
    const labelList = metadata.labels.map(l => `\`${l}\``).join(', ');
    lines.push(`**Labels:** ${labelList}`);
  }

  // Add added label if present
  if (metadata.addedLabel) {
    lines.push(`**Added Label:** \`${metadata.addedLabel}\``);
  }

  // Add comments count if present
  if (metadata.comments !== undefined) {
    lines.push(`**💬 Comments:** ${metadata.comments}`);
  }

  // Add draft status if applicable
  if (metadata.draft) {
    lines.push(`**Status:** Draft`);
  }

  // Add issue state if present
  if (metadata.state) {
    lines.push(`**State:** ${metadata.state}`);
  }

  // Add star statistics if present
  if (metadata.stargazers_count !== undefined) {
    lines.push(`**⭐ Stars:** ${metadata.stargazers_count}`);
  }

  if (metadata.watchers_count !== undefined) {
    lines.push(`**👀 Watchers:** ${metadata.watchers_count}`);
  }

  if (metadata.forks_count !== undefined) {
    lines.push(`**🍴 Forks:** ${metadata.forks_count}`);
  }

  return lines.join('\n');
}

/**
 * Build mentions content for Feishu at functionality
 * @param {string[]} mentions - Array of Feishu user IDs or open_ids
 * @returns {string} Formatted mentions content
 */
function buildMentionsContent(mentions) {
  // Feishu supports mentioning users with <at id="user_id"></at> syntax
  const mentionTags = mentions.map(userId => {
    // Support both user_id and open_id formats
    // If it looks like an email, use email format
    if (userId.includes('@')) {
      return `<at email="${userId}"></at>`;
    }
    // Otherwise treat as user_id/open_id
    return `<at id="${userId}"></at>`;
  });

  return `**CC:** ${mentionTags.join(' ')}`;
}

/**
 * Format event type for display
 * @param {string} eventType - GitHub event type
 * @returns {string} Formatted event type
 */
function formatEventType(eventType) {
  const typeMap = {
    pull_request: 'Pull Request',
    issues: 'Issue',
    star: 'Star',
    push: 'Push',
    release: 'Release',
  };

  return typeMap[eventType] || eventType;
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp || 'Unknown';
    }

    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const values = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    // Format: YYYY-MM-DD HH:mm:ss (Beijing time)
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
  } catch {
    return timestamp || 'Unknown';
  }
}

/**
 * Escape special markdown characters for Feishu lark_md
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
  if (!text) return '';
  // Escape characters that might interfere with lark_md parsing
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
}

/**
 * Build a simple text message (fallback format)
 * @param {object} message - Internal message object
 * @returns {object} Feishu text message payload
 */
export function buildFeishuTextMessage(message) {
  const { type, action, repository, actor, title, url, timestamp } = message;

  const actionText = ACTION_DISPLAY_TEXT[action] || action;
  const eventTypeDisplay = formatEventType(type);

  const content = [
    `[${eventTypeDisplay}] ${repository.owner}/${repository.name}`,
    `${actionText}: ${title}`,
    `Author: ${actor}`,
    `Time: ${formatTimestamp(timestamp)}`,
    `Link: ${url}`,
  ].join('\n');

  return {
    msg_type: 'text',
    content: {
      text: content,
    },
  };
}

// Export helper functions for testing
export {
  buildDetailsContent,
  buildMentionsContent,
  formatEventType,
  formatTimestamp,
  escapeMarkdown,
  ACTION_DISPLAY_TEXT,
  ACTION_HEADER_COLORS,
};

// Re-export FeishuApiError for backward compatibility
export { FeishuApiError } from '../utils/errors.js';
