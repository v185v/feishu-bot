# 快速开始：部署到 Cloudflare Workers

本指南将帮助你快速部署 GitHub Feishu Bot 到 Cloudflare Workers，监控 GitHub 仓库的 PR 并发送通知到飞书群。

## 前置准备

在开始之前，你需要准备：

1. **Cloudflare 账号**（免费版即可）
2. **GitHub 仓库**（需要管理员权限）
3. **飞书群机器人 Webhook URL**
4. **Node.js 18+** 已安装

## 第一步：获取飞书 Webhook URL

1. 打开飞书群聊
2. 点击右上角 **设置** → **群机器人** → **添加机器人**
3. 选择 **自定义机器人**
4. 设置机器人名称（如：GitHub PR 通知）
5. 复制生成的 **Webhook 地址**，格式类似：
   ```
   https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxxxx
   ```

## 第二步：克隆并配置项目

```bash
# 克隆项目
git clone <your-repo-url>
cd github-feishu-bot

# 安装依赖
npm install

# 全局安装 Wrangler CLI
npm install -g wrangler
```

## 第三步：配置仓库信息

创建配置文件 `config/repositories.json`：

```json
{
  "repositories": [
    {
      "owner": "your-github-username",
      "repo": "your-repo-name",
      "events": ["pull_request"],
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/你的webhook地址",
      "secret": "my-secret-key-123",
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

**配置说明：**
- `owner`: GitHub 用户名或组织名
- `repo`: 仓库名称
- `feishu_webhook`: 第一步获取的飞书 Webhook URL
- `secret`: 自定义的密钥（稍后在 GitHub 配置 webhook 时会用到）
- `notify_on_pr_open`: 是否通知 PR 打开事件
- `notify_on_pr_merge`: 是否通知 PR 合并事件
- `notify_on_pr_close`: 是否通知 PR 关闭事件
- `notify_on_pr_review`: 是否通知 PR 审查请求事件

## 第四步：登录 Cloudflare

```bash
# 登录 Cloudflare
wrangler login
```

这会打开浏览器窗口，按提示完成登录。

## 第五步：配置 Wrangler

编辑 `wrangler.toml` 文件：

```toml
name = "github-feishu-bot"
main = "src/index.js"
compatibility_date = "2024-01-15"

# 获取你的 account_id: 运行 wrangler whoami
account_id = "your-cloudflare-account-id"

[vars]
CONFIG_SOURCE = "file"
CONFIG_PATH = "./config/repositories.json"
LOG_LEVEL = "info"
```

获取你的 `account_id`：

```bash
wrangler whoami
```

## 第六步：部署到 Cloudflare Workers

```bash
# 部署
npm run deploy

# 或者直接使用 wrangler
wrangler deploy
```

部署成功后，你会看到类似输出：

```
✨ Successfully published your Worker
🌍 https://github-feishu-bot.your-subdomain.workers.dev
```

**记下这个 URL**，下一步配置 GitHub webhook 时需要用到。

## 第七步：配置 GitHub Webhook

1. 打开你的 GitHub 仓库
2. 进入 **Settings** → **Webhooks** → **Add webhook**
3. 填写配置：

   - **Payload URL**: `https://github-feishu-bot.your-subdomain.workers.dev/webhook`
   - **Content type**: 选择 `application/json`
   - **Secret**: 填写你在 `config/repositories.json` 中设置的 `secret` 值（如：`my-secret-key-123`）
   - **SSL verification**: 选择 `Enable SSL verification`
   - **Which events would you like to trigger this webhook?**
     - 选择 **Let me select individual events**
     - 勾选 ☑️ **Pull requests**
   - **Active**: 勾选 ☑️

4. 点击 **Add webhook**

## 第八步：测试

### 测试 Worker 是否运行

```bash
# 测试健康检查端点
curl https://github-feishu-bot.your-subdomain.workers.dev/health
```

应该返回：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

### 测试 PR 通知

1. 在你的 GitHub 仓库创建一个测试 PR
2. 检查飞书群是否收到通知消息
3. 在 GitHub 查看 webhook 发送状态：
   - 进入 **Settings** → **Webhooks** → 点击你的 webhook
   - 查看 **Recent Deliveries**
   - 应该看到状态码 `200`

### 查看实时日志

```bash
# 查看 Worker 日志
wrangler tail

# 或使用 npm script
npm run tail
```

## 常见问题

### 1. 飞书群没有收到消息

**检查清单：**
- ✅ 确认飞书 Webhook URL 正确
- ✅ 确认 GitHub webhook 发送成功（状态码 200）
- ✅ 查看 Worker 日志：`wrangler tail`
- ✅ 确认配置文件中的 `notify_on_pr_open` 等设置为 `true`

### 2. GitHub webhook 显示错误

**检查清单：**
- ✅ 确认 Payload URL 正确（包含 `/webhook` 路径）
- ✅ 确认 Secret 与配置文件中的一致
- ✅ 确认 Content type 为 `application/json`
- ✅ 查看 GitHub webhook 的 Recent Deliveries 中的错误信息

### 3. Worker 部署失败

```bash
# 检查配置
wrangler whoami

# 验证配置文件
wrangler deploy --dry-run

# 运行测试
npm test
```

### 4. 如何查看详细日志

```bash
# 实时查看日志
wrangler tail

# 只看错误日志
wrangler tail --status error

# 只看 POST 请求
wrangler tail --method POST
```

## 监控多个仓库

如果你需要监控多个仓库，只需在 `config/repositories.json` 中添加更多配置：

```json
{
  "repositories": [
    {
      "owner": "org1",
      "repo": "repo1",
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/webhook1",
      "secret": "secret1",
      "events": ["pull_request"]
    },
    {
      "owner": "org2",
      "repo": "repo2",
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/webhook2",
      "secret": "secret2",
      "events": ["pull_request"]
    }
  ]
}
```

然后重新部署：

```bash
npm run deploy
```

为每个仓库配置 GitHub webhook（使用相同的 Worker URL，但各自的 secret）。

## 更新配置

当你需要修改配置时：

1. 编辑 `config/repositories.json`
2. 重新部署：
   ```bash
   npm run deploy
   ```

## 下一步

- 📖 查看 [完整部署指南](./DEPLOYMENT.md) 了解更多高级配置
- 📖 查看 [配置文档](./CONFIGURATION.md) 了解所有配置选项
- 📖 查看 [架构文档](./ARCHITECTURE.md) 了解系统设计

## 费用说明

Cloudflare Workers 免费版配额：
- **100,000 请求/天**
- 对于大多数小型到中型团队完全够用
- 无需信用卡

如果你的团队规模较大，可以升级到付费版（$5/月）获得无限请求。

## 获取帮助

如果遇到问题：
1. 查看 [故障排除指南](./DEPLOYMENT.md#troubleshooting-deployment)
2. 查看 Worker 日志：`wrangler tail`
3. 查看 GitHub webhook 的 Recent Deliveries
4. 提交 Issue 到项目仓库

---

🎉 恭喜！你已经成功部署了 GitHub Feishu Bot！
