/**
 * Pull Request Event Handler
 * Processes GitHub pull_request webhook events and returns formatted messages
 */

/**
 * PR action types mapped to notification settings
 */
const ACTION_SETTINGS_MAP = {
  opened: 'notify_on_pr_open',
  reopened: 'notify_on_pr_open',
  closed: null, // Handled specially based on merged status
  review_requested: 'notify_on_pr_review',
};

/**
 * Default settings for PR notifications
 */
const DEFAULT_SETTINGS = {
  notify_on_pr_open: true,
  notify_on_pr_merge: true,
  notify_on_pr_close: true,
  notify_on_pr_review: true,
};

/**
 * Handle pull request webhook event
 * @param {object} event - GitHub webhook event object
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance with request ID
 * @returns {Promise<{shouldNotify: boolean, message: object|null}>} Handler result
 */
export async function handlePullRequestEvent(event, config, logger) {
  const { action, pull_request: pr } = event;

  if (!pr) {
    logger.warn('Pull request event missing pull_request data');
    return { shouldNotify: false, message: null };
  }

  logger.debug('Processing pull request event', {
    action,
    prNumber: pr.number,
    prTitle: pr.title,
  });

  // Get effective settings (merge defaults with config)
  const settings = { ...DEFAULT_SETTINGS, ...config.settings };

  // Check if notification is enabled for this action
  const shouldNotify = checkNotificationEnabled(action, pr, settings, logger);

  if (!shouldNotify) {
    logger.info('Notification disabled for this PR action', { action });
    return { shouldNotify: false, message: null };
  }

  // Extract PR details and build message
  const message = buildPRMessage(event, config, logger);

  logger.info('PR event processed successfully', {
    action: message.action,
    prNumber: pr.number,
  });

  return { shouldNotify: true, message };
}


/**
 * Check if notification is enabled for the given PR action
 * @param {string} action - PR action (opened, closed, reopened, review_requested)
 * @param {object} pr - Pull request object
 * @param {object} settings - Repository notification settings
 * @param {Logger} logger - Logger instance
 * @returns {boolean} True if notification should be sent
 */
function checkNotificationEnabled(action, pr, settings, logger) {
  // Handle closed action specially - check merged status
  if (action === 'closed') {
    if (pr.merged) {
      logger.debug('PR was merged, checking notify_on_pr_merge setting');
      return settings.notify_on_pr_merge === true;
    } else {
      logger.debug('PR was closed without merge, checking notify_on_pr_close setting');
      return settings.notify_on_pr_close === true;
    }
  }

  // Get the setting key for this action
  const settingKey = ACTION_SETTINGS_MAP[action];

  if (!settingKey) {
    logger.debug('Unknown PR action, skipping notification', { action });
    return false;
  }

  return settings[settingKey] === true;
}

/**
 * Build formatted message object for PR event
 * @param {object} event - GitHub webhook event
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance
 * @returns {object} Formatted message object
 */
function buildPRMessage(event, config, logger) {
  const { action, pull_request: pr, repository, sender } = event;

  // Determine the effective action for display
  const effectiveAction = getEffectiveAction(action, pr);

  // Extract PR details
  const prDetails = extractPRDetails(pr);

  // Build the message object
  const message = {
    type: 'pull_request',
    action: effectiveAction,
    repository: {
      owner: repository.owner.login || repository.owner.name,
      name: repository.name,
      url: repository.html_url,
    },
    actor: sender?.login || pr.user?.login || 'unknown',
    title: prDetails.title,
    description: prDetails.description,
    url: prDetails.url,
    timestamp: new Date().toISOString(),
    metadata: {
      prNumber: prDetails.number,
      reviewers: prDetails.reviewers,
      merged: pr.merged || false,
      draft: pr.draft || false,
    },
  };

  // Add mentions from config if present
  if (config.mentions && Array.isArray(config.mentions)) {
    message.mentions = config.mentions;
  }

  logger.debug('Built PR message', {
    action: effectiveAction,
    prNumber: prDetails.number,
  });

  return message;
}


/**
 * Get the effective action for display purposes
 * @param {string} action - Original GitHub action
 * @param {object} pr - Pull request object
 * @returns {string} Effective action for display
 */
function getEffectiveAction(action, pr) {
  if (action === 'closed') {
    return pr.merged ? 'merged' : 'closed';
  }
  return action;
}

/**
 * Extract relevant PR details from the pull request object
 * @param {object} pr - GitHub pull request object
 * @returns {object} Extracted PR details
 */
function extractPRDetails(pr) {
  return {
    number: pr.number,
    title: pr.title || 'Untitled PR',
    description: truncateDescription(pr.body),
    url: pr.html_url,
    author: pr.user?.login || 'unknown',
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    reviewers: extractReviewers(pr),
  };
}

/**
 * Extract reviewer information from PR
 * @param {object} pr - GitHub pull request object
 * @returns {string[]} Array of reviewer usernames
 */
function extractReviewers(pr) {
  const reviewers = [];

  if (pr.requested_reviewers && Array.isArray(pr.requested_reviewers)) {
    for (const reviewer of pr.requested_reviewers) {
      if (reviewer.login) {
        reviewers.push(reviewer.login);
      }
    }
  }

  return reviewers;
}

/**
 * Truncate description to a reasonable length
 * @param {string|null} description - PR description/body
 * @param {number} maxLength - Maximum length (default 200)
 * @returns {string} Truncated description
 */
function truncateDescription(description, maxLength = 200) {
  if (!description) {
    return '';
  }

  const trimmed = description.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.substring(0, maxLength - 3) + '...';
}

// Export for testing
export {
  checkNotificationEnabled,
  buildPRMessage,
  getEffectiveAction,
  extractPRDetails,
  extractReviewers,
  truncateDescription,
  DEFAULT_SETTINGS,
};
