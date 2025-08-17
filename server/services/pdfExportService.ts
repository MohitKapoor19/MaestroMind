import { storage } from '../storage';

interface ExportOptions {
  format: 'pdf' | 'html' | 'markdown';
  includeMetrics?: boolean;
  includeAgentDetails?: boolean;
  includeTimeline?: boolean;
  customTemplate?: string;
}

interface TaskExportData {
  task: any;
  agents: any[];
  executions: any[];
  collaborations: any[];
  logs: any[];
  metrics: any;
  timeline?: any[];
}

export class PDFExportService {
  async exportTaskToPDF(taskId: string, options: ExportOptions = {}): Promise<Buffer> {
    try {
      // Gather all task data
      const exportData = await this.gatherTaskData(taskId, options);
      
      // Generate HTML content
      const htmlContent = this.generateHTMLContent(exportData, options);
      
      if (options.format === 'html') {
        return Buffer.from(htmlContent, 'utf-8');
      }
      
      if (options.format === 'markdown') {
        const markdownContent = this.generateMarkdownContent(exportData, options);
        return Buffer.from(markdownContent, 'utf-8');
      }
      
      // For PDF generation, we would typically use puppeteer or similar
      // For now, return HTML as a placeholder
      const pdfContent = await this.generatePDFFromHTML(htmlContent);
      
      // Log the export
      await storage.createLog({
        level: 'info',
        category: 'export',
        message: `Task exported to ${options.format}`,
        data: {
          taskId,
          format: options.format,
          includeMetrics: options.includeMetrics,
          includeAgentDetails: options.includeAgentDetails,
          includeTimeline: options.includeTimeline
        },
        taskId: taskId,
      });
      
      return pdfContent;
    } catch (error) {
      await storage.createLog({
        level: 'error',
        category: 'export',
        message: `Failed to export task: ${error}`,
        data: { taskId, options },
        taskId: taskId,
      });
      throw error;
    }
  }

  private async gatherTaskData(taskId: string, options: ExportOptions): Promise<TaskExportData> {
    // Get task details
    const task = await storage.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Get agents
    const agents = await storage.getAgentsByTaskId(taskId);
    
    // Get executions
    const executions = await storage.getExecutionsByTaskId(taskId);
    
    // Get collaborations
    const collaborations = await storage.getCollaborationsByTaskId(taskId);
    
    // Get logs
    const logs = await storage.getLogsByTaskId(taskId);
    
    // Calculate metrics
    const metrics = await this.calculateTaskMetrics(taskId, executions, agents);
    
    // Get timeline if requested
    let timeline = undefined;
    if (options.includeTimeline) {
      timeline = await this.getTaskTimeline(taskId);
    }

    return {
      task,
      agents,
      executions,
      collaborations,
      logs,
      metrics,
      timeline
    };
  }

