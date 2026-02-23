# 配置指南

本文档提供 GitHub 飞书机器人的详细配置信息。

## 配置源

机器人支持两种配置源：

1. **基于文件**：配置存储在 JSON 文件中（默认）
2. **基于 KV**：配置存储在 Cloudflare KV 存储中

使用 `CONFIG_SOURCE` 环境变量设置配置源。

## 环境变量

### 必需变量

| 变量 | 描述 | 默认值 | 示例 |
|----------|-------------|---------|---------|
| `CONFIG_SOURCE` | 配置源类型 | `file` | `file` 或 `kv` |

### 基于文件的配置

| 变量 | 描述 | 默认值 | 示例 |
|----------|-------------|---------|---------|
| `CONFIG_PATH` | 配置 JSON 文件路径 | `./config/repositories.json` | `./config/repositories.json` |

### 基于 KV 的配置

| 变量 | 描述 | 默认值 | 示例 |
|----------|-------------|---------|---------|
| `CONFIG_KV_NAMESPACE` | KV 命名空间绑定名称 | - | `github_bot_config` |

### 可选变量

| 变量 | 描述 | 默认值 | 示例 |
|----------|-------------|---------|---------|
| `GITHUB_WEBHOOK_SECRET` | 所有仓库的默认 webhook 密钥 | - | `your-secret-here` |
| `LOG_LEVEL` | 日志级别 | `info` | `debug`, `info`, `warn`, `error` |
| `RETRY_ATTEMPTS` | 飞书 API 重试次数 | `3` | `3` |
| `TIMEOUT_MS` | 飞书 API 调用超时时间（毫秒） | `5000` | `5000` |

## 配置文件结构

### 完整示例

```json
{
  "repositories": [
    {
      "owner": "your-org",
      "repo": "your-repo",
      "events": ["pull_request", "star"],
      "feishu_webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/your-token",
      "secret": "your-github-webhook-secret",
      "mentions": ["ou_xxx", "oc_xxx"],
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

## 仓库配置

`repositories` 数组中的每个仓库支持以下字段：

### 必需字段

| 字段 | 类型 | 描述 | 示例 |
|-------|------|-------------|---------|
| `owner` | string | GitHub 组织或用户名 | `"facebook"` |
| `repo` | string | 仓库名称 | `"react"` |
| `events` | string[] | 要监控的 GitHub 事件类型列表 | `["pull_request"]` |
| `feishu_webhook` | string | 飞书机器人 webhook URL | `"https://open.feishu.cn/..."` |
| `secret` | string | 用于签名验证的 GitHub webhook 密钥 | `"your-secret"` |

### 可选字段

| 字段 | 类型 | 描述 | 默认值 | 示例 |
|-------|------|-------------|---------|---------|
| `mentions` | string[] | 在通知中提醒的飞书用户/群组 ID | `[]` | `["ou_xxx", "oc_xxx"]` |
| `settings` | object | 事件特定的通知设置 | 见下文 | 见下文 |

### Settings 对象

`settings` 对象控制哪些事件触发通知：

#### Pull Request 设置

| 字段 | 类型 | 描述 | 默认值 |
|-------|------|-------------|---------|
| `notify_on_pr_open` | boolean | PR 打开时通知 | `true` |
| `notify_on_pr_merge` | boolean | PR 合并时通知 | `true` |
| `notify_on_pr_close` | boolean | PR 关闭时通知（未合并） | `false` |
| `notify_on_pr_review` | boolean | 请求审查时通知 | `true` |

#### Star 设置

| 字段 | 类型 | 描述 | 默认值 |
|-------|------|-------------|---------|
| `notify_on_star` | boolean | 仓库被 star 时通知 | `true` |

## 全局设置

`global_settings` 对象配置系统范围的行为：

| 字段 | 类型 | 描述 | 默认值 | 有效值 |
|-------|------|-------------|---------|--------------|
| `log_level` | string | 日志详细程度 | `"info"` | `"debug"`, `"info"`, `"warn"`, `"error"` |
| `retry_attempts` | number | 飞书 API 调用失败的重试次数 | `3` | `1-10` |
| `timeout_ms` | number | 飞书 API 调用超时时间（毫秒） | `5000` | `1000-30000` |

## 支持的事件类型

`events` 数组当前支持的值：

- `pull_request`：Pull request 生命周期事件（打开、合并、关闭、审查）
- `star`：仓库 star 事件（仅在被 star 时通知，unstar 不通知）

计划支持：
- `issues`：Issue 生命周期事件
- `release`：发布事件
- `push`：推送事件

## 获取飞书 Webhook URL

1. 打开飞书，导航到你想要接收通知的群组
2. 点击群组设置（⚙️）
3. 选择"机器人" → "添加机器人"
4. 选择"自定义机器人"并配置：
   - 机器人名称："GitHub Bot"（或你喜欢的名称）
   - 描述："GitHub 仓库通知"
5. 复制提供的 webhook URL
6. 将 URL 添加到配置文件中

## 获取飞书用户/群组 ID 用于提醒

### 用户 ID (ou_xxx)

1. 打开飞书管理后台
2. 导航到"组织架构" → "成员管理"
3. 找到用户并复制其用户 ID（以 `ou_` 开头）

### 群组 ID (oc_xxx)

1. 在飞书中打开群组
2. 点击群组设置 → "群信息"
3. 复制群组 ID（以 `oc_` 开头）

或者，使用飞书开放平台 API 以编程方式检索 ID。

## 配置验证

机器人在启动时验证配置，如果出现以下情况将失败并显示描述性错误：

- 缺少必需字段
- JSON 语法无效
- 字段类型不正确
- URL 格式错误
- 不支持的事件类型

### 验证错误示例

```
Configuration Error: Missing required field 'owner' in repository configuration
Configuration Error: Invalid event type 'invalid_event'. Supported: pull_request
Configuration Error: Invalid Feishu webhook URL format
```

## 环境变量覆盖

环境变量优先于配置文件中的全局设置值：

```bash
# 覆盖日志级别
LOG_LEVEL=debug

