import { LOG_LEVELS } from './constants.js';
import { ConfigurationError } from './utils/errors.js';

/**
 * Default global settings
 */
const DEFAULT_GLOBAL_SETTINGS = {
  log_level: LOG_LEVELS.INFO,
  retry_attempts: 3,
  timeout_ms: 5000,
};

/**
 * Required fields for repository configuration
 */
const REQUIRED_REPO_FIELDS = ['owner', 'repo', 'events', 'feishu_webhook', 'secret'];

/**
 * Valid event types
 */
const VALID_EVENT_TYPES = ['pull_request', 'issues', 'star', 'push', 'release'];

/**
 * Configuration Manager class
 * Handles loading, validation, and lookup of repository configurations
 */
export class ConfigManager {
  constructor() {
    this.config = null;
    this.repositoryMap = new Map();
  }

  /**
   * Load configuration from environment or provided config object
   * @param {object} env - Environment variables/bindings from Cloudflare Workers
   * @param {object} [configOverride] - Optional configuration object to use directly
   * @returns {Promise<object>} Loaded configuration
   */
  async loadConfig(env, configOverride = null) {
    let rawConfig;

    if (configOverride) {
      rawConfig = configOverride;
    } else {
      const configSource = env.CONFIG_SOURCE || 'file';

      if (configSource === 'kv') {
        rawConfig = await this._loadFromKV(env);
      } else {
        rawConfig = await this._loadFromEnv(env);
      }
    }

    // Apply environment variable overrides for global settings
    rawConfig = this._applyEnvOverrides(rawConfig, env);

    // Validate the configuration
    this._validateConfig(rawConfig);

    // Store and index the configuration
    this.config = rawConfig;
    this._buildRepositoryIndex();

    return this.config;
  }


  /**
   * Load configuration from KV storage
   * @private
   */
  async _loadFromKV(env) {
    const kvNamespace = env.CONFIG_KV_NAMESPACE;
    if (!kvNamespace) {
      throw new ConfigurationError('CONFIG_KV_NAMESPACE binding not found');
    }

    const configKey = env.CONFIG_KV_KEY || 'github_bot_config';
    const configData = await kvNamespace.get(configKey, 'json');

    if (!configData) {
      throw new ConfigurationError(`Configuration not found in KV at key: ${configKey}`);
    }

    return configData;
  }

  /**
   * Load configuration from environment variable (JSON string)
   * @private
   */
  async _loadFromEnv(env) {
    const configJson = env.REPOSITORIES_CONFIG;

    if (!configJson) {
      throw new ConfigurationError('REPOSITORIES_CONFIG environment variable not set');
    }

    try {
      return JSON.parse(configJson);
    } catch (error) {
      throw new ConfigurationError(`Failed to parse REPOSITORIES_CONFIG: ${error.message}`);
    }
  }

  /**
   * Apply environment variable overrides to global settings
   * @private
   */
  _applyEnvOverrides(config, env) {
    const globalSettings = { ...DEFAULT_GLOBAL_SETTINGS, ...config.global_settings };

    // Override log level from environment
    if (env.LOG_LEVEL) {
      const logLevel = env.LOG_LEVEL.toLowerCase();
      if (Object.values(LOG_LEVELS).includes(logLevel)) {
        globalSettings.log_level = logLevel;
      }
    }

    // Override retry attempts from environment
    if (env.RETRY_ATTEMPTS) {
      const retryAttempts = parseInt(env.RETRY_ATTEMPTS, 10);
      if (!isNaN(retryAttempts) && retryAttempts >= 0) {
        globalSettings.retry_attempts = retryAttempts;
      }
    }

    // Override timeout from environment
    if (env.TIMEOUT_MS) {
      const timeoutMs = parseInt(env.TIMEOUT_MS, 10);
      if (!isNaN(timeoutMs) && timeoutMs > 0) {
        globalSettings.timeout_ms = timeoutMs;
      }
    }

    return {
      ...config,
      global_settings: globalSettings,
    };
  }


