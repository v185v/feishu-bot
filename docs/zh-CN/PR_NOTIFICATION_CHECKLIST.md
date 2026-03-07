# PR 通知功能检查清单

## ✅ 功能确认

**是的，当有人创建 PR 时，系统会自动发送飞书消息！**

## 工作原理

```
GitHub PR 创建
    ↓
GitHub 发送 webhook (action: opened)
    ↓
Cloudflare Worker 接收请求
    ↓
验证签名和配置
    ↓
检查 notify_on_pr_open 设置
    ↓
构建飞书消息卡片
    ↓
发送到飞书群
    ↓
✅ 飞书群收到通知
```

## 必要配置检查

### 1. 配置文件 (`config/repositories.json`)

```json
{
  "repositories": [
    {
      "owner": "your-github-username",
      "repo": "your-repo-name",
      "events": ["pull_request"],  // ✅ 必须包含 pull_request
      "feishu_webhook": "https://open.feishu.cn/...",  // ✅ 飞书 Webhook URL
      "secret": "your-secret-key",  // ✅ 与 GitHub webhook 一致
      "settings": {
        "notify_on_pr_open": true,  // ✅ 必须为 true
        "notify_on_pr_merge": true,
        "notify_on_pr_close": false,
        "notify_on_pr_review": true
      }
    }
  ]
}
```

**关键配置项：**
- ✅ `events` 包含 `"pull_request"`
- ✅ `notify_on_pr_open` 设置为 `true`（默认就是 true）
- ✅ `feishu_webhook` 填写正确的飞书群机器人 URL

### 2. GitHub Webhook 配置

在 GitHub 仓库的 **Settings → Webhooks** 中：

- ✅ **Payload URL**: `https://your-worker.workers.dev/webhook`
- ✅ **Content type**: `application/json`
- ✅ **Secret**: 与配置文件中的 `secret` 一致
- ✅ **Events**: 勾选 **Pull requests**
- ✅ **Active**: 勾选启用

### 3. Cloudflare Worker 部署

- ✅ Worker 已成功部署
- ✅ Worker URL 可访问
- ✅ 健康检查通过：`curl https://your-worker.workers.dev/health`

### 4. 飞书群机器人

- ✅ 已在飞书群中添加自定义机器人
- ✅ 已复制 Webhook URL
- ✅ Webhook URL 格式正确：`https://open.feishu.cn/open-apis/bot/v2/hook/...`

## 测试步骤

### 方法 1：创建真实 PR（推荐）

1. 在你的 GitHub 仓库创建一个新分支
2. 提交一些改动
3. 创建 Pull Request
4. 检查飞书群是否收到通知

### 方法 2：查看 GitHub Webhook 日志

1. 进入 GitHub 仓库 **Settings → Webhooks**
2. 点击你配置的 webhook
3. 查看 **Recent Deliveries**
4. 检查最近的请求：
   - ✅ 状态码应该是 `200`
   - ✅ Response body 应该显示成功
   - ❌ 如果是 `4xx` 或 `5xx`，查看错误信息

### 方法 3：查看 Worker 日志

```bash
# 实时查看 Worker 日志
wrangler tail

# 然后创建一个 PR，观察日志输出
```

你应该看到类似的日志：
```
[INFO] Request received { method: 'POST', path: '/webhook' }
[INFO] Configuration loaded successfully
[DEBUG] Processing pull request event { action: 'opened', prNumber: 123 }
[INFO] PR event processed successfully
[INFO] Feishu notification sent successfully
```

### 方法 4：使用测试脚本

```bash
# 运行测试脚本（需要 Node.js）
node test-pr-notification.js
```

## 飞书消息示例

当 PR 创建时，飞书群会收到类似这样的消息卡片：

```
┌─────────────────────────────────────────┐
│ [Pull Request] your-org/your-repo       │  (蓝色标题栏)
├─────────────────────────────────────────┤
│ 🆕 Opened: 添加新功能                    │
│                                         │
│ 这是 PR 的描述内容...                    │
│                                         │
│ ─────────────────────────────────────   │
│                                         │
│ Author: username                        │
│ Time: 2024-01-15 10:30:00              │
│ PR: #123                                │
│ Reviewers: @reviewer1, @reviewer2       │
│                                         │
│ [ View on GitHub ]  (按钮)              │
└─────────────────────────────────────────┘
```

