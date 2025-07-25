import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { taskService } from "./services/taskService";
import { agentService } from "./services/agentService";
import { n8nService } from "./services/n8nService";
import { insertTaskSchema, insertAgentSchema } from "@shared/schema";
import type { RealtimeUpdate, TaskCreationRequest, FileUploadData } from "@shared/schema";
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
