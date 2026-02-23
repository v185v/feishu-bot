# GitHub 飞书机器人

基于 Cloudflare Workers 的机器人，用于监控 GitHub 仓库事件并发送格式化通知到飞书群组。通过飞书消息实时了解 Pull Request、Issue 和仓库活动。

## 功能特性

- 🔔 **多仓库监控**：配置多个 GitHub 仓库，支持不同的通知偏好
- 🔒 **安全的 Webhook 验证**：所有 GitHub webhook 使用 HMAC-SHA256 签名验证
- 📝 **Pull Request 通知**：跟踪 PR 的打开、合并、关闭和审查请求
- 🎨 **丰富的消息格式**：精美的飞书交互式卡片，直接链接到 GitHub
- 🔄 **自动重试机制**：指数退避重试机制，确保消息可靠送达
- 👥 **用户提醒**：为重要事件通知特定的飞书用户或群组
- ⚙️ **灵活的配置**：支持基于文件或 KV 存储的配置，可通过环境变量覆盖
- 📊 **全面的日志**：请求 ID 跟踪和结构化日志，便于故障排查

## 快速开始

### 前置要求

- Node.js 18 或更高版本
- Cloudflare 账号
- 已安装 Wrangler CLI（`npm install -g wrangler`）
- 具有管理员权限的 GitHub 仓库
- 飞书机器人 webhook URL

### 安装

1. 克隆仓库：
```bash
git clone https://github.com/v185v/feishu-bot.git
cd feishu-bot
```

2. 安装依赖：
```bash
npm install
```

3. 配置仓库：
```bash
cp .env.example .env
# 编辑 .env 文件设置你的配置
```

4. 编辑 `config/repositories.json` 配置你的仓库：
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

### 开发

本地运行机器人：
```bash
npm run dev
```

机器人将在 `http://localhost:8787` 上运行

### 测试

运行测试：
```bash
npm test
```

监听模式运行测试：
```bash
npm run test:watch
```

运行测试并生成覆盖率报告：
```bash
npm run test:coverage
```

### 部署

1. 使用 Cloudflare 进行身份验证：
```bash
wrangler login
```

2. 部署到 Cloudflare Workers：
```bash
npm run deploy
```

3. 设置密钥：
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
```

4. 配置 GitHub webhook：
   - 进入仓库设置 → Webhooks → 添加 webhook
   - Payload URL：`https://your-worker.workers.dev/webhook`
   - Content type：`application/json`
   - Secret：你的 webhook 密钥
   - Events：选择 "Pull requests"（或其他你想监控的事件）

## 配置

详细配置选项请参阅 [CONFIGURATION.md](CONFIGURATION.md)

## 部署

详细部署说明请参阅 [DEPLOYMENT.md](DEPLOYMENT.md)

## 架构

系统架构概述请参阅 [ARCHITECTURE.md](ARCHITECTURE.md)

## API 端点

| 端点 | 方法 | 描述 |
|----------|--------|-------------|
| `/webhook` | POST | GitHub webhook 接收器 |
| `/health` | GET | 健康检查端点 |
| `/` | GET | 根端点，返回基本信息 |

## 支持的事件

当前支持的 GitHub 事件：
- **Pull Requests**：打开、合并、关闭、重新打开、请求审查
- **Stars**：仓库被 star

计划支持的事件：
- Issues
- Releases
- Commits

## 故障排查

### Webhook 未接收到事件

1. 检查 GitHub webhook 在仓库设置中的投递状态
2. 验证 webhook URL 是否正确
3. 检查 Cloudflare Workers 日志：`npm run tail`

### 签名验证失败

1. 确保 webhook 密钥在 GitHub 和配置中匹配
2. 检查密钥是否正确设置在 Cloudflare Workers 中

### 消息未出现在飞书中

1. 验证飞书 webhook URL 是否正确
2. 检查机器人是否有权限在群组中发布消息
3. 查看日志中的飞书 API 错误

### 配置未加载

1. 验证 `CONFIG_SOURCE` 是否正确设置（`file` 或 `kv`）
2. 检查 `CONFIG_PATH` 是否指向有效的 JSON 文件
3. 验证配置文件中的 JSON 语法

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

MIT License - 详见 LICENSE 文件

## 支持

如有问题，请在 GitHub 上提交 issue。
