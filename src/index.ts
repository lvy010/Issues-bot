import { run } from 'probot';
import { issuesBot } from './bot.js';
import { logger } from './utils/logger.js';
import { config, validateConfig } from './config/index.js';
import createServer from './api/server.js';

// 验证配置
if (!validateConfig()) {
  logger.error('配置验证失败，服务无法启动');
  process.exit(1);
}

// 启动Web服务器
const app = createServer();
const server = app.listen(config.server.port, () => {
  logger.info(`🌐 Web服务器启动成功: http://localhost:${config.server.port}`);
  logger.info(`📊 管理面板地址: http://localhost:${config.server.port}/dashboard`);
});

// 启动GitHub机器人
logger.info('🤖 正在启动 Issues-bot...');

try {
  run(issuesBot);
  logger.info('✅ Issues-bot 启动成功');
} catch (error) {
  logger.logError('启动机器人失败', error);
  process.exit(1);
}

// 优雅关闭处理
const gracefulShutdown = (signal: string) => {
  logger.info(`接收到 ${signal} 信号，开始优雅关闭...`);
  
  server.close((err) => {
    if (err) {
      logger.logError('关闭Web服务器时出错', err);
    } else {
      logger.info('Web服务器已关闭');
    }
    
    process.exit(err ? 1 : 0);
  });
  
  // 强制退出超时
  setTimeout(() => {
    logger.error('优雅关闭超时，强制退出');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 全局未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.logError('未捕获的异常', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.logError('未处理的Promise拒绝', reason, { promise });
  process.exit(1);
});

// 显示启动信息
logger.info('🎉 Issues-bot 系统已完全启动');
logger.info('📋 功能列表:');
logger.info('   - 🎯 自动Issue分析和分类');
logger.info('   - 🔧 智能自动修复');
logger.info('   - 💡 解决方案生成');
logger.info('   - 📊 实时统计和监控');
logger.info('   - 🎨 Web管理面板');
logger.info('   - 💬 AI助手对话');
logger.info('');
logger.info('🔗 访问管理面板开始使用: http://localhost:' + config.server.port + '/dashboard');
logger.info('');
