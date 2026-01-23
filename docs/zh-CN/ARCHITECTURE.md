# 架构概述

本文档提供 GitHub 飞书机器人系统架构、设计决策和实现细节的全面概述。

## 系统概述

GitHub 飞书机器人是一个基于 Cloudflare Workers 构建的无服务器应用程序，充当 GitHub 仓库和飞书消息群组之间的桥梁。它接收来自 GitHub 的 webhook 事件，验证它们，根据仓库特定的配置处理它们，并将格式化的通知发送到飞书。

## 高层架构

```
┌─────────────────┐
│ GitHub          │
│ 仓库            │
└────────┬────────┘
         │ Webhook 事件
         │ (HTTPS POST)
         ▼
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Workers (边缘网络)                           │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ HTTP 路由器 (index.js)                         │    │
│  │  • POST /webhook                               │    │
│  │  • GET /health                                 │    │
│  │  • GET /                                       │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ GitHub Webhook 处理器                          │    │
│  │  • 签名验证 (HMAC-SHA256)                      │    │
│  │  • 事件类型检测                                │    │
│  │  • 配置查找                                    │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ 事件处理器分发器                               │    │
│  │  • Pull Request 处理器                         │    │
│  │  • Issues 处理器（未来）                       │    │
│  │  • Star 处理器（未来）                         │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ 消息格式化器                                   │    │
│  │  • 飞书卡片构建                                │    │
│  │  • 提醒/@ 处理                                 │    │
│  │  • 链接生成                                    │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ 飞书发送器                                     │    │
│  │  • HTTP POST 到飞书 API                        │    │
│  │  • 重试逻辑（指数退避）                        │    │
│  │  • 错误处理                                    │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ 支持服务                                       │    │
│  │  • 配置管理器                                  │    │
│  │  • 日志记录器（请求 ID 跟踪）                  │    │
│  │  • 验证器                                      │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────────────┘
                  │ 格式化消息
                  │ (HTTPS POST)
                  ▼
         ┌─────────────────┐
         │ 飞书群组        │
         └─────────────────┘
```

## 组件架构

### 1. 入口点 (src/index.js)

**职责**：HTTP 请求处理和路由

**主要功能**：
- 请求生命周期管理
- 路由分发
- 请求 ID 生成
- 全局错误处理
- 响应格式化

**流程**：
```javascript
请求 → 生成请求 ID → 路由到处理器 → 格式化响应 → 返回
```

**端点**：
- `POST /webhook`：GitHub webhook 接收器
- `GET /health`：健康检查（返回 200 OK）
- `GET /`：根信息端点

### 2. 配置管理器 (src/config.js)

**职责**：配置加载、验证和查找

**主要功能**：
- 从文件或 KV 存储加载配置
- 验证配置结构
- 按 owner/repo 查找仓库
- 环境变量覆盖支持

**配置源**：
1. **基于文件**：从 `CONFIG_PATH` 指定的 JSON 文件读取
2. **基于 KV**：从 Cloudflare KV 命名空间读取

**验证规则**：
- 必需字段：owner、repo、events、feishu_webhook、secret
- 有效的事件类型
- 有效的 URL 格式
- 有效的 JSON 结构

### 3. GitHub Webhook 处理器 (src/handlers/github-webhook.js)

**职责**：Webhook 验证和事件处理编排

**主要功能**：
- HMAC-SHA256 签名验证
- 事件类型检测
- 配置查找
- 事件处理器委托
- 错误处理

**安全性**：
- 恒定时间签名比较（防止时序攻击）
- 在任何处理之前进行签名验证
- 对无效签名返回 401 响应

**流程**：
```
Webhook 请求
    ↓
提取签名头
    ↓
计算 HMAC-SHA256
    ↓
比较签名（恒定时间）
    ↓
[有效] → 查找配置 → 分发到事件处理器
[无效] → 返回 401
```

### 4. 事件处理器 (src/handlers/events/)

**职责**：事件特定的处理和消息生成

**当前处理器**：
- `pull-request.js`：Pull request 生命周期事件

**处理器接口**：
```javascript
async function handleEvent(event, config, logger) {
  // 返回：{ shouldNotify: boolean, message: object }
}
```

**Pull Request 处理器操作**：
- `opened`：创建新 PR
- `closed`（已合并）：PR 已合并
- `closed`（未合并）：PR 关闭但未合并
- `reopened`：PR 重新打开
- `review_requested`：请求审查

**配置标志**：
- `notify_on_pr_open`
- `notify_on_pr_merge`
- `notify_on_pr_close`
- `notify_on_pr_review`

### 5. 飞书消息发送器 (src/handlers/feishu-sender.js)

**职责**：消息格式化和发送到飞书

**主要功能**：
- 飞书交互式卡片构建
- HTTP POST 到飞书 webhook
- 指数退避重试逻辑
- 超时处理
- 错误日志记录

