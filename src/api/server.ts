import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import apiRoutes from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  // 安全中间件
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      },
    },
  }));

  // CORS配置
  app.use(cors({
    origin: config.server.nodeEnv === 'development' 
      ? ['http://localhost:3000', 'http://localhost:3001'] 
      : false,
    credentials: true
  }));

  // 请求解析中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 请求日志中间件
  app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path}`, {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    });
    
    next();
  });

  // API路由
  app.use('/api', apiRoutes);

  // 静态文件服务（用于管理面板）
  const publicPath = path.join(__dirname, '../../public');
  app.use('/static', express.static(publicPath));

  // 管理面板路由
  app.get('/dashboard', (req, res) => {
    res.send(generateDashboardHTML());
  });

  app.get('/dashboard/*', (req, res) => {
    res.send(generateDashboardHTML());
  });

  // 根路径重定向到管理面板
  app.get('/', (req, res) => {
    res.redirect('/dashboard');
  });

  // 404处理
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: '页面未找到',
      message: `路径 ${req.originalUrl} 不存在`
    });
  });

  // 全局错误处理
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.logError('服务器错误', err, {
      method: req.method,
      url: req.url,
      headers: req.headers
    });

    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: config.server.nodeEnv === 'development' ? err.message : '请联系管理员'
    });
  });

  return app;
}

/**
 * 生成管理面板HTML
 */
function generateDashboardHTML(): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Issues-bot 管理面板</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/@heroicons/react@1.0.6/outline/index.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vue@3.3.4/dist/vue.global.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.4.0/dist/axios.min.js"></script>
</head>
<body class="bg-gray-50">
    <div id="app">
        <!-- 导航栏 -->
        <nav class="bg-white shadow-sm border-b">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between h-16">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <h1 class="text-xl font-bold text-gray-900">🤖 Issues-bot</h1>
                        </div>
                        <div class="ml-10 flex items-baseline space-x-4">
                            <a @click="currentTab = 'overview'" 
                               :class="currentTab === 'overview' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'"
                               class="px-3 py-2 rounded-md text-sm font-medium cursor-pointer">
                                概览
                            </a>
                            <a @click="currentTab = 'issues'" 
                               :class="currentTab === 'issues' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'"
                               class="px-3 py-2 rounded-md text-sm font-medium cursor-pointer">
                                Issues
                            </a>
                            <a @click="currentTab = 'pending'" 
                               :class="currentTab === 'pending' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'"
                               class="px-3 py-2 rounded-md text-sm font-medium cursor-pointer">
                                待处理
                            </a>
                            <a @click="currentTab = 'chat'" 
                               :class="currentTab === 'chat' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'"
                               class="px-3 py-2 rounded-md text-sm font-medium cursor-pointer">
                                AI助手
                            </a>
                            <a @click="currentTab = 'settings'" 
                               :class="currentTab === 'settings' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'"
                               class="px-3 py-2 rounded-md text-sm font-medium cursor-pointer">
                                设置
                            </a>
                        </div>
                    </div>
                    <div class="flex items-center">
                        <span :class="systemHealth.success ? 'text-green-600' : 'text-red-600'" 
                              class="text-sm font-medium">
                            {{ systemHealth.success ? '🟢 正常' : '🔴 异常' }}
                        </span>
                    </div>
                </div>
            </div>
        </nav>

        <!-- 主内容区域 -->
        <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <!-- 概览页面 -->
            <div v-if="currentTab === 'overview'" class="space-y-6">
                <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <span class="text-2xl">📊</span>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">总Issues</dt>
                                        <dd class="text-lg font-medium text-gray-900">{{ stats.total || 0 }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <span class="text-2xl">🔧</span>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">自动修复</dt>
                                        <dd class="text-lg font-medium text-gray-900">{{ stats.autoFixed || 0 }}</dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <span class="text-2xl">⏱️</span>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">平均解决时间</dt>
                                        <dd class="text-lg font-medium text-gray-900">
                                            {{ formatTime(stats.averageResolutionTime) }}
                                        </dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white overflow-hidden shadow rounded-lg">
                        <div class="p-5">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <span class="text-2xl">✅</span>
                                </div>
                                <div class="ml-5 w-0 flex-1">
                                    <dl>
                                        <dt class="text-sm font-medium text-gray-500 truncate">成功率</dt>
                                        <dd class="text-lg font-medium text-gray-900">
                                            {{ calculateSuccessRate() }}%
                                        </dd>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 图表区域 -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white shadow rounded-lg p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">问题类型分布</h3>
                        <canvas id="typeChart" width="400" height="200"></canvas>
                    </div>
                    
                    <div class="bg-white shadow rounded-lg p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">严重程度分布</h3>
                        <canvas id="severityChart" width="400" height="200"></canvas>
                    </div>
                </div>
            </div>

            <!-- Issues列表页面 -->
            <div v-if="currentTab === 'issues'" class="bg-white shadow overflow-hidden sm:rounded-md">
                <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">Issues 列表</h3>
                    <div class="mt-4 flex space-x-4">
                        <input v-model="issueFilter.repo" placeholder="仓库名 (owner/repo)" 
                               class="block w-full border-gray-300 rounded-md shadow-sm">
                        <select v-model="issueFilter.status" 
                                class="block w-full border-gray-300 rounded-md shadow-sm">
                            <option value="">所有状态</option>
                            <option value="pending">待处理</option>
                            <option value="analyzing">分析中</option>
                            <option value="analyzed">已分析</option>
                            <option value="fixed">已修复</option>
                        </select>
                        <button @click="loadIssues" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                            查询
                        </button>
                    </div>
                </div>
                
                <ul class="divide-y divide-gray-200">
                    <li v-for="issue in issues" :key="issue.id" class="px-4 py-4 hover:bg-gray-50">
                        <div class="flex items-center justify-between">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-900 truncate">
                                    {{ issue.title }}
                                </p>
                                <p class="text-sm text-gray-500">
                                    {{ issue.repositoryName }}#{{ issue.issueNumber }} | 
                                    {{ getTypeEmoji(issue.analysis.type) }} {{ issue.analysis.type }} | 
                                    {{ getSeverityEmoji(issue.analysis.severity) }} {{ issue.analysis.severity }}
                                </p>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span :class="getStatusColor(issue.status)" 
                                      class="px-2 py-1 text-xs font-medium rounded-full">
                                    {{ issue.status }}
                                </span>
                                <span class="text-sm text-gray-500">
                                    {{ formatDate(issue.createdAt) }}
                                </span>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- 待处理Issues页面 -->
            <div v-if="currentTab === 'pending'" class="bg-white shadow overflow-hidden sm:rounded-md">
                <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">待处理 Issues</h3>
                    <button @click="loadPendingIssues" 
                            class="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                        刷新
                    </button>
                </div>
                
                <ul class="divide-y divide-gray-200">
                    <li v-for="issue in pendingIssues" :key="issue.id" class="px-4 py-4">
                        <div class="flex items-center justify-between">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-gray-900">{{ issue.title }}</p>
                                <p class="text-sm text-gray-500">
                                    {{ issue.repositoryName }}#{{ issue.issueNumber }} | 
                                    {{ getPriorityEmoji(issue.analysis.priority) }} {{ issue.analysis.priority }}
                                </p>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span v-if="issue.analysis.autoFixable" 
                                      class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                    可自动修复
                                </span>
                                <span class="text-sm text-gray-500">
                                    {{ formatDate(issue.createdAt) }}
                                </span>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- AI助手页面 -->
            <div v-if="currentTab === 'chat'" class="bg-white shadow rounded-lg">
                <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">AI 助手</h3>
                </div>
                <div class="p-6">
                    <div class="h-96 overflow-y-auto bg-gray-50 rounded-lg p-4 mb-4" ref="chatContainer">
                        <div v-for="message in chatMessages" :key="message.id" 
                             :class="message.role === 'user' ? 'text-right' : 'text-left'" 
                             class="mb-4">
                            <div :class="message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'" 
                                 class="inline-block max-w-xs lg:max-w-md px-4 py-2 rounded-lg shadow">
                                <p class="text-sm">{{ message.content }}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex space-x-4">
                        <input v-model="chatInput" @keyup.enter="sendMessage" 
                               placeholder="输入您的问题..." 
                               class="flex-1 border-gray-300 rounded-md shadow-sm">
                        <button @click="sendMessage" :disabled="!chatInput.trim() || chatLoading"
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {{ chatLoading ? '发送中...' : '发送' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 设置页面 -->
            <div v-if="currentTab === 'settings'" class="bg-white shadow rounded-lg">
                <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">系统设置</h3>
                </div>
                <div class="p-6 space-y-6">
                    <div>
                        <h4 class="text-base font-medium text-gray-900 mb-4">功能配置</h4>
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-700">自动修复功能</span>
                                <span :class="systemConfig.autoFixEnabled ? 'text-green-600' : 'text-red-600'">
                                    {{ systemConfig.autoFixEnabled ? '✅ 启用' : '❌ 禁用' }}
                                </span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-700">Issue分析功能</span>
                                <span :class="systemConfig.issueAnalysisEnabled ? 'text-green-600' : 'text-red-600'">
                                    {{ systemConfig.issueAnalysisEnabled ? '✅ 启用' : '❌ 禁用' }}
                                </span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-700">响应语言</span>
                                <span class="text-sm text-gray-600">{{ systemConfig.language }}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-700">最大自动修复复杂度</span>
                                <span class="text-sm text-gray-600">{{ systemConfig.maxAutoFixComplexity }}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-700">置信度阈值</span>
                                <span class="text-sm text-gray-600">{{ (systemConfig.confidenceThreshold * 100).toFixed(1) }}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <h4 class="text-base font-medium text-gray-900 mb-4">支持的问题类型</h4>
                        <div class="grid grid-cols-2 gap-2">
                            <span v-for="type in systemConfig.supportedTypes" :key="type"
                                  class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                                {{ getTypeEmoji(type) }} {{ type }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        const { createApp } = Vue;

        createApp({
            data() {
                return {
                    currentTab: 'overview',
                    stats: {},
                    issues: [],
                    pendingIssues: [],
                    systemHealth: { success: false },
                    systemConfig: {},
                    issueFilter: {
                        repo: '',
                        status: ''
                    },
                    chatMessages: [
                        {
                            id: 1,
                            role: 'assistant',
                            content: '你好！我是 Issues-bot AI 助手，有什么可以帮助您的吗？'
                        }
                    ],
                    chatInput: '',
                    chatLoading: false
                }
            },
            mounted() {
                this.loadData();
                this.checkHealth();
                this.loadConfig();
                
                // 定期检查健康状态
                setInterval(this.checkHealth, 30000);
            },
            methods: {
                async loadData() {
                    try {
                        const response = await axios.get('/api/stats');
                        this.stats = response.data.data || {};
                        this.updateCharts();
                    } catch (error) {
                        console.error('加载数据失败:', error);
                    }
                },
                
                async loadIssues() {
                    try {
                        let url = '/api/issues/pending';
                        if (this.issueFilter.repo) {
                            const [owner, repo] = this.issueFilter.repo.split('/');
                            if (owner && repo) {
                                url = \`/api/issues/\${owner}/\${repo}\`;
                                if (this.issueFilter.status) {
                                    url += \`?status=\${this.issueFilter.status}\`;
                                }
                            }
                        }
                        
                        const response = await axios.get(url);
                        this.issues = response.data.data || [];
                    } catch (error) {
                        console.error('加载Issues失败:', error);
                    }
                },
                
                async loadPendingIssues() {
                    try {
                        const response = await axios.get('/api/issues/pending');
                        this.pendingIssues = response.data.data || [];
                    } catch (error) {
                        console.error('加载待处理Issues失败:', error);
                    }
                },
                
                async checkHealth() {
                    try {
                        const response = await axios.get('/api/health');
                        this.systemHealth = response.data;
                    } catch (error) {
                        this.systemHealth = { success: false };
                    }
                },
                
                async loadConfig() {
                    try {
                        const response = await axios.get('/api/config');
                        this.systemConfig = response.data.data || {};
                    } catch (error) {
                        console.error('加载配置失败:', error);
                    }
                },
                
                async sendMessage() {
                    if (!this.chatInput.trim() || this.chatLoading) return;
                    
                    const userMessage = {
                        id: Date.now(),
                        role: 'user',
                        content: this.chatInput
                    };
                    
                    this.chatMessages.push(userMessage);
                    this.chatLoading = true;
                    
                    const messages = this.chatMessages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    }));
                    
                    try {
                        const response = await axios.post('/api/chat', { messages });
                        
                        const assistantMessage = {
                            id: Date.now() + 1,
                            role: 'assistant',
                            content: response.data.data.content
                        };
                        
                        this.chatMessages.push(assistantMessage);
                    } catch (error) {
                        const errorMessage = {
                            id: Date.now() + 1,
                            role: 'assistant',
                            content: '抱歉，处理您的请求时出现了错误。请稍后重试。'
                        };
                        
                        this.chatMessages.push(errorMessage);
                    } finally {
                        this.chatLoading = false;
                        this.chatInput = '';
                        this.$nextTick(() => {
                            if (this.$refs.chatContainer) {
                                this.$refs.chatContainer.scrollTop = this.$refs.chatContainer.scrollHeight;
                            }
                        });
                    }
                },
                
                updateCharts() {
                    this.$nextTick(() => {
                        this.createTypeChart();
                        this.createSeverityChart();
                    });
                },
                
                createTypeChart() {
                    const ctx = document.getElementById('typeChart');
                    if (!ctx) return;
                    
                    const typeData = this.stats.byType || {};
                    new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: Object.keys(typeData),
                            datasets: [{
                                data: Object.values(typeData),
                                backgroundColor: [
                                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                                    '#9966FF', '#FF9F40', '#FF6384', '#36A2EB'
                                ]
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false
                        }
                    });
                },
                
                createSeverityChart() {
                    const ctx = document.getElementById('severityChart');
                    if (!ctx) return;
                    
                    const severityData = this.stats.bySeverity || {};
                    new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: Object.keys(severityData),
                            datasets: [{
                                data: Object.values(severityData),
                                backgroundColor: ['#4CAF50', '#FFC107', '#FF9800', '#F44336']
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            }
                        }
                    });
                },
                
                formatTime(ms) {
                    if (!ms) return '0小时';
                    const hours = Math.round(ms / (1000 * 60 * 60));
                    return \`\${hours}小时\`;
                },
                
                formatDate(dateString) {
                    return new Date(dateString).toLocaleDateString('zh-CN');
                },
                
                calculateSuccessRate() {
                    if (!this.stats.total || this.stats.total === 0) return 0;
                    return Math.round((this.stats.autoFixed / this.stats.total) * 100);
                },
                
                getTypeEmoji(type) {
                    const emojis = {
                        bug: '🐛', feature: '💡', documentation: '📚',
                        security: '🔒', performance: '⚡', configuration: '🔧',
                        dependency: '📦', test: '🧪', refactor: '♻️', other: '❓'
                    };
                    return emojis[type] || '❓';
                },
                
                getSeverityEmoji(severity) {
                    const emojis = {
                        low: '🟢', medium: '🟡', high: '🟠', critical: '🔴'
                    };
                    return emojis[severity] || '🟡';
                },
                
                getPriorityEmoji(priority) {
                    const emojis = {
                        low: '⬇️', medium: '➡️', high: '⬆️', urgent: '🚨'
                    };
                    return emojis[priority] || '➡️';
                },
                
                getStatusColor(status) {
                    const colors = {
                        pending: 'bg-yellow-100 text-yellow-800',
                        analyzing: 'bg-blue-100 text-blue-800',
                        analyzed: 'bg-green-100 text-green-800',
                        fixed: 'bg-gray-100 text-gray-800',
                        error: 'bg-red-100 text-red-800'
                    };
                    return colors[status] || 'bg-gray-100 text-gray-800';
                }
            },
            watch: {
                currentTab(newTab) {
                    if (newTab === 'issues') {
                        this.loadIssues();
                    } else if (newTab === 'pending') {
                        this.loadPendingIssues();
                    }
                }
            }
        }).mount('#app');
    </script>
</body>
</html>
`;
}

export default createServer;
