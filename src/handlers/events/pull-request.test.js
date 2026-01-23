import { describe, it, expect, beforeEach } from 'vitest';
import {
  handlePullRequestEvent,
  extractPRDetails,
  getEffectiveAction,
  truncateDescription,
  DEFAULT_SETTINGS,
} from './pull-request.js';

describe('Pull Request Event Handler', () => {
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    mockLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    mockConfig = {
      owner: 'test-owner',
      repo: 'test-repo',
      feishu_webhook: 'https://open.feishu.cn/webhook/test',
      secret: 'test-secret',
      settings: { ...DEFAULT_SETTINGS },
    };
  });

  describe('handlePullRequestEvent', () => {
    it('should process PR opened event', async () => {
      const event = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          body: 'Test description',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
          merged: false,
          draft: false,
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message.type).toBe('pull_request');
      expect(result.message.action).toBe('opened');
      expect(result.message.title).toBe('Test PR');
    });

    it('should process PR merged event', async () => {
      const event = {
        action: 'closed',
        pull_request: {
          number: 123,
          title: 'Test PR',
          body: 'Test description',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
          merged: true,
          draft: false,
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message.action).toBe('merged');
    });

    it('should process PR closed without merge event', async () => {
      const event = {
        action: 'closed',
        pull_request: {
          number: 123,
          title: 'Test PR',
          body: 'Test description',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
          merged: false,
          draft: false,
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message.action).toBe('closed');
    });

    it('should respect notify_on_pr_open setting', async () => {
      mockConfig.settings.notify_on_pr_open = false;

      const event = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
    });

    it('should respect notify_on_pr_merge setting', async () => {
      mockConfig.settings.notify_on_pr_merge = false;

      const event = {
        action: 'closed',
        pull_request: {
          number: 123,
          title: 'Test PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
          merged: true,
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
    });

    it('should include mentions from config', async () => {
      mockConfig.mentions = ['user1', 'user2'];

      const event = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.message.mentions).toEqual(['user1', 'user2']);
    });

    it('should handle review_requested action', async () => {
      const event = {
        action: 'review_requested',
        pull_request: {
          number: 123,
          title: 'Test PR',
          user: { login: 'test-user' },
          html_url: 'https://github.com/test-owner/test-repo/pull/123',
          requested_reviewers: [{ login: 'reviewer1' }, { login: 'reviewer2' }],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
        },
        sender: { login: 'test-user' },
      };

      const result = await handlePullRequestEvent(event, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message.action).toBe('review_requested');
      expect(result.message.metadata.reviewers).toEqual(['reviewer1', 'reviewer2']);
    });
  });

  describe('extractPRDetails', () => {
    it('should extract PR details correctly', () => {
      const pr = {
        number: 123,
        title: 'Test PR Title',
        body: 'Test PR description',
        html_url: 'https://github.com/owner/repo/pull/123',
        user: { login: 'test-user' },
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
        merged_at: null,
        requested_reviewers: [],
      };

      const details = extractPRDetails(pr);

      expect(details.number).toBe(123);
      expect(details.title).toBe('Test PR Title');
      expect(details.description).toBe('Test PR description');
      expect(details.url).toBe('https://github.com/owner/repo/pull/123');
      expect(details.author).toBe('test-user');
    });

    it('should handle missing optional fields', () => {
      const pr = {
        number: 123,
        html_url: 'https://github.com/owner/repo/pull/123',
      };

      const details = extractPRDetails(pr);

      expect(details.number).toBe(123);
      expect(details.title).toBe('Untitled PR');
      expect(details.description).toBe('');
      expect(details.author).toBe('unknown');
    });
  });

  describe('getEffectiveAction', () => {
    it('should return "merged" for closed action with merged=true', () => {
      const action = getEffectiveAction('closed', { merged: true });
      expect(action).toBe('merged');
    });

    it('should return "closed" for closed action with merged=false', () => {
      const action = getEffectiveAction('closed', { merged: false });
      expect(action).toBe('closed');
    });

    it('should return original action for non-closed actions', () => {
      expect(getEffectiveAction('opened', {})).toBe('opened');
      expect(getEffectiveAction('reopened', {})).toBe('reopened');
      expect(getEffectiveAction('review_requested', {})).toBe('review_requested');
    });
  });

  describe('truncateDescription', () => {
    it('should not truncate short descriptions', () => {
      const desc = 'Short description';
      expect(truncateDescription(desc)).toBe('Short description');
    });

    it('should truncate long descriptions', () => {
      const longDesc = 'a'.repeat(300);
      const truncated = truncateDescription(longDesc, 200);

      expect(truncated.length).toBe(200);
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should handle null description', () => {
      expect(truncateDescription(null)).toBe('');
    });

    it('should handle empty description', () => {
      expect(truncateDescription('')).toBe('');
    });

    it('should trim whitespace', () => {
      const desc = '  Test description  ';
      expect(truncateDescription(desc)).toBe('Test description');
    });
  });
});
