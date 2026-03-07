# Architecture Overview

This document provides a comprehensive overview of the GitHub Feishu Bot system architecture, design decisions, and implementation details.

## System Overview

The GitHub Feishu Bot is a serverless application built on Cloudflare Workers that acts as a bridge between GitHub repositories and Feishu messaging groups. It receives webhook events from GitHub, validates them, processes them according to repository-specific configurations, and sends formatted notifications to Feishu.

## High-Level Architecture

```
┌─────────────────┐
│ GitHub          │
│ Repository      │
└────────┬────────┘
         │ Webhook Event
         │ (HTTPS POST)
         ▼
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Workers (Edge Network)                       │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ HTTP Router (index.js)                         │    │
│  │  • POST /webhook                               │    │
│  │  • GET /health                                 │    │
│  │  • GET /                                       │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ GitHub Webhook Handler                         │    │
│  │  • Signature Verification (HMAC-SHA256)        │    │
│  │  • Event Type Detection                        │    │
│  │  • Configuration Lookup                        │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ Event Handler Dispatcher                       │    │
│  │  • Pull Request Handler                        │    │
│  │  • Issues Handler                              │    │
│  │  • Star Handler                                │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ Message Formatter                              │    │
│  │  • Feishu Card Construction                    │    │
│  │  • Mention/At Handling                         │    │
│  │  • Link Generation                             │    │
│  └──────────────┬─────────────────────────────────┘    │
│                 │                                        │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ Feishu Sender                                  │    │
│  │  • HTTP POST to Feishu API                     │    │
│  │  • Retry Logic (Exponential Backoff)          │    │
│  │  • Error Handling                              │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Supporting Services                            │    │
│  │  • Configuration Manager                       │    │
│  │  • Logger (Request ID Tracking)                │    │
│  │  • Validator                                   │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────────────┘
                  │ Formatted Message
                  │ (HTTPS POST)
                  ▼
         ┌─────────────────┐
         │ Feishu Group    │
         └─────────────────┘
```

## Component Architecture

### 1. Entry Point (src/index.js)

**Responsibility**: HTTP request handling and routing

**Key Functions**:
- Request lifecycle management
- Route dispatching
- Request ID generation
- Global error handling
- Response formatting

**Flow**:
```javascript
Request → Generate Request ID → Route to Handler → Format Response → Return
```

**Endpoints**:
- `POST /webhook`: GitHub webhook receiver
- `GET /health`: Health check (returns 200 OK)
- `GET /`: Root info endpoint

### 2. Configuration Manager (src/config.js)

**Responsibility**: Configuration loading, validation, and lookup

**Key Functions**:
- Load configuration from file or KV storage
- Validate configuration structure
- Repository lookup by owner/repo
- Environment variable override support

**Configuration Sources**:
1. **File-based**: Reads from JSON file specified in `CONFIG_PATH`
2. **KV-based**: Reads from Cloudflare KV namespace

**Validation Rules**:
- Required fields: owner, repo, events, feishu_webhook, secret
- Valid event types
- Valid URL formats
- Valid JSON structure

### 3. GitHub Webhook Handler (src/handlers/github-webhook.js)

**Responsibility**: Webhook validation and event processing orchestration

**Key Functions**:
- HMAC-SHA256 signature verification
- Event type detection
- Configuration lookup
- Event handler delegation
- Error handling

**Security**:
- Constant-time signature comparison (prevents timing attacks)
- Signature verification before any processing
- 401 response for invalid signatures

**Flow**:
```
Webhook Request
    ↓
Extract Signature Header
    ↓
Compute HMAC-SHA256
    ↓
Compare Signatures (constant-time)
    ↓
[Valid] → Lookup Configuration → Dispatch to Event Handler
[Invalid] → Return 401
```

### 4. Event Handlers (src/handlers/events/)

**Responsibility**: Event-specific processing and message generation

**Current Handlers**:
- `pull-request.js`: Pull request lifecycle events
- `issues.js`: Issue lifecycle events
- `star.js`: Star events

**Handler Interface**:
```javascript
async function handleEvent(event, config, logger) {
  // Returns: { shouldNotify: boolean, message: object }
}
```

**Pull Request Handler Actions**:
- `opened`: New PR created
- `closed` (merged): PR merged
- `closed` (not merged): PR closed without merge
- `reopened`: PR reopened
- `review_requested`: Review requested

**Configuration Flags**:
- `notify_on_pr_open`
- `notify_on_pr_merge`
- `notify_on_pr_close`
- `notify_on_pr_review`

### 5. Feishu Message Sender (src/handlers/feishu-sender.js)

**Responsibility**: Message formatting and delivery to Feishu

