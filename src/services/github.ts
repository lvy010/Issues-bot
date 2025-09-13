import { Context } from 'probot';
import { minimatch } from 'minimatch';
import { 
  GitHubIssue, 
  GitHubRepository,
  IssueAnalysis,
  IssueSolution,
  AutoFixSuggestion
} from '@/types/index.js';
import { AIService } from './ai.js';
import { AutoFixService } from './autofix.js';
import { DatabaseService } from './database.js';
import { logger } from '@/utils/logger.js';
import { defaultBotConfig } from '@/config/index.js';

export class GitHubService {
  private aiService: AIService;
  private autoFixService: AutoFixService;
  private databaseService: DatabaseService;

  constructor() {
    this.aiService = new AIService();
    this.autoFixService = new AutoFixService();
    this.databaseService = new DatabaseService();
  }

  /**
   * 处理新创建的Issue
   */
  async handleIssueOpened(context: Context): Promise<void> {
    try {
      const issue = context.payload.issue as GitHubIssue;
      const repository = context.payload.repository as GitHubRepository;

      logger.logIssue('opened', issue.number, repository.full_name, {
        title: issue.title,
        labels: issue.labels.map(l => l.name)
      });

      // 检查是否应该处理此Issue
      if (!this.shouldProcessIssue(issue)) {
        logger.info(`跳过处理 Issue #${issue.number}: 不符合处理条件`);
        return;
      }

      // 添加处理中的标签
      await this.addProcessingLabel(context, issue);

      // 分析Issue
      const analysis = await this.analyzeIssue(context, issue, repository);
      
      // 保存到数据库
      await this.saveIssueRecord(issue, repository, analysis);

      // 添加分析结果标签
      await this.addAnalysisLabels(context, issue, analysis);

      // 尝试生成解决方案
      const solution = await this.generateSolution(context, issue, analysis);

      // 添加分析结果评论
      await this.addAnalysisComment(context, issue, analysis, solution);

      // 如果可以自动修复，尝试应用修复
      if (analysis.autoFixable && defaultBotConfig.autoFixEnabled) {
        await this.attemptAutoFix(context, issue, analysis, solution);
      }

      logger.logSuccess('Issue处理完成', {
        issueNumber: issue.number,
        type: analysis.type,
        autoFixable: analysis.autoFixable
      });

    } catch (error) {
      logger.logError('处理Issue失败', error, {
        issueNumber: context.payload.issue?.number,
        repository: context.payload.repository?.full_name
      });

      // 添加错误评论
      await this.addErrorComment(context, error);
    }
  }

  /**
   * 处理Issue评论
   */
  async handleIssueComment(context: Context): Promise<void> {
    try {
      const comment = context.payload.comment;
      const issue = context.payload.issue as GitHubIssue;
      const repository = context.payload.repository as GitHubRepository;

      // 检查是否是机器人命令
      const command = this.parseCommand(comment.body);
      if (!command) {
        return;
      }

      logger.logIssue('command', issue.number, repository.full_name, {
        command: command.action,
        user: comment.user.login
      });

      await this.handleCommand(context, command, issue, repository);

    } catch (error) {
      logger.logError('处理Issue评论失败', error, {
        issueNumber: context.payload.issue?.number,
        commentId: context.payload.comment?.id
      });
    }
  }

  /**
   * 检查是否应该处理此Issue
   */
  private shouldProcessIssue(issue: GitHubIssue): boolean {
    // 检查是否包含跳过标签
    const hasSkipLabel = issue.labels.some(label => 
      defaultBotConfig.skipLabels.includes(label.name.toLowerCase())
    );

    if (hasSkipLabel) {
      return false;
    }

    // 检查Issue状态
    if (issue.state !== 'open') {
      return false;
    }

    // 检查是否已经被处理过
    const hasProcessedLabel = issue.labels.some(label => 
      ['issues-bot:analyzed', 'issues-bot:processing'].includes(label.name)
    );

    return !hasProcessedLabel;
  }

