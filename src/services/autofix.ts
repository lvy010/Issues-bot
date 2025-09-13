import { Context } from 'probot';
import { 
  AutoFixSuggestion, 
  IssueAnalysis, 
  GitHubIssue,
  FileChange
} from '@/types/index.js';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

export class AutoFixService {
  /**
   * 应用自动修复建议
   */
  async applyAutoFix(
    context: Context,
    issue: GitHubIssue,
    autoFix: AutoFixSuggestion,
    analysis: IssueAnalysis
  ): Promise<boolean> {
    try {
      logger.logAI('开始应用自动修复', {
        issueNumber: issue.number,
        type: autoFix.type,
        riskLevel: autoFix.riskLevel,
        confidence: autoFix.confidence
      });

      // 验证修复建议的安全性
      if (!this.isAutoFixSafe(autoFix, analysis)) {
        logger.warn(`Issue #${issue.number} 自动修复被安全检查拦截`);
        return false;
      }

      const repo = context.repo();
      
      // 创建新分支
      const branchName = `autofix/issue-${issue.number}`;
      const baseBranch = await this.getDefaultBranch(context);
      
      try {
        await this.createBranch(context, branchName, baseBranch);
      } catch (error) {
        // 分支可能已存在，尝试更新
        logger.info(`分支 ${branchName} 已存在，将更新现有分支`);
      }

      // 应用文件变更
      const changedFiles: string[] = [];
      for (const fileChange of autoFix.files) {
        const success = await this.applyFileChange(context, fileChange, branchName);
        if (success) {
          changedFiles.push(fileChange.path);
        }
      }

      if (changedFiles.length === 0) {
        logger.warn(`Issue #${issue.number} 没有文件被成功修改`);
        return false;
      }

      // 创建Pull Request
      const prTitle = `🤖 Auto-fix for Issue #${issue.number}: ${issue.title}`;
      const prBody = this.generatePRDescription(issue, autoFix, analysis, changedFiles);

      const { data: pullRequest } = await context.octokit.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        title: prTitle,
        body: prBody,
        head: branchName,
        base: baseBranch,
      });

      // 添加标签和评论
      await this.addPRLabels(context, pullRequest.number, autoFix);
      await this.addIssueComment(context, issue, pullRequest, autoFix);

      logger.logSuccess('自动修复PR创建成功', {
        issueNumber: issue.number,
        prNumber: pullRequest.number,
        changedFiles: changedFiles.length
      });

