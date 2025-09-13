import { Context, Probot } from 'probot';
import { GitHubService } from './services/github.js';
import { DatabaseService } from './services/database.js';
import { logger } from './utils/logger.js';
import { config, validateConfig } from './config/index.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// 创建速率限制器
const rateLimiter = new RateLimiterMemory({
  points: config.security.rateLimitMax, // 每个时间窗口内的最大请求数
  duration: config.security.rateLimitWindow / 1000, // 时间窗口（秒）
});

export const issuesBot = (app: Probot) => {
  // 验证配置
  if (!validateConfig()) {
    logger.error('配置验证失败，机器人无法启动');
    process.exit(1);
  }

  const githubService = new GitHubService();
  const databaseService = new DatabaseService();

  logger.info('🤖 Issues-bot 启动成功');

  /**
   * 处理 Issue 创建事件
   */
  app.on('issues.opened', async (context) => {
    const repo = context.repo();
    const rateLimiterKey = `${repo.owner}/${repo.repo}`;

    try {
      // 速率限制检查
      await rateLimiter.consume(rateLimiterKey);

      logger.logIssue('webhook_received', context.payload.issue.number, repo.full_name, {
        action: 'opened',
        sender: context.payload.sender.login
      });

      await githubService.handleIssueOpened(context);

    } catch (rateLimitError) {
      if (rateLimitError instanceof Error) {
        logger.logError('速率限制触发', rateLimitError, {
          repository: repo.full_name,
          issueNumber: context.payload.issue.number
        });

        // 添加速率限制提醒评论
        await addRateLimitComment(context);
      } else {
        logger.logError('处理Issue开启事件失败', rateLimitError, {
          repository: repo.full_name,
          issueNumber: context.payload.issue.number
        });
      }
    }
  });

  /**
   * 处理 Issue 编辑事件
   */
  app.on('issues.edited', async (context) => {
    const repo = context.repo();
    const rateLimiterKey = `${repo.owner}/${repo.repo}`;

    try {
      // 速率限制检查
      await rateLimiter.consume(rateLimiterKey);

      const changes = context.payload.changes;
      
      // 只有标题或内容发生变化时才重新分析
      if (changes.title || changes.body) {
        logger.logIssue('webhook_received', context.payload.issue.number, repo.full_name, {
          action: 'edited',
          changes: Object.keys(changes),
          sender: context.payload.sender.login
        });

        // 添加重新分析提醒
        await addReanalysisComment(context);
        
        // 重新处理
        await githubService.handleIssueOpened(context);
      }

    } catch (rateLimitError) {
      if (rateLimitError instanceof Error) {
        logger.logError('速率限制触发', rateLimitError, {
          repository: repo.full_name,
          issueNumber: context.payload.issue.number
        });
      } else {
        logger.logError('处理Issue编辑事件失败', rateLimitError, {
          repository: repo.full_name,
          issueNumber: context.payload.issue.number
        });
      }
    }
  });

  /**
   * 处理 Issue 评论事件
   */
  app.on('issue_comment.created', async (context) => {
    const repo = context.repo();
    const rateLimiterKey = `${repo.owner}/${repo.repo}/comment`;

    try {
      // 速率限制检查（评论限制更宽松）
      await rateLimiter.consume(rateLimiterKey, 1);

      // 忽略机器人自己的评论
      if (context.payload.comment.user.type === 'Bot') {
        return;
      }

      logger.logIssue('webhook_received', context.payload.issue.number, repo.full_name, {
        action: 'comment_created',
        sender: context.payload.sender.login,
        commentId: context.payload.comment.id
      });

      await githubService.handleIssueComment(context);

    } catch (rateLimitError) {
      if (rateLimitError instanceof Error) {
        logger.logError('评论速率限制触发', rateLimitError, {
          repository: repo.full_name,
          issueNumber: context.payload.issue.number,
          commentId: context.payload.comment.id
        });
      } else {
        logger.logError('处理Issue评论事件失败', rateLimitError, {
          repository: repo.full_name,
          issueNumber: context.payload.issue.number
        });
      }
    }
  });

  /**
   * 处理 Pull Request 事件（用于跟踪自动修复PR）
   */
  app.on(['pull_request.opened', 'pull_request.closed'], async (context) => {
    try {
      const pr = context.payload.pull_request;
      const repo = context.repo();

      // 检查是否是自动修复PR
      if (pr.head.ref.startsWith('autofix/issue-')) {
        const issueNumber = parseInt(pr.head.ref.replace('autofix/issue-', ''));
        
        logger.logGitHub('autofix_pr_event', {
          action: context.payload.action,
          prNumber: pr.number,
          issueNumber,
          repository: repo.full_name,
          merged: pr.merged
        });

        // 记录PR状态到数据库
        const issueId = `${repo.full_name}#${issueNumber}`;
        await databaseService.addIssueLog(issueId, `autofix_pr_${context.payload.action}`, {
          prNumber: pr.number,
          merged: pr.merged,
          prUrl: pr.html_url
        });

        // 如果PR被合并，更新Issue状态
        if (context.payload.action === 'closed' && pr.merged) {
          await databaseService.updateIssueStatus(issueId, 'fixed');
          
          // 在原Issue中添加完成评论
          await addAutoFixCompletedComment(context, issueNumber, pr);
        }
      }
    } catch (error) {
      logger.logError('处理PR事件失败', error, {
        prNumber: context.payload.pull_request.number,
        action: context.payload.action
      });
    }
  });

  /**
   * 处理应用安装事件
   */
  app.on('installation.created', async (context) => {
    try {
      const installation = context.payload.installation;
      const repositories = context.payload.repositories || [];

      logger.logGitHub('app_installed', {
        installationId: installation.id,
        account: installation.account.login,
        repositoriesCount: repositories.length,
        repositories: repositories.map(repo => repo.full_name)
      });

      // 为每个新安装的仓库添加欢迎Issue（可选）
      for (const repo of repositories) {
        await addWelcomeIssue(context, repo);
      }

    } catch (error) {
      logger.logError('处理应用安装事件失败', error);
    }
  });

  /**
   * 全局错误处理
   */
  app.onError(async (error) => {
    logger.logError('机器人全局错误', error);
  });

  /**
   * 优雅关闭处理
   */
  process.on('SIGINT', async () => {
    logger.info('接收到关闭信号，正在优雅关闭...');
    
    try {
      await databaseService.close();
      logger.info('数据库连接已关闭');
    } catch (error) {
      logger.logError('关闭数据库连接时出错', error);
    }
    
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('接收到终止信号，正在优雅关闭...');
    
    try {
      await databaseService.close();
      logger.info('数据库连接已关闭');
    } catch (error) {
      logger.logError('关闭数据库连接时出错', error);
    }
    
    process.exit(0);
  });
};