  /**
   * 分析Issue
   */
  private async analyzeIssue(
    context: Context,
    issue: GitHubIssue,
    repository: GitHubRepository
  ): Promise<IssueAnalysis> {
    try {
      logger.logAI('开始分析Issue', { issueNumber: issue.number });

      const analysis = await this.aiService.analyzeIssue(issue, repository);

      logger.logAI('Issue分析完成', {
        issueNumber: issue.number,
        type: analysis.type,
        severity: analysis.severity,
        confidence: analysis.confidence
      });

      return analysis;
    } catch (error) {
      logger.logError('Issue分析失败', error, { issueNumber: issue.number });
      throw error;
    }
  }

  /**
   * 生成解决方案
   */
  private async generateSolution(
    context: Context,
    issue: GitHubIssue,
    analysis: IssueAnalysis
  ): Promise<IssueSolution | undefined> {
    try {
      // 获取代码库上下文
      const codebaseContext = await this.getCodebaseContext(context, analysis);
      
      const solution = await this.aiService.generateSolution(issue, analysis, codebaseContext);
      
      // 更新数据库记录
      const issueId = this.generateIssueId(issue, context.payload.repository);
      const existingRecord = await this.databaseService.getIssueRecord(issueId);
      
      if (existingRecord) {
        await this.databaseService.saveIssueRecord({
          ...existingRecord,
          solution
        });
      }

      return solution;
    } catch (error) {
      logger.logError('生成解决方案失败', error, { issueNumber: issue.number });
      return undefined;
    }
  }

  /**
   * 尝试自动修复
   */
  private async attemptAutoFix(
    context: Context,
    issue: GitHubIssue,
    analysis: IssueAnalysis,
    solution?: IssueSolution
  ): Promise<void> {
    try {
      logger.logAI('开始尝试自动修复', { issueNumber: issue.number });

      const codebaseContext = await this.getCodebaseContext(context, analysis);
      const autoFix = await this.aiService.generateAutoFix(issue, analysis, codebaseContext);

      if (!autoFix) {
        logger.info(`Issue #${issue.number} 无法生成自动修复方案`);
        return;
      }

      const success = await this.autoFixService.applyAutoFix(context, issue, autoFix, analysis);

      // 记录自动修复尝试
      const issueId = this.generateIssueId(issue, context.payload.repository);
      await this.databaseService.recordAutoFixAttempt(issueId, success);
      await this.databaseService.addIssueLog(issueId, 'auto_fix_attempted', {
        success,
        autoFix: autoFix
      });

      if (success) {
        logger.logSuccess('自动修复应用成功', { issueNumber: issue.number });
      } else {
        logger.warn(`Issue #${issue.number} 自动修复应用失败`);
      }

    } catch (error) {
      logger.logError('自动修复尝试失败', error, { issueNumber: issue.number });
    }
  }

  /**
   * 获取代码库上下文
   */
  private async getCodebaseContext(
    context: Context,
    analysis: IssueAnalysis
  ): Promise<string> {
    try {
      const repo = context.repo();
      let contextInfo = '';

      // 获取仓库基本信息
      const { data: repository } = await context.octokit.repos.get({
        owner: repo.owner,
        repo: repo.repo,
      });

      contextInfo += `仓库信息:
- 名称: ${repository.full_name}
- 语言: ${repository.language || '未知'}
- 描述: ${repository.description || '无描述'}
- 星标: ${repository.stargazers_count}
- 分支: ${repository.default_branch}
`;

      // 如果分析结果包含相关文件，获取文件内容
      if (analysis.relatedFiles && analysis.relatedFiles.length > 0) {
        contextInfo += '\n相关文件内容:\n';
        
        for (const filePath of analysis.relatedFiles.slice(0, 3)) { // 限制最多3个文件
          try {
            const { data: fileContent } = await context.octokit.repos.getContent({
              owner: repo.owner,
              repo: repo.repo,
              path: filePath,
            }) as any;

            if (fileContent.content) {
              const content = Buffer.from(fileContent.content, 'base64').toString('utf8');
              contextInfo += `\n--- ${filePath} ---\n${content.slice(0, 1000)}\n`;
            }
          } catch (error) {
            logger.warn(`获取文件内容失败: ${filePath}`, error);
          }
        }
      }

      // 获取package.json信息（如果存在）
      try {
        const { data: packageJson } = await context.octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.repo,
          path: 'package.json',
        }) as any;

        if (packageJson.content) {
          const content = Buffer.from(packageJson.content, 'base64').toString('utf8');
          const pkg = JSON.parse(content);
          contextInfo += `\n项目依赖信息:\n- 依赖数量: ${Object.keys(pkg.dependencies || {}).length}\n`;
          contextInfo += `- 开发依赖数量: ${Object.keys(pkg.devDependencies || {}).length}\n`;
        }
      } catch (error) {
        // package.json 不存在或读取失败，忽略
      }

