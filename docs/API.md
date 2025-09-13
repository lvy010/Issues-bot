# 📡 Issues-bot API 文档

Issues-bot 提供了完整的 REST API，支持与系统进行编程交互。

## 基础信息

- **Base URL**: `http://your-domain.com/api`
- **认证**: 目前不需要认证（建议生产环境添加）
- **响应格式**: JSON

## 通用响应格式

所有 API 响应都遵循以下格式：

```json
{
  "success": true|false,
  "data": "响应数据",
  "message": "描述信息",
  "error": "错误信息（仅在失败时）"
}
```

## API 端点

### 1. 系统健康检查

检查系统运行状态和健康信息。

```http
GET /api/health
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "uptime": 3600,
    "memory": {
      "rss": 50331648,
      "heapTotal": 20971520,
      "heapUsed": 15728640,
      "external": 1048576
    },
    "version": "1.0.0"
  },
  "message": "服务运行正常"
}
```

### 2. 获取统计信息

#### 全局统计

```http
GET /api/stats
```

#### 仓库统计

```http
GET /api/stats/:owner/:repo
```

**参数:**
- `owner` - 仓库所有者
- `repo` - 仓库名称

**响应示例:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "open": 45,
    "closed": 105,
    "autoFixed": 32,
    "byType": {
      "bug": 60,
      "feature": 40,
      "documentation": 25,
      "security": 15,
      "performance": 10
    },
    "bySeverity": {
      "low": 50,
      "medium": 70,
      "high": 25,
      "critical": 5
    },
    "averageResolutionTime": 172800000
  }
}
```

### 3. Issues 管理

#### 获取仓库 Issues

```http
GET /api/issues/:owner/:repo
```

**查询参数:**
- `status` - Issue 状态过滤
- `limit` - 返回数量限制（默认 50）
- `offset` - 偏移量（默认 0）

**响应示例:**
```json
{
  "success": true,
  "data": [
    {
      "id": "owner/repo#123",
      "issueNumber": 123,
      "repositoryName": "owner/repo",
      "title": "Bug: 登录功能异常",
      "body": "详细描述...",
      "analysis": {
        "type": "bug",
        "severity": "high",
        "priority": "urgent",
        "confidence": 0.95,
        "description": "分析结果...",
        "autoFixable": true
      },
      "status": "analyzed",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "autoFixAttempted": false
    }
  ]
}
```

#### 获取待处理 Issues

```http
GET /api/issues/pending
```

**查询参数:**
- `limit` - 返回数量限制（默认 10）

#### 获取 Issue 详情

```http
GET /api/issue/:owner/:repo/:number
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "issue": {
      "id": "owner/repo#123",
      "issueNumber": 123,
      "title": "Bug: 登录功能异常",
      "analysis": { ... },
      "solution": {
        "summary": "解决方案摘要",
        "steps": [
          {
            "title": "步骤1",
            "description": "详细描述",
            "code": "示例代码"
          }
        ],
        "difficulty": "medium",
        "estimatedTime": "2-4小时"
      }
    },
    "logs": [
      {
        "id": 1,
        "action": "analyzed",
        "details": { ... },
        "timestamp": "2024-01-01T12:00:00.000Z"
      }
    ]
  }
}
```

### 4. AI 服务

#### 触发 Issue 分析

```http
POST /api/analyze
Content-Type: application/json

