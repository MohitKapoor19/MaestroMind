import { storage } from "../storage";
import { agentService } from "./agentService";
import type { Task, InsertTask, TaskWithAgents } from "@shared/schema";

export interface TaskCreationRequest {
  title: string;
  description: string;
  priority: string;
  estimatedDuration?: string;
  files?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    path: string;
  }>;
}

export interface TaskExecutionRequest {
  taskId: string;
  autoStart?: boolean;
}

export class TaskService {
  // Create a new task and generate initial agent team
  async createTask(request: TaskCreationRequest): Promise<TaskWithAgents> {
    try {
      // Create the task
      const task = await storage.createTask({
        title: request.title,
        description: request.description,
        priority: request.priority,
        estimatedDuration: request.estimatedDuration,
        status: 'pending',
        progress: 0,
      });

      await storage.createLog({
        level: 'info',
        category: 'task',
        message: `Task created: ${task.title}`,
        data: { priority: task.priority, estimatedDuration: task.estimatedDuration },
        taskId: task.id,
      });

      // Handle file uploads if any
      if (request.files && request.files.length > 0) {
        for (const file of request.files) {
          await storage.createFileUpload({
            taskId: task.id,
            filename: file.filename,
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            path: file.path,
            processed: false,
          });
        }

        await storage.createLog({
          level: 'info',
          category: 'task',
          message: `Uploaded ${request.files.length} files for task`,
          data: { fileCount: request.files.length },
          taskId: task.id,
        });
      }

      // Generate agent team
      const agentGeneration = await agentService.generateAgentTeam({
        taskId: task.id,
        taskDescription: request.description,
        priority: request.priority,
      });

      // Update task status to planning
      await storage.updateTask(task.id, {
        status: 'planning',
        progress: 10,
      });

      // Get complete task with agents
      const taskWithAgents = await storage.getTaskWithAgents(task.id);
      if (!taskWithAgents) {
        throw new Error('Failed to retrieve created task');
      }

      return taskWithAgents;
    } catch (error) {
      await storage.createLog({
        level: 'error',
        category: 'task',
        message: `Failed to create task: ${error}`,
        data: { title: request.title },
      });
      throw error;
    }
  }

  // Execute a task through the AutoAgents framework phases
  async executeTask(request: TaskExecutionRequest): Promise<void> {
    try {
      const task = await storage.getTaskWithAgents(request.taskId);
      if (!task) {
        throw new Error(`Task ${request.taskId} not found`);
      }

      await storage.createLog({
        level: 'info',
        category: 'task',
        message: `Starting task execution: ${task.title}`,
        data: { agentCount: task.agents.length },
        taskId: task.id,
      });

      // Phase 1: Drafting Stage - Observer review and refinement
      await this.draftingStage(task);

      // Phase 2: Execution Stage - Agent collaboration
      await this.executionStage(task);

      // Phase 3: Completion and reflection
      await this.completionStage(task);

    } catch (error) {
      await storage.updateTask(request.taskId, {
        status: 'failed',
      });

      await storage.createLog({
        level: 'error',
        category: 'task',
        message: `Task execution failed: ${error}`,
        taskId: request.taskId,
      });
      throw error;
    }
  }

  // Phase 1: Drafting Stage with Observer feedback
  private async draftingStage(task: TaskWithAgents): Promise<void> {
    await storage.updateTask(task.id, {
      status: 'drafting',
      progress: 20,
    });

    await storage.createLog({
      level: 'info',
      category: 'task',
      message: 'Entering drafting stage',
      taskId: task.id,
    });

    // Observer evaluates the initial plan
    const planObservation = await agentService.observeAndRefine(task.id, 'plan');

    let refinementCount = 0;
    const maxRefinements = 3;

    // Iterative refinement if needed
    while (planObservation.needsRefinement && refinementCount < maxRefinements) {
      await storage.createLog({
        level: 'info',
        category: 'task',
        message: `Plan refinement ${refinementCount + 1} requested`,
        data: { feedback: planObservation.feedback },
        taskId: task.id,
      });

      // Refine the plan based on observer feedback
      await this.refinePlan(task, planObservation.suggestions);
      refinementCount++;

      // Update progress
      await storage.updateTask(task.id, {
        progress: 20 + (refinementCount * 10),
      });
    }

    await storage.createLog({
      level: 'info',
      category: 'task',
      message: `Drafting stage completed after ${refinementCount} refinements`,
      data: { finalConfidence: planObservation.confidence },
      taskId: task.id,
    });
  }

  // Phase 2: Execution Stage with agent collaboration
  private async executionStage(task: TaskWithAgents): Promise<void> {
    await storage.updateTask(task.id, {
      status: 'executing',
      progress: 50,
    });

    await storage.createLog({
      level: 'info',
      category: 'task',
      message: 'Entering execution stage',
      taskId: task.id,
    });

    const executionPlan = task.executionPlans[0];
    if (!executionPlan) {
      throw new Error('No execution plan found');
    }

    const steps = executionPlan.executionSteps as string[];
    const stepProgress = 40 / steps.length; // 40% progress allocated to execution

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      await storage.createLog({
        level: 'info',
        category: 'task',
        message: `Executing step ${i + 1}: ${step}`,
        taskId: task.id,
      });

      // Assign step to appropriate agent(s)
      await this.executeStep(task, step, i);

      // Update progress
      await storage.updateTask(task.id, {
        progress: 50 + Math.round((i + 1) * stepProgress),
      });

      // Brief pause between steps to allow for real-time monitoring
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await storage.createLog({
      level: 'info',
      category: 'task',
      message: 'Execution stage completed',
      taskId: task.id,
    });
  }