  private generateHTMLContent(data: TaskExportData, options: ExportOptions): string {
    const { task, agents, executions, metrics, timeline } = data;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Report: ${task.title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: white;
        }
        .header {
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #1e40af;
            margin: 0;
            font-size: 2.5em;
        }
        .header .subtitle {
            color: #6b7280;
            font-size: 1.1em;
            margin-top: 5px;
        }
        .section {
            margin-bottom: 40px;
            padding: 20px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #fafafa;
        }
        .section h2 {
            color: #1f2937;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
            margin-top: 0;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric-card {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #3b82f6;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 1.8em;
            font-weight: bold;
            color: #3b82f6;
        }
        .metric-label {
            color: #6b7280;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .agent-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }
        .agent-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #d1d5db;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .agent-name {
            font-weight: bold;
            color: #1f2937;
            font-size: 1.2em;
            margin-bottom: 5px;
        }
        .agent-role {
            color: #6b7280;
            font-style: italic;
            margin-bottom: 15px;
        }
        .agent-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-completed { background: #dcfce7; color: #166534; }
        .status-running { background: #dbeafe; color: #1d4ed8; }
        .status-failed { background: #fee2e2; color: #dc2626; }
        .status-pending { background: #fef3c7; color: #d97706; }
        .timeline-item {
            display: flex;
            margin-bottom: 15px;
            padding: 10px;
            background: white;
            border-radius: 6px;
            border-left: 3px solid #e5e7eb;
        }
        .timeline-time {
            min-width: 120px;
            color: #6b7280;
            font-size: 0.9em;
        }
        .timeline-content {
            flex: 1;
        }
        .timeline-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .timeline-description {
            color: #6b7280;
            font-size: 0.9em;
        }
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 0.9em;
        }
        @media print {
            body { margin: 0; padding: 15px; }
            .section { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${task.title}</h1>
        <div class="subtitle">
            Task Report • Generated on ${new Date().toLocaleString()}
        </div>
        <div class="subtitle">
            Status: <span class="agent-status status-${task.status}">${task.status}</span>
        </div>
    </div>

    <div class="section">
        <h2>Task Overview</h2>
        <p><strong>Description:</strong> ${task.description || 'No description provided'}</p>
        <p><strong>Priority:</strong> ${task.priority}</p>
        <p><strong>Created:</strong> ${new Date(task.createdAt).toLocaleString()}</p>
        ${task.completedAt ? `<p><strong>Completed:</strong> ${new Date(task.completedAt).toLocaleString()}</p>` : ''}
        ${task.estimatedDuration ? `<p><strong>Estimated Duration:</strong> ${task.estimatedDuration}</p>` : ''}
    </div>

    ${options.includeMetrics !== false ? `
    <div class="section">
        <h2>Performance Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${agents.length}</div>
                <div class="metric-label">Total Agents</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${executions.length}</div>
                <div class="metric-label">Executions</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">$${metrics.totalCost.toFixed(4)}</div>
                <div class="metric-label">Total Cost</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.totalTokens.toLocaleString()}</div>
                <div class="metric-label">Tokens Used</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.successRate}%</div>
                <div class="metric-label">Success Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${metrics.avgExecutionTime}ms</div>
                <div class="metric-label">Avg Execution Time</div>
            </div>
        </div>
    </div>
    ` : ''}

    ${options.includeAgentDetails !== false ? `
    <div class="section">
        <h2>Agent Details</h2>
        <div class="agent-grid">
            ${agents.map(agent => `
                <div class="agent-card">
                    <div class="agent-name">${agent.name}</div>
                    <div class="agent-role">${agent.role}</div>
                    <div class="agent-status status-${agent.status || 'pending'}">${agent.status || 'pending'}</div>
                    <p><strong>Description:</strong> ${agent.description || 'No description'}</p>
                    ${agent.toolset && agent.toolset.length > 0 ? `
                        <p><strong>Tools:</strong> ${agent.toolset.join(', ')}</p>
                    ` : ''}
                    ${agent.suggestions ? `
                        <p><strong>Suggestions:</strong> ${agent.suggestions}</p>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    </div>
    ` : ''}

    ${options.includeTimeline && timeline ? `
    <div class="section">
        <h2>Execution Timeline</h2>
        <div class="timeline">
            ${timeline.map(item => `
                <div class="timeline-item">
                    <div class="timeline-time">${new Date(item.timestamp).toLocaleString()}</div>
                    <div class="timeline-content">
                        <div class="timeline-title">${item.title}</div>
                        <div class="timeline-description">${item.description}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
    ` : ''}

    <div class="footer">
        <p>Generated by MaestroMind • ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;
  }

  private generateMarkdownContent(data: TaskExportData, options: ExportOptions): string {
    const { task, agents, executions, metrics, timeline } = data;
    
    let markdown = `# Task Report: ${task.title}\n\n`;
    markdown += `**Generated:** ${new Date().toLocaleString()}\n`;
    markdown += `**Status:** ${task.status}\n\n`;
    
    markdown += `## Task Overview\n\n`;
    markdown += `- **Description:** ${task.description || 'No description provided'}\n`;
    markdown += `- **Priority:** ${task.priority}\n`;
    markdown += `- **Created:** ${new Date(task.createdAt).toLocaleString()}\n`;
    if (task.completedAt) {
      markdown += `- **Completed:** ${new Date(task.completedAt).toLocaleString()}\n`;
    }
    if (task.estimatedDuration) {
      markdown += `- **Estimated Duration:** ${task.estimatedDuration}\n`;
    }
    markdown += `\n`;

    if (options.includeMetrics !== false) {
      markdown += `## Performance Metrics\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      markdown += `| Total Agents | ${agents.length} |\n`;
      markdown += `| Executions | ${executions.length} |\n`;
      markdown += `| Total Cost | $${metrics.totalCost.toFixed(4)} |\n`;
      markdown += `| Tokens Used | ${metrics.totalTokens.toLocaleString()} |\n`;
      markdown += `| Success Rate | ${metrics.successRate}% |\n`;
      markdown += `| Avg Execution Time | ${metrics.avgExecutionTime}ms |\n\n`;
    }

    if (options.includeAgentDetails !== false) {
      markdown += `## Agent Details\n\n`;
      agents.forEach(agent => {
        markdown += `### ${agent.name}\n\n`;
        markdown += `- **Role:** ${agent.role}\n`;
        markdown += `- **Status:** ${agent.status || 'pending'}\n`;
        markdown += `- **Description:** ${agent.description || 'No description'}\n`;
        if (agent.toolset && agent.toolset.length > 0) {
          markdown += `- **Tools:** ${agent.toolset.join(', ')}\n`;
        }
        if (agent.suggestions) {
          markdown += `- **Suggestions:** ${agent.suggestions}\n`;
        }
        markdown += `\n`;
      });
    }

    if (options.includeTimeline && timeline) {
      markdown += `## Execution Timeline\n\n`;
      timeline.forEach(item => {
        markdown += `### ${new Date(item.timestamp).toLocaleString()}\n`;
        markdown += `**${item.title}**\n\n`;
        markdown += `${item.description}\n\n`;
      });
    }

    markdown += `---\n\n`;
    markdown += `*Generated by MaestroMind on ${new Date().toLocaleDateString()}*\n`;
    
    return markdown;
  }

  private async generatePDFFromHTML(htmlContent: string): Promise<Buffer> {
    // In a real implementation, you would use puppeteer or similar:
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.setContent(htmlContent);
    // const pdf = await page.pdf({ format: 'A4', printBackground: true });
    // await browser.close();
    // return pdf;
    
    // For now, return the HTML content as bytes
    return Buffer.from(htmlContent, 'utf-8');
  }

  private async calculateTaskMetrics(taskId: string, executions: any[], agents: any[]): Promise<any> {
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.status === 'completed').length;
    const successRate = totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0;
    
    const totalCost = executions.reduce((sum, e) => sum + (e.cost || 0), 0);
    const totalTokens = executions.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);
    
    const executionTimes = executions
      .filter(e => e.completedAt && e.startedAt)
      .map(e => new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime());
    
    const avgExecutionTime = executionTimes.length > 0 
      ? Math.round(executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length)
      : 0;

    return {
      totalExecutions,
      successfulExecutions,
      successRate,
      totalCost,
      totalTokens,
      avgExecutionTime,
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length
    };
  }

  private async getTaskTimeline(taskId: string): Promise<any[]> {
    // This would integrate with the timeline service
    // For now, return a placeholder
    return [
      {
        id: '1',
        title: 'Task Created',
        description: 'Task was created and initialized',
        timestamp: new Date(),
        type: 'task_created'
      },
      {
        id: '2',
        title: 'Agents Generated',
        description: 'AI agents were generated for the task',
        timestamp: new Date(),
        type: 'agents_created'
      }
    ];
  }

  async getExportHistory(taskId?: string): Promise<any[]> {
    try {
      // Get export logs
      const logs = await storage.getLogsByFilter({
        category: 'export',
        taskId: taskId,
        limit: 50
      });
      
      return logs.map(log => ({
        id: log.id,
        taskId: log.taskId,
        format: log.data?.format,
        timestamp: log.timestamp,
        success: log.level !== 'error'
      }));
    } catch (error) {
      console.error('Failed to get export history:', error);
      return [];
    }
  }
}

export const pdfExportService = new PDFExportService();