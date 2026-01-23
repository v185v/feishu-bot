# 部署指南

本指南介绍如何将 GitHub 飞书机器人部署到 Cloudflare Workers。

## 前置要求

部署前，请确保你有：

- 已安装 Node.js 18 或更高版本
- Cloudflare 账号（免费套餐即可）
- 全局安装 Wrangler CLI：`npm install -g wrangler`
- 具有管理员权限的 GitHub 仓库
- 飞书机器人 webhook URL

## 初始设置

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Wrangler

使用你的 Cloudflare 账号详细信息编辑 `wrangler.toml`：

```toml
name = "github-feishu-bot"
main = "src/index.js"
compatibility_date = "2024-01-15"

# 添加你的账号 ID
account_id = "your-cloudflare-account-id"

[vars]
CONFIG_SOURCE = "file"
CONFIG_PATH = "./config/repositories.json"
LOG_LEVEL = "info"
```

查找你的账号 ID：
```bash
wrangler whoami
```

### 3. 使用 Cloudflare 进行身份验证

```bash
wrangler login
```

这将打开浏览器窗口进行身份验证。

### 4. 配置仓库

创建或编辑 `config/repositories.json`：

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

## 部署方法

### 方法 1：基于文件的配置（推荐入门使用）

此方法将配置文件与 Worker 打包在一起。

1. 确保 `wrangler.toml` 包含：
```toml
[vars]
CONFIG_SOURCE = "file"
CONFIG_PATH = "./config/repositories.json"
```

2. 部署：
```bash
npm run deploy
```

3. 设置密钥：
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
# 在提示时输入你的默认 webhook 密钥
```

**优点**：设置简单，无需额外服务
**缺点**：配置更改需要重新部署

### 方法 2：KV 存储配置（推荐生产环境使用）

此方法将配置存储在 Cloudflare KV 中，允许在不重新部署的情况下更新。

1. 创建 KV 命名空间：
```bash
wrangler kv:namespace create "CONFIG_KV"
```

记下输出中的命名空间 ID。

2. 更新 `wrangler.toml`：
```toml
[vars]
CONFIG_SOURCE = "kv"

[[kv_namespaces]]
binding = "CONFIG_KV"
id = "your-kv-namespace-id"
```

3. 将配置上传到 KV：
```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

4. 部署：
```bash
npm run deploy
```

5. 设置密钥：
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
```

**优点**：无需重新部署即可更新配置
**缺点**：设置稍微复杂

## 环境特定部署

### 开发环境

```bash
# 部署到开发环境
wrangler deploy --env development

# 查看日志
wrangler tail --env development
```

### 生产环境

```bash
# 部署到生产环境
npm run deploy:production

# 或手动部署
wrangler deploy --env production

# 查看日志
wrangler tail --env production
```

在 `wrangler.toml` 中配置环境：

```toml
[env.development]
name = "github-feishu-bot-dev"
vars = { LOG_LEVEL = "debug" }

[env.production]
name = "github-feishu-bot"
vars = { LOG_LEVEL = "info" }
```

## GitHub Webhook 配置

部署后，为每个仓库配置 GitHub webhook：

### 1. 获取你的 Worker URL

部署后，Wrangler 将输出你的 Worker URL：
```
https://github-feishu-bot.your-subdomain.workers.dev
```

### 2. 配置 GitHub Webhook

1. 进入你的 GitHub 仓库
2. 导航到 **Settings** → **Webhooks** → **Add webhook**
3. 配置：
   - **Payload URL**：`https://your-worker.workers.dev/webhook`
   - **Content type**：`application/json`
   - **Secret**：你的 webhook 密钥（必须与配置匹配）
   - **SSL verification**：启用 SSL 验证
   - **Events**：选择要监控的事件：
     - ☑️ Pull requests
     - ☐ Issues（未来支持）
     - ☐ Stars（未来支持）
   - **Active**：☑️ 勾选

4. 点击 **Add webhook**

### 3. 测试 Webhook

1. 在仓库中创建一个测试 pull request
2. 检查 GitHub webhook 投递状态：
   - 进入 **Settings** → **Webhooks** → 点击你的 webhook
   - 查看 **Recent Deliveries**
   - 检查响应状态（应为 200）

3. 验证消息是否出现在飞书群组中

## 管理密钥

### 设置密钥

```bash
# 设置 webhook 密钥
wrangler secret put GITHUB_WEBHOOK_SECRET

# 如需要，设置其他密钥
wrangler secret put FEISHU_APP_SECRET
```

### 列出密钥

```bash
wrangler secret list
```

### 删除密钥

```bash
wrangler secret delete GITHUB_WEBHOOK_SECRET
```

### 环境特定密钥

```bash
# 开发环境
wrangler secret put GITHUB_WEBHOOK_SECRET --env development

# 生产环境
wrangler secret put GITHUB_WEBHOOK_SECRET --env production
```

## 更新配置

### 基于文件的配置