**Key Functions**:
- Feishu interactive card construction
- HTTP POST to Feishu webhook
- Retry logic with exponential backoff
- Timeout handling
- Error logging

**Message Card Structure**:
```json
{
  "msg_type": "interactive",
  "card": {
    "config": { "wide_screen_mode": true },
    "elements": [
      {
        "tag": "div",
        "text": {
          "content": "**[PR] Repository**\nTitle",
          "tag": "lark_md"
        }
      },
      {
        "tag": "div",
        "text": {
          "content": "**Author:** @user\n**Status:** Open",
          "tag": "lark_md"
        }
      },
      {
        "tag": "action",
        "actions": [{
          "type": "button",
          "text": { "content": "View on GitHub" },
          "url": "https://github.com/..."
        }]
      }
    ]
  }
}
```

**Retry Strategy**:
- Trigger: 5xx responses or network timeouts
- Attempts: Configurable (default: 3)
- Backoff: Exponential with jitter
  - Attempt 1: Immediate
  - Attempt 2: 1s + random(0-500ms)
  - Attempt 3: 2s + random(0-500ms)
- Timeout: Configurable (default: 5000ms)

### 6. Utilities

#### Logger (src/utils/logger.js)

**Responsibility**: Structured logging with request tracking

**Features**:
- Request ID tracking
- Log level filtering (debug, info, warn, error)
- Structured log output
- Context enrichment

**Log Format**:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "requestId": "req_abc123",
  "message": "Processing webhook event",
  "context": {
    "repository": "org/repo",
    "eventType": "pull_request"
  }
}
```

#### Validator (src/utils/validator.js)

**Responsibility**: Input validation and signature verification

**Functions**:
- HMAC-SHA256 signature computation
- Constant-time signature comparison
- Input validation helpers

#### Constants (src/constants.js)

**Responsibility**: System-wide constants

**Includes**:
- HTTP status codes
- Error messages
- Log levels
- Event types

## Data Flow

### Successful Webhook Processing

```
1. GitHub sends webhook → POST /webhook
2. Worker generates request ID
3. Extract signature from X-Hub-Signature-256 header
4. Load configuration for repository
5. Compute HMAC-SHA256 signature
6. Compare signatures (constant-time)
7. Parse event type and action
8. Dispatch to event handler (e.g., pull-request.js)
9. Check configuration flags (e.g., notify_on_pr_open)
10. Generate message object
11. Format Feishu card
12. POST to Feishu webhook
13. [If fails] Retry with exponential backoff
14. Return 200 OK to GitHub
```

### Error Handling Flow

```
Error Occurs
    ↓
Classify Error Type
    ↓
┌─────────────┬──────────────┬─────────────┐
│ Config (400)│ Auth (401)   │ Process (500)│
└─────────────┴──────────────┴─────────────┘
    ↓              ↓               ↓
Log Error      Log Error       Log Error
    ↓              ↓               ↓
Return 400     Return 401      Retry (if Feishu)
                                    ↓
                               Return 500
```

## Design Decisions

### 1. Serverless Architecture (Cloudflare Workers)

**Rationale**:
- Zero infrastructure management
- Global edge network (low latency)
- Automatic scaling
- Cost-effective (free tier sufficient for most use cases)
- Built-in DDoS protection

**Trade-offs**:
- 10ms CPU time limit (free tier)
- No persistent storage (use KV for configuration)
- Cold start latency (minimal with Workers)

### 2. Event Handler Plugin Architecture

**Rationale**:
- Easy to add new event types
- Separation of concerns
- Testable in isolation
- Consistent interface

**Implementation**:
```javascript
// handlers/events/pull-request.js
export async function handlePullRequest(event, config, logger) {
  // Event-specific logic
}

