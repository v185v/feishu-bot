# Configuration Guide

This document provides detailed information about configuring the GitHub Feishu Bot.

## Configuration Sources

The bot supports two configuration sources:

1. **File-based**: Configuration stored in a JSON file (default)
2. **KV-based**: Configuration stored in Cloudflare KV storage

Set the configuration source using the `CONFIG_SOURCE` environment variable.

## Environment Variables

### Required Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CONFIG_SOURCE` | Configuration source type | `file` | `file` or `kv` |

### File-based Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CONFIG_PATH` | Path to configuration JSON file | `./config/repositories.json` | `./config/repositories.json` |

### KV-based Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CONFIG_KV_NAMESPACE` | KV namespace binding name | - | `github_bot_config` |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GITHUB_WEBHOOK_SECRET` | Default webhook secret for all repositories | - | `your-secret-here` |
| `LOG_LEVEL` | Logging level | `info` | `debug`, `info`, `warn`, `error` |
| `RETRY_ATTEMPTS` | Number of retry attempts for Feishu API | `3` | `3` |
| `TIMEOUT_MS` | Timeout for Feishu API calls (ms) | `5000` | `5000` |

## Configuration File Structure

### Complete Example

```json
{
  "repositories": [
    {
      "owner": "your-org",
      "repo": "your-repo",
      "events": ["pull_request"],
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/your-token",
      "secret": "your-github-webhook-secret",
      "mentions": ["ou_xxx", "oc_xxx"],
      "settings": {
        "notify_on_pr_open": true,
        "notify_on_pr_merge": true,
        "notify_on_pr_close": false,
        "notify_on_pr_review": true
      }
    }
  ],
  "global_settings": {
    "log_level": "info",
    "retry_attempts": 3,
    "timeout_ms": 5000
  }
}
```

## Repository Configuration

Each repository in the `repositories` array supports the following fields:

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `owner` | string | GitHub organization or user name | `"facebook"` |
| `repo` | string | Repository name | `"react"` |
| `events` | string[] | List of GitHub event types to monitor | `["pull_request"]` |
| `feishu_webhook` | string | Feishu bot webhook URL | `"https://open.feishu.cn/..."` |
| `secret` | string | GitHub webhook secret for signature verification | `"your-secret"` |

### Optional Fields

| Field | Type | Description | Default | Example |
|-------|------|-------------|---------|---------|
| `mentions` | string[] | Feishu user/group IDs to mention in notifications | `[]` | `["ou_xxx", "oc_xxx"]` |
| `settings` | object | Event-specific notification settings | See below | See below |

### Settings Object

The `settings` object controls which events trigger notifications:

#### Pull Request Settings

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `notify_on_pr_open` | boolean | Notify when PR is opened | `true` |
| `notify_on_pr_merge` | boolean | Notify when PR is merged | `true` |
| `notify_on_pr_close` | boolean | Notify when PR is closed (not merged) | `false` |
| `notify_on_pr_review` | boolean | Notify when review is requested | `true` |

## Global Settings

The `global_settings` object configures system-wide behavior:

| Field | Type | Description | Default | Valid Values |
|-------|------|-------------|---------|--------------|
| `log_level` | string | Logging verbosity | `"info"` | `"debug"`, `"info"`, `"warn"`, `"error"` |
| `retry_attempts` | number | Number of retry attempts for failed Feishu API calls | `3` | `1-10` |
| `timeout_ms` | number | Timeout for Feishu API calls in milliseconds | `5000` | `1000-30000` |

## Supported Event Types

Currently supported values for the `events` array:

- `pull_request`: Pull request lifecycle events (open, merge, close, review)

Future support planned:
- `issues`: Issue lifecycle events
- `star`: Repository star events
- `release`: Release events
- `push`: Push events

## Getting Feishu Webhook URL

1. Open Feishu and navigate to the group where you want notifications
2. Click on group settings (⚙️)
3. Select "Bots" → "Add Bot"
4. Choose "Custom Bot" and configure:
   - Bot name: "GitHub Bot" (or your preferred name)
   - Description: "GitHub repository notifications"
5. Copy the webhook URL provided
6. Add the URL to your configuration file

## Getting Feishu User/Group IDs for Mentions

