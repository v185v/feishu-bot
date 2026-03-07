# Deployment Guide

This guide covers deploying the GitHub Feishu Bot to Cloudflare Workers.

## Prerequisites

Before deploying, ensure you have:

- Node.js 18 or higher installed
- A Cloudflare account (free tier works)
- Wrangler CLI installed globally: `npm install -g wrangler`
- GitHub repository with admin access
- Feishu bot webhook URL

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Wrangler

Edit `wrangler.toml` with your Cloudflare account details:

```toml
name = "github-feishu-bot"
main = "src/index.js"
compatibility_date = "2024-01-15"

# Add your account ID
account_id = "your-cloudflare-account-id"

[vars]
CONFIG_SOURCE = "file"
CONFIG_PATH = "./config/repositories.json"
LOG_LEVEL = "info"
```

To find your account ID:
```bash
wrangler whoami
```

### 3. Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

### 4. Configure Repositories

Create or edit `config/repositories.json`:

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

## Deployment Methods

### Method 1: File-based Configuration (Recommended for Getting Started)

This method bundles the configuration file with your Worker.

1. Ensure `wrangler.toml` has:
```toml
[vars]
CONFIG_SOURCE = "file"
CONFIG_PATH = "./config/repositories.json"
```

2. Deploy:
```bash
npm run deploy
```

3. No additional Worker secrets are required in file mode.

**Pros**: Simple setup, no additional services needed
**Cons**: Requires redeployment for configuration changes

### Method 2: KV Storage Configuration (Recommended for Production)

This method stores configuration in Cloudflare KV, allowing updates without redeployment.

1. Create KV namespace:
```bash
wrangler kv:namespace create "CONFIG_KV"
```

Note the namespace ID from the output.

2. Update `wrangler.toml`:
```toml
[vars]
CONFIG_SOURCE = "kv"

[[kv_namespaces]]
binding = "CONFIG_KV"
id = "your-kv-namespace-id"
```

3. Upload configuration to KV:
```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

4. Deploy:
```bash
npm run deploy
```

5. No additional Worker secrets are required in KV mode.

**Pros**: Update configuration without redeployment
**Cons**: Slightly more complex setup

## Environment-Specific Deployments

### Development Environment

```bash
# Deploy to development
wrangler deploy --env development

# Tail logs
wrangler tail --env development
```

### Production Environment

```bash
# Deploy to production
npm run deploy:production

# Or manually
wrangler deploy --env production

# Tail logs
wrangler tail --env production
```

Configure environments in `wrangler.toml`:

```toml
[env.development]
name = "github-feishu-bot-dev"
vars = { LOG_LEVEL = "debug" }

[env.production]
name = "github-feishu-bot"
vars = { LOG_LEVEL = "info" }
```

## GitHub Webhook Configuration

After deploying, configure GitHub webhooks for each repository:

### 1. Get Your Worker URL

After deployment, Wrangler will output your Worker URL:
```
https://github-feishu-bot.your-subdomain.workers.dev
```

### 2. Configure GitHub Webhook

1. Go to your GitHub repository
2. Navigate to **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-worker.workers.dev/webhook`
   - **Content type**: `application/json`
   - **Secret**: Your webhook secret (must match configuration)
   - **SSL verification**: Enable SSL verification
   - **Events**: Select events to monitor:
     - ☑️ Pull requests
     - ☑️ Issues
     - ☑️ Stars (GitHub UI label: Watch)
   - **Active**: ☑️ Checked

4. Click **Add webhook**

### 3. Test Webhook

1. Create a test pull request in your repository
2. Check GitHub webhook delivery status:
   - Go to **Settings** → **Webhooks** → Click your webhook
   - View **Recent Deliveries**
   - Check response status (should be 200)

3. Verify message appears in Feishu group

## Managing Secrets

Repository webhook secrets are stored in your repository configuration JSON (`secret` field per repository), not in a global Worker secret.

If you use env-based configuration, store the full JSON config in `REPOSITORIES_CONFIG`:

```bash
wrangler secret put REPOSITORIES_CONFIG
```

### Listing Secrets

```bash
wrangler secret list
```

### Deleting Secrets

```bash
wrangler secret delete REPOSITORIES_CONFIG
```

### Environment-Specific Secrets

```bash
# Development
wrangler secret put REPOSITORIES_CONFIG --env development

# Production
wrangler secret put REPOSITORIES_CONFIG --env production
```

## Updating Configuration

### File-based Configuration

1. Edit `config/repositories.json`
2. Redeploy:
```bash
npm run deploy
```

### KV-based Configuration

Update without redeployment:

```bash
# Update entire configuration
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"

# Or update via API
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/config" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  -d @config/repositories.json
```

Changes take effect immediately.

## Monitoring and Debugging

### View Real-time Logs

