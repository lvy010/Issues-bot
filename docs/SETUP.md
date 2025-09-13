# 🚀 Issues-bot 安装配置指南

## 前置要求

- Node.js 18+ 
- npm 或 yarn
- GitHub 账户
- OpenAI API 密钥

## 1. 项目安装

### 克隆项目

```bash
git clone https://github.com/your-username/issues-bot.git
cd issues-bot
```

### 安装依赖

```bash
npm install
# 或
yarn install
```

## 2. 环境配置

### 复制环境变量文件

```bash
cp env.example .env
```

### 配置必要的环境变量

编辑 `.env` 文件：

```env
# OpenAI API 配置（必需）
OPENAI_API_KEY=your_openai_api_key_here

# GitHub 应用配置（必需）
GITHUB_APP_ID=your_github_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
your_private_key_content_here
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# 其他配置（可选）
LANGUAGE=中文
AUTO_FIX_ENABLED=true
ISSUE_ANALYSIS_ENABLED=true
```

## 3. GitHub App 创建

### 步骤 1: 创建 GitHub App

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击 "New GitHub App"
3. 填写应用信息：
   - **App name**: Issues-bot
   - **Description**: AI-powered GitHub Issues automation
   - **Homepage URL**: `https://github.com/your-username/issues-bot`
   - **Webhook URL**: `https://your-domain.com/api/github/webhooks`
   - **Webhook secret**: 生成一个随机字符串

### 步骤 2: 配置权限

在 "Permissions" 部分设置以下权限：

- **Issues**: Read & Write
- **Contents**: Read & Write  
- **Pull requests**: Read & Write
- **Metadata**: Read

### 步骤 3: 订阅事件

在 "Subscribe to events" 部分选择：

- [x] Issues
- [x] Issue comments
- [x] Pull requests

### 步骤 4: 获取应用信息

创建完成后：

1. 记录 **App ID**
2. 生成并下载 **Private Key**
3. 保存 **Webhook Secret**

## 4. 本地开发

### 启动开发模式

```bash
# 构建项目
npm run build

# 启动服务
npm start

# 或者开发模式（自动重启）
npm run dev
```

### 使用 ngrok 进行本地测试

```bash
# 安装 ngrok
npm install -g ngrok

# 启动 ngrok
ngrok http 3000

# 使用生成的 https URL 更新 GitHub App 的 Webhook URL
```

## 5. 部署方案

### 方案 A: Docker 部署

```bash
# 构建镜像
docker build -t issues-bot .

# 运行容器
docker run -d \
  --name issues-bot \
  -p 3000:3000 \
  --env-file .env \
  -v issues-bot-data:/app/data \
  issues-bot
```

### 方案 B: Docker Compose 部署

```bash
# 启动服务
docker-compose up -d

# 包含 Nginx 反向代理
docker-compose --profile with-nginx up -d
```

### 方案 C: 云平台部署

#### Vercel 部署

1. 连接 GitHub 仓库到 Vercel
2. 配置环境变量
3. 部署

#### Railway 部署

1. 连接 GitHub 仓库到 Railway
2. 配置环境变量
3. 部署

#### AWS/Azure/GCP 部署

参考相应平台的 Node.js 应用部署文档。

## 6. 安装 GitHub App

### 步骤 1: 安装到仓库

1. 访问 GitHub App 页面
2. 点击 "Install App"
3. 选择要安装的账户/组织
4. 选择仓库（推荐先选择测试仓库）

### 步骤 2: 验证安装

1. 在安装的仓库中创建一个测试 Issue
2. 检查机器人是否自动响应
3. 查看管理面板：`http://your-domain.com/dashboard`

## 7. 测试验证

### 创建测试 Issue

```markdown
标题: 测试 bug - 登录按钮不工作

内容:
当我点击登录按钮时，页面没有任何响应。

**重现步骤:**
1. 打开登录页面
2. 输入用户名和密码
3. 点击登录按钮
4. 没有任何反应

**期望行为:**
应该跳转到首页或显示错误信息

**环境:**
- 浏览器: Chrome 118
- 操作系统: Windows 11
```

### 验证机器人响应

机器人应该：
1. 自动分析 Issue 类型和严重程度
2. 添加相应标签
3. 提供分析评论
4. 如果可能，尝试自动修复

### 测试手动命令

在 Issue 评论中测试以下命令：

```
@issues-bot analyze
@issues-bot fix
@issues-bot suggest
@issues-bot priority
```

## 8. 常见问题

### Q: 机器人没有响应 Issue
A: 检查：
- GitHub App 权限设置
- Webhook URL 是否可访问
- 环境变量配置
- 服务器日志

### Q: 自动修复功能不工作
A: 检查：
- `AUTO_FIX_ENABLED` 环境变量
- OpenAI API 配额
- 仓库写入权限

### Q: 管理面板显示异常
A: 检查：
- 数据库文件权限
- 服务器端口配置
- 防火墙设置

## 9. 监控和维护

### 日志监控

```bash
# 查看应用日志
docker logs issues-bot -f

# 或使用 PM2
pm2 logs issues-bot
```

### 健康检查

访问健康检查端点：
```
GET http://your-domain.com/api/health
```

### 数据备份

定期备份数据库文件：
```bash
# 备份 SQLite 数据库
cp data/issues-bot.db backup/issues-bot-$(date +%Y%m%d).db
```

## 10. 高级配置

### 自定义 AI 提示词

编辑 `src/config/index.ts` 中的 `prompts` 配置。

### 配置过滤规则

修改 `defaultBotConfig` 中的过滤规则：

```typescript
skipLabels: ['duplicate', 'invalid', 'wontfix'],
priorityKeywords: ['crash', 'security', 'urgent']
```

### SSL 证书配置

对于生产环境，配置 HTTPS：

1. 获取 SSL 证书
2. 配置 Nginx 反向代理
3. 更新 GitHub App Webhook URL

---

如有问题，请查看 [FAQ](./FAQ.md) 或创建 Issue 寻求帮助。