**消息卡片结构**：
```json
{
  "msg_type": "interactive",
  "card": {
    "config": { "wide_screen_mode": true },
    "elements": [
      {
        "tag": "div",
        "text": {
          "content": "**[PR] 仓库**\n标题",
          "tag": "lark_md"
        }
      },
      {
        "tag": "div",
        "text": {
          "content": "**作者:** @user\n**状态:** 打开",
          "tag": "lark_md"
        }
      },
      {
        "tag": "action",
        "actions": [{
          "type": "button",
          "text": { "content": "在 GitHub 上查看" },
          "url": "https://github.com/..."
        }]
      }
    ]
  }
}
```

**重试策略**：
- 触发条件：5xx 响应或网络超时
- 尝试次数：可配置（默认：3）
- 退避：指数退避加抖动
  - 尝试 1：立即
  - 尝试 2：1秒 + 随机(0-500ms)
  - 尝试 3：2秒 + 随机(0-500ms)
- 超时：可配置（默认：5000ms）

### 6. 工具类

#### 日志记录器 (src/utils/logger.js)

**职责**：带请求跟踪的结构化日志

**功能**：
- 请求 ID 跟踪
- 日志级别过滤（debug、info、warn、error）
- 结构化日志输出
- 上下文丰富

**日志格式**：
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "requestId": "req_abc123",
  "message": "处理 webhook 事件",
  "context": {
    "repository": "org/repo",
    "eventType": "pull_request"
  }
}
```

#### 验证器 (src/utils/validator.js)

**职责**：输入验证和签名验证

**功能**：
- HMAC-SHA256 签名计算
- 恒定时间签名比较
- 输入验证辅助函数

#### 常量 (src/constants.js)

**职责**：系统范围的常量

**包括**：
- HTTP 状态码
- 错误消息
- 日志级别
- 事件类型

## 数据流

### 成功的 Webhook 处理

```
1. GitHub 发送 webhook → POST /webhook
2. Worker 生成请求 ID
3. 从 X-Hub-Signature-256 头提取签名
4. 加载仓库配置
5. 计算 HMAC-SHA256 签名
6. 比较签名（恒定时间）
7. 解析事件类型和操作
8. 分发到事件处理器（例如 pull-request.js）
9. 检查配置标志（例如 notify_on_pr_open）
10. 生成消息对象
11. 格式化飞书卡片
12. POST 到飞书 webhook
13. [如果失败] 使用指数退避重试
14. 向 GitHub 返回 200 OK
```

### 错误处理流程

```
发生错误
    ↓
分类错误类型
    ↓
┌─────────────┬──────────────┬─────────────┐
│ 配置 (400)  │ 认证 (401)   │ 处理 (500)  │
└─────────────┴──────────────┴─────────────┘
    ↓              ↓               ↓
记录错误       记录错误        记录错误
    ↓              ↓               ↓
返回 400       返回 401        重试（如果是飞书）
                                    ↓
                               返回 500
```

## 设计决策

### 1. 无服务器架构（Cloudflare Workers）

**理由**：
- 零基础设施管理
- 全球边缘网络（低延迟）
- 自动扩展
- 成本效益高（免费套餐足够大多数用例）
- 内置 DDoS 保护

**权衡**：
- 10ms CPU 时间限制（免费套餐）
- 无持久存储（使用 KV 存储配置）
- 冷启动延迟（Workers 最小）

### 2. 事件处理器插件架构

**理由**：
- 易于添加新事件类型
- 关注点分离
- 可独立测试
- 一致的接口

**实现**：
```javascript
// handlers/events/pull-request.js
export async function handlePullRequest(event, config, logger) {
  // 事件特定逻辑
}

// handlers/github-webhook.js
const handlers = {
  pull_request: handlePullRequest,
  issues: handleIssues,  // 未来
  star: handleStar       // 未来
};
```

### 3. 配置驱动的行为

**理由**：
- 无需代码更改的灵活性
- 每个仓库的自定义
- 易于添加新仓库
- 支持不同的团队/工作流程

**配置层次结构**：
1. 全局设置（默认值）
2. 仓库特定设置
3. 环境变量覆盖

### 4. 指数退避重试逻辑

**理由**：
- 处理瞬态飞书 API 故障
- 避免压垮飞书 API
- 提高可靠性

**实现**：
```javascript
async function sendWithRetry(url, message, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(message),
        timeout: 5000
      });
      if (response.ok) return response;
    } catch (error) {
      if (i === attempts - 1) throw error;
      await sleep(Math.pow(2, i) * 1000 + Math.random() * 500);
    }
  }
}
```

### 5. 请求 ID 跟踪

**理由**：
- 跨组件跟踪请求
- 关联日志以进行调试
- 识别重复的 webhook

**实现**：
- 在请求入口生成 UUID
- 通过所有组件传递
- 包含在所有日志条目中

### 6. 恒定时间签名比较

**理由**：
- 防止时序攻击
- 安全最佳实践
- 保护 webhook 密钥

**实现**：
```javascript
function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

