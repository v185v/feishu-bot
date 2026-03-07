import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleRequest } from './index.js';
import { computeHmacSha256 } from './utils/validator.js';
import { HTTP_STATUS } from './constants.js';

/**
 * Integration Tests for End-to-End Webhook Processing
 * Tests complete flow from webhook receipt to Feishu notification
 */

describe('Integration Tests - End-to-End Webhook Processing', () => {
  let mockEnv;
  let mockFetch;

  beforeEach(() => {
    // Setup mock environment with valid configuration
    const validConfig = {
      repositories: [
        {
          owner: 'test-owner',
          repo: 'test-repo',
          events: ['pull_request'],
          feishu_webhook: 'https://open.feishu.cn/webhook/test-webhook',
          secret: 'test-secret-123',
          mentions: ['user123'],
          settings: {
            notify_on_pr_open: true,
            notify_on_pr_merge: true,
            notify_on_pr_close: true,
            notify_on_pr_review: true,
          },
        },
      ],
      global_settings: {
        log_level: 'info',
        retry_attempts: 3,
        timeout_ms: 5000,
      },
    };

    mockEnv = {
      CONFIG_SOURCE: 'env',
      REPOSITORIES_CONFIG: JSON.stringify(validConfig),
    };

    // Mock global fetch for Feishu API calls
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: 'success' }),
    });
    global.fetch = mockFetch;
  });

  describe('Complete Webhook Processing Flow', () => {
    it('should process valid PR opened webhook and send to Feishu', async () => {
      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Add new feature',
          body: 'This PR adds a new feature',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);
      
      const responseData = await response.json();
      // Response contains the dispatched event result
      expect(responseData.message).toBeDefined();
      expect(responseData.message.type).toBe('pull_request');
      expect(responseData.message.action).toBe('opened');
      expect(responseData.message.title).toBe('Add new feature');

      // Verify Feishu API was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://open.feishu.cn/webhook/test-webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Verify message card structure
      const feishuCall = mockFetch.mock.calls[0];
      const feishuPayload = JSON.parse(feishuCall[1].body);
      expect(feishuPayload.msg_type).toBe('interactive');
      expect(feishuPayload.card.header.title.content).toContain('test-owner/test-repo');
      expect(feishuPayload.card.elements).toBeDefined();
    });

    it('should process PR merged webhook correctly', async () => {
      const prEvent = {
        action: 'closed',
        pull_request: {
          number: 43,
          title: 'Fix bug',
          body: 'Bug fix',
          user: { login: 'developer2' },
          html_url: 'https://github.com/test-owner/test-repo/pull/43',
          created_at: '2024-01-15T10:30:00Z',
          merged: true,
          merged_at: '2024-01-15T11:00:00Z',
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer2' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify Feishu was called with merged action
      const feishuCall = mockFetch.mock.calls[0];
      const feishuPayload = JSON.parse(feishuCall[1].body);
      const titleElement = feishuPayload.card.elements.find(e => e.tag === 'div' && e.text?.content?.includes('Merged'));
      expect(titleElement).toBeDefined();
    });

    it('should process PR review requested webhook', async () => {
      const prEvent = {
        action: 'review_requested',
        pull_request: {
          number: 44,
          title: 'Update docs',
          body: 'Documentation update',
          user: { login: 'developer3' },
          html_url: 'https://github.com/test-owner/test-repo/pull/44',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [{ login: 'reviewer1' }, { login: 'reviewer2' }],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer3' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify reviewers are included in message
      const feishuCall = mockFetch.mock.calls[0];
      const feishuPayload = JSON.parse(feishuCall[1].body);
      const detailsElement = feishuPayload.card.elements.find(
        e => e.tag === 'div' && e.text?.content?.includes('Reviewers')
      );
      expect(detailsElement).toBeDefined();
      expect(detailsElement.text.content).toContain('reviewer1');
      expect(detailsElement.text.content).toContain('reviewer2');
    });
  });

  describe('Error Scenarios', () => {
    it('should reject webhook with invalid signature', async () => {
      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      // Use wrong secret to generate invalid signature
      const invalidSignature = await computeHmacSha256(body, 'wrong-secret');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${invalidSignature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      
      const responseData = await response.json();
      expect(responseData.error).toBeDefined();
      expect(responseData.message).toContain('signature');

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject webhook with missing signature header', async () => {
      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          // Missing X-Hub-Signature-256 header
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      
      const responseData = await response.json();
      expect(responseData.message).toContain('X-Hub-Signature-256');

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return 404 for unknown repository', async () => {
      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/unknown-owner/unknown-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'unknown-repo',
          owner: { login: 'unknown-owner' },
          html_url: 'https://github.com/unknown-owner/unknown-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      // Use any secret since repository won't be found anyway
      const signature = await computeHmacSha256(body, 'any-secret');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
      
      const responseData = await response.json();
      expect(responseData.message).toContain('not found');
      expect(responseData.repository).toBe('unknown-owner/unknown-repo');

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON in webhook body', async () => {
      const body = '{ invalid json }';
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      
      const responseData = await response.json();
      expect(responseData.message).toContain('JSON');

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle missing X-GitHub-Event header', async () => {
      const prEvent = {
        action: 'opened',
        pull_request: { number: 42 },
        repository: { name: 'test-repo', owner: { login: 'test-owner' } },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Missing X-GitHub-Event header
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      
      const responseData = await response.json();
      expect(responseData.message).toContain('X-GitHub-Event');

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle Feishu API failure with retry', async () => {
      // Mock Feishu to fail initially then succeed
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ code: 99001, msg: 'Internal server error' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ code: 0, msg: 'success' }),
        });
      });

      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);
      
      // Verify retry happened (should be called at least twice)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should return 500 when Feishu API fails after all retries', { timeout: 10000 }, async () => {
      // Mock Feishu to always fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: 99001, msg: 'Internal server error' }),
      });

      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      
      const responseData = await response.json();
      expect(responseData.error).toBeDefined();

      // Verify retry attempts (initial + 3 retries = 4 total)
      expect(mockFetch.mock.calls.length).toBe(4);
    });
  });

  describe('Configuration-Based Event Filtering', () => {
    it('should skip notification when notify_on_pr_open is false', async () => {
      // Update config to disable PR open notifications
      const config = JSON.parse(mockEnv.REPOSITORIES_CONFIG);
      config.repositories[0].settings.notify_on_pr_open = false;
      mockEnv.REPOSITORIES_CONFIG = JSON.stringify(config);

      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify Feishu was NOT called (notification disabled)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip notification when notify_on_pr_merge is false', async () => {
      // Update config to disable PR merge notifications
      const config = JSON.parse(mockEnv.REPOSITORIES_CONFIG);
      config.repositories[0].settings.notify_on_pr_merge = false;
      mockEnv.REPOSITORIES_CONFIG = JSON.stringify(config);

      const prEvent = {
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: true,
          merged_at: '2024-01-15T11:00:00Z',
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip notification when notify_on_pr_close is false', async () => {
      // Update config to disable PR close notifications
      const config = JSON.parse(mockEnv.REPOSITORIES_CONFIG);
      config.repositories[0].settings.notify_on_pr_close = false;
      mockEnv.REPOSITORIES_CONFIG = JSON.stringify(config);

      const prEvent = {
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false, // Not merged, just closed
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip notification when notify_on_pr_review is false', async () => {
      // Update config to disable PR review notifications
      const config = JSON.parse(mockEnv.REPOSITORIES_CONFIG);
      config.repositories[0].settings.notify_on_pr_review = false;
      mockEnv.REPOSITORIES_CONFIG = JSON.stringify(config);

      const prEvent = {
        action: 'review_requested',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [{ login: 'reviewer1' }],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip notification when event type not in repository events list', async () => {
      // Update config to only monitor 'issues' events (not pull_request)
      const config = JSON.parse(mockEnv.REPOSITORIES_CONFIG);
      config.repositories[0].events = ['issues'];
      mockEnv.REPOSITORIES_CONFIG = JSON.stringify(config);

      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);
      
      const responseData = await response.json();
      expect(responseData.message).toContain('not configured');

      // Verify Feishu was NOT called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send notification when all settings are enabled', async () => {
      // Ensure all settings are enabled (default config)
      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Test PR',
          body: 'Test',
          user: { login: 'developer1' },
          html_url: 'https://github.com/test-owner/test-repo/pull/42',
          created_at: '2024-01-15T10:30:00Z',
          merged: false,
          draft: false,
          requested_reviewers: [],
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'test-owner' },
          html_url: 'https://github.com/test-owner/test-repo',
        },
        sender: { login: 'developer1' },
      };

      const body = JSON.stringify(prEvent);
      const signature = await computeHmacSha256(body, 'test-secret-123');

      const request = new Request('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body,
      });

      const response = await handleRequest(request, mockEnv, {});

      expect(response.status).toBe(HTTP_STATUS.OK);

      // Verify Feishu WAS called
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
