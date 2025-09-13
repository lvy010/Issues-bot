import { BotConfig } from '@/types/index.js';

// 环境变量配置
export const config = {
  // OpenAI 配置
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.MAX_TOKENS || '2000'),
    endpoint: process.env.OPENAI_API_ENDPOINT,
    isAzure: Boolean(process.env.AZURE_API_VERSION && process.env.AZURE_DEPLOYMENT),
    azure: {
      apiVersion: process.env.AZURE_API_VERSION,
      deployment: process.env.AZURE_DEPLOYMENT,
    },
    isGithubModels: process.env.USE_GITHUB_MODELS === 'true',
  },

  // GitHub 配置
  github: {
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_PRIVATE_KEY || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    token: process.env.GITHUB_TOKEN || '',
  },

  // 服务器配置
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL || './data/issues-bot.db',
  },

  // AI 功能配置
  ai: {
    language: process.env.LANGUAGE || '中文',
    autoFixEnabled: process.env.AUTO_FIX_ENABLED === 'true',
    issueAnalysisEnabled: process.env.ISSUE_ANALYSIS_ENABLED === 'true',
    maxAutoFixComplexity: parseInt(process.env.MAX_AUTO_FIX_COMPLEXITY || '3'),
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.8'),
  },

  // 安全配置
  security: {
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15分钟
  },
} as const;

// Bot 默认配置
export const defaultBotConfig: BotConfig = {
  autoFixEnabled: config.ai.autoFixEnabled,
  issueAnalysisEnabled: config.ai.issueAnalysisEnabled,
  maxAutoFixComplexity: config.ai.maxAutoFixComplexity,
  confidenceThreshold: config.ai.confidenceThreshold,
  language: config.ai.language,
  skipLabels: ['duplicate', 'invalid', 'wontfix', 'spam'],
  priorityKeywords: [
    'crash', 'security', 'data loss', 'performance', 'urgent',
    'critical', 'breaking', 'vulnerability', '崩溃', '安全',
    '数据丢失', '性能', '紧急', '严重', '漏洞'
  ],
  supportedFileTypes: [
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c',
    '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
    '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.scss',
    '.md', '.txt', '.sh', '.bat', '.ps1', '.dockerfile'
  ],
};

// AI 提示词配置
export const prompts = {
  issueAnalysis: `
请作为一个资深的软件工程师和项目管理专家，分析以下 GitHub Issue。

分析要求：
1. 确定问题类型：bug, feature, documentation, security, performance, configuration, dependency, test, refactor, other
2. 评估严重程度：low, medium, high, critical
3. 确定优先级：low, medium, high, urgent
4. 评估自动修复可能性（0-1分）
5. 建议合适的标签
6. 估算解决时间
7. 识别相关文件和依赖

请以JSON格式返回分析结果：
{
  "type": "问题类型",
  "severity": "严重程度", 
  "priority": "优先级",
  "confidence": 0.95,
  "description": "详细分析说明",
  "suggestedLabels": ["标签1", "标签2"],
  "estimatedTime": "预估时间",
  "autoFixable": false,
  "relatedFiles": ["相关文件列表"],
  "dependencies": ["相关依赖"]
}

Issue 内容：
{issue_content}

代码库信息：
- 仓库语言：{repository_language}
- 仓库名称：{repository_name}
`,

  solutionGeneration: `
请作为一个经验丰富的软件工程师，为以下已分析的 GitHub Issue 提供详细的解决方案。

Issue 分析结果：
{analysis_result}

Issue 内容：
{issue_content}

请提供包含以下内容的解决方案：
1. 问题总结
2. 详细的解决步骤
3. 如果可能，提供自动修复建议
4. 相关资源和文档链接
5. 预估难度和时间

请以JSON格式返回：
{
  "summary": "问题总结",
  "steps": [
    {
      "title": "步骤标题",
      "description": "详细描述",
      "code": "相关代码（如果有）",
      "commands": ["命令列表"],
      "files": ["相关文件"]
    }
  ],
  "autoFix": {
    "type": "修复类型",
    "description": "修复描述",
    "files": [{
      "path": "文件路径",
      "action": "create/update/delete",
      "content": "文件内容"
    }],
    "commands": ["执行命令"],
    "confidence": 0.8,
    "riskLevel": "low/medium/high",
    "testRequired": true
  },
  "additionalResources": ["资源链接"],
  "estimatedTime": "预估时间",
  "difficulty": "easy/medium/hard"
}
`,

  autoFixGeneration: `
请作为一个专业的代码生成专家，为以下 GitHub Issue 生成自动修复方案。

Issue 信息：
{issue_content}

分析结果：
{analysis_result}

代码库上下文：
{codebase_context}

要求：
1. 只对明确可以自动修复的问题生成方案
2. 确保修复方案安全且不会破坏现有功能
3. 提供详细的文件变更内容
4. 评估风险等级和测试需求

请以JSON格式返回自动修复方案：
{
  "type": "code_change/config_change/dependency_update/documentation",
  "description": "修复描述",
  "files": [
    {
      "path": "文件路径",
      "action": "create/update/delete",
      "content": "完整文件内容",
      "changes": [
        {
          "lineNumber": 10,
          "type": "add/remove/replace",
          "content": "新内容",
          "originalContent": "原内容"
        }
      ]
    }
  ],
  "commands": ["需要执行的命令"],
  "confidence": 0.85,
  "riskLevel": "low",
  "testRequired": true
}

如果无法安全地自动修复，请返回：
{
  "autoFixable": false,
  "reason": "无法自动修复的原因"
}
`,
};

// 文件类型检测配置
export const fileTypePatterns = {
  javascript: /\.(js|jsx|mjs|cjs)$/,
  typescript: /\.(ts|tsx)$/,
  python: /\.py$/,
  java: /\.java$/,
  cpp: /\.(cpp|cxx|cc|c)$/,
  csharp: /\.cs$/,
  php: /\.php$/,
  ruby: /\.rb$/,
  go: /\.go$/,
  rust: /\.rs$/,
  swift: /\.swift$/,
  kotlin: /\.kt$/,
  scala: /\.scala$/,
  config: /\.(json|yaml|yml|toml|ini|conf)$/,
  web: /\.(html|css|scss|sass|less)$/,
  shell: /\.(sh|bash|zsh|fish|ps1|bat)$/,
  docker: /^(Dockerfile|\.dockerignore)$/,
  docs: /\.(md|txt|rst|adoc)$/,
};

// 验证配置
export function validateConfig(): boolean {
  const required = [
    config.openai.apiKey,
    config.github.appId,
    config.github.privateKey,
    config.github.webhookSecret,
  ];

  const missing = required.filter(value => !value);
  
  if (missing.length > 0) {
    console.error('缺少必要的环境变量配置');
    return false;
  }

  return true;
}