### User ID (ou_xxx)

1. Open Feishu Admin Console
2. Navigate to "Organization" → "Users"
3. Find the user and copy their User ID (starts with `ou_`)

### Group ID (oc_xxx)

1. Open the group in Feishu
2. Click group settings → "Group Info"
3. Copy the Group ID (starts with `oc_`)

Alternatively, use the Feishu Open Platform API to retrieve IDs programmatically.

## Configuration Validation

The bot validates configuration on startup and will fail with descriptive errors if:

- Required fields are missing
- JSON syntax is invalid
- Field types are incorrect
- URLs are malformed
- Event types are unsupported

### Example Validation Errors

```
Configuration Error: Missing required field 'owner' in repository configuration
Configuration Error: Invalid event type 'invalid_event'. Supported: pull_request
Configuration Error: Invalid Feishu webhook URL format
```

## Environment Variable Overrides

Environment variables take precedence over configuration file values for global settings:

```bash
# Override log level
LOG_LEVEL=debug

# Override retry attempts
RETRY_ATTEMPTS=5

# Override timeout
TIMEOUT_MS=10000
```

Repository-specific settings cannot be overridden via environment variables.

## Multiple Repository Configuration

You can monitor multiple repositories with different settings:

```json
{
  "repositories": [
    {
      "owner": "org1",
      "repo": "frontend",
      "events": ["pull_request"],
      "feishu_webhook": "https://open.feishu.cn/hook/frontend-team",
      "secret": "frontend-secret",
      "settings": {
        "notify_on_pr_open": true,
        "notify_on_pr_merge": true,
        "notify_on_pr_close": false,
        "notify_on_pr_review": true
      }
    },
    {
      "owner": "org1",
      "repo": "backend",
      "events": ["pull_request"],
      "feishu_webhook": "https://open.feishu.cn/hook/backend-team",
      "secret": "backend-secret",
      "mentions": ["ou_backend_lead"],
      "settings": {
        "notify_on_pr_open": true,
        "notify_on_pr_merge": true,
        "notify_on_pr_close": true,
        "notify_on_pr_review": true
      }
    }
  ],
  "global_settings": {
    "log_level": "info",
    "retry_attempts": 3,
    "timeout_ms": 5000
  }
}
```

## KV Storage Configuration

For KV-based configuration:

1. Create a KV namespace:
```bash
wrangler kv:namespace create "CONFIG_KV"
```

2. Update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CONFIG_KV"
id = "your-kv-namespace-id"
```

3. Upload configuration:
```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

4. Set environment variable:
```bash
CONFIG_SOURCE=kv
CONFIG_KV_NAMESPACE=CONFIG_KV
```

## Security Best Practices

1. **Never commit secrets**: Use environment variables or Cloudflare Workers secrets
2. **Unique secrets per repository**: Use different webhook secrets for each repository
3. **Rotate secrets regularly**: Update webhook secrets periodically
4. **Restrict webhook events**: Only enable events you need in GitHub webhook settings
5. **Use HTTPS**: Always use HTTPS URLs for Feishu webhooks

## Configuration Updates

### File-based Configuration

Changes to the configuration file require redeploying the Worker:

```bash
npm run deploy
```

### KV-based Configuration

Changes to KV storage take effect immediately without redeployment:

```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

## Troubleshooting Configuration Issues

### Configuration not loading

1. Check `CONFIG_SOURCE` is set correctly
2. Verify file path or KV namespace binding
3. Validate JSON syntax: `cat config/repositories.json | jq`
4. Check Worker logs: `wrangler tail`

### Webhook signature verification failing

1. Ensure `secret` matches GitHub webhook configuration
2. Check for whitespace in secret values
3. Verify secret is properly URL-encoded if needed

### Feishu messages not sending

1. Test webhook URL with curl:
```bash
curl -X POST "your-feishu-webhook-url" \
  -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"test"}}'
```

2. Verify bot has permission to post in group
3. Check Feishu webhook URL is not expired

### Events not triggering notifications

1. Verify event type is in `events` array
2. Check event-specific settings (e.g., `notify_on_pr_open`)
3. Review Worker logs for event processing
4. Confirm GitHub webhook is configured for the event type