# 覆盖重试次数
RETRY_ATTEMPTS=5

# 覆盖超时时间
TIMEOUT_MS=10000
```

仓库特定的设置不能通过环境变量覆盖。

## 多仓库配置

你可以使用不同的设置监控多个仓库：

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

## KV 存储配置

对于基于 KV 的配置：

1. 创建 KV 命名空间：
```bash
wrangler kv:namespace create "CONFIG_KV"
```

2. 更新 `wrangler.toml`：
```toml
[[kv_namespaces]]
binding = "CONFIG_KV"
id = "your-kv-namespace-id"
```

3. 上传配置：
```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

4. 设置环境变量：
```bash
CONFIG_SOURCE=kv
CONFIG_KV_NAMESPACE=CONFIG_KV
```

## 安全最佳实践

1. **永远不要提交密钥**：使用环境变量或 Cloudflare Workers 密钥
2. **每个仓库使用唯一密钥**：为每个仓库使用不同的 webhook 密钥
3. **定期轮换密钥**：定期更新 webhook 密钥
4. **限制 webhook 事件**：在 GitHub webhook 设置中仅启用所需的事件
5. **使用 HTTPS**：始终为飞书 webhook 使用 HTTPS URL

## 配置更新

### 基于文件的配置

对配置文件的更改需要重新部署 Worker：

```bash
npm run deploy
```

### 基于 KV 的配置

对 KV 存储的更改立即生效，无需重新部署：

```bash
wrangler kv:key put --namespace-id=your-kv-namespace-id "config" "$(cat config/repositories.json)"
```

## 配置问题故障排查

### 配置未加载

1. 检查 `CONFIG_SOURCE` 是否正确设置
2. 验证文件路径或 KV 命名空间绑定
3. 验证 JSON 语法：`cat config/repositories.json | jq`
4. 检查 Worker 日志：`wrangler tail`

### Webhook 签名验证失败

1. 确保 `secret` 与 GitHub webhook 配置匹配
2. 检查密钥值中的空格
3. 如果需要，验证密钥是否正确进行了 URL 编码

### 飞书消息未发送

1. 使用 curl 测试 webhook URL：
```bash
curl -X POST "your-feishu-webhook-url" \
  -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"test"}}'
```

2. 验证机器人是否有权限在群组中发布消息
3. 检查飞书 webhook URL 是否未过期

### 事件未触发通知

1. 验证事件类型是否在 `events` 数组中
2. 检查事件特定的设置（例如 `notify_on_pr_open`）
3. 查看 Worker 日志以了解事件处理情况
4. 确认 GitHub webhook 已配置该事件类型