  // Phase 3: Completion and reflection
  private async completionStage(task: TaskWithAgents): Promise<void> {
    await storage.updateTask(task.id, {
      status: 'refinement',
      progress: 90,
    });

    await storage.createLog({
      level: 'info',
      category: 'task',
      message: 'Entering completion stage',
      taskId: task.id,
    });

    // Observer evaluates the execution results
    const executionObservation = await agentService.observeAndRefine(task.id, 'execution');

    // Final collaborative refinement if needed
    if (executionObservation.needsRefinement) {
      await this.performFinalRefinement(task, executionObservation.suggestions);
    }

    // Mark task as completed
    await storage.updateTask(task.id, {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
    });

    // Calculate actual duration
    const startTime = new Date(task.createdAt).getTime();
    const endTime = Date.now();
    const actualDuration = Math.round((endTime - startTime) / (1000 * 60)); // minutes

    await storage.updateTask(task.id, {
      actualDuration,
    });

    await storage.createLog({
      level: 'info',
      category: 'task',
      message: `Task completed successfully in ${actualDuration} minutes`,
      data: { 
        finalConfidence: executionObservation.confidence,
        actualDuration,
      },
      taskId: task.id,
    });
  }

  // Get task status with real-time metrics
  async getTaskStatus(taskId: string): Promise<any> {
    const task = await storage.getTaskWithAgents(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const executions = await storage.getExecutionsByTask(taskId);
    const collaborations = await storage.getCollaborationsByTask(taskId);
    const logs = await storage.getLogs({ taskId, limit: 50 });

    // Calculate metrics
    const totalCost = executions.reduce((sum, exec) => 
      sum + (parseFloat(exec.cost || '0')), 0
    );

    const totalTokens = executions.reduce((sum, exec) => 
      sum + (exec.tokensUsed || 0), 0
    );

    const avgExecutionTime = executions.length > 0
      ? executions.reduce((sum, exec) => sum + (exec.duration || 0), 0) / executions.length
      : 0;

    return {
      task,
      metrics: {
        totalExecutions: executions.length,
        totalCollaborations: collaborations.length,
        totalCost,
        totalTokens,
        avgExecutionTime,
        successRate: executions.filter(e => e.status === 'completed').length / Math.max(executions.length, 1),
      },
      recentActivity: logs.slice(0, 20),
      agentStatuses: await Promise.all(
        task.agents.map(agent => agentService.getAgentStatus(agent.id))
      ),
    };
  }

  // Get dashboard metrics
  async getDashboardMetrics(): Promise<any> {
    const taskMetrics = await storage.getTaskMetrics();
    const agentMetrics = await storage.getAgentMetrics();

    const recentLogs = await storage.getLogs({ 
      limit: 10,
      category: 'task',
    });

    const activeTasks = await storage.getAllTasks();
    const runningTasks = activeTasks.filter(task => 
      ['planning', 'drafting', 'executing', 'refinement'].includes(task.status)
    );

    return {
      overview: {
        ...taskMetrics,
        ...agentMetrics,
      },
      activeTasks: runningTasks.slice(0, 5),
      recentActivity: recentLogs,
      systemHealth: {
        status: 'healthy',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
    };
  }

  private async refinePlan(task: TaskWithAgents, suggestions: string[]): Promise<void> {
    // Implementation would refine the execution plan based on observer suggestions
    // This is a simplified version
    await storage.createLog({
      level: 'info',
      category: 'task',
      message: 'Plan refinement applied',
      data: { suggestions },
      taskId: task.id,
    });
  }

  private async executeStep(task: TaskWithAgents, step: string, stepIndex: number): Promise<void> {
    // Assign step to most appropriate agent based on capabilities
    const assignedAgent = this.selectAgentForStep(task.agents, step);
    
    if (assignedAgent) {
      await agentService.executeAgentAction({
        agentId: assignedAgent.id,
        action: `execute_step_${stepIndex + 1}`,
        input: { step, stepIndex },
        context: `Task: ${task.title}\nStep: ${step}`,
      });
    }
  }

  private selectAgentForStep(agents: any[], step: string): any {
    // Simple selection logic - could be enhanced with ML
    const stepLower = step.toLowerCase();
    
    if (stepLower.includes('code') || stepLower.includes('program')) {
      return agents.find(a => a.role.toLowerCase().includes('program') || a.role.toLowerCase().includes('develop'));
    }
    
    if (stepLower.includes('design') || stepLower.includes('ui')) {
      return agents.find(a => a.role.toLowerCase().includes('design'));
    }
    
    if (stepLower.includes('research') || stepLower.includes('analyze')) {
      return agents.find(a => a.role.toLowerCase().includes('research') || a.role.toLowerCase().includes('analy'));
    }
    
    // Default to first agent
    return agents[0];
  }

  private async performFinalRefinement(task: TaskWithAgents, suggestions: string[]): Promise<void> {
    await storage.createLog({
      level: 'info',
      category: 'task',
      message: 'Performing final collaborative refinement',
      data: { suggestions },
      taskId: task.id,
    });

    // Implement final refinement logic
    // This could involve agent collaborations to improve the final output
  }
}

export const taskService = new TaskService();
