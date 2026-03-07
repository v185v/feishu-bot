# Star 监控功能使用指南

## 功能概述

Star 监控功能允许你在 GitHub 仓库被 star 时收到飞书通知。这对于跟踪项目受欢迎程度和了解社区关注度非常有用。

## 功能特性

- ⭐ **Star 通知**：当有人 star 你的仓库时立即收到通知
- 📊 **统计信息**：显示仓库的 star、watcher 和 fork 数量
- 🎯 **可配置**：可以选择启用或禁用 star 通知
- 🔕 **智能过滤**：仅在 star 时通知，unstar 不会触发通知

## 配置方法

### 1. 更新配置文件

在 `config/repositories.json` 中添加 `star` 事件类型和相关设置：

```json
{
  "repositories": [
    {
      "owner": "your-org",
      "repo": "your-repo",
      "events": ["pull_request", "star"],
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/...",
      "secret": "your-github-webhook-secret",
      "mentions": [],
      "settings": {
        "notify_on_pr_open": true,
        "notify_on_pr_merge": true,
        "notify_on_pr_close": false,
        "notify_on_pr_review": true,
        "notify_on_star": true
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

### 2. 配置 GitHub Webhook

在 GitHub 仓库设置中配置 webhook：

1. 进入仓库的 **Settings** → **Webhooks** → **Add webhook**
2. 配置以下选项：
   - **Payload URL**: `https://your-worker.workers.dev/webhook`
   - **Content type**: `application/json`
   - **Secret**: 你的 webhook 密钥
   - **Events**: 选择 **Watch** 事件（GitHub 使用 Watch 事件来表示 star）
     - 注意：在 GitHub webhook 配置中，star 事件被称为 "Watch" 事件
   - **Active**: ☑️ 勾选

3. 点击 **Add webhook**

### 3. 部署更新

如果使用文件配置：
```bash
npm run deploy
```

如果使用 KV 配置：
```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

## 配置选项

### notify_on_star

控制是否在仓库被 star 时发送通知。

- **类型**: `boolean`
- **默认值**: `true`
- **说明**: 设置为 `false` 可以禁用 star 通知

```json
{
  "settings": {
    "notify_on_star": true
  }
}
```

## 通知消息格式

当有人 star 你的仓库时，飞书会收到一个交互式卡片消息，包含：

- 📌 **标题**: `[Star] owner/repo`
- ⭐ **操作**: `user starred owner/repo`
- 📝 **仓库描述**: 仓库的简短描述
- 📊 **统计信息**:
  - ⭐ Stars: 当前 star 总数
  - 👀 Watchers: 当前 watcher 总数
  - 🍴 Forks: 当前 fork 总数
- 👤 **用户信息**: star 的用户名
- ⏰ **时间戳**: star 的时间
- 🔗 **GitHub 链接**: 直接跳转到仓库的按钮

### 示例消息

```
[Star] facebook/react
⭐ Starred: john-doe starred facebook/react

A declarative, efficient, and flexible JavaScript library for building user interfaces.

Author: john-doe
Time: 2024-01-15 10:30:00
⭐ Stars: 215,234
👀 Watchers: 6,789
🍴 Forks: 44,567

[View on GitHub]
```

## 行为说明

### 触发通知的情况

- ✅ 用户 star 仓库（action: `created`）
- ✅ `notify_on_star` 设置为 `true`
- ✅ `star` 在仓库的 `events` 数组中

### 不触发通知的情况

- ❌ 用户 unstar 仓库（action: `deleted`）
- ❌ `notify_on_star` 设置为 `false`
- ❌ `star` 不在仓库的 `events` 数组中
- ❌ Webhook 签名验证失败

## 使用场景

### 1. 开源项目维护者

跟踪项目的受欢迎程度，了解何时有新的关注者：

```json
{
  "owner": "your-org",
  "repo": "awesome-project",
  "events": ["star"],
  "settings": {
    "notify_on_star": true
  }
}
```

### 2. 团队协作

在团队群组中分享项目获得 star 的好消息：

```json
{
  "owner": "company",
  "repo": "product",
  "events": ["pull_request", "star"],
  "mentions": ["ou_team_lead"],
  "settings": {
    "notify_on_star": true
  }
}
```

### 3. 多仓库监控

同时监控多个仓库的 star 情况：

```json
{
  "repositories": [
    {
      "owner": "org",
      "repo": "frontend",
      "events": ["star"],
      "feishu_webhook": "https://open.feishu.cn/hook/frontend-team",
      "settings": {
        "notify_on_star": true
      }
    },
    {
      "owner": "org",
      "repo": "backend",
      "events": ["star"],
      "feishu_webhook": "https://open.feishu.cn/hook/backend-team",
      "settings": {
        "notify_on_star": true
      }
    }
  ]
}
```

## 故障排查

### 没有收到 star 通知

1. **检查配置**:
   - 确认 `"star"` 在 `events` 数组中
   - 确认 `notify_on_star` 设置为 `true`

2. **检查 GitHub Webhook**:
   - 进入仓库 Settings → Webhooks
   - 确认 "Watch" 事件已勾选
   - 查看 Recent Deliveries 确认 webhook 已发送

3. **检查日志**:
   ```bash
   wrangler tail
   ```
   查看是否有错误信息

4. **测试 webhook**:
   - 自己 star/unstar 仓库进行测试
   - 查看 GitHub webhook 的 Recent Deliveries

### Star 通知太频繁

如果你的项目很受欢迎，可能会收到大量 star 通知。可以考虑：

1. **禁用 star 通知**:
   ```json
   {
     "settings": {
       "notify_on_star": false
     }
   }
   ```

2. **使用单独的飞书群组**:
   为 star 通知创建专门的群组，避免干扰主要工作群

3. **定期查看统计**:
   直接在 GitHub 上查看 star 统计，而不是实时通知

## 技术细节

### GitHub Webhook 事件

GitHub 使用 `watch` 事件来表示 star 操作：

- **事件名称**: `watch`（在 GitHub webhook 配置中）
- **事件类型**: `star`（在本系统中）
- **操作类型**:
  - `started`: 用户 star 了仓库（会触发通知）
  - 注意：GitHub 不会为 unstar 发送 webhook 事件

### 事件处理流程

```
GitHub 发送 watch webhook
    ↓
Worker 接收并验证签名
    ↓
检查 star 在 events 数组中
    ↓
调用 star 事件处理器
    ↓
检查 notify_on_star 设置
    ↓
构建飞书消息卡片
    ↓
发送到飞书 webhook
    ↓
返回 200 OK
```

### 代码位置

- **事件处理器**: `src/handlers/events/star.js`
- **测试文件**: `src/handlers/events/star.test.js`
- **注册位置**: `src/index.js`

## 相关文档

- [配置指南](CONFIGURATION.md)
- [部署指南](DEPLOYMENT.md)
- [架构概述](ARCHITECTURE.md)
- [GitHub Webhooks 文档](https://docs.github.com/en/webhooks)