  /**
   * Validate the configuration structure and required fields
   * @private
   */
  _validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new ConfigurationError('Configuration must be a valid object');
    }

    if (!Array.isArray(config.repositories)) {
      throw new ConfigurationError('Configuration must contain a "repositories" array');
    }

    if (config.repositories.length === 0) {
      throw new ConfigurationError('Configuration must contain at least one repository');
    }

    // Validate each repository configuration
    config.repositories.forEach((repo, index) => {
      this._validateRepository(repo, index);
    });

    // Validate global settings if present
    if (config.global_settings) {
      this._validateGlobalSettings(config.global_settings);
    }
  }

  /**
   * Validate a single repository configuration
   * @private
   */
  _validateRepository(repo, index) {
    // Check required fields
    for (const field of REQUIRED_REPO_FIELDS) {
      if (!repo[field]) {
        throw new ConfigurationError(
          `Repository at index ${index} is missing required field: ${field}`
        );
      }
    }

    // Validate owner and repo are strings
    if (typeof repo.owner !== 'string' || repo.owner.trim() === '') {
      throw new ConfigurationError(
        `Repository at index ${index}: "owner" must be a non-empty string`
      );
    }

    if (typeof repo.repo !== 'string' || repo.repo.trim() === '') {
      throw new ConfigurationError(
        `Repository at index ${index}: "repo" must be a non-empty string`
      );
    }

    // Validate events array
    if (!Array.isArray(repo.events) || repo.events.length === 0) {
      throw new ConfigurationError(
        `Repository at index ${index}: "events" must be a non-empty array`
      );
    }

    // Validate event types
    for (const event of repo.events) {
      if (!VALID_EVENT_TYPES.includes(event)) {
        throw new ConfigurationError(
          `Repository at index ${index}: invalid event type "${event}". Valid types: ${VALID_EVENT_TYPES.join(', ')}`
        );
      }
    }

    // Validate feishu_webhook URL
    if (typeof repo.feishu_webhook !== 'string' || !repo.feishu_webhook.startsWith('http')) {
      throw new ConfigurationError(
        `Repository at index ${index}: "feishu_webhook" must be a valid URL`
      );
    }

    // Validate secret
    if (typeof repo.secret !== 'string' || repo.secret.trim() === '') {
      throw new ConfigurationError(
        `Repository at index ${index}: "secret" must be a non-empty string`
      );
    }

    // Validate mentions if present
    if (repo.mentions !== undefined) {
      if (!Array.isArray(repo.mentions)) {
        throw new ConfigurationError(
          `Repository at index ${index}: "mentions" must be an array`
        );
      }
    }

    // Validate settings if present
    if (repo.settings !== undefined) {
      this._validateRepositorySettings(repo.settings, index);
    }
  }


  /**
   * Validate repository-specific settings
   * @private
   */
  _validateRepositorySettings(settings, index) {
    if (typeof settings !== 'object' || settings === null) {
      throw new ConfigurationError(
        `Repository at index ${index}: "settings" must be an object`
      );
    }

    const booleanSettings = [
      'notify_on_pr_open',
      'notify_on_pr_merge',
      'notify_on_pr_close',
      'notify_on_pr_review',
    ];

    for (const setting of booleanSettings) {
      if (settings[setting] !== undefined && typeof settings[setting] !== 'boolean') {
        throw new ConfigurationError(
          `Repository at index ${index}: "${setting}" must be a boolean`
        );
      }
    }
  }

  /**
   * Validate global settings
   * @private
   */
  _validateGlobalSettings(settings) {
    if (typeof settings !== 'object' || settings === null) {
      throw new ConfigurationError('"global_settings" must be an object');
    }

    if (settings.log_level !== undefined) {
      if (!Object.values(LOG_LEVELS).includes(settings.log_level)) {
        throw new ConfigurationError(
          `Invalid log_level: "${settings.log_level}". Valid levels: ${Object.values(LOG_LEVELS).join(', ')}`
        );
      }
    }

    if (settings.retry_attempts !== undefined) {
      if (typeof settings.retry_attempts !== 'number' || settings.retry_attempts < 0) {
        throw new ConfigurationError('"retry_attempts" must be a non-negative number');
      }
    }

    if (settings.timeout_ms !== undefined) {
      if (typeof settings.timeout_ms !== 'number' || settings.timeout_ms <= 0) {
        throw new ConfigurationError('"timeout_ms" must be a positive number');
      }
    }
  }

  /**
   * Build an index of repositories for fast lookup
   * @private
   */
  _buildRepositoryIndex() {
    this.repositoryMap.clear();

    for (const repo of this.config.repositories) {
      const key = this._getRepoKey(repo.owner, repo.repo);
      this.repositoryMap.set(key, repo);
    }
  }

  /**
   * Generate a unique key for repository lookup
   * @private
   */
  _getRepoKey(owner, repo) {
    return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  }

  /**
   * Find repository configuration by owner and repo name
   * @param {string} owner - Repository owner (organization or user)
   * @param {string} repo - Repository name
   * @returns {object|null} Repository configuration or null if not found
   */
  getRepository(owner, repo) {
    if (!this.config) {
      throw new ConfigurationError('Configuration not loaded. Call loadConfig() first.');
    }

    const key = this._getRepoKey(owner, repo);
    return this.repositoryMap.get(key) || null;
  }

  /**
   * Get global settings with defaults applied
   * @returns {object} Global settings
   */
  getGlobalSettings() {
    if (!this.config) {
      throw new ConfigurationError('Configuration not loaded. Call loadConfig() first.');
    }

    return this.config.global_settings || DEFAULT_GLOBAL_SETTINGS;
  }

  /**
   * Get all configured repositories
   * @returns {Array} Array of repository configurations
   */
  getAllRepositories() {
    if (!this.config) {
      throw new ConfigurationError('Configuration not loaded. Call loadConfig() first.');
    }

    return this.config.repositories;
  }

  /**
   * Check if a repository is configured
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {boolean} True if repository is configured
   */
  hasRepository(owner, repo) {
    return this.getRepository(owner, repo) !== null;
  }
}

/**
 * Singleton instance for global use
 */
let configManagerInstance = null;

/**
 * Get the singleton ConfigManager instance
 * @returns {ConfigManager} ConfigManager instance
 */
export function getConfigManager() {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager();
  }
  return configManagerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetConfigManager() {
  configManagerInstance = null;
}

// Re-export ConfigurationError for backward compatibility
export { ConfigurationError } from './utils/errors.js';