1. 编辑 `config/repositories.json`
2. 重新部署：
```bash
npm run deploy
```

### 基于 KV 的配置

无需重新部署即可更新：

```bash
# 更新整个配置
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"

# 或通过 API 更新
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/config" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  -d @config/repositories.json
```

更改立即生效。

## 监控和调试

### 查看实时日志

```bash
# 查看日志
npm run tail

# 或使用 wrangler
wrangler tail

# 按状态过滤
wrangler tail --status error

# 按方法过滤
wrangler tail --method POST
```

### 检查部署状态

```bash
wrangler deployments list
```

### 查看 Worker 详细信息

```bash
wrangler whoami
```

## 自定义域名

### 添加自定义域名

1. 在 Cloudflare 控制台中：
   - 进入 **Workers & Pages**
   - 选择你的 Worker
   - 进入 **Settings** → **Triggers**
   - 点击 **Add Custom Domain**
   - 输入你的域名（例如 `github-bot.example.com`）

2. 更新 GitHub webhook URL 以使用自定义域名

### 配置 DNS

Cloudflare 会自动为你的 Cloudflare 账号上的自定义域名配置 DNS。

## 性能优化

### 减少冷启动

1. 使用 Cloudflare Workers 付费计划以获得：
   - 减少冷启动时间
   - 更高的 CPU 限制
   - 更多并发请求

2. 保持 Worker 代码最小化：
   - 避免大型依赖
   - 使用 tree-shaking
   - 最小化打包大小

### 优化配置加载

对于基于 KV 的配置：

```javascript
// 在内存中缓存配置
let configCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 分钟

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

## 扩展考虑

### 请求限制

Cloudflare Workers 免费套餐：
- 每天 100,000 次请求
- 每次请求 10ms CPU 时间

付费套餐：
- 无限请求
- 每次请求 50ms CPU 时间

### 速率限制

为高流量仓库实施速率限制：

```javascript
// 在 wrangler.toml 中
[vars]
RATE_LIMIT_PER_REPO = "100"
RATE_LIMIT_WINDOW = "60"
```

### 多个 Workers

对于非常高的流量，为每个仓库或团队部署单独的 Workers：

```bash
# 部署团队特定的 workers
wrangler deploy --name github-bot-team-a
wrangler deploy --name github-bot-team-b
```

## 回滚

### 回滚到先前版本

```bash
# 列出部署
wrangler deployments list

# 回滚到特定部署
wrangler rollback [deployment-id]
```

### 紧急禁用

```bash
# 删除 worker（停止所有流量）
wrangler delete

# 或在 Cloudflare 控制台中禁用路由
```

## CI/CD 集成

### GitHub Actions

创建 `.github/workflows/deploy.yml`：

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

创建 `.gitlab-ci.yml`：

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

## 安全最佳实践

1. **对敏感数据使用密钥**
   - 永远不要将密钥提交到 git
   - 对所有敏感值使用 `wrangler secret`

2. **启用 SSL 验证**
   - 始终在 GitHub webhooks 中启用 SSL 验证

3. **定期轮换密钥**
   - 每 90 天更新一次 webhook 密钥
   - 如果泄露，更新飞书 webhook URL

4. **限制访问**
   - 对管理端点使用 Cloudflare Access
   - 如需要，实施 IP 白名单

5. **监控日志**
   - 定期查看日志以发现可疑活动
   - 为身份验证失败设置警报

## 部署故障排查

### 部署失败

```bash
# 检查 wrangler 配置
wrangler whoami

# 验证 wrangler.toml
wrangler deploy --dry-run

# 检查语法错误
npm test
```

### Worker 无响应

1. 检查部署状态：
```bash
wrangler deployments list
```

2. 查看日志：
```bash
wrangler tail
```

3. 测试健康端点：
```bash
curl https://your-worker.workers.dev/health
```

### 配置未加载

1. 验证环境变量：
```bash
wrangler secret list
```

2. 检查 KV 命名空间绑定：
```bash
wrangler kv:namespace list
```

3. 测试配置加载：
```bash
curl https://your-worker.workers.dev/
```

## 成本估算

### 免费套餐

- 每天 100,000 次请求
- 适合小型到中型团队
- 无需信用卡

### 付费套餐（每月 $5）

- 无限请求
- 包含 1000 万次请求
- 每增加 100 万次请求 $0.50
- 推荐用于生产环境

### 示例成本

- 小型团队（10 个仓库，每天 100 个 PR）：免费套餐
- 中型团队（50 个仓库，每天 500 个 PR）：免费套餐
- 大型团队（100 个仓库，每天 2000 个 PR）：约 $5-10/月

## 支持和资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [GitHub Webhooks 文档](https://docs.github.com/en/webhooks)
- [飞书机器人文档](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)

## 下一步

成功部署后：

1. ✅ 使用测试 PR 测试 webhook 投递
2. ✅ 监控日志以查找任何错误
3. ✅ 配置其他仓库
4. ✅ 设置监控和警报
5. ✅ 记录团队特定的配置
