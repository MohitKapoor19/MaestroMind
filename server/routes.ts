import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { taskService } from "./services/taskService";
import { agentService } from "./services/agentService";
import { n8nService } from "./services/n8nService";
import { taskQueueService } from "./services/taskQueueService";
import { budgetService } from "./services/budgetService";
import { errorRecoveryService } from "./services/errorRecoveryService";
import { templateService } from "./services/templateService";
import { timelineService } from "./services/timelineService";
import { serviceManager } from "./services/serviceManager";
import { 
  insertTaskSchema, 
  insertAgentSchema,
  insertTaskQueueSchema,
  insertBudgetSchema,
  insertAgentTemplateSchema
} from "@shared/schema";
import type { 
  RealtimeUpdate, 
  TaskCreationRequest, 
  FileUploadData,
  InsertTaskQueue,
  InsertBudget,
  InsertAgentTemplate
} from "@shared/schema";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// WebSocket clients for real-time updates
const wsClients = new Set<WebSocket>();

// Broadcast real-time updates to all connected clients
function broadcastUpdate(update: RealtimeUpdate): void {
  const message = JSON.stringify(update);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    clientTracking: true,
    perMessageDeflate: false
  });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    });

    // Send initial connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connection',
        data: { status: 'connected', timestamp: new Date().toISOString() },
      }));
    }
  });

  // API Routes

  // Dashboard and metrics
  app.get('/api/dashboard/metrics', async (req, res) => {
    try {
      const metrics = await taskService.getDashboardMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Failed to get dashboard metrics:', error);
      res.status(500).json({ message: 'Failed to get dashboard metrics' });
    }
  });

  // System status and health endpoints
  app.get('/api/system/status', async (req, res) => {
    try {
      const status = await serviceManager.getSystemStatus();
      res.json(status);
    } catch (error) {
      console.error('Failed to get system status:', error);
      res.status(500).json({ message: 'Failed to get system status' });
    }
  });

  app.get('/api/system/health', async (req, res) => {
    try {
      const health = await serviceManager.healthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 
                         health.status === 'degraded' ? 206 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      console.error('Failed to get health status:', error);
      res.status(503).json({ 
        status: 'unhealthy',
        services: { healthCheck: 'error' },
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/api/system/initialized', async (req, res) => {
    try {
      res.json({ initialized: serviceManager.isInitialized() });
    } catch (error) {
      res.json({ initialized: false });
    }
  });

  // Task management
  app.get('/api/tasks', async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error('Failed to get tasks:', error);
      res.status(500).json({ message: 'Failed to get tasks' });
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const task = await storage.getTaskWithAgents(req.params.id);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      console.error('Failed to get task:', error);
      res.status(500).json({ message: 'Failed to get task' });
    }
  });

  app.get('/api/tasks/:id/status', async (req, res) => {
    try {
      const status = await taskService.getTaskStatus(req.params.id);
      res.json(status);
    } catch (error) {
      console.error('Failed to get task status:', error);
      res.status(500).json({ message: 'Failed to get task status' });
    }
  });

  app.post('/api/tasks', upload.array('files'), async (req, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      
      // Handle uploaded files
      const files = (req.files as Express.Multer.File[]) || [];
      const fileData: FileUploadData[] = await Promise.all(files.map(async (file) => {
        const newPath = path.join('uploads', `${Date.now()}-${file.originalname}`);
        await fs.rename(file.path, newPath);
        
        return {
          filename: path.basename(newPath),
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: newPath,
        };
      }));

      const taskRequest: TaskCreationRequest = {
        ...taskData,
        priority: taskData.priority || 'medium',
        files: fileData,
      };

      const task = await taskService.createTask(taskRequest);

      // Broadcast real-time update
      broadcastUpdate({
        type: 'task_update',
        data: { action: 'created', task },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(task);
    } catch (error) {
      console.error('Failed to create task:', error);
      res.status(500).json({ message: 'Failed to create task' });
    }
  });

  app.post('/api/tasks/:id/execute', async (req, res) => {
    try {
      const { autoStart = true } = req.body;
      
      // Start task execution asynchronously
      taskService.executeTask({
        taskId: req.params.id,
        autoStart,
      }).catch(error => {
        console.error('Task execution failed:', error);
        broadcastUpdate({
          type: 'task_update',
          data: { action: 'failed', taskId: req.params.id, error: error.message },
          timestamp: new Date().toISOString(),
        });
      });

      res.json({ message: 'Task execution started' });
    } catch (error) {
      console.error('Failed to start task execution:', error);
      res.status(500).json({ message: 'Failed to start task execution' });
    }
  });

  // Agent management
  app.get('/api/agents', async (req, res) => {
    try {
      const { taskId } = req.query;
      let agents: any[] = [];
      
      if (taskId) {
        agents = await storage.getAgentsByTask(taskId as string);
      } else {
        // Get all agents (for debugging/admin purposes)
        agents = [];
      }
      
      res.json(agents);
    } catch (error) {
      console.error('Failed to get agents:', error);
      res.status(500).json({ message: 'Failed to get agents' });
    }
  });

  app.get('/api/agents/:id', async (req, res) => {
    try {
      const agent = await storage.getAgentWithExecutions(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: 'Agent not found' });
      }
      res.json(agent);
    } catch (error) {
      console.error('Failed to get agent:', error);
      res.status(500).json({ message: 'Failed to get agent' });
    }
  });

  app.get('/api/agents/:id/status', async (req, res) => {
    try {
      const status = await agentService.getAgentStatus(req.params.id);
      res.json(status);
    } catch (error) {
      console.error('Failed to get agent status:', error);
      res.status(500).json({ message: 'Failed to get agent status' });
    }
  });

  app.post('/api/agents/:id/execute', async (req, res) => {
    try {
      const { action, input, context } = req.body;
      
      const execution = await agentService.executeAgentAction({
        agentId: req.params.id,
        action,
        input,
        context,
      });

      // Broadcast real-time update
      broadcastUpdate({
        type: 'agent_update',
        data: { action: 'executed', agentId: req.params.id, execution },
        timestamp: new Date().toISOString(),
      });

      res.json(execution);
    } catch (error) {
      console.error('Failed to execute agent action:', error);
      res.status(500).json({ message: 'Failed to execute agent action' });
    }
  });

  // Agent collaborations
  app.post('/api/collaborations', async (req, res) => {
    try {
      const { fromAgentId, toAgentId, collaborationType, content } = req.body;
      
      const result = await agentService.facilitateCollaboration({
        fromAgentId,
        toAgentId,
        collaborationType,
        content,
      });

      // Broadcast real-time update
      broadcastUpdate({
        type: 'agent_update',
        data: { action: 'collaboration', collaboration: result.collaboration },
        timestamp: new Date().toISOString(),
      });

      res.json(result);
    } catch (error) {
      console.error('Failed to facilitate collaboration:', error);
      res.status(500).json({ message: 'Failed to facilitate collaboration' });
    }
  });

  // System logs and monitoring
  app.get('/api/logs', async (req, res) => {
    try {
      const {
        level,
        category,
        taskId,
        agentId,
        limit = '100',
      } = req.query;

      const logs = await storage.getLogs({
        level: level as string,
        category: category as string,
        taskId: taskId as string,
        agentId: agentId as string,
        limit: parseInt(limit as string),
      });

      res.json(logs);
    } catch (error) {
      console.error('Failed to get logs:', error);
      res.status(500).json({ message: 'Failed to get logs' });
    }
  });

  // File management
  app.get('/api/tasks/:id/files', async (req, res) => {
    try {
      const files = await storage.getFilesByTask(req.params.id);
      res.json(files);
    } catch (error) {
      console.error('Failed to get task files:', error);
      res.status(500).json({ message: 'Failed to get task files' });
    }
  });

  app.get('/api/files/:id/download', async (req, res) => {
    try {
      // Find file by ID
      const files = await storage.getFilesByTask(''); // This is a simplified approach
      const file = files.find(f => f.id === req.params.id);
      
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }

      res.download(file.path, file.originalName);
    } catch (error) {
      console.error('Failed to download file:', error);
      res.status(500).json({ message: 'Failed to download file' });
    }
  });

  // Observer and monitoring endpoints
  app.post('/api/tasks/:id/observe', async (req, res) => {
    try {
      const { type = 'execution' } = req.body;
      
      const observation = await agentService.observeAndRefine(
        req.params.id,
        type as 'plan' | 'execution'
      );

      res.json(observation);
    } catch (error) {
      console.error('Failed to perform observation:', error);
      res.status(500).json({ message: 'Failed to perform observation' });
    }
  });

  // Human-in-the-Loop (HITL) Control Endpoints
  app.post('/api/tasks/:id/pause', async (req, res) => {
    try {
      await storage.updateTask(req.params.id, { 
        status: 'paused',
        updatedAt: new Date()
      });
      
      broadcastUpdate({
        type: 'task_update',
        taskId: req.params.id,
        data: { status: 'paused' },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Task paused' });
    } catch (error) {
      console.error('Failed to pause task:', error);
      res.status(500).json({ message: 'Failed to pause task' });
    }
  });

  app.post('/api/tasks/:id/resume', async (req, res) => {
    try {
      await storage.updateTask(req.params.id, { 
        status: 'running',
        updatedAt: new Date()
      });
      
      broadcastUpdate({
        type: 'task_update',
        taskId: req.params.id,
        data: { status: 'running' },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Task resumed' });
    } catch (error) {
      console.error('Failed to resume task:', error);
      res.status(500).json({ message: 'Failed to resume task' });
    }
  });

  app.post('/api/agents/:id/approve', async (req, res) => {
    try {
      const { feedback } = req.body;
      
      await storage.updateAgent(req.params.id, { 
        status: 'approved',
        memoryContext: {
          ...((await storage.getAgent(req.params.id))?.memoryContext || {}),
          humanFeedback: feedback,
          approvedAt: new Date().toISOString(),
        },
        updatedAt: new Date()
      });

      broadcastUpdate({
        type: 'agent_update',
        agentId: req.params.id,
        data: { status: 'approved', feedback },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Agent approved' });
    } catch (error) {
      console.error('Failed to approve agent:', error);
      res.status(500).json({ message: 'Failed to approve agent' });
    }
  });

  app.post('/api/agents/:id/reject', async (req, res) => {
    try {
      const { reason } = req.body;
      
      await storage.updateAgent(req.params.id, { 
        status: 'rejected',
        memoryContext: {
          ...((await storage.getAgent(req.params.id))?.memoryContext || {}),
          rejectionReason: reason,
          rejectedAt: new Date().toISOString(),
        },
        updatedAt: new Date()
      });

      broadcastUpdate({
        type: 'agent_update',
        agentId: req.params.id,
        data: { status: 'rejected', reason },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Agent rejected' });
    } catch (error) {
      console.error('Failed to reject agent:', error);
      res.status(500).json({ message: 'Failed to reject agent' });
    }
  });

  app.post('/api/agents/:id/modify', async (req, res) => {
    try {
      const { prompt, description, toolset, suggestions } = req.body;
      const updates: any = {};
      
      if (prompt !== undefined) updates.prompt = prompt;
      if (description !== undefined) updates.description = description;
      if (toolset !== undefined) updates.toolset = toolset;
      if (suggestions !== undefined) updates.suggestions = suggestions;
      
      updates.updatedAt = new Date();
      
      await storage.updateAgent(req.params.id, updates);

      broadcastUpdate({
        type: 'agent_update',
        agentId: req.params.id,
        data: { modified: true, updates },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Agent modified', updates });
    } catch (error) {
      console.error('Failed to modify agent:', error);
      res.status(500).json({ message: 'Failed to modify agent' });
    }
  });

  app.post('/api/agents/:id/step', async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: 'Agent not found' });
      }

      // Execute single step for the agent
      const execution = await agentService.executeAgentAction({
        agentId: req.params.id,
        action: 'step',
        input: req.body.input || {},
        context: req.body.context,
      });

      broadcastUpdate({
        type: 'agent_update',
        agentId: req.params.id,
        data: { step: 'completed', execution },
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, execution });
    } catch (error) {
      console.error('Failed to step agent:', error);
      res.status(500).json({ message: 'Failed to step agent' });
    }
  });

  // Export endpoints for tasks
  app.get('/api/tasks/:id/export.md', async (req, res) => {
    try {
      const task = await storage.getTaskWithAgents(req.params.id);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      const executions = await storage.getExecutionsByTask(req.params.id);
      const plans = await storage.getExecutionPlansByTask(req.params.id);
      const logs = await storage.getLogsByTask(req.params.id);

      // Generate Markdown report
      let markdown = `# Task Report: ${task.title}\n\n`;
      markdown += `**ID:** ${task.id}\n`;
      markdown += `**Status:** ${task.status}\n`;
      markdown += `**Priority:** ${task.priority}\n`;
      markdown += `**Created:** ${task.createdAt}\n`;
      markdown += `**Updated:** ${task.updatedAt}\n\n`;
      
      markdown += `## Description\n\n${task.description}\n\n`;
      
      markdown += `## Agents (${task.agents.length})\n\n`;
      for (const agent of task.agents) {
        markdown += `### ${agent.name} (${agent.role})\n`;
        markdown += `- **Status:** ${agent.status}\n`;
        markdown += `- **Confidence:** ${agent.confidence}%\n`;
        markdown += `- **Description:** ${agent.description}\n`;
        markdown += `- **Toolset:** ${agent.toolset.join(', ')}\n`;
        markdown += `- **Suggestions:** ${agent.suggestions}\n\n`;
      }

      markdown += `## Execution Plan\n\n`;
      if (plans.length > 0) {
        const latestPlan = plans[plans.length - 1];
        markdown += `**Status:** ${latestPlan.status}\n\n`;
        if (latestPlan.executionSteps) {
          markdown += `### Steps\n\n`;
          latestPlan.executionSteps.forEach((step: string, index: number) => {
            markdown += `${index + 1}. ${step}\n`;
          });
        }
      }

      markdown += `\n## Execution History (${executions.length} executions)\n\n`;
      for (const exec of executions.slice(-10)) {
        markdown += `- **Agent:** ${exec.agentId}\n`;
        markdown += `  - **Action:** ${exec.action}\n`;
        markdown += `  - **Status:** ${exec.status}\n`;
        markdown += `  - **Duration:** ${exec.duration}ms\n`;
        markdown += `  - **Tokens:** ${exec.tokensUsed || 0}\n`;
        markdown += `  - **Cost:** $${exec.cost || 0}\n\n`;
      }

      markdown += `## Recent Logs\n\n`;
      for (const log of logs.slice(-20)) {
        markdown += `- [${log.level.toUpperCase()}] ${log.message} (${log.createdAt})\n`;
      }

      markdown += `\n---\n*Generated on ${new Date().toISOString()}*\n`;

      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="task-${req.params.id}-report.md"`);
      res.send(markdown);
    } catch (error) {
      console.error('Failed to export task as markdown:', error);
      res.status(500).json({ message: 'Failed to export task' });
    }
  });

  app.get('/api/tasks/:id/export.json', async (req, res) => {
    try {
      const task = await storage.getTaskWithAgents(req.params.id);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      const executions = await storage.getExecutionsByTask(req.params.id);
      const plans = await storage.getExecutionPlansByTask(req.params.id);
      const logs = await storage.getLogsByTask(req.params.id);
      const metrics = await taskService.getTaskMetrics(req.params.id);

      const exportData = {
        task,
        agents: task.agents,
        executionPlans: plans,
        executions,
        logs: logs.slice(-100), // Last 100 logs
        metrics,
        exportedAt: new Date().toISOString(),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="task-${req.params.id}-export.json"`);
      res.json(exportData);
    } catch (error) {
      console.error('Failed to export task as JSON:', error);
      res.status(500).json({ message: 'Failed to export task' });
    }
  });

  // Health check endpoint
  app.get('/api/health', async (req, res) => {
    try {
      const metrics = await storage.getTaskMetrics();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        metrics,
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ===== TASK QUEUE & SCHEDULING ENDPOINTS =====

  // Queue Management
  app.get('/api/queues', async (req, res) => {
    try {
      const queues = await taskQueueService.getAllQueues();
      res.json(queues);
    } catch (error) {
      console.error('Failed to get queues:', error);
      res.status(500).json({ message: 'Failed to get queues' });
    }
  });

  app.post('/api/queues', async (req, res) => {
    try {
      const queueData = insertTaskQueueSchema.parse(req.body);
      const queue = await taskQueueService.createQueue(queueData);
      
      broadcastUpdate({
        type: 'queue_update',
        data: { action: 'created', queue },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(queue);
    } catch (error) {
      console.error('Failed to create queue:', error);
      res.status(500).json({ message: 'Failed to create queue' });
    }
  });

  app.get('/api/queues/:id', async (req, res) => {
    try {
      const queue = await taskQueueService.getQueueWithEntries(req.params.id);
      if (!queue) {
        return res.status(404).json({ message: 'Queue not found' });
      }
      res.json(queue);
    } catch (error) {
      console.error('Failed to get queue:', error);
      res.status(500).json({ message: 'Failed to get queue' });
    }
  });

  app.put('/api/queues/:id', async (req, res) => {
    try {
      const queue = await taskQueueService.updateQueue(req.params.id, req.body);
      
      broadcastUpdate({
        type: 'queue_update',
        data: { action: 'updated', queue },
        timestamp: new Date().toISOString(),
      });

      res.json(queue);
    } catch (error) {
      console.error('Failed to update queue:', error);
      res.status(500).json({ message: 'Failed to update queue' });
    }
  });

  app.delete('/api/queues/:id', async (req, res) => {
    try {
      await taskQueueService.deleteQueue(req.params.id);
      
      broadcastUpdate({
        type: 'queue_update',
        data: { action: 'deleted', queueId: req.params.id },
        timestamp: new Date().toISOString(),
      });

      res.json({ message: 'Queue deleted successfully' });
    } catch (error) {
      console.error('Failed to delete queue:', error);
      res.status(500).json({ message: 'Failed to delete queue' });
    }
  });

  app.post('/api/queues/:id/start', async (req, res) => {
    try {
      await taskQueueService.startQueueExecution(req.params.id, req.body);
      res.json({ message: 'Queue execution started' });
    } catch (error) {
      console.error('Failed to start queue:', error);
      res.status(500).json({ message: 'Failed to start queue execution' });
    }
  });

  app.post('/api/queues/:id/stop', async (req, res) => {
    try {
      await taskQueueService.stopQueueExecution(req.params.id);
      res.json({ message: 'Queue execution stopped' });
    } catch (error) {
      console.error('Failed to stop queue:', error);
      res.status(500).json({ message: 'Failed to stop queue execution' });
    }
  });

  app.post('/api/queues/:id/pause', async (req, res) => {
    try {
      await taskQueueService.pauseQueue(req.params.id);
      res.json({ message: 'Queue paused' });
    } catch (error) {
      console.error('Failed to pause queue:', error);
      res.status(500).json({ message: 'Failed to pause queue' });
    }
  });

  app.post('/api/queues/:id/resume', async (req, res) => {
    try {
      await taskQueueService.resumeQueue(req.params.id);
      res.json({ message: 'Queue resumed' });
    } catch (error) {
      console.error('Failed to resume queue:', error);
      res.status(500).json({ message: 'Failed to resume queue' });
    }
  });

  app.get('/api/queues/:id/statistics', async (req, res) => {
    try {
      const stats = await taskQueueService.getQueueStatistics(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error('Failed to get queue statistics:', error);
      res.status(500).json({ message: 'Failed to get queue statistics' });
    }
  });

  // Queue Entry Management
  app.post('/api/queues/:queueId/entries', async (req, res) => {
    try {
      const { taskId, priority, estimatedDuration, dependencies, scheduledFor, metadata } = req.body;
      
      const entry = await taskQueueService.addTaskToQueue(req.params.queueId, taskId, {
        priority,
        estimatedDuration,
        dependencies,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        metadata,
      });

      broadcastUpdate({
        type: 'queue_update',
        data: { action: 'entry_added', entry },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Failed to add task to queue:', error);
      res.status(500).json({ message: 'Failed to add task to queue' });
    }
  });

  app.get('/api/queue-entries/:id', async (req, res) => {
    try {
      const entry = await storage.getQueueEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: 'Queue entry not found' });
      }
      res.json(entry);
    } catch (error) {
      console.error('Failed to get queue entry:', error);
      res.status(500).json({ message: 'Failed to get queue entry' });
    }
  });

  app.put('/api/queue-entries/:id', async (req, res) => {
    try {
      const entry = await taskQueueService.updateQueueEntry(req.params.id, req.body);
      
      broadcastUpdate({
        type: 'queue_update',
        data: { action: 'entry_updated', entry },
        timestamp: new Date().toISOString(),
      });

      res.json(entry);
    } catch (error) {
      console.error('Failed to update queue entry:', error);
      res.status(500).json({ message: 'Failed to update queue entry' });
    }
  });

  app.delete('/api/queue-entries/:id', async (req, res) => {
    try {
      await taskQueueService.removeFromQueue(req.params.id);
      
      broadcastUpdate({
        type: 'queue_update',
        data: { action: 'entry_removed', entryId: req.params.id },
        timestamp: new Date().toISOString(),
      });

      res.json({ message: 'Queue entry removed successfully' });
    } catch (error) {
      console.error('Failed to remove queue entry:', error);
      res.status(500).json({ message: 'Failed to remove queue entry' });
    }
  });

  // Task Scheduling
  app.get('/api/schedules', async (req, res) => {
    try {
      const { active } = req.query;
      let schedules;
      
      if (active === 'true') {
        schedules = await taskQueueService.getActiveSchedules();
      } else {
        schedules = await taskQueueService.getAllSchedules();
      }
      
      res.json(schedules);
    } catch (error) {
      console.error('Failed to get schedules:', error);
      res.status(500).json({ message: 'Failed to get schedules' });
    }
  });

  app.post('/api/schedules', async (req, res) => {
    try {
      const schedule = await taskQueueService.createSchedule(req.body);
      res.status(201).json(schedule);
    } catch (error) {
      console.error('Failed to create schedule:', error);
      res.status(500).json({ message: 'Failed to create schedule' });
    }
  });

  app.put('/api/schedules/:id', async (req, res) => {
    try {
      const schedule = await taskQueueService.updateSchedule(req.params.id, req.body);
      res.json(schedule);
    } catch (error) {
      console.error('Failed to update schedule:', error);
      res.status(500).json({ message: 'Failed to update schedule' });
    }
  });

  app.delete('/api/schedules/:id', async (req, res) => {
    try {
      await taskQueueService.deleteSchedule(req.params.id);
      res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      res.status(500).json({ message: 'Failed to delete schedule' });
    }
  });

  // ===== BUDGET & COST MONITORING ENDPOINTS =====

  // Budget Management
  app.get('/api/budgets', async (req, res) => {
    try {
      const { type, entityId } = req.query;
      let budgets;
      
      if (type) {
        budgets = await budgetService.getBudgetsByType(type as string, entityId as string);
      } else {
        budgets = await budgetService.getAllBudgets();
      }
      
      res.json(budgets);
    } catch (error) {
      console.error('Failed to get budgets:', error);
      res.status(500).json({ message: 'Failed to get budgets' });
    }
  });

  app.post('/api/budgets', async (req, res) => {
    try {
      const budgetData = insertBudgetSchema.parse(req.body);
      const budget = await budgetService.createBudget(budgetData);
      
      broadcastUpdate({
        type: 'budget_update',
        data: { action: 'created', budget },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(budget);
    } catch (error) {
      console.error('Failed to create budget:', error);
      res.status(500).json({ message: 'Failed to create budget' });
    }
  });

  app.get('/api/budgets/:id', async (req, res) => {
    try {
      const budget = await budgetService.getBudgetWithCosts(req.params.id);
      if (!budget) {
        return res.status(404).json({ message: 'Budget not found' });
      }
      res.json(budget);
    } catch (error) {
      console.error('Failed to get budget:', error);
      res.status(500).json({ message: 'Failed to get budget' });
    }
  });

  app.put('/api/budgets/:id', async (req, res) => {
    try {
      const budget = await budgetService.updateBudget(req.params.id, req.body);
      
      broadcastUpdate({
        type: 'budget_update',
        data: { action: 'updated', budget },
        timestamp: new Date().toISOString(),
      });

      res.json(budget);
    } catch (error) {
      console.error('Failed to update budget:', error);
      res.status(500).json({ message: 'Failed to update budget' });
    }
  });

  app.delete('/api/budgets/:id', async (req, res) => {
    try {
      await budgetService.deleteBudget(req.params.id);
      
      broadcastUpdate({
        type: 'budget_update',
        data: { action: 'deleted', budgetId: req.params.id },
        timestamp: new Date().toISOString(),
      });

      res.json({ message: 'Budget deleted successfully' });
    } catch (error) {
      console.error('Failed to delete budget:', error);
      res.status(500).json({ message: 'Failed to delete budget' });
    }
  });

  // Budget Alerts & Monitoring
  app.get('/api/budget-alerts', async (req, res) => {
    try {
      const { critical } = req.query;
      let alerts;
      
      if (critical === 'true') {
        alerts = await budgetService.getCriticalAlerts();
      } else {
        alerts = await budgetService.getAllBudgetAlerts();
      }
      
      res.json(alerts);
    } catch (error) {
      console.error('Failed to get budget alerts:', error);
      res.status(500).json({ message: 'Failed to get budget alerts' });
    }
  });

  app.get('/api/budgets/:id/alerts', async (req, res) => {
    try {
      const alerts = await budgetService.checkBudgetAlerts(req.params.id);
      res.json(alerts);
    } catch (error) {
      console.error('Failed to check budget alerts:', error);
      res.status(500).json({ message: 'Failed to check budget alerts' });
    }
  });

  // Cost Analysis & Reporting
  app.get('/api/tasks/:id/cost-summary', async (req, res) => {
    try {
      const summary = await budgetService.getCostSummaryForTask(req.params.id);
      res.json(summary);
    } catch (error) {
      console.error('Failed to get task cost summary:', error);
      res.status(500).json({ message: 'Failed to get task cost summary' });
    }
  });

  app.get('/api/agents/:id/cost-summary', async (req, res) => {
    try {
      const summary = await budgetService.getCostSummaryForAgent(req.params.id);
      res.json(summary);
    } catch (error) {
      console.error('Failed to get agent cost summary:', error);
      res.status(500).json({ message: 'Failed to get agent cost summary' });
    }
  });

  app.get('/api/budgets/:id/period-summary', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const summary = await budgetService.getPeriodCostSummary(req.params.id, start, end);
      res.json(summary);
    } catch (error) {
      console.error('Failed to get period cost summary:', error);
      res.status(500).json({ message: 'Failed to get period cost summary' });
    }
  });

  app.post('/api/cost-estimation', async (req, res) => {
    try {
      const { taskDescription, estimatedTokens, provider } = req.body;
      const estimation = await budgetService.estimateTaskCost(taskDescription, estimatedTokens, provider);
      res.json(estimation);
    } catch (error) {
      console.error('Failed to estimate task cost:', error);
      res.status(500).json({ message: 'Failed to estimate task cost' });
    }
  });

  app.get('/api/cost-optimization', async (req, res) => {
    try {
      const suggestions = await budgetService.getCostOptimizationSuggestions();
      res.json(suggestions);
    } catch (error) {
      console.error('Failed to get cost optimization suggestions:', error);
      res.status(500).json({ message: 'Failed to get cost optimization suggestions' });
    }
  });

  // ===== ERROR RECOVERY ENDPOINTS =====

  // Error Instance Management
  app.get('/api/errors', async (req, res) => {
    try {
      const { taskId, agentId, errorType, unresolved } = req.query;
      let errors;

      if (unresolved === 'true') {
        errors = await errorRecoveryService.getUnresolvedErrors();
      } else if (taskId) {
        errors = await errorRecoveryService.getErrorsByTask(taskId as string);
      } else if (agentId) {
        errors = await errorRecoveryService.getErrorsByAgent(agentId as string);
      } else if (errorType) {
        errors = await storage.getErrorsByType(errorType as string);
      } else {
        errors = await storage.getUnresolvedErrors();
      }

      res.json(errors);
    } catch (error) {
      console.error('Failed to get errors:', error);
      res.status(500).json({ message: 'Failed to get errors' });
    }
  });

  app.get('/api/errors/:id', async (req, res) => {
    try {
      const error = await storage.getErrorInstance(req.params.id);
      if (!error) {
        return res.status(404).json({ message: 'Error not found' });
      }
      res.json(error);
    } catch (error) {
      console.error('Failed to get error:', error);
      res.status(500).json({ message: 'Failed to get error' });
    }
  });

  app.post('/api/errors/:id/resolve', async (req, res) => {
    try {
      const { resolutionStrategy } = req.body;
      await errorRecoveryService.resolveError(req.params.id, resolutionStrategy);
      
      broadcastUpdate({
        type: 'error_update',
        data: { action: 'resolved', errorId: req.params.id, resolutionStrategy },
        timestamp: new Date().toISOString(),
      });

      res.json({ message: 'Error resolved successfully' });
    } catch (error) {
      console.error('Failed to resolve error:', error);
      res.status(500).json({ message: 'Failed to resolve error' });
    }
  });

  app.get('/api/error-patterns', async (req, res) => {
    try {
      const { timeframe } = req.query;
      const patterns = await errorRecoveryService.getErrorPatterns(
        (timeframe as 'hour' | 'day' | 'week' | 'month') || 'day'
      );
      res.json(patterns);
    } catch (error) {
      console.error('Failed to get error patterns:', error);
      res.status(500).json({ message: 'Failed to get error patterns' });
    }
  });

  // Recovery Strategy Management
  app.get('/api/recovery-strategies', async (req, res) => {
    try {
      const { errorType, provider } = req.query;
      
      if (errorType) {
        const strategies = await errorRecoveryService.getRecoveryStrategies(
          errorType as string, 
          provider as string
        );
        res.json(strategies);
      } else {
        // Get all strategies - would need a new storage method
        res.json([]);
      }
    } catch (error) {
      console.error('Failed to get recovery strategies:', error);
      res.status(500).json({ message: 'Failed to get recovery strategies' });
    }
  });

  app.post('/api/recovery-strategies', async (req, res) => {
    try {
      const strategy = await errorRecoveryService.createRecoveryStrategy(req.body);
      res.status(201).json(strategy);
    } catch (error) {
      console.error('Failed to create recovery strategy:', error);
      res.status(500).json({ message: 'Failed to create recovery strategy' });
    }
  });

  app.get('/api/recovery-strategies/:id', async (req, res) => {
    try {
      const strategy = await storage.getRecoveryStrategy(req.params.id);
      if (!strategy) {
        return res.status(404).json({ message: 'Recovery strategy not found' });
      }
      res.json(strategy);
    } catch (error) {
      console.error('Failed to get recovery strategy:', error);
      res.status(500).json({ message: 'Failed to get recovery strategy' });
    }
  });

  app.put('/api/recovery-strategies/:id', async (req, res) => {
    try {
      const strategy = await storage.updateRecoveryStrategy(req.params.id, req.body);
      res.json(strategy);
    } catch (error) {
      console.error('Failed to update recovery strategy:', error);
      res.status(500).json({ message: 'Failed to update recovery strategy' });
    }
  });

  // ===== TEMPLATE MANAGEMENT ENDPOINTS =====

  // Template Discovery & Management
  app.get('/api/templates', async (req, res) => {
    try {
      const { 
        category, 
        tags, 
        isPublic, 
        createdBy, 
        minRating, 
        sortBy, 
        limit, 
        query 
      } = req.query;

      let templates;

      if (query) {
        const searchOptions = {
          category: category as string,
          tags: tags ? (tags as string).split(',') : undefined,
          isPublic: isPublic ? isPublic === 'true' : undefined,
          createdBy: createdBy as string,
          minRating: minRating ? parseFloat(minRating as string) : undefined,
          sortBy: sortBy as 'rating' | 'usage' | 'recent' | 'name',
          limit: limit ? parseInt(limit as string) : undefined,
        };
        
        templates = await templateService.searchTemplates(query as string, searchOptions);
      } else if (category) {
        templates = await templateService.getTemplatesByCategory(category as string);
      } else {
        templates = await templateService.getAllTemplates();
      }

      res.json(templates);
    } catch (error) {
      console.error('Failed to get templates:', error);
      res.status(500).json({ message: 'Failed to get templates' });
    }
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const { agentConfig, templateInfo, options } = req.body;
      const template = await templateService.createTemplate(agentConfig, templateInfo, options);
      res.status(201).json(template);
    } catch (error) {
      console.error('Failed to create template:', error);
      res.status(500).json({ message: 'Failed to create template' });
    }
  });

  app.get('/api/templates/popular', async (req, res) => {
    try {
      const { limit } = req.query;
      const templates = await templateService.getPopularTemplates(
        limit ? parseInt(limit as string) : 10
      );
      res.json(templates);
    } catch (error) {
      console.error('Failed to get popular templates:', error);
      res.status(500).json({ message: 'Failed to get popular templates' });
    }
  });

  app.get('/api/templates/recommended', async (req, res) => {
    try {
      const { basedOnUsage, limit } = req.query;
      const usage = basedOnUsage ? (basedOnUsage as string).split(',') : undefined;
      
      const templates = await templateService.getRecommendedTemplates(
        usage,
        limit ? parseInt(limit as string) : 5
      );
      res.json(templates);
    } catch (error) {
      console.error('Failed to get recommended templates:', error);
      res.status(500).json({ message: 'Failed to get recommended templates' });
    }
  });

  app.get('/api/templates/:id', async (req, res) => {
    try {
      const template = await templateService.getTemplateWithUsage(req.params.id);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      res.json(template);
    } catch (error) {
      console.error('Failed to get template:', error);
      res.status(500).json({ message: 'Failed to get template' });
    }
  });

  app.put('/api/templates/:id', async (req, res) => {
    try {
      const template = await templateService.updateTemplate(req.params.id, req.body);
      res.json(template);
    } catch (error) {
      console.error('Failed to update template:', error);
      res.status(500).json({ message: 'Failed to update template' });
    }
  });

  app.delete('/api/templates/:id', async (req, res) => {
    try {
      await templateService.deleteTemplate(req.params.id);
      res.json({ message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Failed to delete template:', error);
      res.status(500).json({ message: 'Failed to delete template' });
    }
  });

  // Template Usage & Application
  app.post('/api/templates/:id/use', async (req, res) => {
    try {
      const { taskId, usedBy, modifications } = req.body;
      const agent = await templateService.useTemplate(req.params.id, taskId, {
        usedBy,
        modifications,
      });
      
      broadcastUpdate({
        type: 'agent_update',
        data: { action: 'created_from_template', agent, templateId: req.params.id },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(agent);
    } catch (error) {
      console.error('Failed to use template:', error);
      res.status(500).json({ message: 'Failed to use template' });
    }
  });

  app.post('/api/templates/:id/rate', async (req, res) => {
    try {
      const { rating, feedback, ratedBy } = req.body;
      const template = await templateService.rateTemplate(req.params.id, rating, feedback, ratedBy);
      res.json(template);
    } catch (error) {
      console.error('Failed to rate template:', error);
      res.status(500).json({ message: 'Failed to rate template' });
    }
  });

  app.post('/api/agents/:id/create-template', async (req, res) => {
    try {
      const { templateInfo, options } = req.body;
      const template = await templateService.createTemplateFromAgent(
        req.params.id,
        templateInfo,
        options
      );
      res.status(201).json(template);
    } catch (error) {
      console.error('Failed to create template from agent:', error);
      res.status(500).json({ message: 'Failed to create template from agent' });
    }
  });

  app.get('/api/template-usage/stats', async (req, res) => {
    try {
      const stats = await templateService.getTemplateUsageStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get template usage stats:', error);
      res.status(500).json({ message: 'Failed to get template usage stats' });
    }
  });

  // ===== TIMELINE & EXECUTION HISTORY ENDPOINTS =====

  // Timeline Retrieval & Filtering
  app.get('/api/tasks/:id/timeline', async (req, res) => {
    try {
      const { 
        eventTypes, 
        eventCategories, 
        agentIds, 
        startDate, 
        endDate, 
        searchText 
      } = req.query;

      const filter = {
        eventTypes: eventTypes ? (eventTypes as string).split(',') : undefined,
        eventCategories: eventCategories ? (eventCategories as string).split(',') : undefined,
        agentIds: agentIds ? (agentIds as string).split(',') : undefined,
        dateRange: startDate && endDate ? {
          start: new Date(startDate as string),
          end: new Date(endDate as string),
        } : undefined,
        searchText: searchText as string,
      };

      const events = await timelineService.getTaskTimeline(req.params.id, filter);
      res.json(events);
    } catch (error) {
      console.error('Failed to get task timeline:', error);
      res.status(500).json({ message: 'Failed to get task timeline' });
    }
  });

  app.get('/api/agents/:id/timeline', async (req, res) => {
    try {
      const events = await timelineService.getAgentTimeline(req.params.id);
      res.json(events);
    } catch (error) {
      console.error('Failed to get agent timeline:', error);
      res.status(500).json({ message: 'Failed to get agent timeline' });
    }
  });

  app.get('/api/tasks/:id/timeline-with-snapshots', async (req, res) => {
    try {
      const timeline = await storage.getTaskWithTimeline(req.params.id);
      if (!timeline) {
        return res.status(404).json({ message: 'Task not found' });
      }
      res.json(timeline);
    } catch (error) {
      console.error('Failed to get task timeline with snapshots:', error);
      res.status(500).json({ message: 'Failed to get task timeline with snapshots' });
    }
  });

  // Timeline Snapshots
  app.get('/api/tasks/:id/snapshots', async (req, res) => {
    try {
      const { bookmarked } = req.query;
      let snapshots;
      
      if (bookmarked === 'true') {
        snapshots = await storage.getBookmarkedSnapshots(req.params.id);
      } else {
        snapshots = await storage.getSnapshotsForTask(req.params.id);
      }
      
      res.json(snapshots);
    } catch (error) {
      console.error('Failed to get snapshots:', error);
      res.status(500).json({ message: 'Failed to get snapshots' });
    }
  });

  app.post('/api/tasks/:id/snapshots', async (req, res) => {
    try {
      const { eventId, type, name, description, isBookmarked } = req.body;
      const currentState = await timelineService.getCurrentTaskState(req.params.id);
      
      const snapshot = await timelineService.createSnapshot(req.params.id, eventId, {
        type,
        name,
        description,
        fullState: currentState,
        isBookmarked,
      });
      
      broadcastUpdate({
        type: 'timeline_update',
        data: { action: 'snapshot_created', snapshot },
        timestamp: new Date().toISOString(),
      });

      res.status(201).json(snapshot);
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      res.status(500).json({ message: 'Failed to create snapshot' });
    }
  });

  app.post('/api/snapshots/:id/bookmark', async (req, res) => {
    try {
      await timelineService.bookmarkSnapshot(req.params.id);
      res.json({ message: 'Snapshot bookmarked successfully' });
    } catch (error) {
      console.error('Failed to bookmark snapshot:', error);
      res.status(500).json({ message: 'Failed to bookmark snapshot' });
    }
  });

  app.delete('/api/snapshots/:id/bookmark', async (req, res) => {
    try {
      await timelineService.unbookmarkSnapshot(req.params.id);
      res.json({ message: 'Snapshot unbookmarked successfully' });
    } catch (error) {
      console.error('Failed to unbookmark snapshot:', error);
      res.status(500).json({ message: 'Failed to unbookmark snapshot' });
    }
  });

  app.delete('/api/snapshots/:id', async (req, res) => {
    try {
      await timelineService.deleteSnapshot(req.params.id);
      res.json({ message: 'Snapshot deleted successfully' });
    } catch (error) {
      console.error('Failed to delete snapshot:', error);
      res.status(500).json({ message: 'Failed to delete snapshot' });
    }
  });

  // Timeline Playback & Replay
  app.post('/api/tasks/:id/playback/start', async (req, res) => {
    try {
      const { startFromEvent, playbackSpeed, autoAdvance } = req.body;
      const playback = await timelineService.startPlayback(req.params.id, {
        startFromEvent,
        playbackSpeed,
        autoAdvance,
      });
      res.json(playback);
    } catch (error) {
      console.error('Failed to start playback:', error);
      res.status(500).json({ message: 'Failed to start playback' });
    }
  });

  app.post('/api/tasks/:id/playback/play-pause', async (req, res) => {
    try {
      const playback = await timelineService.playPause(req.params.id);
      if (!playback) {
        return res.status(404).json({ message: 'No active playback found' });
      }
      res.json(playback);
    } catch (error) {
      console.error('Failed to toggle playback:', error);
      res.status(500).json({ message: 'Failed to toggle playback' });
    }
  });

  app.post('/api/tasks/:id/playback/seek', async (req, res) => {
    try {
      const { eventIndex } = req.body;
      const playback = await timelineService.seekToEvent(req.params.id, eventIndex);
      if (!playback) {
        return res.status(404).json({ message: 'No active playback found' });
      }
      res.json(playback);
    } catch (error) {
      console.error('Failed to seek playback:', error);
      res.status(500).json({ message: 'Failed to seek playback' });
    }
  });

  app.get('/api/tasks/:id/playback/state', async (req, res) => {
    try {
      const playback = await timelineService.getPlaybackState(req.params.id);
      if (!playback) {
        return res.status(404).json({ message: 'No active playback found' });
      }
      res.json(playback);
    } catch (error) {
      console.error('Failed to get playback state:', error);
      res.status(500).json({ message: 'Failed to get playback state' });
    }
  });

  app.post('/api/tasks/:id/playback/stop', async (req, res) => {
    try {
      await timelineService.stopPlayback(req.params.id);
      res.json({ message: 'Playback stopped successfully' });
    } catch (error) {
      console.error('Failed to stop playback:', error);
      res.status(500).json({ message: 'Failed to stop playback' });
    }
  });

  // State Reconstruction
  app.get('/api/tasks/:id/state/current', async (req, res) => {
    try {
      const state = await timelineService.getCurrentTaskState(req.params.id);
      res.json(state);
    } catch (error) {
      console.error('Failed to get current task state:', error);
      res.status(500).json({ message: 'Failed to get current task state' });
    }
  });

  app.post('/api/tasks/:id/state/reconstruct', async (req, res) => {
    try {
      const { eventId } = req.body;
      const state = await timelineService.reconstructStateAtEvent(req.params.id, eventId);
      res.json(state);
    } catch (error) {
      console.error('Failed to reconstruct state:', error);
      res.status(500).json({ message: 'Failed to reconstruct state' });
    }
  });

  // Timeline Export & Analysis
  app.get('/api/tasks/:id/timeline/export', async (req, res) => {
    try {
      const { format, ...filterParams } = req.query;
      const filter = Object.keys(filterParams).length > 0 ? filterParams : undefined;
      
      const exportData = await timelineService.exportTimeline(
        req.params.id,
        (format as 'json' | 'csv' | 'detailed') || 'json',
        filter as any
      );

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="timeline-${req.params.id}.csv"`);
        res.send(exportData);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="timeline-${req.params.id}.json"`);
        res.json(exportData);
      }
    } catch (error) {
      console.error('Failed to export timeline:', error);
      res.status(500).json({ message: 'Failed to export timeline' });
    }
  });

  app.get('/api/tasks/:id/timeline/analytics', async (req, res) => {
    try {
      const analytics = await timelineService.getTimelineAnalytics(req.params.id);
      res.json(analytics);
    } catch (error) {
      console.error('Failed to get timeline analytics:', error);
      res.status(500).json({ message: 'Failed to get timeline analytics' });
    }
  });

  // n8n Workflow routes
  app.post('/api/workflows', async (req, res) => {
    try {
      const workflow = await n8nService.createWorkflow(req.body);
      res.json(workflow);
    } catch (error) {
      console.error('Failed to create workflow:', error);
      res.status(500).json({ message: 'Failed to create workflow' });
    }
  });

  app.get('/api/workflows', async (req, res) => {
    try {
      const { taskId } = req.query;
      let workflows;
      
      if (taskId) {
        workflows = await n8nService.getWorkflowsByTask(taskId as string);
      } else {
        workflows = [];
      }
      
      res.json(workflows);
    } catch (error) {
      console.error('Failed to get workflows:', error);
      res.status(500).json({ message: 'Failed to get workflows' });
    }
  });

  app.get('/api/workflows/:id', async (req, res) => {
    try {
      const workflow = await n8nService.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }
      res.json(workflow);
    } catch (error) {
      console.error('Failed to get workflow:', error);
      res.status(500).json({ message: 'Failed to get workflow' });
    }
  });

  app.put('/api/workflows/:id', async (req, res) => {
    try {
      const workflow = await n8nService.updateWorkflow(req.params.id, req.body);
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }
      res.json(workflow);
    } catch (error) {
      console.error('Failed to update workflow:', error);
      res.status(500).json({ message: 'Failed to update workflow' });
    }
  });

  app.delete('/api/workflows/:id', async (req, res) => {
    try {
      const success = await n8nService.deleteWorkflow(req.params.id);
      if (!success) {
        return res.status(404).json({ message: 'Workflow not found' });
      }
      res.json({ message: 'Workflow deleted successfully' });
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      res.status(500).json({ message: 'Failed to delete workflow' });
    }
  });

  app.post('/api/workflows/:id/execute', async (req, res) => {
    try {
      const result = await n8nService.executeWorkflow(req.params.id);
      res.json(result);
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      res.status(500).json({ message: 'Failed to execute workflow' });
    }
  });

  app.post('/api/workflows/validate', async (req, res) => {
    try {
      const validation = await n8nService.validateWorkflow(req.body);
      res.json(validation);
    } catch (error) {
      console.error('Failed to validate workflow:', error);
      res.status(500).json({ message: 'Failed to validate workflow' });
    }
  });

  return httpServer;
}