      return contextInfo;
    } catch (error) {
      logger.logError('获取代码库上下文失败', error);
      return '无法获取代码库上下文信息';
    }
  }

  /**
   * 保存Issue记录到数据库
   */
  private async saveIssueRecord(
    issue: GitHubIssue,
    repository: GitHubRepository,
    analysis: IssueAnalysis,
    solution?: IssueSolution
  ): Promise<void> {
    const issueRecord = {
      id: this.generateIssueId(issue, repository),
      issueNumber: issue.number,
      repositoryId: repository.id.toString(),
      repositoryName: repository.full_name,
      title: issue.title,
      body: issue.body,
      analysis,
      solution,
      status: 'analyzed' as const,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(),
      autoFixAttempted: false,
    };

    await this.databaseService.saveIssueRecord(issueRecord);
    await this.databaseService.addIssueLog(issueRecord.id, 'analyzed', { analysis });
  }

  /**
   * 生成Issue ID
   */
  private generateIssueId(issue: GitHubIssue, repository: GitHubRepository): string {
    return `${repository.full_name}#${issue.number}`;
  }

  /**
   * 添加处理中标签
   */
  private async addProcessingLabel(context: Context, issue: GitHubIssue): Promise<void> {
    try {
      const repo = context.repo();
      await context.octokit.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        labels: ['issues-bot:processing']
      });
    } catch (error) {
      logger.logError('添加处理标签失败', error, { issueNumber: issue.number });
    }
  }

  /**
   * 添加分析结果标签
   */
  private async addAnalysisLabels(
    context: Context,
    issue: GitHubIssue,
    analysis: IssueAnalysis
  ): Promise<void> {
    try {
      const repo = context.repo();
      const labels = [
        'issues-bot:analyzed',
        `type:${analysis.type}`,
        `severity:${analysis.severity}`,
        `priority:${analysis.priority}`,
        ...analysis.suggestedLabels
      ];

      // 移除处理中标签，添加分析标签
      await context.octokit.issues.removeLabel({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        name: 'issues-bot:processing'
      });

      await context.octokit.issues.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        labels
      });

      logger.info(`Issue #${issue.number} 标签添加成功`);
    } catch (error) {
      logger.logError('添加分析标签失败', error, { issueNumber: issue.number });
    }
  }

  /**
   * 添加分析结果评论
   */
  private async addAnalysisComment(
    context: Context,
    issue: GitHubIssue,
    analysis: IssueAnalysis,
    solution?: IssueSolution
  ): Promise<void> {
    try {
      const confidencePercent = (analysis.confidence * 100).toFixed(1);
      
      let comment = `## 🤖 Issue 自动分析

我已经分析了这个 Issue，以下是分析结果：

### 📊 分析摘要
- **类型**: ${this.getTypeEmoji(analysis.type)} ${analysis.type}
- **严重程度**: ${this.getSeverityEmoji(analysis.severity)} ${analysis.severity}
- **优先级**: ${this.getPriorityEmoji(analysis.priority)} ${analysis.priority}
- **置信度**: ${confidencePercent}%
- **预估时间**: ${analysis.estimatedTime}

### 📝 详细描述
${analysis.description}

`;

      if (analysis.relatedFiles && analysis.relatedFiles.length > 0) {
        comment += `### 📁 相关文件
${analysis.relatedFiles.map(file => `- \`${file}\``).join('\n')}

`;
      }

      if (analysis.dependencies && analysis.dependencies.length > 0) {
        comment += `### 🔗 相关依赖
${analysis.dependencies.map(dep => `- \`${dep}\``).join('\n')}

`;
      }

      if (solution) {
        comment += `### 💡 解决方案
${solution.summary}

**难度等级**: ${solution.difficulty} | **预估时间**: ${solution.estimatedTime}

`;

        if (solution.steps && solution.steps.length > 0) {
          comment += `**解决步骤**:
${solution.steps.map((step, index) => `${index + 1}. **${step.title}**: ${step.description}`).join('\n')}

`;
        }
      }

      if (analysis.autoFixable) {
        comment += `### 🔧 自动修复
✅ 此问题可能可以自动修复。我将尝试生成修复方案并创建 Pull Request。

`;
      } else {
        comment += `### ⚠️ 手动处理
❌ 此问题需要手动处理，AI 无法提供安全的自动修复方案。

`;
      }

      comment += `---
*由 Issues-bot 自动生成 | 置信度: ${confidencePercent}%*`;

      const repo = context.repo();
      await context.octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        body: comment
      });

      logger.info(`Issue #${issue.number} 分析评论添加成功`);
    } catch (error) {
      logger.logError('添加分析评论失败', error, { issueNumber: issue.number });
    }
  }

  /**
   * 添加错误评论
   */
  private async addErrorComment(context: Context, error: any): Promise<void> {
    try {
      const comment = `## ❌ 处理失败

很抱歉，在分析这个 Issue 时遇到了错误：

\`\`\`
${error.message || '未知错误'}
\`\`\`

请联系维护团队或稍后重试。您也可以使用 \`@issues-bot analyze\` 命令重新触发分析。

---
*由 Issues-bot 自动生成*`;

      const repo = context.repo();
      const issue = context.payload.issue;
      
      if (issue) {
        await context.octokit.issues.createComment({
          owner: repo.owner,
          repo: repo.repo,
          issue_number: issue.number,
          body: comment
        });
      }
    } catch (commentError) {
      logger.logError('添加错误评论失败', commentError);
    }
  }

  /**
   * 解析命令
   */
  private parseCommand(commentBody: string): { action: string; args: string[] } | null {
    const commandPattern = /@issues-bot\s+(\w+)(.*)$/im;
    const match = commentBody.match(commandPattern);
    
    if (!match) {
      return null;
    }

    const action = match[1].toLowerCase();
    const argsString = match[2].trim();
    const args = argsString ? argsString.split(/\s+/) : [];

    return { action, args };
  }

  /**
   * 处理命令
   */
  private async handleCommand(
    context: Context,
    command: { action: string; args: string[] },
    issue: GitHubIssue,
    repository: GitHubRepository
  ): Promise<void> {
    switch (command.action) {
      case 'analyze':
      case '分析':
        await this.handleAnalyzeCommand(context, issue, repository);
        break;
      case 'fix':
      case '修复':
        await this.handleFixCommand(context, issue, repository);
        break;
      case 'suggest':
      case '建议':
        await this.handleSuggestCommand(context, issue, repository);
        break;
      case 'priority':
      case '优先级':
        await this.handlePriorityCommand(context, issue, repository);
        break;
      default:
        await this.handleUnknownCommand(context, command.action);
    }
  }

  /**
   * 处理分析命令
   */
  private async handleAnalyzeCommand(
    context: Context,
    issue: GitHubIssue,
    repository: GitHubRepository
  ): Promise<void> {
    await this.addCommandResponse(context, '🔍 重新分析中...');
    await this.handleIssueOpened(context);
  }

  /**
   * 处理修复命令
   */
  private async handleFixCommand(
    context: Context,
    issue: GitHubIssue,
    repository: GitHubRepository
  ): Promise<void> {
    await this.addCommandResponse(context, '🔧 尝试自动修复中...');
    
    const issueId = this.generateIssueId(issue, repository);
    const record = await this.databaseService.getIssueRecord(issueId);
    
    if (!record) {
      await this.addCommandResponse(context, '❌ 未找到分析记录，请先使用 `@issues-bot analyze` 进行分析。');
      return;
    }

    await this.attemptAutoFix(context, issue, record.analysis, record.solution);
  }

  /**
   * 处理建议命令
   */
  private async handleSuggestCommand(
    context: Context,
    issue: GitHubIssue,
    repository: GitHubRepository
  ): Promise<void> {
    await this.addCommandResponse(context, '💡 生成解决建议中...');
    
    const issueId = this.generateIssueId(issue, repository);
    const record = await this.databaseService.getIssueRecord(issueId);
    
    if (!record) {
      await this.addCommandResponse(context, '❌ 未找到分析记录，请先使用 `@issues-bot analyze` 进行分析。');
      return;
    }

    const solution = await this.generateSolution(context, issue, record.analysis);
    if (solution) {
      await this.addSolutionComment(context, issue, solution);
    }
  }

  /**
   * 处理优先级命令
   */
  private async handlePriorityCommand(
    context: Context,
    issue: GitHubIssue,
    repository: GitHubRepository
  ): Promise<void> {
    await this.addCommandResponse(context, '⚖️ 重新评估优先级中...');
    await this.handleAnalyzeCommand(context, issue, repository);
  }

  /**
   * 处理未知命令
   */
  private async handleUnknownCommand(context: Context, action: string): Promise<void> {
    const helpText = `❓ 未知命令: \`${action}\`

可用命令：
- \`@issues-bot analyze\` - 重新分析 Issue
- \`@issues-bot fix\` - 尝试自动修复
- \`@issues-bot suggest\` - 提供解决建议
- \`@issues-bot priority\` - 重新评估优先级`;

    await this.addCommandResponse(context, helpText);
  }

  /**
   * 添加命令响应
   */
  private async addCommandResponse(context: Context, message: string): Promise<void> {
    try {
      const repo = context.repo();
      const issue = context.payload.issue;
      
      await context.octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issue.number,
        body: message
      });
    } catch (error) {
      logger.logError('添加命令响应失败', error);
    }
  }

  /**
   * 添加解决方案评论
   */
  private async addSolutionComment(
    context: Context,
    issue: GitHubIssue,
    solution: IssueSolution
  ): Promise<void> {
    const comment = `## 💡 详细解决方案

${solution.summary}

### 📋 解决步骤
${solution.steps.map((step, index) => `
#### ${index + 1}. ${step.title}
${step.description}

${step.code ? `\`\`\`\n${step.code}\n\`\`\`` : ''}
${step.commands && step.commands.length > 0 ? `**命令**:\n\`\`\`bash\n${step.commands.join('\n')}\n\`\`\`` : ''}
${step.files && step.files.length > 0 ? `**相关文件**: ${step.files.map(f => `\`${f}\``).join(', ')}` : ''}
`).join('\n')}

### 📊 预估信息
- **难度**: ${solution.difficulty}
- **预估时间**: ${solution.estimatedTime}

${solution.additionalResources && solution.additionalResources.length > 0 ? `
### 📚 相关资源
${solution.additionalResources.map(resource => `- ${resource}`).join('\n')}
` : ''}

---
*由 Issues-bot 生成的详细解决方案*`;

    const repo = context.repo();
    await context.octokit.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: issue.number,
      body: comment
    });
  }

  // 辅助方法
  private getTypeEmoji(type: string): string {
    const emojis: Record<string, string> = {
      bug: '🐛',
      feature: '💡',
      documentation: '📚',
      security: '🔒',
      performance: '⚡',
      configuration: '🔧',
      dependency: '📦',
      test: '🧪',
      refactor: '♻️',
      other: '❓'
    };
    return emojis[type] || '❓';
  }

  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };
    return emojis[severity] || '🟡';
  }

  private getPriorityEmoji(priority: string): string {
    const emojis: Record<string, string> = {
      low: '⬇️',
      medium: '➡️',
      high: '⬆️',
      urgent: '🚨'
    };
    return emojis[priority] || '➡️';
  }
}
