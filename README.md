# 🤖 Issues-bot - GitHub Issues 智能解决助手

一个基于 AI 的 GitHub Issues 自动化解决系统，能够智能分析、分类并尝试自动修复项目中的问题。

## ✨ 主要功能

- 🎯 **智能问题检测**: 自动分析 GitHub Issues 内容，识别问题类型和严重程度
- 🔧 **自动修复尝试**: 针对常见问题类型提供自动化解决方案
- 📊 **问题分类管理**: 智能标签分类，优先级排序
- 💬 **AI 助手对话**: 与用户互动，提供解决建议和指导
- 🎨 **用户友好界面**: 直观的 Web 管理面板
- 📈 **数据统计分析**: 问题处理效率和成功率统计

## 🚀 快速开始

### 1. 安装部署

```bash
# 克隆项目
git clone https://github.com/your-username/issues-bot.git
cd issues-bot

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要的 API 密钥

# 启动服务
npm start
```

### 2. GitHub 应用配置

1. 前往 GitHub 设置 > Developer settings > GitHub Apps
2. 创建新的 GitHub App
3. 配置必要的权限：Issues (read/write), Contents (read/write), Pull requests (read/write)
4. 设置 Webhook URL 指向您的服务器
5. 安装 App 到目标仓库

### 3. 环境变量配置

```env
# OpenAI API 配置
OPENAI_API_KEY=your_openai_api_key
MODEL=gpt-4o-mini

# GitHub 配置
GITHUB_APP_ID=your_github_app_id
GITHUB_PRIVATE_KEY=your_github_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# 自定义配置
LANGUAGE=中文
AUTO_FIX_ENABLED=true
ISSUE_ANALYSIS_ENABLED=true
```

## 🔧 支持的问题类型

- **🐛 Bug 报告**: 自动分析错误信息，提供修复建议
- **💡 功能请求**: 评估可行性，生成实现方案
- **📚 文档问题**: 自动更新和补充文档
- **🔒 安全漏洞**: 识别并提供安全修复方案
- **⚡ 性能问题**: 分析性能瓶颈，优化建议
- **🔧 配置问题**: 自动修正配置文件错误

## 📖 使用方法

### 自动化流程

1. **Issue 创建**: 用户在 GitHub 仓库中创建新 Issue
2. **智能分析**: AI 自动分析 Issue 内容，确定问题类型
3. **自动标记**: 添加合适的标签和优先级
4. **解决方案**: 
   - 对于简单问题：直接提供自动修复 PR
   - 对于复杂问题：提供详细的解决建议和步骤
5. **持续跟踪**: 监控 Issue 状态，提供后续支持

### 手动触发

在 Issue 评论中使用特定命令：

- `@issues-bot analyze` - 重新分析 Issue
- `@issues-bot fix` - 尝试自动修复
- `@issues-bot suggest` - 提供解决建议
- `@issues-bot priority` - 重新评估优先级

## 🎨 Web 管理面板

访问 `http://your-server:3000/dashboard` 查看：

- 📊 问题统计概览
- 📋 待处理问题列表
- 🤖 AI 处理记录
- ⚙️ 系统配置管理
- 📈 效率分析报告

## 🔧 高级配置

### 自定义 AI 提示词

```javascript
// config/prompts.js
export const ISSUE_ANALYSIS_PROMPT = `
请分析以下 GitHub Issue：
1. 确定问题类型（bug/feature/documentation/security）
2. 评估严重程度（low/medium/high/critical）
3. 提供初步解决方案
4. 估算解决时间

Issue 内容：{issue_content}
`;
```

### 问题过滤规则

```javascript
// config/filters.js
export const ISSUE_FILTERS = {
  // 跳过的问题类型
  skipLabels: ['duplicate', 'invalid', 'wontfix'],
  
  // 优先处理的关键词
  priorityKeywords: ['crash', 'security', 'data loss', 'performance'],
  
  // 自动修复启用条件
  autoFixCriteria: {
    maxComplexity: 3,
    confidenceThreshold: 0.8,
    hasTestCase: true
  }
};
```

## 📊 API 接口

### REST API

```bash
# 获取项目问题统计
GET /api/stats/:owner/:repo

# 手动触发问题分析
POST /api/analyze
{
  "owner": "username",
  "repo": "repository",
  "issue_number": 123
}

# 获取 AI 解决方案
GET /api/solution/:owner/:repo/:issue_number
```

### Webhook 事件

系统监听以下 GitHub Webhook 事件：

- `issues.opened` - 新问题创建
- `issues.edited` - 问题内容更新
- `issue_comment.created` - 新评论添加
- `pull_request.opened` - 自动修复 PR 创建

## 🛡️ 安全考虑

- 🔐 所有 API 请求需要有效的 GitHub token 认证
- 🚫 敏感信息（密钥、密码）自动过滤
- 📝 详细的操作日志记录
- 🔒 自动修复前的安全检查机制

## 🤝 贡献指南

我们欢迎所有形式的贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详细信息。

### 开发环境设置

```bash
# 开发模式启动
npm run dev

# 运行测试
npm test

# 代码格式化
npm run format

# 类型检查
npm run type-check
```

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 基于 [ChatGPT-CodeReview](https://github.com/anc95/ChatGPT-CodeReview) 项目构建
- 感谢 OpenAI 提供的 AI 能力支持
- 感谢 GitHub 提供的开放 API

---

💡 **提示**: 如果遇到问题，请查看 [常见问题](docs/FAQ.md) 或在 [Issues](https://github.com/your-username/issues-bot/issues) 中提问。
