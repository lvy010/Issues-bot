import express from 'express';
import { DatabaseService } from '../services/database.js';
import { AIService } from '../services/ai.js';
import { logger } from '../utils/logger.js';
import { ApiResponse, IssueStatsResponse } from '../types/index.js';

const router = express.Router();
const databaseService = new DatabaseService();
const aiService = new AIService();

/**
 * 获取仓库统计信息
 * GET /api/stats/:owner/:repo
 */
router.get('/stats/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const repositoryName = `${owner}/${repo}`;
    
    logger.info(`获取仓库统计信息: ${repositoryName}`);
    
    const stats = await databaseService.getStatistics(repositoryName);
    
    const response: ApiResponse<IssueStatsResponse> = {
      success: true,
      data: stats,
      message: '统计信息获取成功'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('获取统计信息失败', error, {
      repository: `${req.params.owner}/${req.params.repo}`
    });
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取统计信息失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * 获取全局统计信息
 * GET /api/stats
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('获取全局统计信息');
    
    const stats = await databaseService.getStatistics();
    
    const response: ApiResponse<IssueStatsResponse> = {
      success: true,
      data: stats,
      message: '全局统计信息获取成功'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('获取全局统计信息失败', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取统计信息失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * 获取仓库Issues列表
 * GET /api/issues/:owner/:repo
 */
router.get('/issues/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { status, limit = '50', offset = '0' } = req.query;
    const repositoryName = `${owner}/${repo}`;
    
    logger.info(`获取仓库Issues: ${repositoryName}`, {
      status,
      limit: Number(limit),
      offset: Number(offset)
    });
    
    const issues = await databaseService.getRepositoryIssues(
      repositoryName,
      status as any,
      Number(limit),
      Number(offset)
    );
    
    const response: ApiResponse = {
      success: true,
      data: issues,
      message: `获取到 ${issues.length} 个Issues`
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('获取Issues列表失败', error, {
      repository: `${req.params.owner}/${req.params.repo}`
    });
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取Issues失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * 获取待处理Issues
 * GET /api/issues/pending
 */
router.get('/issues/pending', async (req, res) => {
  try {
    const { limit = '10' } = req.query;
    
    logger.info(`获取待处理Issues，限制: ${limit}`);
    
    const issues = await databaseService.getPendingIssues(Number(limit));
    
    const response: ApiResponse = {
      success: true,
      data: issues,
      message: `获取到 ${issues.length} 个待处理Issues`
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('获取待处理Issues失败', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取待处理Issues失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * 获取特定Issue详情
 * GET /api/issue/:owner/:repo/:number
 */
router.get('/issue/:owner/:repo/:number', async (req, res) => {
  try {
    const { owner, repo, number } = req.params;
    const repositoryName = `${owner}/${repo}`;
    const issueNumber = parseInt(number);
    
    logger.info(`获取Issue详情: ${repositoryName}#${issueNumber}`);
    
    const issue = await databaseService.getIssueByNumber(repositoryName, issueNumber);
    
    if (!issue) {
      const response: ApiResponse = {
        success: false,
        error: 'Issue未找到'
      };
      return res.status(404).json(response);
    }
    
    // 获取Issue日志
    const logs = await databaseService.getIssueLogs(issue.id);
    
    const response: ApiResponse = {
      success: true,
      data: {
        issue,
        logs
      },
      message: 'Issue详情获取成功'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('获取Issue详情失败', error, {
      repository: `${req.params.owner}/${req.params.repo}`,
      issueNumber: req.params.number
    });
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取Issue详情失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * 手动触发Issue分析
 * POST /api/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { owner, repo, issue_number } = req.body;
    
    if (!owner || !repo || !issue_number) {
      const response: ApiResponse = {
        success: false,
        error: '缺少必要参数: owner, repo, issue_number'
      };
      return res.status(400).json(response);
    }
    
    logger.info(`手动触发Issue分析: ${owner}/${repo}#${issue_number}`);
    
    // 这里应该触发重新分析，但需要GitHub API访问权限
    // 目前返回成功响应，实际实现需要集成GitHub API
    
    const response: ApiResponse = {
      success: true,
      message: '分析请求已提交'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('手动触发分析失败', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '触发分析失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * AI聊天接口
 * POST /api/chat
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      const response: ApiResponse = {
        success: false,
        error: '无效的消息格式'
      };
      return res.status(400).json(response);
    }
    
    logger.info('处理AI聊天请求', { messagesCount: messages.length });
    
    const aiResponse = await aiService.chat(messages);
    
    const response: ApiResponse = {
      success: true,
      data: aiResponse,
      message: 'AI响应生成成功'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('AI聊天请求失败', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'AI聊天失败'
    };
    
    res.status(500).json(response);
  }
});

/**
 * 健康检查接口
 * GET /api/health
 */
router.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    await databaseService.getStatistics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      },
      message: '服务运行正常'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('健康检查失败', error);
    
    const response: ApiResponse = {
      success: false,
      error: '服务异常',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      }
    };
    
    res.status(503).json(response);
  }
});

/**
 * 获取系统配置信息
 * GET /api/config
 */
router.get('/config', async (req, res) => {
  try {
    const config = {
      autoFixEnabled: process.env.AUTO_FIX_ENABLED === 'true',
      issueAnalysisEnabled: process.env.ISSUE_ANALYSIS_ENABLED === 'true',
      language: process.env.LANGUAGE || '中文',
      supportedTypes: [
        'bug', 'feature', 'documentation', 'security', 
        'performance', 'configuration', 'dependency', 'test'
      ],
      maxAutoFixComplexity: parseInt(process.env.MAX_AUTO_FIX_COMPLEXITY || '3'),
      confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.8')
    };
    
    const response: ApiResponse = {
      success: true,
      data: config,
      message: '配置信息获取成功'
    };
    
    res.json(response);
  } catch (error) {
    logger.logError('获取配置信息失败', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : '获取配置失败'
    };
    
    res.status(500).json(response);
  }
});

export default router;
