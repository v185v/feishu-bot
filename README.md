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
- Feishu bot webhook URL

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
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/...",
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

3. Set up secrets:
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
```

4. Configure GitHub webhook:
   - Go to your repository settings → Webhooks → Add webhook
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

## Troubleshooting

### Webhook not receiving events

1. Check GitHub webhook delivery status in repository settings
2. Verify the webhook URL is correct
3. Check Cloudflare Workers logs: `npm run tail`

### Signature verification failing

1. Ensure the webhook secret matches in both GitHub and your configuration
2. Check that the secret is properly set in Cloudflare Workers

### Messages not appearing in Feishu

1. Verify the Feishu webhook URL is correct
2. Check that the bot has permission to post in the group
3. Review logs for Feishu API errors

### Configuration not loading

1. Verify `CONFIG_SOURCE` is set correctly (`file` or `kv`)
2. Check that `CONFIG_PATH` points to a valid JSON file
3. Validate JSON syntax in configuration file

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.
