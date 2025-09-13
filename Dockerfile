# 使用官方 Node.js 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 创建数据目录
RUN mkdir -p /app/data

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY dist/ ./dist/
COPY public/ ./public/

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S issuesbot -u 1001

# 设置数据目录权限
RUN chown -R issuesbot:nodejs /app/data

# 切换到非 root 用户
USER issuesbot

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).end()"

# 启动应用
CMD ["node", "dist/index.js"]
