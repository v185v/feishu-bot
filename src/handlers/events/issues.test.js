/**
 * Tests for Issues Event Handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleIssuesEvent,
  checkNotificationEnabled,
  buildIssueMessage,
  getEffectiveAction,
  extractIssueDetails,
  extractLabels,
  extractAssignees,
  truncateDescription,
  DEFAULT_SETTINGS,
} from './issues.js';

describe('Issues Event Handler', () => {
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
        notify_on_issue_open: true,
        notify_on_issue_close: true,
        notify_on_issue_reopen: true,
      },
    };

    mockEvent = {
      action: 'opened',
      issue: {
        number: 123,
        title: 'Test Issue',
        body: 'This is a test issue description',
        state: 'open',
        html_url: 'https://github.com/test-org/test-repo/issues/123',
        user: {
          login: 'test-user',
        },
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
        closed_at: null,
        labels: [
          { name: 'bug' },
          { name: 'priority-high' },
        ],
        assignees: [
          { login: 'assignee1' },
          { login: 'assignee2' },
        ],
        comments: 5,
      },
      repository: {
        name: 'test-repo',
        full_name: 'test-org/test-repo',
        html_url: 'https://github.com/test-org/test-repo',
        owner: {
          login: 'test-org',
        },
      },
      sender: {
        login: 'test-user',
      },
    };
  });

  describe('handleIssuesEvent', () => {
    it('should process issue opened event successfully', async () => {
      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message.type).toBe('issues');
      expect(result.message.action).toBe('opened');
      expect(result.message.actor).toBe('test-user');
    });

    it('should process issue closed event', async () => {
      mockEvent.action = 'closed';
      mockEvent.issue.state = 'closed';

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message.action).toBe('closed');
    });

    it('should process issue reopened event', async () => {
      mockEvent.action = 'reopened';

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message.action).toBe('reopened');
    });

    it('should not notify when notify_on_issue_open is false', async () => {
      mockConfig.settings.notify_on_issue_open = false;

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should not notify for assigned action by default', async () => {
      mockEvent.action = 'assigned';
      mockEvent.assignee = { login: 'assignee1' };

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should notify for assigned action when enabled', async () => {
      mockEvent.action = 'assigned';
      mockEvent.assignee = { login: 'assignee1' };
      mockConfig.settings.notify_on_issue_assign = true;

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message.action).toBe('assigned to assignee1');
    });

    it('should handle missing issue data', async () => {
      mockEvent.issue = null;

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(false);
      expect(result.message).toBeNull();
    });

    it('should use default settings when not provided', async () => {
      mockConfig.settings = {};

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.shouldNotify).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should include mentions from config', async () => {
      mockConfig.mentions = ['ou_user1', 'ou_user2'];

      const result = await handleIssuesEvent(mockEvent, mockConfig, mockLogger);

      expect(result.message.mentions).toEqual(['ou_user1', 'ou_user2']);
    });
  });

  describe('checkNotificationEnabled', () => {
    it('should return true for opened action when notify_on_issue_open is true', () => {
      const settings = { notify_on_issue_open: true };
      const result = checkNotificationEnabled('opened', settings, mockLogger);

      expect(result).toBe(true);
    });

    it('should return false for opened action when notify_on_issue_open is false', () => {
      const settings = { notify_on_issue_open: false };
      const result = checkNotificationEnabled('opened', settings, mockLogger);

      expect(result).toBe(false);
    });

    it('should return false for unknown action', () => {
      const settings = { notify_on_issue_open: true };
      const result = checkNotificationEnabled('unknown_action', settings, mockLogger);

      expect(result).toBe(false);
    });
  });

  describe('buildIssueMessage', () => {
    it('should build correct message structure', () => {
      const message = buildIssueMessage(mockEvent, mockConfig, mockLogger);

      expect(message.type).toBe('issues');
      expect(message.action).toBe('opened');
      expect(message.repository.owner).toBe('test-org');
      expect(message.repository.name).toBe('test-repo');
      expect(message.actor).toBe('test-user');
      expect(message.title).toBe('Test Issue');
      expect(message.url).toBe('https://github.com/test-org/test-repo/issues/123');
    });

    it('should include issue metadata', () => {
      const message = buildIssueMessage(mockEvent, mockConfig, mockLogger);

      expect(message.metadata.issueNumber).toBe(123);
      expect(message.metadata.state).toBe('open');
      expect(message.metadata.labels).toEqual(['bug', 'priority-high']);
      expect(message.metadata.assignees).toEqual(['assignee1', 'assignee2']);
      expect(message.metadata.comments).toBe(5);
    });

    it('should include assignee information for assigned action', () => {
      mockEvent.action = 'assigned';
      mockEvent.assignee = { login: 'new-assignee' };

      const message = buildIssueMessage(mockEvent, mockConfig, mockLogger);

      expect(message.metadata.assignedTo).toBe('new-assignee');
    });

    it('should include label information for labeled action', () => {
      mockEvent.action = 'labeled';
      mockEvent.label = { name: 'enhancement' };

      const message = buildIssueMessage(mockEvent, mockConfig, mockLogger);

      expect(message.metadata.addedLabel).toBe('enhancement');
    });
  });

  describe('getEffectiveAction', () => {
    it('should return action with assignee for assigned action', () => {
      const event = {
        action: 'assigned',
        assignee: { login: 'john-doe' },
      };

      const result = getEffectiveAction('assigned', event);

      expect(result).toBe('assigned to john-doe');
    });

    it('should return action with label for labeled action', () => {
      const event = {
        action: 'labeled',
        label: { name: 'bug' },
      };

      const result = getEffectiveAction('labeled', event);

      expect(result).toBe('labeled bug');
    });

    it('should return original action for other actions', () => {
      const event = { action: 'opened' };

      const result = getEffectiveAction('opened', event);

      expect(result).toBe('opened');
    });
  });

  describe('extractIssueDetails', () => {
    it('should extract all issue details correctly', () => {
      const details = extractIssueDetails(mockEvent.issue);

      expect(details.number).toBe(123);
      expect(details.title).toBe('Test Issue');
      expect(details.description).toBe('This is a test issue description');
      expect(details.url).toBe('https://github.com/test-org/test-repo/issues/123');
      expect(details.state).toBe('open');
      expect(details.author).toBe('test-user');
      expect(details.labels).toEqual(['bug', 'priority-high']);
      expect(details.assignees).toEqual(['assignee1', 'assignee2']);
      expect(details.comments).toBe(5);
    });

    it('should handle missing optional fields', () => {
      const minimalIssue = {
        number: 456,
        title: 'Minimal Issue',
        body: null,
        state: 'open',
        html_url: 'https://github.com/test/test/issues/456',
        user: null,
        labels: [],
        assignees: [],
      };

      const details = extractIssueDetails(minimalIssue);

      expect(details.number).toBe(456);
      expect(details.description).toBe('');
      expect(details.author).toBe('unknown');
      expect(details.labels).toEqual([]);
      expect(details.assignees).toEqual([]);
      expect(details.comments).toBe(0);
    });
  });

  describe('extractLabels', () => {
    it('should extract label names', () => {
      const issue = {
        labels: [
          { name: 'bug' },
          { name: 'enhancement' },
        ],
      };

      const labels = extractLabels(issue);

      expect(labels).toEqual(['bug', 'enhancement']);
    });

    it('should handle missing labels', () => {
      const issue = { labels: [] };

      const labels = extractLabels(issue);

      expect(labels).toEqual([]);
    });
  });

  describe('extractAssignees', () => {
    it('should extract assignee usernames', () => {
      const issue = {
        assignees: [
          { login: 'user1' },
          { login: 'user2' },
        ],
      };

      const assignees = extractAssignees(issue);

      expect(assignees).toEqual(['user1', 'user2']);
    });

    it('should handle missing assignees', () => {
      const issue = { assignees: [] };

      const assignees = extractAssignees(issue);

      expect(assignees).toEqual([]);
    });
  });

  describe('truncateDescription', () => {
    it('should not truncate short descriptions', () => {
      const desc = 'Short description';
      const result = truncateDescription(desc);

      expect(result).toBe('Short description');
    });

    it('should truncate long descriptions', () => {
      const desc = 'a'.repeat(250);
      const result = truncateDescription(desc);

      expect(result.length).toBe(200);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle null description', () => {
      const result = truncateDescription(null);

      expect(result).toBe('');
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SETTINGS.notify_on_issue_open).toBe(true);
      expect(DEFAULT_SETTINGS.notify_on_issue_close).toBe(true);
      expect(DEFAULT_SETTINGS.notify_on_issue_reopen).toBe(true);
      expect(DEFAULT_SETTINGS.notify_on_issue_assign).toBe(false);
      expect(DEFAULT_SETTINGS.notify_on_issue_label).toBe(false);
    });
  });
});