```bash
# Tail logs
npm run tail

# Or with wrangler
wrangler tail

# Filter by status
wrangler tail --status error

# Filter by method
wrangler tail --method POST
```

### Check Deployment Status

```bash
wrangler deployments list
```

### View Worker Details

```bash
wrangler whoami
```

## Custom Domains

### Add Custom Domain

1. In Cloudflare Dashboard:
   - Go to **Workers & Pages**
   - Select your Worker
   - Go to **Settings** → **Triggers**
   - Click **Add Custom Domain**
   - Enter your domain (e.g., `github-bot.example.com`)

2. Update GitHub webhook URL to use custom domain

### Configure DNS

Cloudflare automatically configures DNS for custom domains on your Cloudflare account.

## Performance Optimization

### Reduce Cold Starts

1. Use Cloudflare Workers Paid plan for:
   - Reduced cold start times
   - Higher CPU limits
   - More concurrent requests

2. Keep Worker code minimal:
   - Avoid large dependencies
   - Use tree-shaking
   - Minimize bundle size

### Optimize Configuration Loading

For KV-based configuration:

```javascript
// Cache configuration in memory
let configCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

async function getConfig() {
  const now = Date.now();
  if (configCache && (now - cacheTime) < CACHE_TTL) {
    return configCache;
  }
  
  configCache = await loadConfigFromKV();
  cacheTime = now;
  return configCache;
}
```

## Scaling Considerations

### Request Limits

Cloudflare Workers Free Tier:
- 100,000 requests/day
- 10ms CPU time per request

Paid Tier:
- Unlimited requests
- 50ms CPU time per request

### Rate Limiting

Implement rate limiting for high-traffic repositories:

```javascript
// In wrangler.toml
[vars]
RATE_LIMIT_PER_REPO = "100"
RATE_LIMIT_WINDOW = "60"
```

### Multiple Workers

For very high traffic, deploy separate Workers per repository or team:

```bash
# Deploy team-specific workers
wrangler deploy --name github-bot-team-a
wrangler deploy --name github-bot-team-b
```

## Rollback

### Rollback to Previous Version

```bash
# List deployments
wrangler deployments list

# Rollback to specific deployment
wrangler rollback [deployment-id]
```

### Emergency Disable

```bash
# Delete worker (stops all traffic)
wrangler delete

# Or disable routes in Cloudflare Dashboard
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
deploy:
  image: node:18
  script:
    - npm ci
    - npm test
    - npm install -g wrangler
    - wrangler deploy
  only:
    - main
  variables:
    CLOUDFLARE_API_TOKEN: $CLOUDFLARE_API_TOKEN
    CLOUDFLARE_ACCOUNT_ID: $CLOUDFLARE_ACCOUNT_ID
```

## Security Best Practices

1. **Use Secrets for Sensitive Data**
   - Never commit secrets to git
   - Use `wrangler secret` for all sensitive values

2. **Enable SSL Verification**
   - Always enable SSL verification in GitHub webhooks

3. **Rotate Secrets Regularly**
   - Update webhook secrets every 90 days
   - Update Feishu webhook URLs if compromised

4. **Restrict Access**
   - Use Cloudflare Access for admin endpoints
   - Implement IP allowlisting if needed

5. **Monitor Logs**
   - Regularly review logs for suspicious activity
   - Set up alerts for authentication failures

## Troubleshooting Deployment

### Deployment Fails

```bash
# Check wrangler configuration
wrangler whoami

# Validate wrangler.toml
wrangler deploy --dry-run

# Check for syntax errors
npm test
```

### Worker Not Responding

1. Check deployment status:
```bash
wrangler deployments list
```

2. View logs:
```bash
wrangler tail
```

3. Test health endpoint:
```bash
curl https://your-worker.workers.dev/health
```

### Configuration Not Loading

1. Verify environment variables:
```bash
wrangler secret list
```

2. Check KV namespace binding:
```bash
wrangler kv:namespace list
```

3. Test configuration loading:
```bash
curl https://your-worker.workers.dev/
```

## Cost Estimation

### Free Tier

- 100,000 requests/day
- Sufficient for small to medium teams
- No credit card required

### Paid Tier ($5/month)

- Unlimited requests
- 10 million requests included
- $0.50 per additional million requests
- Recommended for production use

### Example Costs

- Small team (10 repos, 100 PRs/day): Free tier
- Medium team (50 repos, 500 PRs/day): Free tier
- Large team (100 repos, 2000 PRs/day): ~$5-10/month

## Support and Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [Feishu Bot Documentation](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)

## Next Steps

After successful deployment:

1. ✅ Test webhook delivery with a test PR
2. ✅ Monitor logs for any errors
3. ✅ Configure additional repositories
4. ✅ Set up monitoring and alerts
5. ✅ Document team-specific configuration
