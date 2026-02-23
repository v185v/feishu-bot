/**
 * Issues Event Handler
 * Processes GitHub issues webhook events and returns formatted messages
 */

/**
 * Issue action types mapped to notification settings
 */
const ACTION_SETTINGS_MAP = {
  opened: 'notify_on_issue_open',
  closed: 'notify_on_issue_close',
  reopened: 'notify_on_issue_reopen',
  assigned: 'notify_on_issue_assign',
  labeled: 'notify_on_issue_label',
};

/**
 * Default settings for issue notifications
 */
const DEFAULT_SETTINGS = {
  notify_on_issue_open: true,
  notify_on_issue_close: true,
  notify_on_issue_reopen: true,
  notify_on_issue_assign: false,
  notify_on_issue_label: false,
};

/**
 * Handle issues webhook event
 * @param {object} event - GitHub webhook event object
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance with request ID
 * @returns {Promise<{shouldNotify: boolean, message: object|null}>} Handler result
 */
export async function handleIssuesEvent(event, config, logger) {
  const { action, issue } = event;

  if (!issue) {
    logger.warn('Issues event missing issue data');
    return { shouldNotify: false, message: null };
  }

  logger.debug('Processing issues event', {
    action,
    issueNumber: issue.number,
    issueTitle: issue.title,
  });

  // Get effective settings (merge defaults with config)
  const settings = { ...DEFAULT_SETTINGS, ...config.settings };

  // Check if notification is enabled for this action
  const shouldNotify = checkNotificationEnabled(action, settings, logger);

  if (!shouldNotify) {
    logger.info('Notification disabled for this issue action', { action });
    return { shouldNotify: false, message: null };
  }

  // Extract issue details and build message
  const message = buildIssueMessage(event, config, logger);

  logger.info('Issue event processed successfully', {
    action: message.action,
    issueNumber: issue.number,
  });

  return { shouldNotify: true, message };
}


/**
 * Check if notification is enabled for the given issue action
 * @param {string} action - Issue action (opened, closed, reopened, assigned, labeled)
 * @param {object} settings - Repository notification settings
 * @param {Logger} logger - Logger instance
 * @returns {boolean} True if notification should be sent
 */
function checkNotificationEnabled(action, settings, logger) {
  // Get the setting key for this action
  const settingKey = ACTION_SETTINGS_MAP[action];

  if (!settingKey) {
    logger.debug('Unknown issue action, skipping notification', { action });
    return false;
  }

  const enabled = settings[settingKey] === true;
  logger.debug(`Issue action ${action}, setting ${settingKey}=${enabled}`);
  
  return enabled;
}

/**
 * Build formatted message object for issue event
 * @param {object} event - GitHub webhook event
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance
 * @returns {object} Formatted message object
 */
function buildIssueMessage(event, config, logger) {
  const { action, issue, repository, sender, assignee, label } = event;

  // Extract issue details
  const issueDetails = extractIssueDetails(issue);

  // Determine the effective action for display
  const effectiveAction = getEffectiveAction(action, event);

  // Build the message object
  const message = {
    type: 'issues',
    action: effectiveAction,
    repository: {
      owner: repository.owner.login || repository.owner.name,
      name: repository.name,
      url: repository.html_url,
    },
    actor: sender?.login || 'unknown',
    title: issueDetails.title,
    description: issueDetails.description,
    url: issueDetails.url,
    timestamp: new Date().toISOString(),
    metadata: {
      issueNumber: issueDetails.number,
      state: issueDetails.state,
      labels: issueDetails.labels,
      assignees: issueDetails.assignees,
      comments: issueDetails.comments,
    },
  };

  // Add assignee information if present
  if (assignee) {
    message.metadata.assignedTo = assignee.login;
  }

  // Add label information if present
  if (label) {
    message.metadata.addedLabel = label.name;
  }

  // Add mentions from config if present
  if (config.mentions && Array.isArray(config.mentions)) {
    message.mentions = config.mentions;
  }

  logger.debug('Built issue message', {
    action: effectiveAction,
    issueNumber: issueDetails.number,
  });

  return message;
}


/**
 * Get the effective action for display purposes
 * @param {string} action - Original GitHub action
 * @param {object} event - Full event object
 * @returns {string} Effective action for display
 */
function getEffectiveAction(action, event) {
  // For assigned action, include assignee info
  if (action === 'assigned' && event.assignee) {
    return `assigned to ${event.assignee.login}`;
  }

  // For labeled action, include label info
  if (action === 'labeled' && event.label) {
    return `labeled ${event.label.name}`;
  }

  return action;
}

/**
 * Extract relevant issue details from the issue object
 * @param {object} issue - GitHub issue object
 * @returns {object} Extracted issue details
 */
function extractIssueDetails(issue) {
  return {
    number: issue.number,
    title: issue.title || 'Untitled Issue',
    description: truncateDescription(issue.body),
    url: issue.html_url,
    state: issue.state,
    author: issue.user?.login || 'unknown',
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    labels: extractLabels(issue),
    assignees: extractAssignees(issue),
    comments: issue.comments || 0,
  };
}

/**
 * Extract label names from issue
 * @param {object} issue - GitHub issue object
 * @returns {string[]} Array of label names
 */
function extractLabels(issue) {
  const labels = [];

  if (issue.labels && Array.isArray(issue.labels)) {
    for (const label of issue.labels) {
      if (label.name) {
        labels.push(label.name);
      }
    }
  }

  return labels;
}

/**
 * Extract assignee usernames from issue
 * @param {object} issue - GitHub issue object
 * @returns {string[]} Array of assignee usernames
 */
function extractAssignees(issue) {
  const assignees = [];

  if (issue.assignees && Array.isArray(issue.assignees)) {
    for (const assignee of issue.assignees) {
      if (assignee.login) {
        assignees.push(assignee.login);
      }
    }
  }

  return assignees;
}

/**
 * Truncate description to a reasonable length
 * @param {string|null} description - Issue description/body
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
  buildIssueMessage,
  getEffectiveAction,
  extractIssueDetails,
  extractLabels,
  extractAssignees,
  truncateDescription,
  DEFAULT_SETTINGS,
};
