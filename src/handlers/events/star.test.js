/**
 * Tests for Star Event Handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleStarEvent,
  checkNotificationEnabled,
  buildStarMessage,
  DEFAULT_SETTINGS,
} from './star.js';

describe('Star Event Handler', () => {
  let mockLogger;
  let mockConfig;
  let mockEvent;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    mockConfig = {
      owner: 'test-org',
      repo: 'test-repo',
      feishu_webhook: 'https://open.feishu.cn/webhook/test',
      secret: 'test-secret',
      mentions: [],
      settings: {
        notify_on_star: true,
      },
    };

    mockEvent = {
      action: 'created',
      starred_at: '2024-01-15T10:30:00Z',
      sender: {
        login: 'test-user',
        id: 12345,
      },
      repository: {
        name: 'test-repo',
        full_name: 'test-org/test-repo',
        description: 'A test repository',
        html_url: 'https://github.com/test-org/test-repo',
        stargazers_count: 100,
        watchers_count: 50,
        forks_count: 25,
        owner: {
          login: 'test-org',
        },
      },
    };
  });

  describe('handleStarEvent', () => {
    it('should process star created event successfully', async () => {
      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message.type).toBe('star');
      expect(result.message.action).toBe('starred');
      expect(result.message.actor).toBe('test-user');
    });

    it('should not notify when notify_on_star is false', async () => {
      mockConfig.settings.notify_on_star = false;

      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should not notify for deleted action', async () => {
      mockEvent.action = 'deleted';

      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should handle missing sender data', async () => {
      mockEvent.sender = null;

      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should handle missing repository data', async () => {
      mockEvent.repository = null;

      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should use default settings when not provided', async () => {
      mockConfig.settings = {};

      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should include mentions from config', async () => {
      mockConfig.mentions = ['ou_user1', 'ou_user2'];

      const result = await handleStarEvent(mockEvent, mockConfig, mockLogger);

      expect(result.message.mentions).toEqual(['ou_user1', 'ou_user2']);
    });
  });

  describe('checkNotificationEnabled', () => {
    it('should return true for created action when notify_on_star is true', () => {
      const settings = { notify_on_star: true };
      const result = checkNotificationEnabled('created', settings, mockLogger);

      expect(result).toBe(true);
    });

    it('should return false for created action when notify_on_star is false', () => {
      const settings = { notify_on_star: false };
      const result = checkNotificationEnabled('created', settings, mockLogger);

      expect(result).toBe(false);
    });

    it('should return false for deleted action', () => {
      const settings = { notify_on_star: true };
      const result = checkNotificationEnabled('deleted', settings, mockLogger);

      expect(result).toBe(false);
    });
  });

  describe('buildStarMessage', () => {
    it('should build correct message structure', () => {
      const message = buildStarMessage(mockEvent, mockConfig, mockLogger);

      expect(message.type).toBe('star');
      expect(message.action).toBe('starred');
      expect(message.repository.owner).toBe('test-org');
      expect(message.repository.name).toBe('test-repo');
      expect(message.repository.url).toBe('https://github.com/test-org/test-repo');
      expect(message.actor).toBe('test-user');
      expect(message.title).toBe('test-user starred test-org/test-repo');
      expect(message.description).toBe('A test repository');
      expect(message.url).toBe('https://github.com/test-org/test-repo');
      expect(message.timestamp).toBe('2024-01-15T10:30:00Z');
    });

    it('should include repository statistics in metadata', () => {
      const message = buildStarMessage(mockEvent, mockConfig, mockLogger);

      expect(message.metadata.stargazers_count).toBe(100);
      expect(message.metadata.watchers_count).toBe(50);
      expect(message.metadata.forks_count).toBe(25);
    });

    it('should handle missing description', () => {
      mockEvent.repository.description = null;

      const message = buildStarMessage(mockEvent, mockConfig, mockLogger);

      expect(message.description).toBe('');
    });

    it('should handle missing starred_at timestamp', () => {
      mockEvent.starred_at = null;

      const message = buildStarMessage(mockEvent, mockConfig, mockLogger);

      expect(message.timestamp).toBeDefined();
      expect(typeof message.timestamp).toBe('string');
    });

    it('should handle missing repository statistics', () => {
      delete mockEvent.repository.stargazers_count;
      delete mockEvent.repository.watchers_count;
      delete mockEvent.repository.forks_count;

      const message = buildStarMessage(mockEvent, mockConfig, mockLogger);

      expect(message.metadata.stargazers_count).toBe(0);
      expect(message.metadata.watchers_count).toBe(0);
      expect(message.metadata.forks_count).toBe(0);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have notify_on_star enabled by default', () => {
      expect(DEFAULT_SETTINGS.notify_on_star).toBe(true);
    });
  });
});
