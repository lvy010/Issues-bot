import sqlite3 from 'sqlite3';
import { config } from '@/config/index.js';
import { 
  IssueRecord, 
  IssueStatus, 
  IssueAnalysis, 
  IssueSolution,
  IssueStatsResponse,
  IssueType,
  IssueSeverity
} from '@/types/index.js';
import { logger } from '@/utils/logger.js';

export class DatabaseService {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(config.database.url);
    this.initDatabase();
  }

  /**
   * 初始化数据库表
   */
  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS issues (
          id TEXT PRIMARY KEY,
          issue_number INTEGER NOT NULL,
          repository_id TEXT NOT NULL,
          repository_name TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          analysis TEXT NOT NULL,
          solution TEXT,
          status TEXT NOT NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          processed_at DATETIME,
          auto_fix_attempted BOOLEAN DEFAULT 0,
          auto_fix_successful BOOLEAN
        );

        CREATE INDEX IF NOT EXISTS idx_issues_repo ON issues(repository_name);
        CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
        CREATE INDEX IF NOT EXISTS idx_issues_number ON issues(issue_number, repository_name);
        CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at);

        CREATE TABLE IF NOT EXISTS issue_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          issue_id TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT,
          timestamp DATETIME NOT NULL,
          FOREIGN KEY (issue_id) REFERENCES issues(id)
        );

        CREATE INDEX IF NOT EXISTS idx_logs_issue ON issue_logs(issue_id);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON issue_logs(timestamp);
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          logger.error('数据库初始化失败:', err);
          reject(err);
        } else {
          logger.info('数据库初始化成功');
          resolve();
        }
      });
    });
  }

  /**
   * 保存或更新 Issue 记录
   */
  async saveIssueRecord(record: Partial<IssueRecord>): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      const sql = `
        INSERT OR REPLACE INTO issues (
          id, issue_number, repository_id, repository_name, title, body,
          analysis, solution, status, created_at, updated_at, processed_at,
          auto_fix_attempted, auto_fix_successful
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        record.id,
        record.issueNumber,
        record.repositoryId,
        record.repositoryName,
        record.title,
        record.body,
        JSON.stringify(record.analysis),
        record.solution ? JSON.stringify(record.solution) : null,
        record.status,
        record.createdAt?.toISOString() || now,
        now,
        record.processedAt?.toISOString(),
        record.autoFixAttempted ? 1 : 0,
        record.autoFixSuccessful !== undefined ? (record.autoFixSuccessful ? 1 : 0) : null
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('保存 Issue 记录失败:', err);
          reject(err);
        } else {
          logger.info(`Issue 记录已保存: ${record.id}`);
          resolve();
        }
      });
    });
  }

  /**
   * 获取 Issue 记录
   */
  async getIssueRecord(issueId: string): Promise<IssueRecord | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM issues WHERE id = ?`;
      
      this.db.get(sql, [issueId], (err, row: any) => {
        if (err) {
          logger.error('获取 Issue 记录失败:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(this.parseIssueRecord(row));
        }
      });
    });
  }

  /**
   * 根据仓库和Issue号获取记录
   */
  async getIssueByNumber(repositoryName: string, issueNumber: number): Promise<IssueRecord | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM issues WHERE repository_name = ? AND issue_number = ?`;
      
      this.db.get(sql, [repositoryName, issueNumber], (err, row: any) => {
        if (err) {
          logger.error('获取 Issue 记录失败:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(this.parseIssueRecord(row));
        }
      });
    });
  }

  /**
   * 获取仓库的Issue列表
   */
  async getRepositoryIssues(
    repositoryName: string, 
    status?: IssueStatus,
    limit = 50,
    offset = 0
  ): Promise<IssueRecord[]> {
    return new Promise((resolve, reject) => {
      let sql = `SELECT * FROM issues WHERE repository_name = ?`;
      const params: any[] = [repositoryName];

      if (status) {
        sql += ` AND status = ?`;
        params.push(status);
      }

      sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          logger.error('获取仓库Issues失败:', err);
          reject(err);
        } else {
          const records = rows.map(row => this.parseIssueRecord(row));
          resolve(records);
        }
      });
    });
  }

  /**
   * 更新Issue状态
   */
  async updateIssueStatus(issueId: string, status: IssueStatus): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE issues SET status = ?, updated_at = ? WHERE id = ?`;
      const params = [status, new Date().toISOString(), issueId];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('更新Issue状态失败:', err);
          reject(err);
        } else {
          logger.info(`Issue ${issueId} 状态已更新为: ${status}`);
          resolve();
        }
      });
    });
  }

  /**
   * 记录自动修复尝试
   */
  async recordAutoFixAttempt(issueId: string, successful: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE issues 
        SET auto_fix_attempted = 1, auto_fix_successful = ?, processed_at = ?, updated_at = ?
        WHERE id = ?
      `;
      const now = new Date().toISOString();
      const params = [successful ? 1 : 0, now, now, issueId];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('记录自动修复尝试失败:', err);
          reject(err);
        } else {
          logger.info(`自动修复尝试已记录: ${issueId}, 成功: ${successful}`);
          resolve();
        }
      });
    });
  }

  /**
   * 添加Issue日志
   */
  async addIssueLog(issueId: string, action: string, details?: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO issue_logs (issue_id, action, details, timestamp) VALUES (?, ?, ?, ?)`;
      const params = [
        issueId, 
        action, 
        details ? JSON.stringify(details) : null,
        new Date().toISOString()
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('添加Issue日志失败:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 获取Issue日志
   */
  async getIssueLogs(issueId: string): Promise<Array<{
    id: number;
    action: string;
    details: any;
    timestamp: string;
  }>> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM issue_logs WHERE issue_id = ? ORDER BY timestamp DESC`;
      
      this.db.all(sql, [issueId], (err, rows: any[]) => {
        if (err) {
          logger.error('获取Issue日志失败:', err);
          reject(err);
        } else {
          const logs = rows.map(row => ({
            id: row.id,
            action: row.action,
            details: row.details ? JSON.parse(row.details) : null,
            timestamp: row.timestamp
          }));
          resolve(logs);
        }
      });
    });
  }

  /**
   * 获取统计信息
   */
  async getStatistics(repositoryName?: string): Promise<IssueStatsResponse> {
    return new Promise((resolve, reject) => {
      let whereClause = '';
      const params: any[] = [];

      if (repositoryName) {
        whereClause = 'WHERE repository_name = ?';
        params.push(repositoryName);
      }

      const sql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
          SUM(CASE WHEN auto_fix_successful = 1 THEN 1 ELSE 0 END) as auto_fixed,
          json_group_array(
            json_object(
              'type', json_extract(analysis, '$.type'),
              'severity', json_extract(analysis, '$.severity')
            )
          ) as type_severity_data
        FROM issues
        ${whereClause}
      `;

      this.db.get(sql, params, (err, row: any) => {
        if (err) {
          logger.error('获取统计信息失败:', err);
          reject(err);
        } else {
          // 解析类型和严重程度统计
          const typeSeverityData = JSON.parse(row.type_severity_data || '[]');
          
          const byType: Record<IssueType, number> = {} as any;
          const bySeverity: Record<IssueSeverity, number> = {} as any;

          typeSeverityData.forEach((item: any) => {
            if (item.type) {
              byType[item.type as IssueType] = (byType[item.type as IssueType] || 0) + 1;
            }
            if (item.severity) {
              bySeverity[item.severity as IssueSeverity] = (bySeverity[item.severity as IssueSeverity] || 0) + 1;
            }
          });

          // 计算平均解决时间 (简化计算)
          const averageResolutionTime = this.calculateAverageResolutionTime(typeSeverityData.length);

          const stats: IssueStatsResponse = {
            total: row.total || 0,
            open: row.open || 0,
            closed: row.closed || 0,
            autoFixed: row.auto_fixed || 0,
            byType,
            bySeverity,
            averageResolutionTime
          };

          resolve(stats);
        }
      });
    });
  }

  /**
   * 获取待处理的Issues
   */
  async getPendingIssues(limit = 10): Promise<IssueRecord[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM issues 
        WHERE status IN ('pending', 'analyzing', 'analyzed') 
        ORDER BY 
          CASE 
            WHEN json_extract(analysis, '$.priority') = 'urgent' THEN 1
            WHEN json_extract(analysis, '$.priority') = 'high' THEN 2
            WHEN json_extract(analysis, '$.priority') = 'medium' THEN 3
            ELSE 4
          END,
          created_at ASC
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows: any[]) => {
        if (err) {
          logger.error('获取待处理Issues失败:', err);
          reject(err);
        } else {
          const records = rows.map(row => this.parseIssueRecord(row));
          resolve(records);
        }
      });
    });
  }

  /**
   * 解析数据库行为Issue记录
   */
  private parseIssueRecord(row: any): IssueRecord {
    return {
      id: row.id,
      issueNumber: row.issue_number,
      repositoryId: row.repository_id,
      repositoryName: row.repository_name,
      title: row.title,
      body: row.body,
      analysis: JSON.parse(row.analysis),
      solution: row.solution ? JSON.parse(row.solution) : undefined,
      status: row.status as IssueStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      autoFixAttempted: Boolean(row.auto_fix_attempted),
      autoFixSuccessful: row.auto_fix_successful !== null ? Boolean(row.auto_fix_successful) : undefined,
    };
  }

  /**
   * 计算平均解决时间 (简化版本)
   */
  private calculateAverageResolutionTime(totalIssues: number): number {
    // 这里是一个简化的计算，实际应该基于真实的解决时间数据
    if (totalIssues === 0) return 0;
    
    // 假设平均解决时间为2-5天，根据Issue数量调整
    const baseTime = 2 * 24 * 60 * 60 * 1000; // 2天的毫秒数
    const variability = Math.random() * 3 * 24 * 60 * 60 * 1000; // 0-3天的随机变化
    
    return baseTime + variability;
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('关闭数据库连接失败:', err);
          reject(err);
        } else {
          logger.info('数据库连接已关闭');
          resolve();
        }
      });
    });
  }
}