## 支持的 PR 事件

系统支持以下 PR 事件的通知：

| 事件 | 配置项 | 默认值 | 说明 |
|------|--------|--------|------|
| PR 打开 | `notify_on_pr_open` | ✅ true | 创建新 PR 时 |
| PR 重新打开 | `notify_on_pr_open` | ✅ true | 重新打开已关闭的 PR |
| PR 合并 | `notify_on_pr_merge` | ✅ true | PR 被合并时 |
| PR 关闭 | `notify_on_pr_close` | ❌ false | PR 被关闭（未合并）时 |
| 请求审查 | `notify_on_pr_review` | ✅ true | 请求他人审查 PR 时 |

## 常见问题排查

### ❌ 飞书群没有收到消息

**检查步骤：**

1. **验证 Worker 是否收到请求**
   ```bash
   wrangler tail
   ```
   创建 PR 后查看是否有日志输出

2. **检查 GitHub Webhook 状态**
   - 进入 **Settings → Webhooks**
   - 查看 **Recent Deliveries**
   - 如果状态码不是 200，查看错误信息

3. **验证配置文件**
   ```bash
   # 检查配置文件是否正确
   cat config/repositories.json
   ```
   确认：
   - `notify_on_pr_open` 为 `true`
   - `feishu_webhook` URL 正确
   - `owner` 和 `repo` 与 GitHub 仓库匹配

4. **测试飞书 Webhook**
   ```bash
   curl -X POST "https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook" \
     -H "Content-Type: application/json" \
     -d '{
       "msg_type": "text",
       "content": {
         "text": "测试消息"
       }
     }'
   ```
   如果飞书群收到消息，说明 Webhook URL 正确

5. **检查 Worker 错误日志**
   ```bash
   wrangler tail --status error
   ```

### ❌ GitHub Webhook 显示错误

**常见错误及解决方法：**

| 错误 | 原因 | 解决方法 |
|------|------|----------|
| 401 Unauthorized | Secret 不匹配 | 确保 GitHub webhook secret 与配置文件一致 |
| 404 Not Found | Worker URL 错误 | 检查 Payload URL 是否包含 `/webhook` |
| 500 Internal Error | Worker 代码错误 | 查看 `wrangler tail` 日志 |
| Timeout | Worker 响应慢 | 检查飞书 API 是否可访问 |

### ❌ 配置更新后不生效

**解决方法：**

```bash
# 重新部署 Worker
npm run deploy

# 或
wrangler deploy
```

配置文件是打包到 Worker 中的，修改后需要重新部署。

## 高级配置

### 自定义通知内容

如果需要自定义通知内容，可以修改 `src/handlers/events/pull-request.js` 中的 `buildPRMessage` 函数。

### 添加 @ 提醒

在配置文件中添加 `mentions` 字段：

```json
{
  "mentions": [
    "ou_xxxxxx",  // 飞书用户 ID
    "user@example.com"  // 或使用邮箱
  ]
}
```

### 只通知特定类型的 PR

```json
{
  "settings": {
    "notify_on_pr_open": true,   // 只通知新建 PR
    "notify_on_pr_merge": false, // 不通知合并
    "notify_on_pr_close": false, // 不通知关闭
    "notify_on_pr_review": false // 不通知审查请求
  }
}
```

## 性能说明

- **延迟**: 通常在 1-3 秒内收到通知
- **可靠性**: 支持自动重试（默认 3 次）
- **限制**: Cloudflare Workers 免费版每天 100,000 次请求

## 总结

✅ **是的，系统完全支持 PR 创建时发送飞书消息！**

只要确保：
1. ✅ 配置文件中 `notify_on_pr_open: true`（默认就是）
2. ✅ GitHub webhook 配置正确
3. ✅ 飞书 webhook URL 正确
4. ✅ Worker 已部署

就可以正常工作了！

---

如有问题，请查看：
- [快速开始指南](./QUICK_START.md)
- [完整部署文档](./DEPLOYMENT.md)
- [配置说明](./CONFIGURATION.md)