{
  "owner": "username",
  "repo": "repository", 
  "issue_number": 123
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "分析请求已提交"
}
```

#### AI 聊天接口

```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "如何优化这个 React 组件的性能？"
    }
  ]
}
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "content": "为了优化 React 组件性能，您可以...",
    "confidence": 0.92
  }
}
```

### 5. 系统配置

#### 获取系统配置

```http
GET /api/config
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "autoFixEnabled": true,
    "issueAnalysisEnabled": true,
    "language": "中文",
    "supportedTypes": [
      "bug", "feature", "documentation", "security",
      "performance", "configuration", "dependency", "test"
    ],
    "maxAutoFixComplexity": 3,
    "confidenceThreshold": 0.8
  }
}
```

## 错误处理

### HTTP 状态码

- `200` - 成功
- `400` - 请求参数错误
- `404` - 资源未找到
- `500` - 服务器内部错误
- `503` - 服务不可用

### 错误响应格式

```json
{
  "success": false,
  "error": "错误描述",
  "message": "详细错误信息"
}
```

### 常见错误

#### 404 - 资源未找到
```json
{
  "success": false,
  "error": "Issue未找到"
}
```

#### 400 - 参数错误
```json
{
  "success": false,
  "error": "缺少必要参数: owner, repo, issue_number"
}
```

#### 500 - 服务器错误
```json
{
  "success": false,
  "error": "AI分析服务暂时不可用"
}
```

## 速率限制

为了保护系统资源，API 实施了速率限制：

- **限制**: 100 请求 / 15 分钟
- **响应头**: 
  - `X-RateLimit-Limit` - 限制数量
  - `X-RateLimit-Remaining` - 剩余次数
  - `X-RateLimit-Reset` - 重置时间

当超过限制时，返回 429 状态码：

```json
{
  "success": false,
  "error": "请求频率过高，请稍后重试"
}
```

## SDK 和示例

### JavaScript/Node.js

```javascript
class IssuesBotAPI {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
  }

  async getStats(owner, repo) {
    const url = owner && repo 
      ? `${this.baseURL}/stats/${owner}/${repo}`
      : `${this.baseURL}/stats`;
      
    const response = await fetch(url);
    return response.json();
  }

  async analyzeIssue(owner, repo, issueNumber) {
    const response = await fetch(`${this.baseURL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        repo,
        issue_number: issueNumber
      })
    });
    return response.json();
  }

  async chat(messages) {
    const response = await fetch(`${this.baseURL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    return response.json();
  }
}

// 使用示例
const api = new IssuesBotAPI();

// 获取统计信息
const stats = await api.getStats('owner', 'repo');
console.log('Issues 统计:', stats.data);

// 触发分析
await api.analyzeIssue('owner', 'repo', 123);

// AI 聊天
const response = await api.chat([
  { role: 'user', content: '如何修复这个 bug？' }
]);
console.log('AI 回复:', response.data.content);
```

### Python

```python
import requests
import json

class IssuesBotAPI:
    def __init__(self, base_url='http://localhost:3000/api'):
        self.base_url = base_url
        
    def get_stats(self, owner=None, repo=None):
        if owner and repo:
            url = f"{self.base_url}/stats/{owner}/{repo}"
        else:
            url = f"{self.base_url}/stats"
        
        response = requests.get(url)
        return response.json()
    
    def analyze_issue(self, owner, repo, issue_number):
        url = f"{self.base_url}/analyze"
        data = {
            'owner': owner,
            'repo': repo,
            'issue_number': issue_number
        }
        
        response = requests.post(url, json=data)
        return response.json()
    
    def chat(self, messages):
        url = f"{self.base_url}/chat"
        data = {'messages': messages}
        
        response = requests.post(url, json=data)
        return response.json()

# 使用示例
api = IssuesBotAPI()

# 获取统计信息
stats = api.get_stats('owner', 'repo')
print(f"总 Issues: {stats['data']['total']}")

# AI 聊天
response = api.chat([
    {'role': 'user', 'content': '这个错误怎么解决？'}
])
print(f"AI 回复: {response['data']['content']}")
```

### curl 示例

```bash
# 获取健康状态
curl -X GET http://localhost:3000/api/health

# 获取统计信息
curl -X GET http://localhost:3000/api/stats/owner/repo

# 触发分析
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"owner":"owner","repo":"repo","issue_number":123}'

# AI 聊天
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello AI!"}]}'
```

## Webhook 集成

除了 REST API，Issues-bot 还支持 Webhook 集成，可以在特定事件发生时主动通知您的系统。

### 支持的事件

- `issue.analyzed` - Issue 分析完成
- `issue.auto_fixed` - 自动修复完成
- `system.error` - 系统错误

### Webhook 配置

在环境变量中配置 Webhook URL：

```env
WEBHOOK_URL=https://your-app.com/webhooks/issues-bot
WEBHOOK_SECRET=your_webhook_secret
```

### Webhook 载荷示例

```json
{
  "event": "issue.analyzed",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "data": {
    "repository": "owner/repo",
    "issue_number": 123,
    "analysis": {
      "type": "bug",
      "severity": "high",
      "confidence": 0.95
    }
  }
}
```

---

有关更多 API 使用示例，请参考 [示例项目](../examples/) 目录。
