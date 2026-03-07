# GitHub Feishu Bot

A Cloudflare Workers-based bot that monitors GitHub repository events and sends formatted notifications to Feishu (Lark) groups. Stay informed about pull requests, issues, and repository activity in real-time through Feishu messaging.

## Features

- 🔔 **Multi-Repository Monitoring**: Configure multiple GitHub repositories with different notification preferences
- 🔒 **Secure Webhook Verification**: HMAC-SHA256 signature verification for all GitHub webhooks
- 📝 **Pull Request Notifications**: Track PR opens, merges, closes, and review requests
- 🎨 **Rich Message Formatting**: Beautiful Feishu interactive cards with direct links to GitHub
- 🔄 **Automatic Retry Logic**: Exponential backoff retry mechanism for reliable message delivery
- 👥 **User Mentions**: Notify specific Feishu users or groups for important events
- ⚙️ **Flexible Configuration**: File-based or KV storage configuration with environment variable overrides
- 📊 **Comprehensive Logging**: Request ID tracking and structured logging for easy troubleshooting

## Quick Start

### Prerequisites

- Node.js 18 or higher
- A Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)
- GitHub repository with admin access
- One or more Feishu bot webhook URLs

### Installation

1. Clone the repository:
```bash
git clone https://github.com/v185v/feishu-bot.git
cd feishu-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure your repositories:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Edit `config/repositories.json` with your repository configurations:
```json
{
  "repositories": [
    {
      "owner": "your-org",
      "repo": "your-repo",
      "events": ["pull_request"],
      "feishu_webhooks": [
        "https://open.feishu.cn/open-apis/bot/v2/hook/team-a",
        "https://open.feishu.cn/open-apis/bot/v2/hook/team-b"
      ],
      "secret": "your-github-webhook-secret",
      "mentions": [],
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


`feishu_webhook` (single URL) is still supported for backward compatibility.

### Development

Run the bot locally:
```bash
npm run dev
```

The bot will be available at `http://localhost:8787`

### Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with coverage:
```bash
npm run test:coverage
```

### Deployment

1. Authenticate with Cloudflare:
```bash
wrangler login
```

2. Deploy to Cloudflare Workers:
```bash
npm run deploy
```

3. If you use env-based configuration (`CONFIG_SOURCE=env`), set repository config as a secret:
```bash
wrangler secret put REPOSITORIES_CONFIG
```

4. Configure GitHub webhook:
   - Go to your repository settings -> Webhooks -> Add webhook
   - Payload URL: `https://your-worker.workers.dev/webhook`
   - Content type: `application/json`
   - Secret: Your webhook secret
   - Events: Select "Pull requests" (or other events you want to monitor)

## Configuration

See [CONFIGURATION.md](CONFIGURATION.md) for detailed configuration options.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for system architecture overview.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | GitHub webhook receiver |
| `/health` | GET | Health check endpoint |
| `/` | GET | Root endpoint with basic info |

## Supported Events

Currently supported GitHub events:
- **Pull Requests**: open, merge, close, reopen, review requested
- Issues
- Stars

Future event support planned:
- Releases
- Commits

## Eaxmple repositories
```
{
  "repositories": [
    {
      "owner": "v185v",
      "repo": "feishu-bot",
      "events": ["pull_request", "issues", "star"],
      "feishu_webhooks": [
        "https://open.feishu.cn/open-apis/bot/v2/hook/team-a",
        "https://open.feishu.cn/open-apis/bot/v2/hook/team-b"
      ],
      "secret": "your-github-webhook-secret",
      "mentions": ["ou_xxx", "ou_yyy"],
      "settings": {
        "notify_on_pr_open": true,
        "notify_on_pr_merge": true,
        "notify_on_pr_close": false,
        "notify_on_pr_review": true,

        "notify_on_star": true,

        "notify_on_issue_open": true,
        "notify_on_issue_close": true,
        "notify_on_issue_reopen": true,
        "notify_on_issue_assign": false,
        "notify_on_issue_label": false
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

## Troubleshooting

### Webhook not receiving events

1. Check GitHub webhook delivery status in repository settings
2. Verify the webhook URL is correct
3. Check Cloudflare Workers logs: `npm run tail`

### Signature verification failing

1. Ensure the webhook secret matches in both GitHub and your configuration
2. Check that the repository `secret` field is loaded from your active config source

### Messages not appearing in Feishu

1. Verify the Feishu webhook URL is correct
2. Check that the bot has permission to post in the group
3. Review logs for Feishu API errors

### Configuration not loading

1. Verify `CONFIG_SOURCE` is set correctly (`file`, `env`, or `kv`)
2. If `file`, check that `CONFIG_PATH` points to a valid JSON file
3. If `env`, verify `REPOSITORIES_CONFIG` is set and is valid JSON
4. If `kv`, verify KV binding `CONFIG_KV` exists and key `config` (or `CONFIG_KV_KEY`) contains valid JSON

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.
