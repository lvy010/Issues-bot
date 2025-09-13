import { OpenAI, AzureOpenAI } from 'openai';
import { config, prompts } from '@/config/index.js';
import { 
  IssueAnalysis, 
  IssueSolution, 
  AutoFixSuggestion, 
  GitHubIssue,
  GitHubRepository,
  ChatMessage,
  AIResponse
} from '@/types/index.js';
import { logger } from '@/utils/logger.js';

export class AIService {
  private openai: OpenAI | AzureOpenAI;
  private isAzure: boolean;
  private isGithubModels: boolean;

  constructor() {
    this.isAzure = config.openai.isAzure;
    this.isGithubModels = config.openai.isGithubModels;

    if (this.isAzure) {
      this.openai = new AzureOpenAI({
        apiKey: config.openai.apiKey,
        endpoint: config.openai.endpoint || '',
        apiVersion: config.openai.azure.apiVersion || '',
        deployment: config.openai.azure.deployment || '',
      });
    } else {
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
        baseURL: this.isGithubModels 
          ? 'https://models.github.ai/inference' 
          : config.openai.endpoint || 'https://api.openai.com/v1',
      });
    }
  }

  /**
   * 分析 GitHub Issue
   */
  async analyzeIssue(
    issue: GitHubIssue, 
    repository: GitHubRepository
  ): Promise<IssueAnalysis> {
    try {
      logger.info(`开始分析 Issue #${issue.number}: ${issue.title}`);
      
      const prompt = this.buildIssueAnalysisPrompt(issue, repository);
      const response = await this.callOpenAI(prompt, true);
      
      const analysis = this.parseAnalysisResponse(response.content);
      
      logger.info(`Issue #${issue.number} 分析完成`, {
        type: analysis.type,
        severity: analysis.severity,
        confidence: analysis.confidence
      });
      
      return analysis;
    } catch (error) {
      logger.error(`分析 Issue #${issue.number} 失败:`, error);
      throw new Error(`Issue 分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成解决方案
   */
  async generateSolution(
    issue: GitHubIssue,
    analysis: IssueAnalysis,
    codebaseContext?: string
  ): Promise<IssueSolution> {
    try {
      logger.info(`为 Issue #${issue.number} 生成解决方案`);
      
      const prompt = this.buildSolutionPrompt(issue, analysis, codebaseContext);
      const response = await this.callOpenAI(prompt, true);
      
      const solution = this.parseSolutionResponse(response.content);
      
      logger.info(`Issue #${issue.number} 解决方案生成完成`);
      
      return solution;
    } catch (error) {
      logger.error(`生成 Issue #${issue.number} 解决方案失败:`, error);
      throw new Error(`解决方案生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成自动修复建议
   */
  async generateAutoFix(
    issue: GitHubIssue,
    analysis: IssueAnalysis,
    codebaseContext: string
  ): Promise<AutoFixSuggestion | null> {
    try {
      if (!analysis.autoFixable || analysis.confidence < config.ai.confidenceThreshold) {
        logger.info(`Issue #${issue.number} 不符合自动修复条件`);
        return null;
      }

      logger.info(`为 Issue #${issue.number} 生成自动修复方案`);
      
      const prompt = this.buildAutoFixPrompt(issue, analysis, codebaseContext);
      const response = await this.callOpenAI(prompt, true);
      
      const autoFix = this.parseAutoFixResponse(response.content);
      
      if (!autoFix) {
        logger.info(`Issue #${issue.number} 无法生成安全的自动修复方案`);
        return null;
      }

      logger.info(`Issue #${issue.number} 自动修复方案生成完成`);
      
      return autoFix;
    } catch (error) {
      logger.error(`生成 Issue #${issue.number} 自动修复方案失败:`, error);
      return null;
    }
  }

  /**
   * 通用聊天接口
   */
  async chat(messages: ChatMessage[]): Promise<AIResponse> {
    try {
      const response = await this.openai.chat.completions.create({
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        model: config.openai.model,
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';
      
      return {
        content,
        confidence: this.estimateConfidence(content),
      };
    } catch (error) {
      logger.error('AI 聊天请求失败:', error);
      throw new Error(`AI 聊天失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 调用 OpenAI API
   */
  private async callOpenAI(prompt: string, useJsonMode = false): Promise<AIResponse> {
    try {
      const requestConfig: any = {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: config.openai.model,
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens,
      };

      if (useJsonMode) {
        requestConfig.response_format = { type: "json_object" };
      }

      const response = await this.openai.chat.completions.create(requestConfig);
      
      const content = response.choices[0]?.message?.content || '';
      
      return {
        content,
        confidence: this.estimateConfidence(content),
      };
    } catch (error) {
      logger.error('OpenAI API 调用失败:', error);
      throw error;
    }
  }

  /**
   * 构建 Issue 分析提示词
   */
  private buildIssueAnalysisPrompt(issue: GitHubIssue, repository: GitHubRepository): string {
    const issueContent = `
标题: ${issue.title}
内容: ${issue.body || '无详细描述'}
现有标签: ${issue.labels.map(l => l.name).join(', ') || '无'}
创建时间: ${issue.created_at}
`;

    return prompts.issueAnalysis
      .replace('{issue_content}', issueContent)
      .replace('{repository_language}', repository.language || '未知')
      .replace('{repository_name}', repository.full_name);
  }

  /**
   * 构建解决方案提示词
   */
  private buildSolutionPrompt(
    issue: GitHubIssue, 
    analysis: IssueAnalysis,
    codebaseContext?: string
  ): string {
    const issueContent = `
标题: ${issue.title}
内容: ${issue.body || '无详细描述'}
`;

    return prompts.solutionGeneration
      .replace('{analysis_result}', JSON.stringify(analysis, null, 2))
      .replace('{issue_content}', issueContent)
      .replace('{codebase_context}', codebaseContext || '无代码库上下文');
  }

  /**
   * 构建自动修复提示词
   */
  private buildAutoFixPrompt(
    issue: GitHubIssue,
    analysis: IssueAnalysis,
    codebaseContext: string
  ): string {
    const issueContent = `
标题: ${issue.title}
内容: ${issue.body || '无详细描述'}
`;

    return prompts.autoFixGeneration
      .replace('{issue_content}', issueContent)
      .replace('{analysis_result}', JSON.stringify(analysis, null, 2))
      .replace('{codebase_context}', codebaseContext);
  }

  /**
   * 解析分析响应
   */
  private parseAnalysisResponse(content: string): IssueAnalysis {
    try {
      const parsed = JSON.parse(content);
      
      // 验证必要字段
      const required = ['type', 'severity', 'priority', 'confidence', 'description'];
      for (const field of required) {
        if (!(field in parsed)) {
          throw new Error(`缺少必要字段: ${field}`);
        }
      }

      return {
        type: parsed.type,
        severity: parsed.severity,
        priority: parsed.priority,
        confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
        description: parsed.description,
        suggestedLabels: parsed.suggestedLabels || [],
        estimatedTime: parsed.estimatedTime || '未知',
        autoFixable: Boolean(parsed.autoFixable),
        relatedFiles: parsed.relatedFiles || [],
        dependencies: parsed.dependencies || [],
      };
    } catch (error) {
      logger.error('解析分析响应失败:', error);
      // 返回默认分析结果
      return {
        type: 'other' as any,
        severity: 'medium' as any,
        priority: 'medium' as any,
        confidence: 0.3,
        description: '自动分析失败，需要人工审查',
        suggestedLabels: ['needs-review'],
        estimatedTime: '未知',
        autoFixable: false,
        relatedFiles: [],
        dependencies: [],
      };
    }
  }

  /**
   * 解析解决方案响应
   */
  private parseSolutionResponse(content: string): IssueSolution {
    try {
      const parsed = JSON.parse(content);
      
      return {
        summary: parsed.summary || '解决方案生成失败',
        steps: parsed.steps || [],
        autoFix: parsed.autoFix,
        additionalResources: parsed.additionalResources || [],
        estimatedTime: parsed.estimatedTime || '未知',
        difficulty: parsed.difficulty || 'medium',
      };
    } catch (error) {
      logger.error('解析解决方案响应失败:', error);
      return {
        summary: '解决方案解析失败，请查看原始 Issue 内容',
        steps: [],
        estimatedTime: '未知',
        difficulty: 'hard',
      };
    }
  }

  /**
   * 解析自动修复响应
   */
  private parseAutoFixResponse(content: string): AutoFixSuggestion | null {
    try {
      const parsed = JSON.parse(content);
      
      if (parsed.autoFixable === false) {
        return null;
      }

      return {
        type: parsed.type,
        description: parsed.description,
        files: parsed.files || [],
        commands: parsed.commands || [],
        confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
        riskLevel: parsed.riskLevel || 'medium',
        testRequired: Boolean(parsed.testRequired),
      };
    } catch (error) {
      logger.error('解析自动修复响应失败:', error);
      return null;
    }
  }

  /**
   * 估算响应置信度
   */
  private estimateConfidence(content: string): number {
    // 简单的置信度估算逻辑
    let confidence = 0.5;
    
    // 检查响应长度
    if (content.length > 100) confidence += 0.1;
    if (content.length > 500) confidence += 0.1;
    
    // 检查结构化内容
    if (content.includes('{') && content.includes('}')) confidence += 0.1;
    
    // 检查具体信息
    const patterns = [
      /\d+/, // 包含数字
      /```/, // 包含代码块
      /https?:\/\//, // 包含链接
      /步骤|step/i, // 包含步骤
    ];
    
    patterns.forEach(pattern => {
      if (pattern.test(content)) confidence += 0.05;
    });
    
    return Math.min(confidence, 1);
  }
}