      return true;
    } catch (error) {
      logger.logError('应用自动修复失败', error, {
        issueNumber: issue.number,
        type: autoFix.type
      });
      return false;
    }
  }

  /**
   * 验证自动修复的安全性
   */
  private isAutoFixSafe(autoFix: AutoFixSuggestion, analysis: IssueAnalysis): boolean {
    // 置信度检查
    if (autoFix.confidence < config.ai.confidenceThreshold) {
      logger.warn('自动修复置信度不足', { confidence: autoFix.confidence });
      return false;
    }

    // 风险等级检查
    if (autoFix.riskLevel === 'high') {
      logger.warn('自动修复风险等级过高');
      return false;
    }

    // 复杂度检查（基于文件变更数量）
    if (autoFix.files.length > config.ai.maxAutoFixComplexity) {
      logger.warn('自动修复复杂度过高', { filesCount: autoFix.files.length });
      return false;
    }

    // 检查是否修改关键文件
    const criticalFiles = [
      'package.json', 'package-lock.json', 'yarn.lock',
      'Dockerfile', 'docker-compose.yml',
      '.env', '.env.local', '.env.production',
      'nginx.conf', 'apache.conf'
    ];

    const hasCriticalFiles = autoFix.files.some(file => 
      criticalFiles.some(critical => file.path.endsWith(critical))
    );

    if (hasCriticalFiles && autoFix.riskLevel !== 'low') {
      logger.warn('自动修复涉及关键文件，风险过高');
      return false;
    }

    // 检查是否包含危险操作
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /sudo/i,
      /chmod\s+777/i,
      /password/i,
      /secret/i,
      /api[_-]?key/i,
      /private[_-]?key/i
    ];

    const hasDangerousContent = autoFix.files.some(file => 
      file.content && dangerousPatterns.some(pattern => pattern.test(file.content!))
    );

    if (hasDangerousContent) {
      logger.warn('自动修复包含危险内容');
      return false;
    }

    return true;
  }

  /**
   * 获取默认分支
   */
  private async getDefaultBranch(context: Context): Promise<string> {
    const repo = context.repo();
    const { data: repository } = await context.octokit.repos.get({
      owner: repo.owner,
      repo: repo.repo,
    });
    return repository.default_branch;
  }

  /**
   * 创建新分支
   */
  private async createBranch(context: Context, branchName: string, baseBranch: string): Promise<void> {
    const repo = context.repo();
    
    // 获取基础分支的最新commit
    const { data: baseRef } = await context.octokit.git.getRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: `heads/${baseBranch}`,
    });

    // 创建新分支
    await context.octokit.git.createRef({
      owner: repo.owner,
      repo: repo.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    });

    logger.info(`分支 ${branchName} 创建成功`);
  }

  /**
   * 应用文件变更
   */
  private async applyFileChange(
    context: Context, 
    fileChange: AutoFixSuggestion['files'][0], 
    branchName: string
  ): Promise<boolean> {
    try {
      const repo = context.repo();

      if (fileChange.action === 'create') {
        // 创建新文件
        await context.octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.repo,
          path: fileChange.path,
          message: `🤖 Auto-create: ${fileChange.path}`,
          content: Buffer.from(fileChange.content || '').toString('base64'),
          branch: branchName,
        });

        logger.info(`文件创建成功: ${fileChange.path}`);
        return true;

      } else if (fileChange.action === 'update') {
        // 获取现有文件
        let existingFile;
        try {
          const { data } = await context.octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            path: fileChange.path,
            ref: branchName,
          });
          existingFile = data as any;
        } catch (error) {
          logger.warn(`文件不存在，将创建新文件: ${fileChange.path}`);
          return this.applyFileChange(context, { ...fileChange, action: 'create' }, branchName);
        }

        // 更新文件内容
        let newContent = fileChange.content;
        
        if (fileChange.changes && fileChange.changes.length > 0) {
          // 应用细粒度变更
          const originalContent = Buffer.from(existingFile.content, 'base64').toString('utf8');
          newContent = this.applyFileChanges(originalContent, fileChange.changes);
        }

        await context.octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.repo,
          path: fileChange.path,
          message: `🤖 Auto-update: ${fileChange.path}`,
          content: Buffer.from(newContent || '').toString('base64'),
          branch: branchName,
          sha: existingFile.sha,
        });

        logger.info(`文件更新成功: ${fileChange.path}`);
        return true;

      } else if (fileChange.action === 'delete') {
        // 删除文件
        const { data: existingFile } = await context.octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.repo,
          path: fileChange.path,
          ref: branchName,
        }) as any;

        await context.octokit.repos.deleteFile({
          owner: repo.owner,
          repo: repo.repo,
          path: fileChange.path,
          message: `🤖 Auto-delete: ${fileChange.path}`,
          branch: branchName,
          sha: existingFile.sha,
        });

        logger.info(`文件删除成功: ${fileChange.path}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.logError(`应用文件变更失败: ${fileChange.path}`, error);
      return false;
    }
  }

  /**
   * 应用细粒度文件变更
   */
  private applyFileChanges(originalContent: string, changes: FileChange[]): string {
    const lines = originalContent.split('\n');
    
    // 按行号倒序排序，避免行号偏移问题
    const sortedChanges = changes.sort((a, b) => b.lineNumber - a.lineNumber);

    for (const change of sortedChanges) {
      const lineIndex = change.lineNumber - 1; // 转换为0基础索引

      if (change.type === 'add') {
        lines.splice(lineIndex, 0, change.content);
      } else if (change.type === 'remove') {
        if (lineIndex >= 0 && lineIndex < lines.length) {
          lines.splice(lineIndex, 1);
        }
      } else if (change.type === 'replace') {
        if (lineIndex >= 0 && lineIndex < lines.length) {
          lines[lineIndex] = change.content;
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成PR描述
   */
  private generatePRDescription(
    issue: GitHubIssue,
    autoFix: AutoFixSuggestion,
    analysis: IssueAnalysis,
    changedFiles: string[]
  ): string {
    return `
## 🤖 自动修复

这是一个由 AI 生成的自动修复 PR，用于解决 Issue #${issue.number}。

### 📋 Issue 信息
- **标题**: ${issue.title}
- **类型**: ${analysis.type}
- **严重程度**: ${analysis.severity}
- **优先级**: ${analysis.priority}

### 🔧 修复内容
${autoFix.description}

### 📁 变更文件
${changedFiles.map(file => `- \`${file}\``).join('\n')}

### ⚡ 修复类型
- **类型**: ${autoFix.type}
- **风险等级**: ${autoFix.riskLevel}
- **置信度**: ${(autoFix.confidence * 100).toFixed(1)}%
- **需要测试**: ${autoFix.testRequired ? '是' : '否'}

### 🧪 测试建议
${autoFix.testRequired ? `
在合并此 PR 之前，请确保：
1. 运行现有的测试套件
2. 手动验证修复是否解决了报告的问题
3. 检查是否有任何副作用或回归问题
` : '此修复风险较低，但仍建议进行基本的功能验证。'}

### 📝 命令执行
${autoFix.commands && autoFix.commands.length > 0 ? `
需要执行以下命令：
\`\`\`bash
${autoFix.commands.join('\n')}
\`\`\`
` : '无需执行额外命令。'}

---
*此 PR 由 Issues-bot 自动生成。如有疑问，请联系维护团队。*

Fixes #${issue.number}
`;
  }

  /**
   * 为PR添加标签
   */
  private async addPRLabels(context: Context, prNumber: number, autoFix: AutoFixSuggestion): Promise<void> {
    try {
      const labels = ['auto-fix', `risk-${autoFix.riskLevel}`];
      
      if (autoFix.testRequired) {
        labels.push('needs-testing');
      }

      // 根据修复类型添加特定标签
      switch (autoFix.type) {
        case 'code_change':
          labels.push('code-change');
          break;
        case 'config_change':
          labels.push('configuration');
          break;
        case 'dependency_update':
          labels.push('dependencies');
          break;
        case 'documentation':
          labels.push('documentation');
          break;
      }

      const repo = context.repo();
      await context.octokit.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: prNumber,
        labels,
      });

      logger.info(`PR #${prNumber} 标签添加成功:`, labels);
    } catch (error) {
      logger.logError('添加PR标签失败', error, { prNumber });
    }
  }

  /**
   * 在原Issue中添加评论
   */
  private async addIssueComment(
    context: Context,
    issue: GitHubIssue,
    pullRequest: any,
    autoFix: AutoFixSuggestion
  ): Promise<void> {
    try {
      const comment = `
## 🤖 自动修复已创建

我已经分析了这个 Issue 并创建了一个自动修复的 Pull Request：

**🔗 Pull Request**: #${pullRequest.number}

### 📊 修复信息
- **类型**: ${autoFix.type}
- **风险等级**: ${autoFix.riskLevel}
- **置信度**: ${(autoFix.confidence * 100).toFixed(1)}%
- **文件变更**: ${autoFix.files.length} 个文件

### 📝 描述
${autoFix.description}

### 👀 下一步
请审查 Pull Request 中的变更，如果一切看起来正确，您可以合并它来解决这个问题。

${autoFix.testRequired ? '⚠️ **注意**: 此修复需要测试验证，请在合并前运行相关测试。' : ''}

---
*由 Issues-bot 自动生成*
`;

      const repo = context.repo();
      await context.octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        body: comment,
      });

      logger.info(`Issue #${issue.number} 自动修复评论添加成功`);
    } catch (error) {
      logger.logError('添加Issue评论失败', error, { issueNumber: issue.number });
    }
  }
}