/**
 * 添加速率限制提醒评论
 */
async function addRateLimitComment(context: Context): Promise<void> {
  try {
    const repo = context.repo();
    const issue = context.payload.issue;

    const comment = `## ⚠️ 速率限制

很抱歉，当前仓库的请求频率过高，已触发速率限制。请稍后重试。

- **限制**: ${config.security.rateLimitMax} 请求 / ${config.security.rateLimitWindow / 1000 / 60} 分钟
- **建议**: 请等待几分钟后再创建新的 Issue 或使用命令

如需紧急处理，请联系维护团队。

---
*由 Issues-bot 自动生成*`;

    await context.octokit.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issue.number,
      body: comment
    });
  } catch (error) {
    logger.logError('添加速率限制评论失败', error);
  }
}

/**
 * 添加重新分析提醒评论
 */
async function addReanalysisComment(context: Context): Promise<void> {
  try {
    const repo = context.repo();
    const issue = context.payload.issue;

    const comment = `## 🔄 重新分析中

检测到 Issue 内容已更新，正在重新分析...

---
*由 Issues-bot 自动生成*`;

    await context.octokit.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issue.number,
      body: comment
    });
  } catch (error) {
    logger.logError('添加重新分析评论失败', error);
  }
}

/**
 * 添加自动修复完成评论
 */
async function addAutoFixCompletedComment(
  context: Context, 
  issueNumber: number, 
  pr: any
): Promise<void> {
  try {
    const repo = context.repo();

    const comment = `## ✅ 自动修复已完成

自动修复 Pull Request #${pr.number} 已被合并，此 Issue 应该已经得到解决。

### 🎉 修复详情
- **PR链接**: #${pr.number}
- **合并时间**: ${new Date().toLocaleString('zh-CN')}
- **修复分支**: \`${pr.head.ref}\`

如果问题仍然存在，请重新打开此 Issue 或创建新的 Issue。

---
*由 Issues-bot 自动生成*`;

    await context.octokit.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      body: comment
    });

    // 自动关闭Issue
    await context.octokit.issues.update({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issueNumber,
      state: 'closed',
      state_reason: 'completed'
    });

  } catch (error) {
    logger.logError('添加自动修复完成评论失败', error);
  }
}

/**
 * 为新安装的仓库添加欢迎Issue
 */
async function addWelcomeIssue(context: Context, repo: any): Promise<void> {
  try {
    const welcomeTitle = '🤖 欢迎使用 Issues-bot！';
    const welcomeBody = `## 🎉 Issues-bot 已成功安装

感谢您安装 Issues-bot！这个 AI 驱动的助手将帮助您：

### ✨ 主要功能
- 🎯 自动分析和分类 Issues
- 🔧 尝试自动修复简单问题
- 💡 提供详细的解决方案和建议
- 📊 智能优先级评估
- 🏷️ 自动标签管理

### 🚀 如何使用
1. **自动处理**: 创建新 Issue 时，机器人会自动分析
2. **手动命令**: 在 Issue 评论中使用以下命令：
   - \`@issues-bot analyze\` - 重新分析 Issue
   - \`@issues-bot fix\` - 尝试自动修复
   - \`@issues-bot suggest\` - 获取解决建议
   - \`@issues-bot priority\` - 重新评估优先级

### ⚙️ 配置选项
您可以通过以下方式自定义机器人行为：
- 添加 \`duplicate\`, \`invalid\`, \`wontfix\` 标签来跳过特定 Issue
- 使用仓库 Settings > Secrets 配置自定义 AI 设置

### 📊 管理面板
访问 [管理面板](${config.server.port ? `http://localhost:${config.server.port}/dashboard` : '配置中的服务器地址'}) 查看统计信息和管理设置。

### 🤝 反馈和支持
如果您有任何问题或建议，请：
1. 查看 [使用文档](https://github.com/your-username/issues-bot)
2. 创建 Issue 报告问题
3. 联系维护团队

现在您可以创建 Issues 来测试机器人的功能了！

---
*此 Issue 由 Issues-bot 自动创建，您可以安全地关闭它。*`;

    await context.octokit.issues.create({
      owner: repo.owner.login,
      repo: repo.name,
      title: welcomeTitle,
      body: welcomeBody,
      labels: ['issues-bot:welcome', 'documentation']
    });

    logger.info(`欢迎Issue已创建: ${repo.full_name}`);

  } catch (error) {
    logger.logError('创建欢迎Issue失败', error, {
      repository: repo.full_name
    });
  }
}
