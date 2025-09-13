// GitHub API 相关类型
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description: string | null;
  }>;
  assignees: Array<{
    login: string;
    id: number;
  }>;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: {
    login: string;
    id: number;
  };
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
  };
  html_url: string;
  language: string | null;
}

// AI 分析结果类型
export interface IssueAnalysis {
  type: IssueType;
  severity: IssueSeverity;
  priority: IssuePriority;
  confidence: number;
  description: string;
  suggestedLabels: string[];
  estimatedTime: string;
  autoFixable: boolean;
  relatedFiles?: string[];
  dependencies?: string[];
}

export enum IssueType {
  BUG = 'bug',
  FEATURE = 'feature',
  DOCUMENTATION = 'documentation',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  CONFIGURATION = 'configuration',
  DEPENDENCY = 'dependency',
  TEST = 'test',
  REFACTOR = 'refactor',
  OTHER = 'other'
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum IssuePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// 自动修复相关类型
export interface AutoFixSuggestion {
  type: 'code_change' | 'config_change' | 'dependency_update' | 'documentation';
  description: string;
  files: Array<{
    path: string;
    action: 'create' | 'update' | 'delete';
    content?: string;
    changes?: FileChange[];
  }>;
  commands?: string[];
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  testRequired: boolean;
}

export interface FileChange {
  lineNumber: number;
  type: 'add' | 'remove' | 'replace';
  content: string;
  originalContent?: string;
}

// 解决方案类型
export interface IssueSolution {
  summary: string;
  steps: SolutionStep[];
  autoFix?: AutoFixSuggestion;
  additionalResources?: string[];
  estimatedTime: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface SolutionStep {
  title: string;
  description: string;
  code?: string;
  commands?: string[];
  files?: string[];
}

// 数据库模型类型
export interface IssueRecord {
  id: string;
  issueNumber: number;
  repositoryId: string;
  repositoryName: string;
  title: string;
  body: string | null;
  analysis: IssueAnalysis;
  solution?: IssueSolution;
  status: IssueStatus;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  autoFixAttempted: boolean;
  autoFixSuccessful?: boolean;
}

export enum IssueStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  ANALYZED = 'analyzed',
  AUTO_FIXING = 'auto_fixing',
  FIXED = 'fixed',
  MANUAL_REQUIRED = 'manual_required',
  CLOSED = 'closed',
  ERROR = 'error'
}

// 配置类型
export interface BotConfig {
  autoFixEnabled: boolean;
  issueAnalysisEnabled: boolean;
  maxAutoFixComplexity: number;
  confidenceThreshold: number;
  language: string;
  skipLabels: string[];
  priorityKeywords: string[];
  supportedFileTypes: string[];
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface IssueStatsResponse {
  total: number;
  open: number;
  closed: number;
  autoFixed: number;
  byType: Record<IssueType, number>;
  bySeverity: Record<IssueSeverity, number>;
  averageResolutionTime: number;
}

// Webhook 载荷类型
export interface WebhookPayload {
  action: string;
  issue?: GitHubIssue;
  repository: GitHubRepository;
  sender: {
    login: string;
    id: number;
  };
}

// AI Chat 相关类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  confidence?: number;
  reasoning?: string;
}
