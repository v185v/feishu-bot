import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager, ConfigurationError } from './config.js';

describe('ConfigManager', () => {
  let configManager;

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  describe('Configuration Loading', () => {
    it('should load valid configuration from bundled file when CONFIG_SOURCE=file', async () => {
      const env = {
        CONFIG_SOURCE: 'file',
        CONFIG_PATH: './config/repositories.json',
      };

      const config = await configManager.loadConfig(env);

      expect(config).toBeDefined();
      expect(Array.isArray(config.repositories)).toBe(true);
      expect(config.repositories.length).toBeGreaterThan(0);
    });

    it('should load valid configuration from environment', async () => {
      const validConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test',
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(validConfig),
      };

      const config = await configManager.loadConfig(env);

      expect(config).toBeDefined();
      expect(config.repositories).toHaveLength(1);
      expect(config.repositories[0].owner).toBe('test-owner');
    });

    it('should load valid configuration with feishu_webhooks array', async () => {
      const validConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhooks: [
              'https://open.feishu.cn/webhook/test-1',
              'https://open.feishu.cn/webhook/test-2',
            ],
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(validConfig),
      };

      const config = await configManager.loadConfig(env);

      expect(config).toBeDefined();
      expect(config.repositories).toHaveLength(1);
      expect(config.repositories[0].feishu_webhooks).toHaveLength(2);
    });

    it('should default to bundled file configuration when CONFIG_SOURCE is not set', async () => {
      const env = {};

      const config = await configManager.loadConfig(env);

      expect(config).toBeDefined();
      expect(Array.isArray(config.repositories)).toBe(true);
      expect(config.repositories.length).toBeGreaterThan(0);
    });

    it('should load configuration from CONFIG_KV binding with default key', async () => {
      const kvConfig = {
        repositories: [
          {
            owner: 'kv-owner',
            repo: 'kv-repo',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/kv',
            secret: 'kv-secret',
          },
        ],
      };

      const kvGet = vi.fn(async (key, type) => {
        if (key === 'config' && type === 'json') {
          return kvConfig;
        }
        return null;
      });

      const env = {
        CONFIG_SOURCE: 'kv',
        CONFIG_KV: {
          get: kvGet,
        },
      };

      const config = await configManager.loadConfig(env);

      expect(config.repositories[0].owner).toBe('kv-owner');
      expect(kvGet).toHaveBeenCalledWith('config', 'json');
    });

    it('should load configuration from legacy CONFIG_KV_NAMESPACE with custom key', async () => {
      const kvConfig = {
        repositories: [
          {
            owner: 'legacy-owner',
            repo: 'legacy-repo',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/legacy',
            secret: 'legacy-secret',
          },
        ],
      };

      const kvGet = vi.fn(async (key, type) => {
        if (key === 'custom_key' && type === 'json') {
          return kvConfig;
        }
        return null;
      });

      const env = {
        CONFIG_SOURCE: 'kv',
        CONFIG_KV_NAMESPACE: {
          get: kvGet,
        },
        CONFIG_KV_KEY: 'custom_key',
      };

      const config = await configManager.loadConfig(env);

      expect(config.repositories[0].owner).toBe('legacy-owner');
      expect(kvGet).toHaveBeenCalledWith('custom_key', 'json');
    });

    it('should apply environment variable overrides', async () => {
      const validConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test',
            secret: 'test-secret',
          },
        ],
        global_settings: {
          log_level: 'info',
          retry_attempts: 3,
        },
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(validConfig),
        LOG_LEVEL: 'debug',
        RETRY_ATTEMPTS: '5',
        TIMEOUT_MS: '10000',
      };

      const config = await configManager.loadConfig(env);

      expect(config.global_settings.log_level).toBe('debug');
      expect(config.global_settings.retry_attempts).toBe(5);
      expect(config.global_settings.timeout_ms).toBe(10000);
    });

    it('should throw error when env-based configuration is missing', async () => {
      const env = {
        CONFIG_SOURCE: 'env',
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(ConfigurationError);
    });

    it('should throw error for malformed JSON', async () => {
      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: 'invalid json {',
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(ConfigurationError);
    });
  });

  describe('Configuration Validation', () => {
    it('should reject configuration without repositories array', async () => {
      const invalidConfig = {
        global_settings: {},
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        'Configuration must contain a "repositories" array'
      );
    });

    it('should reject empty repositories array', async () => {
      const invalidConfig = {
        repositories: [],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        'Configuration must contain at least one repository'
      );
    });

    it('should reject repository missing required fields', async () => {
      const invalidConfig = {
        repositories: [
          {
            owner: 'test-owner',
            // Missing repo, events, secret
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        'missing required field'
      );
    });

    it('should reject invalid event types', async () => {
      const invalidConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['invalid_event'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test',
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        'invalid event type'
      );
    });

    it('should reject invalid feishu_webhook URL', async () => {
      const invalidConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhook: 'not-a-url',
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        'must be a valid URL'
      );
    });

    it('should reject repository missing both feishu_webhook and feishu_webhooks', async () => {
      const invalidConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        'either "feishu_webhook" or "feishu_webhooks" must be provided'
      );
    });

    it('should reject empty feishu_webhooks array', async () => {
      const invalidConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhooks: [],
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        '"feishu_webhooks" must be a non-empty array'
      );
    });

    it('should reject invalid URL in feishu_webhooks array', async () => {
      const invalidConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhooks: [
              'https://open.feishu.cn/webhook/test',
              'not-a-url',
            ],
            secret: 'test-secret',
          },
        ],
      };

      const env = {
        CONFIG_SOURCE: 'env',
        REPOSITORIES_CONFIG: JSON.stringify(invalidConfig),
      };

      await expect(configManager.loadConfig(env)).rejects.toThrow(
        '"feishu_webhooks[1]" must be a valid URL'
      );
    });
  });

  describe('Repository Lookup', () => {
    beforeEach(async () => {
      const validConfig = {
        repositories: [
          {
            owner: 'owner1',
            repo: 'repo1',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test1',
            secret: 'secret1',
          },
          {
            owner: 'owner2',
            repo: 'repo2',
            events: ['issues'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test2',
            secret: 'secret2',
          },
        ],
      };

      await configManager.loadConfig({}, validConfig);
    });

    it('should find repository by owner and repo', () => {
      const repo = configManager.getRepository('owner1', 'repo1');

      expect(repo).toBeDefined();
      expect(repo.owner).toBe('owner1');
      expect(repo.repo).toBe('repo1');
    });

    it('should return null for unknown repository', () => {
      const repo = configManager.getRepository('unknown', 'repo');

      expect(repo).toBeNull();
    });

    it('should perform case-insensitive lookup', () => {
      const repo = configManager.getRepository('OWNER1', 'REPO1');

      expect(repo).toBeDefined();
      expect(repo.owner).toBe('owner1');
    });

    it('should check if repository exists', () => {
      expect(configManager.hasRepository('owner1', 'repo1')).toBe(true);
      expect(configManager.hasRepository('unknown', 'repo')).toBe(false);
    });
  });

  describe('Global Settings', () => {
    it('should return default global settings when not specified', async () => {
      const validConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test',
            secret: 'test-secret',
          },
        ],
      };

      await configManager.loadConfig({}, validConfig);

      const settings = configManager.getGlobalSettings();

      expect(settings.log_level).toBe('info');
      expect(settings.retry_attempts).toBe(3);
      expect(settings.timeout_ms).toBe(5000);
    });

    it('should merge custom global settings with defaults', async () => {
      const validConfig = {
        repositories: [
          {
            owner: 'test-owner',
            repo: 'test-repo',
            events: ['pull_request'],
            feishu_webhook: 'https://open.feishu.cn/webhook/test',
            secret: 'test-secret',
          },
        ],
        global_settings: {
          retry_attempts: 5,
        },
      };

      await configManager.loadConfig({}, validConfig);

      const settings = configManager.getGlobalSettings();

      expect(settings.log_level).toBe('info'); // default
      expect(settings.retry_attempts).toBe(5); // custom
      expect(settings.timeout_ms).toBe(5000); // default
    });
  });
});