// handlers/github-webhook.js
const handlers = {
  pull_request: handlePullRequest,
  issues: handleIssues,
  star: handleStar
};
```

### 3. Configuration-Driven Behavior

**Rationale**:
- Flexibility without code changes
- Per-repository customization
- Easy to add new repositories
- Support for different teams/workflows

**Configuration Hierarchy**:
1. Global settings (defaults)
2. Repository-specific settings
3. Environment variable overrides

### 4. Retry Logic with Exponential Backoff

**Rationale**:
- Handle transient Feishu API failures
- Avoid overwhelming Feishu API
- Improve reliability

**Implementation**:
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

### 5. Request ID Tracking

**Rationale**:
- Trace requests across components
- Correlate logs for debugging
- Identify duplicate webhooks

**Implementation**:
- Generate UUID on request entry
- Pass through all components
- Include in all log entries

### 6. Constant-Time Signature Comparison

**Rationale**:
- Prevent timing attacks
- Security best practice
- Protect webhook secrets

**Implementation**:
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

## Security Architecture

### 1. Webhook Signature Verification

- HMAC-SHA256 with shared secret
- Constant-time comparison
- Reject unsigned requests

### 2. Secret Management

- Secrets stored in Cloudflare Workers secrets
- Never logged or exposed
- Per-repository secrets supported

### 3. Input Validation

- Validate all webhook payloads
- Sanitize user input
- Validate URLs before making requests

### 4. Rate Limiting

- Cloudflare Workers built-in protection
- Per-repository rate limiting (future)

### 5. Error Handling

- Never expose internal errors to clients
- Log detailed errors internally
- Return generic error messages

## Performance Characteristics

### Latency

- **Webhook Processing**: < 100ms (excluding Feishu API)
- **Feishu API Call**: 500-2000ms
- **Total Response Time**: < 5s (with retries)

### Throughput

- **Free Tier**: 100,000 requests/day
- **Paid Tier**: Unlimited requests
- **Typical Load**: 10-1000 webhooks/day per repository

### Resource Usage

- **Memory**: < 10MB per request
- **CPU**: < 5ms per request (excluding network I/O)
- **Network**: < 10KB per webhook

## Scalability

### Horizontal Scaling

- Cloudflare Workers automatically scale
- No configuration needed
- Global edge network

### Vertical Scaling

- Upgrade to paid tier for higher CPU limits
- Use KV storage for large configurations
- Implement caching for frequently accessed data

### Multi-Region

- Cloudflare Workers run on global edge network
- Automatic routing to nearest data center
- No manual region configuration

## Monitoring and Observability

### Logging

- Structured JSON logs
- Request ID tracking
- Log levels: debug, info, warn, error

### Metrics (Future)

- Webhook processing latency
- Success/failure rates
- Feishu API response times
- Retry attempt distribution

### Alerting (Future)

- High error rates
- Feishu API failures
- Configuration errors
- Signature verification failures

## Extensibility

### Adding New Event Types

1. Create handler: `src/handlers/events/new-event.js`
2. Implement handler interface
3. Register in dispatcher
4. Add configuration flags
5. Update documentation

### Adding New Notification Channels

1. Create sender: `src/handlers/senders/new-channel.js`
2. Implement sender interface
3. Update message dispatcher
4. Add channel configuration
5. Update documentation

### Adding New Features

- Custom message templates
- Conditional notifications (e.g., only notify on specific labels)
- Message threading
- Reaction support
- User mapping (GitHub → Feishu)

## Testing Strategy

### Unit Tests

- Configuration loading and validation
- Signature verification
- Event parsing
- Message formatting
- Retry logic

### Integration Tests

- End-to-end webhook processing
- Error scenarios
- Configuration-based filtering

### Test Coverage

- Target: > 80% code coverage
- Focus on critical paths
- Mock external APIs (GitHub, Feishu)

## Deployment Architecture

### Development

```
Local Machine
    ↓
wrangler dev
    ↓
Local Worker (localhost:8787)
```

### Production

```
Git Repository
    ↓
CI/CD Pipeline (GitHub Actions)
    ↓
wrangler deploy
    ↓
Cloudflare Workers (Global Edge)
```

## Future Enhancements

### Planned Features

1. **Additional Event Types**
   - Releases
   - Push
   - Commits

2. **Advanced Filtering**
   - Label-based filtering
   - Branch-based filtering
   - Author-based filtering

3. **Message Customization**
   - Custom templates
   - Conditional formatting
   - Rich media support

4. **Analytics**
   - Webhook processing metrics
   - Notification delivery rates
   - User engagement tracking

5. **Multi-Channel Support**
   - Slack integration
   - Discord integration
   - Email notifications

### Technical Debt

- Add comprehensive error recovery
- Implement request deduplication
- Add webhook replay functionality
- Improve configuration validation

## References

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [GitHub Webhooks Documentation](https://docs.github.com/en/webhooks)
- [Feishu Bot API Documentation](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)
- [HMAC-SHA256 Specification](https://tools.ietf.org/html/rfc2104)

## Glossary

- **Cloudflare Workers**: Serverless computing platform running on Cloudflare's edge network
- **KV Storage**: Cloudflare's key-value storage service
- **HMAC-SHA256**: Hash-based message authentication code using SHA-256
- **Webhook**: HTTP callback for event notifications
- **Edge Network**: Globally distributed network of servers
- **Cold Start**: Initial latency when a serverless function is invoked after being idle
- **Exponential Backoff**: Retry strategy with increasing delays between attempts
