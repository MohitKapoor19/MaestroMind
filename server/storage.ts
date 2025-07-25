import {
  tasks,
  agents,
  agentExecutions,
  agentCollaborations,
  executionPlans,
  systemLogs,
  fileUploads,
  n8nWorkflows,
  type Task,
  type InsertTask,
  type Agent,
  type InsertAgent,
  type AgentExecution,
  type InsertAgentExecution,
  type AgentCollaboration,
  type ExecutionPlan,
  type SystemLog,
  type InsertSystemLog,
  type FileUpload,
  type N8nWorkflow,
  type InsertN8nWorkflow,
  type TaskWithAgents,
  type AgentWithExecutions,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql } from "drizzle-orm";

export interface IStorage {
  // Task operations
  createTask(task: InsertTask): Promise<Task>;
  getTask(id: string): Promise<Task | undefined>;
  getTaskWithAgents(id: string): Promise<TaskWithAgents | undefined>;
  getAllTasks(): Promise<Task[]>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Agent operations
  createAgent(agent: InsertAgent): Promise<Agent>;
  getAgent(id: string): Promise<Agent | undefined>;
  getAgentWithExecutions(id: string): Promise<AgentWithExecutions | undefined>;
  getAgentsByTask(taskId: string): Promise<Agent[]>;
  updateAgent(id: string, updates: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;

  // Agent execution operations
  createAgentExecution(execution: InsertAgentExecution): Promise<AgentExecution>;
  getExecutionsByAgent(agentId: string): Promise<AgentExecution[]>;
  getExecutionsByTask(taskId: string): Promise<AgentExecution[]>;

  // Agent collaboration operations
  createCollaboration(collaboration: Omit<AgentCollaboration, 'id' | 'timestamp'>): Promise<AgentCollaboration>;
  getCollaborationsByTask(taskId: string): Promise<AgentCollaboration[]>;
  updateCollaboration(id: string, updates: Partial<AgentCollaboration>): Promise<AgentCollaboration>;

  // Execution plan operations
  createExecutionPlan(plan: Omit<ExecutionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExecutionPlan>;
  getExecutionPlansByTask(taskId: string): Promise<ExecutionPlan[]>;
  updateExecutionPlan(id: string, updates: Partial<ExecutionPlan>): Promise<ExecutionPlan>;

  // System log operations
  createLog(log: InsertSystemLog): Promise<SystemLog>;
  getLogs(filters?: {
    level?: string;
    category?: string;
    taskId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<SystemLog[]>;

  // File upload operations
  createFileUpload(file: Omit<FileUpload, 'id' | 'uploadedAt'>): Promise<FileUpload>;
  getFilesByTask(taskId: string): Promise<FileUpload[]>;
  updateFileUpload(id: string, updates: Partial<FileUpload>): Promise<FileUpload>;

  // n8n Workflow operations
  createN8nWorkflow(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<N8nWorkflow>;
  getN8nWorkflow(id: string): Promise<N8nWorkflow | null>;
  getN8nWorkflowsByTask(taskId: string): Promise<N8nWorkflow[]>;
  updateN8nWorkflow(id: string, updates: Partial<N8nWorkflow>): Promise<N8nWorkflow | null>;
  deleteN8nWorkflow(id: string): Promise<boolean>;

  // Analytics operations
  getTaskMetrics(): Promise<{
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    successRate: number;
    avgCompletionTime: number;
  }>;

  getAgentMetrics(): Promise<{
    totalAgents: number;
    activeAgents: number;
    avgConfidence: number;
    totalExecutions: number;
    totalCost: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Task operations
  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async getTaskWithAgents(id: string): Promise<TaskWithAgents | undefined> {
    const task = await this.getTask(id);
    if (!task) return undefined;

    const taskAgents = await this.getAgentsByTask(id);
    const plans = await this.getExecutionPlansByTask(id);
    const files = await this.getFilesByTask(id);

    return {
      ...task,
      agents: taskAgents,
      executionPlans: plans,
      files,
    };
  }

  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const [updatedTask] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // Agent operations
  async createAgent(agent: InsertAgent): Promise<Agent> {
    const [newAgent] = await db.insert(agents).values(agent).returning();
    return newAgent;
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async getAgentWithExecutions(id: string): Promise<AgentWithExecutions | undefined> {
    const agent = await this.getAgent(id);
    if (!agent) return undefined;

    const executions = await this.getExecutionsByAgent(id);
    const collaborationsFrom = await db
      .select()
      .from(agentCollaborations)
      .where(eq(agentCollaborations.fromAgentId, id));
    const collaborationsTo = await db
      .select()
      .from(agentCollaborations)
      .where(eq(agentCollaborations.toAgentId, id));

    return {
      ...agent,
      executions,
      collaborationsFrom,
      collaborationsTo,
    };
  }

  async getAgentsByTask(taskId: string): Promise<Agent[]> {
    return await db
      .select()
      .from(agents)
      .where(eq(agents.taskId, taskId))
      .orderBy(agents.createdAt);
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
    const [updatedAgent] = await db
      .update(agents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(agents.id, id))
      .returning();
    return updatedAgent;
  }

  async deleteAgent(id: string): Promise<void> {
    await db.delete(agents).where(eq(agents.id, id));
  }

  // Agent execution operations
  async createAgentExecution(execution: InsertAgentExecution): Promise<AgentExecution> {
    const [newExecution] = await db.insert(agentExecutions).values(execution).returning();
    return newExecution;
  }

  async getExecutionsByAgent(agentId: string): Promise<AgentExecution[]> {
    return await db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.agentId, agentId))
      .orderBy(desc(agentExecutions.timestamp));
  }

  async getExecutionsByTask(taskId: string): Promise<AgentExecution[]> {
    return await db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.taskId, taskId))
      .orderBy(desc(agentExecutions.timestamp));
  }

  // Agent collaboration operations
  async createCollaboration(collaboration: Omit<AgentCollaboration, 'id' | 'timestamp'>): Promise<AgentCollaboration> {
    const [newCollaboration] = await db.insert(agentCollaborations).values(collaboration).returning();
    return newCollaboration;
  }

  async getCollaborationsByTask(taskId: string): Promise<AgentCollaboration[]> {
    return await db
      .select()
      .from(agentCollaborations)
      .where(eq(agentCollaborations.taskId, taskId))
      .orderBy(desc(agentCollaborations.timestamp));
  }

  async updateCollaboration(id: string, updates: Partial<AgentCollaboration>): Promise<AgentCollaboration> {
    const [updatedCollaboration] = await db
      .update(agentCollaborations)
      .set(updates)
      .where(eq(agentCollaborations.id, id))
      .returning();
    return updatedCollaboration;
  }

  // Execution plan operations
  async createExecutionPlan(plan: Omit<ExecutionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExecutionPlan> {
    const [newPlan] = await db.insert(executionPlans).values(plan).returning();
    return newPlan;
  }

  async getExecutionPlansByTask(taskId: string): Promise<ExecutionPlan[]> {
    return await db
      .select()
      .from(executionPlans)
      .where(eq(executionPlans.taskId, taskId))
      .orderBy(desc(executionPlans.version));
  }

  async updateExecutionPlan(id: string, updates: Partial<ExecutionPlan>): Promise<ExecutionPlan> {
    const [updatedPlan] = await db
      .update(executionPlans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(executionPlans.id, id))
      .returning();
    return updatedPlan;
  }

  // System log operations
  async createLog(log: InsertSystemLog): Promise<SystemLog> {
    const [newLog] = await db.insert(systemLogs).values(log).returning();
    return newLog;
  }

  async getLogs(filters?: {
    level?: string;
    category?: string;
    taskId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<SystemLog[]> {
    let query = db.select().from(systemLogs);

    if (filters) {
      const conditions = [];
      if (filters.level) conditions.push(eq(systemLogs.level, filters.level));
      if (filters.category) conditions.push(eq(systemLogs.category, filters.category));
      if (filters.taskId) conditions.push(eq(systemLogs.taskId, filters.taskId));
      if (filters.agentId) conditions.push(eq(systemLogs.agentId, filters.agentId));

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }

    query = query.orderBy(desc(systemLogs.timestamp));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    return await query;
  }

  // File upload operations
  async createFileUpload(file: Omit<FileUpload, 'id' | 'uploadedAt'>): Promise<FileUpload> {
    const [newFile] = await db.insert(fileUploads).values(file).returning();
    return newFile;
  }

  async getFilesByTask(taskId: string): Promise<FileUpload[]> {
    return await db
      .select()
      .from(fileUploads)
      .where(eq(fileUploads.taskId, taskId))
      .orderBy(fileUploads.uploadedAt);
  }

  async updateFileUpload(id: string, updates: Partial<FileUpload>): Promise<FileUpload> {
    const [updatedFile] = await db
      .update(fileUploads)
      .set(updates)
      .where(eq(fileUploads.id, id))
      .returning();
    return updatedFile;
  }

  // Analytics operations
  async getTaskMetrics(): Promise<{
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    successRate: number;
    avgCompletionTime: number;
  }> {
    const [metrics] = await db
      .select({
        totalTasks: sql<number>`count(*)`,
        activeTasks: sql<number>`count(*) filter (where status in ('pending', 'planning', 'executing', 'refinement'))`,
        completedTasks: sql<number>`count(*) filter (where status = 'completed')`,
        avgDuration: sql<number>`avg(actual_duration) filter (where actual_duration is not null)`,
      })
      .from(tasks);

    const successRate = metrics.totalTasks > 0 
      ? (metrics.completedTasks / metrics.totalTasks) * 100 
      : 0;

    return {
      totalTasks: metrics.totalTasks,
      activeTasks: metrics.activeTasks,
      completedTasks: metrics.completedTasks,
      successRate: Math.round(successRate * 100) / 100,
      avgCompletionTime: Math.round((metrics.avgDuration || 0) / 60 * 100) / 100, // convert to hours
    };
  }

  async getAgentMetrics(): Promise<{
    totalAgents: number;
    activeAgents: number;
    avgConfidence: number;
    totalExecutions: number;
    totalCost: number;
  }> {
    const [agentMetrics] = await db
      .select({
        totalAgents: sql<number>`count(*)`,
        activeAgents: sql<number>`count(*) filter (where status in ('working', 'collaborating'))`,
        avgConfidence: sql<number>`avg(confidence) filter (where confidence is not null)`,
      })
      .from(agents);

    const [executionMetrics] = await db
      .select({
        totalExecutions: sql<number>`count(*)`,
        totalCost: sql<number>`sum(cost) filter (where cost is not null)`,
      })
      .from(agentExecutions);

    return {
      totalAgents: agentMetrics.totalAgents,
      activeAgents: agentMetrics.activeAgents,
      avgConfidence: Math.round((agentMetrics.avgConfidence || 0) * 100) / 100,
      totalExecutions: executionMetrics.totalExecutions,
      totalCost: Math.round((executionMetrics.totalCost || 0) * 1000000) / 1000000, // round to 6 decimal places
    };
  }

  // n8n Workflow operations
  async createN8nWorkflow(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<N8nWorkflow> {
    const [newWorkflow] = await db.insert(n8nWorkflows).values(workflow).returning();
    return newWorkflow;
  }

  async getN8nWorkflow(id: string): Promise<N8nWorkflow | null> {
    const [workflow] = await db.select().from(n8nWorkflows).where(eq(n8nWorkflows.id, id));
    return workflow || null;
  }

  async getN8nWorkflowsByTask(taskId: string): Promise<N8nWorkflow[]> {
    return await db
      .select()
      .from(n8nWorkflows)
      .where(eq(n8nWorkflows.taskId, taskId))
      .orderBy(desc(n8nWorkflows.updatedAt));
  }

  async updateN8nWorkflow(id: string, updates: Partial<N8nWorkflow>): Promise<N8nWorkflow | null> {
    const [updatedWorkflow] = await db
      .update(n8nWorkflows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(n8nWorkflows.id, id))
      .returning();
    return updatedWorkflow || null;
  }

  async deleteN8nWorkflow(id: string): Promise<boolean> {
    const result = await db.delete(n8nWorkflows).where(eq(n8nWorkflows.id, id));
    return result.rowCount > 0;
  }
}

export const storage = new DatabaseStorage();
