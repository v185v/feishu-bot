import { describe, it, expect } from 'vitest';
import {
  calculateBackoffDelay,
  maskWebhookUrl,
  buildFeishuMessageCard,
  formatTimestamp,
  escapeMarkdown,
} from './feishu-sender.js';

describe('Feishu Sender', () => {
  describe('calculateBackoffDelay', () => {
    it('should return 0 for first attempt', () => {
      const delay = calculateBackoffDelay(0);
      expect(delay).toBe(0);
    });

    it('should return exponential backoff for subsequent attempts', () => {
      const delay1 = calculateBackoffDelay(1, 1000);
      const delay2 = calculateBackoffDelay(2, 1000);

      // First retry: 1000 * 2^0 + jitter = 1000-1500ms
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1500);

      // Second retry: 1000 * 2^1 + jitter = 2000-2500ms
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2500);
    });

    it('should include random jitter', () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculateBackoffDelay(1, 1000));
      }

      // Check that not all delays are identical (jitter is working)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should use custom base delay', () => {
      const delay = calculateBackoffDelay(1, 500);

      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1000);
    });
  });

  describe('maskWebhookUrl', () => {
    it('should mask webhook token in URL', () => {
      const url = 'https://open.feishu.cn/webhook/abcdef123456789';
      const masked = maskWebhookUrl(url);

      expect(masked).toContain('abcd');
      expect(masked).toContain('****');
      expect(masked).toContain('6789');
      expect(masked).not.toContain('abcdef123456789');
    });

    it('should handle short tokens', () => {
      const url = 'https://open.feishu.cn/webhook/short';
      const masked = maskWebhookUrl(url);

      expect(masked).toBeDefined();
    });

    it('should handle invalid URLs', () => {
      const masked = maskWebhookUrl('not-a-url');
      expect(masked).toBe('***masked***');
    });
  });

  describe('buildFeishuMessageCard', () => {
    it('should build message card for PR opened event', () => {
      const message = {
        type: 'pull_request',
        action: 'opened',
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          url: 'https://github.com/test-owner/test-repo',
        },
        actor: 'test-user',
        title: 'Test PR Title',
        description: 'Test PR description',
        url: 'https://github.com/test-owner/test-repo/pull/123',
        timestamp: '2024-01-01T10:00:00Z',
        metadata: {
          prNumber: 123,
          reviewers: [],
          merged: false,
          draft: false,
        },
      };

      const card = buildFeishuMessageCard(message);

      expect(card.msg_type).toBe('interactive');
      expect(card.card).toBeDefined();
      expect(card.card.header).toBeDefined();
      expect(card.card.header.title.content).toContain('test-owner/test-repo');
      expect(card.card.elements).toBeDefined();
      expect(card.card.elements.length).toBeGreaterThan(0);
    });

    it('should include mentions in message card', () => {
      const message = {
        type: 'pull_request',
        action: 'opened',
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          url: 'https://github.com/test-owner/test-repo',
        },
        actor: 'test-user',
        title: 'Test PR',
        description: '',
        url: 'https://github.com/test-owner/test-repo/pull/123',
        timestamp: '2024-01-01T10:00:00Z',
        mentions: ['user1', 'user2@example.com'],
        metadata: {
          prNumber: 123,
        },
      };

      const card = buildFeishuMessageCard(message);

      // Find the mentions element
      const mentionsElement = card.card.elements.find(
        (el) => el.text && el.text.content && el.text.content.includes('CC:')
      );

      expect(mentionsElement).toBeDefined();
      expect(mentionsElement.text.content).toContain('user1');
      expect(mentionsElement.text.content).toContain('user2@example.com');
    });

    it('should include action button with GitHub URL', () => {
      const message = {
        type: 'pull_request',
        action: 'opened',
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          url: 'https://github.com/test-owner/test-repo',
        },
        actor: 'test-user',
        title: 'Test PR',
        description: '',
        url: 'https://github.com/test-owner/test-repo/pull/123',
        timestamp: '2024-01-01T10:00:00Z',
        metadata: {},
      };

      const card = buildFeishuMessageCard(message);

      // Find the action element
      const actionElement = card.card.elements.find((el) => el.tag === 'action');

      expect(actionElement).toBeDefined();
      expect(actionElement.actions).toBeDefined();
      expect(actionElement.actions[0].url).toBe(
        'https://github.com/test-owner/test-repo/pull/123'
      );
    });

    it('should use correct header color for different actions', () => {
      const actions = ['opened', 'merged', 'closed', 'reopened', 'review_requested'];
      const expectedColors = ['blue', 'green', 'red', 'orange', 'purple'];

      actions.forEach((action, index) => {
        const message = {
          type: 'pull_request',
          action,
          repository: { owner: 'owner', name: 'repo', url: 'https://github.com' },
          actor: 'user',
          title: 'Test',
          description: '',
          url: 'https://github.com',
          timestamp: '2024-01-01T10:00:00Z',
          metadata: {},
        };

        const card = buildFeishuMessageCard(message);
        expect(card.card.header.template).toBe(expectedColors[index]);
      });
    });
  });

  describe('formatTimestamp', () => {
    it('should format ISO timestamp in Beijing time', () => {
      const timestamp = '2024-01-15T10:30:45Z';
      const formatted = formatTimestamp(timestamp);

      expect(formatted).toBe('2024-01-15 18:30:45');
    });

    it('should handle invalid timestamp', () => {
      const formatted = formatTimestamp('invalid');
      expect(formatted).toBe('invalid');
    });

    it('should handle null timestamp', () => {
      const formatted = formatTimestamp(null);
      // null gets converted to epoch time by Date constructor (displayed in Beijing time)
      expect(formatted).toBe('1970-01-01 08:00:00');
    });
  });

  describe('escapeMarkdown', () => {
    it('should escape special markdown characters', () => {
      const text = 'Test *bold* _italic_ ~strikethrough~ `code`';
      const escaped = escapeMarkdown(text);

      expect(escaped).toContain('\\*');
      expect(escaped).toContain('\\_');
      expect(escaped).toContain('\\~');
      expect(escaped).toContain('\\`');
    });

    it('should escape backslashes', () => {
      const text = 'Test \\ backslash';
      const escaped = escapeMarkdown(text);

      expect(escaped).toContain('\\\\');
    });

    it('should handle empty string', () => {
      expect(escapeMarkdown('')).toBe('');
    });

    it('should handle null', () => {
      expect(escapeMarkdown(null)).toBe('');
    });
  });
});