## 安全架构

### 1. Webhook 签名验证

- 使用共享密钥的 HMAC-SHA256
- 恒定时间比较
- 拒绝未签名的请求

### 2. 密钥管理

- 密钥存储在 Cloudflare Workers 密钥中
- 永不记录或暴露
- 支持每个仓库的密钥

### 3. 输入验证

- 验证所有 webhook 负载
- 清理用户输入
- 在发出请求之前验证 URL

### 4. 速率限制

- Cloudflare Workers 内置保护
- 每个仓库的速率限制（未来）

### 5. 错误处理

- 永不向客户端暴露内部错误
- 内部记录详细错误
- 返回通用错误消息

## 性能特征

### 延迟

- **Webhook 处理**：< 100ms（不包括飞书 API）
- **飞书 API 调用**：500-2000ms
- **总响应时间**：< 5s（包括重试）

### 吞吐量

- **免费套餐**：每天 100,000 次请求
- **付费套餐**：无限请求
- **典型负载**：每个仓库每天 10-1000 个 webhook

### 资源使用

- **内存**：每次请求 < 10MB
- **CPU**：每次请求 < 5ms（不包括网络 I/O）
- **网络**：每个 webhook < 10KB

## 可扩展性

### 水平扩展

- Cloudflare Workers 自动扩展
- 无需配置
- 全球边缘网络

### 垂直扩展

- 升级到付费套餐以获得更高的 CPU 限制
- 使用 KV 存储处理大型配置
- 为频繁访问的数据实施缓存

### 多区域

- Cloudflare Workers 在全球边缘网络上运行
- 自动路由到最近的数据中心
- 无需手动区域配置

## 监控和可观察性

### 日志记录

- 结构化 JSON 日志
- 请求 ID 跟踪
- 日志级别：debug、info、warn、error

### 指标（未来）

- Webhook 处理延迟
- 成功/失败率
- 飞书 API 响应时间
- 重试尝试分布

### 警报（未来）

- 高错误率
- 飞书 API 故障
- 配置错误
- 签名验证失败

## 可扩展性

### 添加新事件类型

1. 创建处理器：`src/handlers/events/new-event.js`
2. 实现处理器接口
3. 在分发器中注册
4. 添加配置标志
5. 更新文档

### 添加新通知渠道

1. 创建发送器：`src/handlers/senders/new-channel.js`
2. 实现发送器接口
3. 更新消息分发器
4. 添加渠道配置
5. 更新文档

### 添加新功能

- 自定义消息模板
- 条件通知（例如，仅在特定标签上通知）
- 消息线程
- 反应支持
- 用户映射（GitHub → 飞书）

## 测试策略

### 单元测试

- 配置加载和验证
- 签名验证
- 事件解析
- 消息格式化
- 重试逻辑

### 集成测试

- 端到端 webhook 处理
- 错误场景
- 基于配置的过滤

### 测试覆盖率

- 目标：> 80% 代码覆盖率
- 关注关键路径
- 模拟外部 API（GitHub、飞书）

## 部署架构

### 开发

```
本地机器
    ↓
wrangler dev
    ↓
本地 Worker (localhost:8787)
```

### 生产

```
Git 仓库
    ↓
CI/CD 管道 (GitHub Actions)
    ↓
wrangler deploy
    ↓
Cloudflare Workers (全球边缘)
```

## 未来增强

### 计划功能

1. **其他事件类型**
   - Issues
   - Stars
   - Releases
   - Commits

2. **高级过滤**
   - 基于标签的过滤
   - 基于分支的过滤
   - 基于作者的过滤

3. **消息自定义**
   - 自定义模板
   - 条件格式化
   - 富媒体支持

4. **分析**
   - Webhook 处理指标
   - 通知投递率
   - 用户参与度跟踪

5. **多渠道支持**
   - Slack 集成
   - Discord 集成
   - 电子邮件通知

### 技术债务

- 添加全面的错误恢复
- 实现请求去重
- 添加 webhook 重放功能
- 改进配置验证

## 参考资料

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [GitHub Webhooks 文档](https://docs.github.com/en/webhooks)
- [飞书机器人 API 文档](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)
- [HMAC-SHA256 规范](https://tools.ietf.org/html/rfc2104)

## 术语表

- **Cloudflare Workers**：在 Cloudflare 边缘网络上运行的无服务器计算平台
- **KV 存储**：Cloudflare 的键值存储服务
- **HMAC-SHA256**：使用 SHA-256 的基于哈希的消息认证码
- **Webhook**：用于事件通知的 HTTP 回调
- **边缘网络**：全球分布的服务器网络
- **冷启动**：无服务器函数在空闲后被调用时的初始延迟
- **指数退避**：尝试之间延迟递增的重试策略
