/**
 * Star Event Handler
 * Processes GitHub star webhook events and returns formatted messages
 */

/**
 * Default settings for star notifications
 */
const DEFAULT_SETTINGS = {
  notify_on_star: true,
};

/**
 * Handle star webhook event
 * @param {object} event - GitHub webhook event object
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance with request ID
 * @returns {Promise<{shouldNotify: boolean, message: object|null}>} Handler result
 */
export async function handleStarEvent(event, config, logger) {
  const { action, starred_at, sender, repository } = event;

  if (!sender || !repository) {
    logger.warn('Star event missing required data');
    return { shouldNotify: false, message: null };
  }

  logger.debug('Processing star event', {
    action,
    user: sender.login,
    repository: repository.full_name,
  });

  // Get effective settings (merge defaults with config)
  const settings = { ...DEFAULT_SETTINGS, ...config.settings };

  // Check if notification is enabled for star events
  const shouldNotify = checkNotificationEnabled(action, settings, logger);

  if (!shouldNotify) {
    logger.info('Notification disabled for this star action', { action });
    return { shouldNotify: false, message: null };
  }

  // Build message
  const message = buildStarMessage(event, config, logger);

  logger.info('Star event processed successfully', {
    action: message.action,
    user: sender.login,
  });

  return { shouldNotify: true, message };
}


/**
 * Check if notification is enabled for the given star action
 * @param {string} action - Star action (created or deleted)
 * @param {object} settings - Repository notification settings
 * @param {Logger} logger - Logger instance
 * @returns {boolean} True if notification should be sent
 */
function checkNotificationEnabled(action, settings, logger) {
  // Only notify on 'created' action (when someone stars the repo)
  if (action === 'created') {
    logger.debug('Star created, checking notify_on_star setting');
    return settings.notify_on_star === true;
  }

  // Don't notify on 'deleted' action (when someone unstars)
  logger.debug('Star deleted, skipping notification', { action });
  return false;
}

/**
 * Build formatted message object for star event
 * @param {object} event - GitHub webhook event
 * @param {object} config - Repository configuration
 * @param {Logger} logger - Logger instance
 * @returns {object} Formatted message object
 */
function buildStarMessage(event, config, logger) {
  const { action, starred_at, sender, repository } = event;

  // Determine the effective action for display
  const effectiveAction = action === 'created' ? 'starred' : 'unstarred';

  // Build the message object
  const message = {
    type: 'star',
    action: effectiveAction,
    repository: {
      owner: repository.owner.login || repository.owner.name,
      name: repository.name,
      url: repository.html_url,
    },
    actor: sender.login,
    title: `${sender.login} starred ${repository.full_name}`,
    description: repository.description || '',
    url: repository.html_url,
    timestamp: starred_at || new Date().toISOString(),
    metadata: {
      stargazers_count: repository.stargazers_count || 0,
      watchers_count: repository.watchers_count || 0,
      forks_count: repository.forks_count || 0,
    },
  };

  // Add mentions from config if present
  if (config.mentions && Array.isArray(config.mentions)) {
    message.mentions = config.mentions;
  }

  logger.debug('Built star message', {
    action: effectiveAction,
    user: sender.login,
    stargazers_count: message.metadata.stargazers_count,
  });

  return message;
}


// Export for testing
export {
  checkNotificationEnabled,
  buildStarMessage,
  DEFAULT_SETTINGS,
};
