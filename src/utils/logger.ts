import log from 'loglevel';
import { config } from '@/config/index.js';

// 配置日志级别
const logLevel = config.server.logLevel as log.LogLevelDesc;
log.setLevel(logLevel);

// 自定义日志格式
const originalFactory = log.methodFactory;
log.methodFactory = function (methodName, logLevel, loggerName) {
  const rawMethod = originalFactory(methodName, logLevel, loggerName);
  
  return function (...args) {
    const timestamp = new Date().toISOString();
    const level = methodName.toUpperCase().padEnd(5);
    const prefix = `[${timestamp}] ${level}`;
    
    rawMethod(prefix, ...args);
  };
};

// 重新应用配置
log.setLevel(log.getLevel());

export const logger = {
  debug: log.debug.bind(log),
  info: log.info.bind(log),
  warn: log.warn.bind(log),
  error: log.error.bind(log),
  
  // 格式化对象日志
  logObject: (level: 'debug' | 'info' | 'warn' | 'error', message: string, obj: any) => {
    log[level](message, JSON.stringify(obj, null, 2));
  },
  
  // 性能日志
  time: (label: string) => {
    console.time(`⏱️  ${label}`);
  },
  
  timeEnd: (label: string) => {
    console.timeEnd(`⏱️  ${label}`);
  },
  
  // Issue 相关的结构化日志
  logIssue: (action: string, issueNumber: number, repo: string, details?: any) => {
    const logData = {
      action,
      issue: issueNumber,
      repository: repo,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    log.info(`🎯 Issue ${action}:`, JSON.stringify(logData, null, 2));
  },
  
  // AI 处理日志
  logAI: (operation: string, details?: any) => {
    const logData = {
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    log.info(`🤖 AI ${operation}:`, JSON.stringify(logData, null, 2));
  },
  
  // GitHub API 日志
  logGitHub: (action: string, details?: any) => {
    const logData = {
      action,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    log.info(`🐙 GitHub ${action}:`, JSON.stringify(logData, null, 2));
  },
  
  // 错误日志增强
  logError: (context: string, error: Error | any, additionalInfo?: any) => {
    const errorData = {
      context,
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      ...additionalInfo
    };
    
    log.error(`❌ Error in ${context}:`, JSON.stringify(errorData, null, 2));
  },
  
  // 成功操作日志
  logSuccess: (operation: string, details?: any) => {
    const logData = {
      operation,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    log.info(`✅ Success ${operation}:`, JSON.stringify(logData, null, 2));
  }
};

export default logger;
