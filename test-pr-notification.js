/**
 * 测试脚本：验证 PR 创建时的通知流程
 * 
 * 使用方法：
 * node test-pr-notification.js
 */

// 模拟 PR opened 事件
const mockPROpenedEvent = {
  action: 'opened',
  pull_request: {
    number: 123,
    title: '测试 PR：添加新功能',
    body: '这是一个测试 PR，用于验证飞书通知功能是否正常工作。',
    html_url: 'https://github.com/test-org/test-repo/pull/123',
    user: {
      login: 'test-user',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    merged: false,
    draft: false,
    requested_reviewers: [
      { login: 'reviewer1' },
      { login: 'reviewer2' },
    ],
  },
  sender: {
    login: 'test-user',
  },
  repository: {
    name: 'test-repo',
    full_name: 'test-org/test-repo',
    html_url: 'https://github.com/test-org/test-repo',
    owner: {
      login: 'test-org',
    },
  },
};

// 模拟配置
const mockConfig = {
  owner: 'test-org',
  repo: 'test-repo',
  feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-url',
  secret: 'test-secret',
  mentions: [],
  settings: {
    notify_on_pr_open: true,  // ✅ 这个设置决定是否发送通知
    notify_on_pr_merge: true,
    notify_on_pr_close: false,
    notify_on_pr_review: true,
  },
  global_settings: {
    log_level: 'info',
    retry_attempts: 3,
    timeout_ms: 5000,
  },
};

// 模拟 Logger
const mockLogger = {
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
};

console.log('='.repeat(60));
console.log('测试 PR 创建通知流程');
console.log('='.repeat(60));

// 导入处理器（需要在 Node.js 环境中运行）
import('./src/handlers/events/pull-request.js').then(async (module) => {
  const { handlePullRequestEvent, DEFAULT_SETTINGS } = module;

  console.log('\n1️⃣ 默认配置：');
  console.log(JSON.stringify(DEFAULT_SETTINGS, null, 2));

  console.log('\n2️⃣ 当前仓库配置：');
  console.log(JSON.stringify(mockConfig.settings, null, 2));

  console.log('\n3️⃣ 处理 PR opened 事件...\n');

  try {
    const result = await handlePullRequestEvent(
      mockPROpenedEvent,
      mockConfig,
      mockLogger
    );

    console.log('\n4️⃣ 处理结果：');
    console.log(`   - 是否发送通知: ${result.shouldNotify ? '✅ 是' : '❌ 否'}`);
    
    if (result.message) {
      console.log(`   - 消息类型: ${result.message.type}`);
      console.log(`   - 动作: ${result.message.action}`);
      console.log(`   - PR 标题: ${result.message.title}`);
      console.log(`   - PR 编号: #${result.message.metadata.prNumber}`);
      console.log(`   - 作者: ${result.message.actor}`);
      console.log(`   - 审查者: ${result.message.metadata.reviewers.join(', ') || '无'}`);
    }

    console.log('\n5️⃣ 飞书消息卡片预览：');
    
    // 导入飞书发送器
    const feishuModule = await import('./src/handlers/feishu-sender.js');
    const { buildFeishuMessageCard } = feishuModule;
    
    if (result.message) {
      const card = buildFeishuMessageCard(result.message);
      console.log(JSON.stringify(card, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成！');
    console.log('='.repeat(60));
    
    if (result.shouldNotify) {
      console.log('\n✨ 结论：当有人创建 PR 时，会成功发送飞书消息！');
      console.log('\n📝 确保以下配置正确：');
      console.log('   1. config/repositories.json 中 notify_on_pr_open: true');
      console.log('   2. feishu_webhook 填写正确的飞书群机器人 URL');
      console.log('   3. GitHub webhook 配置正确（URL、Secret、事件类型）');
    } else {
      console.log('\n⚠️  当前配置不会发送通知，请检查 notify_on_pr_open 设置');
    }

  } catch (error) {
    console.error('\n❌ 测试失败：', error.message);
    console.error(error.stack);
  }
}).catch(error => {
  console.error('❌ 无法加载模块：', error.message);
  console.log('\n💡 提示：请确保在项目根目录运行此脚本');
});
