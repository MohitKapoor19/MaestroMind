import {
  tasks,
  agents,
  agentExecutions,
  agentCollaborations,
  executionPlans,
  systemLogs,
  fileUploads,
  n8nWorkflows,
  taskQueues,
  queueEntries,
  taskSchedules,
  budgets,
  costEntries,
  errorInstances,
  recoveryStrategies,
  agentTemplates,
  templateUsage,
  executionEvents,
  timelineSnapshots,
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
  type TaskQueue,
  type InsertTaskQueue,
  type QueueEntry,
  type InsertQueueEntry,
  type TaskSchedule,
  type InsertTaskSchedule,
  type Budget,
  type InsertBudget,
  type CostEntry,
  type InsertCostEntry,
  type ErrorInstance,
  type InsertErrorInstance,
  type RecoveryStrategy,
  type AgentTemplate,
  type InsertAgentTemplate,
  type TemplateUsage,
  type ExecutionEvent,
  type InsertExecutionEvent,
  type TimelineSnapshot,
  type TaskQueueWithEntries,
  type QueueEntryWithTask,
  type BudgetWithCosts,
  type AgentTemplateWithUsage,
  type TaskWithTimeline,
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

  // Task Queue operations
  createTaskQueue(queue: InsertTaskQueue): Promise<TaskQueue>;
  getTaskQueue(id: string): Promise<TaskQueue | undefined>;
  getTaskQueueWithEntries(id: string): Promise<TaskQueueWithEntries | undefined>;
  getAllTaskQueues(): Promise<TaskQueue[]>;
  updateTaskQueue(id: string, updates: Partial<TaskQueue>): Promise<TaskQueue>;
  deleteTaskQueue(id: string): Promise<void>;

  // Queue Entry operations
  createQueueEntry(entry: InsertQueueEntry): Promise<QueueEntry>;
  getQueueEntry(id: string): Promise<QueueEntry | undefined>;
  getQueueEntriesForQueue(queueId: string): Promise<QueueEntry[]>;
  getQueueEntriesForTask(taskId: string): Promise<QueueEntry[]>;
  updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry>;
  deleteQueueEntry(id: string): Promise<void>;
  getNextQueuedEntry(queueId: string): Promise<QueueEntry | undefined>;

  // Task Schedule operations
  createTaskSchedule(schedule: InsertTaskSchedule): Promise<TaskSchedule>;
  getTaskSchedule(id: string): Promise<TaskSchedule | undefined>;
  getAllTaskSchedules(): Promise<TaskSchedule[]>;
  getActiveSchedules(): Promise<TaskSchedule[]>;
  updateTaskSchedule(id: string, updates: Partial<TaskSchedule>): Promise<TaskSchedule>;
  deleteTaskSchedule(id: string): Promise<void>;

  // Budget operations
  createBudget(budget: InsertBudget): Promise<Budget>;
  getBudget(id: string): Promise<Budget | undefined>;
  getBudgetWithCosts(id: string): Promise<BudgetWithCosts | undefined>;
  getAllBudgets(): Promise<Budget[]>;
  getBudgetsByType(type: string, entityId?: string): Promise<Budget[]>;
  updateBudget(id: string, updates: Partial<Budget>): Promise<Budget>;
  deleteBudget(id: string): Promise<void>;

  // Cost Entry operations
  createCostEntry(entry: InsertCostEntry): Promise<CostEntry>;
  getCostEntriesForBudget(budgetId: string): Promise<CostEntry[]>;
  getCostEntriesForTask(taskId: string): Promise<CostEntry[]>;
  getCostEntriesForAgent(agentId: string): Promise<CostEntry[]>;
  getTotalCostForPeriod(budgetId: string, start: Date, end: Date): Promise<number>;

  // Error Instance operations
  createErrorInstance(error: InsertErrorInstance): Promise<ErrorInstance>;
  getErrorInstance(id: string): Promise<ErrorInstance | undefined>;
  getErrorsByTask(taskId: string): Promise<ErrorInstance[]>;
  getErrorsByAgent(agentId: string): Promise<ErrorInstance[]>;
  getErrorsByType(errorType: string): Promise<ErrorInstance[]>;
  updateErrorInstance(id: string, updates: Partial<ErrorInstance>): Promise<ErrorInstance>;
  getUnresolvedErrors(): Promise<ErrorInstance[]>;

  // Recovery Strategy operations
  createRecoveryStrategy(strategy: Omit<RecoveryStrategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecoveryStrategy>;
  getRecoveryStrategy(id: string): Promise<RecoveryStrategy | undefined>;
  getRecoveryStrategiesByErrorType(errorType: string): Promise<RecoveryStrategy[]>;
  updateRecoveryStrategy(id: string, updates: Partial<RecoveryStrategy>): Promise<RecoveryStrategy>;

  // Agent Template operations
  createAgentTemplate(template: InsertAgentTemplate): Promise<AgentTemplate>;
  getAgentTemplate(id: string): Promise<AgentTemplate | undefined>;
  getAgentTemplateWithUsage(id: string): Promise<AgentTemplateWithUsage | undefined>;
  getAllAgentTemplates(): Promise<AgentTemplate[]>;
  getAgentTemplatesByCategory(category: string): Promise<AgentTemplate[]>;
  searchAgentTemplates(query: string): Promise<AgentTemplate[]>;
  updateAgentTemplate(id: string, updates: Partial<AgentTemplate>): Promise<AgentTemplate>;
  deleteAgentTemplate(id: string): Promise<void>;

  // Template Usage operations
  createTemplateUsage(usage: Omit<TemplateUsage, 'id' | 'usedAt'>): Promise<TemplateUsage>;
  getTemplateUsageForTemplate(templateId: string): Promise<TemplateUsage[]>;
  getTemplateUsageForTask(taskId: string): Promise<TemplateUsage[]>;

  // Timeline and Events operations
  createExecutionEvent(event: InsertExecutionEvent): Promise<ExecutionEvent>;
  getExecutionEvent(id: string): Promise<ExecutionEvent | undefined>;
  getEventsForTask(taskId: string): Promise<ExecutionEvent[]>;
  getEventsForAgent(agentId: string): Promise<ExecutionEvent[]>;
  getEventsByType(eventType: string): Promise<ExecutionEvent[]>;
  getTaskWithTimeline(taskId: string): Promise<TaskWithTimeline | undefined>;

  // Timeline Snapshot operations
  createTimelineSnapshot(snapshot: Omit<TimelineSnapshot, 'id' | 'createdAt'>): Promise<TimelineSnapshot>;
  getTimelineSnapshot(id: string): Promise<TimelineSnapshot | undefined>;
  getSnapshotsForTask(taskId: string): Promise<TimelineSnapshot[]>;
  getBookmarkedSnapshots(taskId: string): Promise<TimelineSnapshot[]>;
  updateTimelineSnapshot(id: string, updates: Partial<TimelineSnapshot>): Promise<TimelineSnapshot>;
  deleteTimelineSnapshot(id: string): Promise<void>;

  // Log operations (enhanced for timeline features)
  getLogsByTask(taskId: string): Promise<SystemLog[]>;
  getLogsByAgent(agentId: string): Promise<SystemLog[]>;
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

  // Task Queue operations
  async createTaskQueue(queue: InsertTaskQueue): Promise<TaskQueue> {
    const [newQueue] = await db.insert(taskQueues).values(queue).returning();
    return newQueue;
  }

  async getTaskQueue(id: string): Promise<TaskQueue | undefined> {
    const [queue] = await db.select().from(taskQueues).where(eq(taskQueues.id, id));
    return queue;
  }

  async getTaskQueueWithEntries(id: string): Promise<TaskQueueWithEntries | undefined> {
    const queue = await this.getTaskQueue(id);
    if (!queue) return undefined;

    const entries = await this.getQueueEntriesForQueue(id);
    return { ...queue, entries };
  }

  async getAllTaskQueues(): Promise<TaskQueue[]> {
    return await db.select().from(taskQueues).orderBy(desc(taskQueues.priority), desc(taskQueues.createdAt));
  }

  async updateTaskQueue(id: string, updates: Partial<TaskQueue>): Promise<TaskQueue> {
    const [updatedQueue] = await db
      .update(taskQueues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(taskQueues.id, id))
      .returning();
    return updatedQueue;
  }

  async deleteTaskQueue(id: string): Promise<void> {
    await db.delete(taskQueues).where(eq(taskQueues.id, id));
  }

  // Queue Entry operations
  async createQueueEntry(entry: InsertQueueEntry): Promise<QueueEntry> {
    const [newEntry] = await db.insert(queueEntries).values(entry).returning();
    return newEntry;
  }

  async getQueueEntry(id: string): Promise<QueueEntry | undefined> {
    const [entry] = await db.select().from(queueEntries).where(eq(queueEntries.id, id));
    return entry;
  }

  async getQueueEntriesForQueue(queueId: string): Promise<QueueEntry[]> {
    return await db
      .select()
      .from(queueEntries)
      .where(eq(queueEntries.queueId, queueId))
      .orderBy(queueEntries.priority, queueEntries.position);
  }

  async getQueueEntriesForTask(taskId: string): Promise<QueueEntry[]> {
    return await db
      .select()
      .from(queueEntries)
      .where(eq(queueEntries.taskId, taskId))
      .orderBy(desc(queueEntries.createdAt));
  }

  async updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry> {
    const [updatedEntry] = await db
      .update(queueEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(queueEntries.id, id))
      .returning();
    return updatedEntry;
  }

  async deleteQueueEntry(id: string): Promise<void> {
    await db.delete(queueEntries).where(eq(queueEntries.id, id));
  }

  async getNextQueuedEntry(queueId: string): Promise<QueueEntry | undefined> {
    const [entry] = await db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.queueId, queueId), eq(queueEntries.status, 'queued')))
      .orderBy(desc(queueEntries.priority), queueEntries.position)
      .limit(1);
    return entry;
  }

  // Task Schedule operations
  async createTaskSchedule(schedule: InsertTaskSchedule): Promise<TaskSchedule> {
    const [newSchedule] = await db.insert(taskSchedules).values(schedule).returning();
    return newSchedule;
  }

  async getTaskSchedule(id: string): Promise<TaskSchedule | undefined> {
    const [schedule] = await db.select().from(taskSchedules).where(eq(taskSchedules.id, id));
    return schedule;
  }

  async getAllTaskSchedules(): Promise<TaskSchedule[]> {
    return await db.select().from(taskSchedules).orderBy(desc(taskSchedules.createdAt));
  }

  async getActiveSchedules(): Promise<TaskSchedule[]> {
    return await db
      .select()
      .from(taskSchedules)
      .where(eq(taskSchedules.isActive, true))
      .orderBy(taskSchedules.nextRunAt);
  }

  async updateTaskSchedule(id: string, updates: Partial<TaskSchedule>): Promise<TaskSchedule> {
    const [updatedSchedule] = await db
      .update(taskSchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(taskSchedules.id, id))
      .returning();
    return updatedSchedule;
  }

  async deleteTaskSchedule(id: string): Promise<void> {
    await db.delete(taskSchedules).where(eq(taskSchedules.id, id));
  }

  // Budget operations
  async createBudget(budget: InsertBudget): Promise<Budget> {
    const [newBudget] = await db.insert(budgets).values(budget).returning();
    return newBudget;
  }

  async getBudget(id: string): Promise<Budget | undefined> {
    const [budget] = await db.select().from(budgets).where(eq(budgets.id, id));
    return budget;
  }

  async getBudgetWithCosts(id: string): Promise<BudgetWithCosts | undefined> {
    const budget = await this.getBudget(id);
    if (!budget) return undefined;

    const costs = await this.getCostEntriesForBudget(id);
    const totalSpent = costs.reduce((sum, cost) => sum + parseFloat(cost.cost), 0);
    const remainingBudget = parseFloat(budget.limitAmount) - totalSpent;
    const utilizationPercentage = (totalSpent / parseFloat(budget.limitAmount)) * 100;

    return {
      ...budget,
      costEntries: costs,
      totalSpent,
      remainingBudget,
      utilizationPercentage,
    };
  }

  async getAllBudgets(): Promise<Budget[]> {
    return await db.select().from(budgets).orderBy(desc(budgets.createdAt));
  }

  async getBudgetsByType(type: string, entityId?: string): Promise<Budget[]> {
    let query = db.select().from(budgets).where(eq(budgets.type, type));
    
    if (entityId) {
      query = query.where(eq(budgets.entityId, entityId));
    }

    return await query.orderBy(desc(budgets.createdAt));
  }

  async updateBudget(id: string, updates: Partial<Budget>): Promise<Budget> {
    const [updatedBudget] = await db
      .update(budgets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(budgets.id, id))
      .returning();
    return updatedBudget;
  }

  async deleteBudget(id: string): Promise<void> {
    await db.delete(budgets).where(eq(budgets.id, id));
  }

  // Cost Entry operations
  async createCostEntry(entry: InsertCostEntry): Promise<CostEntry> {
    const [newEntry] = await db.insert(costEntries).values(entry).returning();
    return newEntry;
  }

  async getCostEntriesForBudget(budgetId: string): Promise<CostEntry[]> {
    return await db
      .select()
      .from(costEntries)
      .where(eq(costEntries.budgetId, budgetId))
      .orderBy(desc(costEntries.timestamp));
  }

  async getCostEntriesForTask(taskId: string): Promise<CostEntry[]> {
    return await db
      .select()
      .from(costEntries)
      .where(eq(costEntries.taskId, taskId))
      .orderBy(desc(costEntries.timestamp));
  }

  async getCostEntriesForAgent(agentId: string): Promise<CostEntry[]> {
    return await db
      .select()
      .from(costEntries)
      .where(eq(costEntries.agentId, agentId))
      .orderBy(desc(costEntries.timestamp));
  }

  async getTotalCostForPeriod(budgetId: string, start: Date, end: Date): Promise<number> {
    const [result] = await db
      .select({
        total: sql<number>`sum(cost)`,
      })
      .from(costEntries)
      .where(
        and(
          eq(costEntries.budgetId, budgetId),
          sql`${costEntries.timestamp} >= ${start}`,
          sql`${costEntries.timestamp} <= ${end}`
        )
      );

    return result.total || 0;
  }

  // Error Instance operations
  async createErrorInstance(error: InsertErrorInstance): Promise<ErrorInstance> {
    const [newError] = await db.insert(errorInstances).values(error).returning();
    return newError;
  }

  async getErrorInstance(id: string): Promise<ErrorInstance | undefined> {
    const [error] = await db.select().from(errorInstances).where(eq(errorInstances.id, id));
    return error;
  }

  async getErrorsByTask(taskId: string): Promise<ErrorInstance[]> {
    return await db
      .select()
      .from(errorInstances)
      .where(eq(errorInstances.taskId, taskId))
      .orderBy(desc(errorInstances.occurredAt));
  }

  async getErrorsByAgent(agentId: string): Promise<ErrorInstance[]> {
    return await db
      .select()
      .from(errorInstances)
      .where(eq(errorInstances.agentId, agentId))
      .orderBy(desc(errorInstances.occurredAt));
  }

  async getErrorsByType(errorType: string): Promise<ErrorInstance[]> {
    return await db
      .select()
      .from(errorInstances)
      .where(eq(errorInstances.errorType, errorType))
      .orderBy(desc(errorInstances.occurredAt));
  }

  async updateErrorInstance(id: string, updates: Partial<ErrorInstance>): Promise<ErrorInstance> {
    const [updatedError] = await db
      .update(errorInstances)
      .set(updates)
      .where(eq(errorInstances.id, id))
      .returning();
    return updatedError;
  }

  async getUnresolvedErrors(): Promise<ErrorInstance[]> {
    return await db
      .select()
      .from(errorInstances)
      .where(eq(errorInstances.isResolved, false))
      .orderBy(desc(errorInstances.severity), desc(errorInstances.occurredAt));
  }

  // Recovery Strategy operations
  async createRecoveryStrategy(strategy: Omit<RecoveryStrategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecoveryStrategy> {
    const [newStrategy] = await db.insert(recoveryStrategies).values(strategy).returning();
    return newStrategy;
  }

  async getRecoveryStrategy(id: string): Promise<RecoveryStrategy | undefined> {
    const [strategy] = await db.select().from(recoveryStrategies).where(eq(recoveryStrategies.id, id));
    return strategy;
  }

  async getRecoveryStrategiesByErrorType(errorType: string): Promise<RecoveryStrategy[]> {
    return await db
      .select()
      .from(recoveryStrategies)
      .where(and(eq(recoveryStrategies.errorType, errorType), eq(recoveryStrategies.isActive, true)))
      .orderBy(desc(recoveryStrategies.priority), desc(recoveryStrategies.successRate));
  }

  async updateRecoveryStrategy(id: string, updates: Partial<RecoveryStrategy>): Promise<RecoveryStrategy> {
    const [updatedStrategy] = await db
      .update(recoveryStrategies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(recoveryStrategies.id, id))
      .returning();
    return updatedStrategy;
  }

  // Agent Template operations
  async createAgentTemplate(template: InsertAgentTemplate): Promise<AgentTemplate> {
    const [newTemplate] = await db.insert(agentTemplates).values(template).returning();
    return newTemplate;
  }

  async getAgentTemplate(id: string): Promise<AgentTemplate | undefined> {
    const [template] = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id));
    return template;
  }

  async getAgentTemplateWithUsage(id: string): Promise<AgentTemplateWithUsage | undefined> {
    const template = await this.getAgentTemplate(id);
    if (!template) return undefined;

    const usage = await this.getTemplateUsageForTemplate(id);
    const averageRating = usage.length > 0 
      ? usage.reduce((sum, u) => sum + (u.rating || 0), 0) / usage.filter(u => u.rating).length 
      : 0;
    const recentUsage = usage.filter(u => 
      new Date(u.usedAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000 // last 30 days
    ).length;

    return {
      ...template,
      usage,
      averageRating,
      recentUsage,
    };
  }

  async getAllAgentTemplates(): Promise<AgentTemplate[]> {
    return await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.isActive, true))
      .orderBy(desc(agentTemplates.rating), desc(agentTemplates.usageCount));
  }

  async getAgentTemplatesByCategory(category: string): Promise<AgentTemplate[]> {
    return await db
      .select()
      .from(agentTemplates)
      .where(and(eq(agentTemplates.category, category), eq(agentTemplates.isActive, true)))
      .orderBy(desc(agentTemplates.rating), desc(agentTemplates.usageCount));
  }

  async searchAgentTemplates(query: string): Promise<AgentTemplate[]> {
    return await db
      .select()
      .from(agentTemplates)
      .where(
        and(
          eq(agentTemplates.isActive, true),
          or(
            sql`${agentTemplates.name} ILIKE ${`%${query}%`}`,
            sql`${agentTemplates.description} ILIKE ${`%${query}%`}`,
            sql`${agentTemplates.tags}::text ILIKE ${`%${query}%`}`
          )
        )
      )
      .orderBy(desc(agentTemplates.rating), desc(agentTemplates.usageCount));
  }

  async updateAgentTemplate(id: string, updates: Partial<AgentTemplate>): Promise<AgentTemplate> {
    const [updatedTemplate] = await db
      .update(agentTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(agentTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteAgentTemplate(id: string): Promise<void> {
    await db.delete(agentTemplates).where(eq(agentTemplates.id, id));
  }

  // Template Usage operations
  async createTemplateUsage(usage: Omit<TemplateUsage, 'id' | 'usedAt'>): Promise<TemplateUsage> {
    const [newUsage] = await db.insert(templateUsage).values(usage).returning();
    return newUsage;
  }

  async getTemplateUsageForTemplate(templateId: string): Promise<TemplateUsage[]> {
    return await db
      .select()
      .from(templateUsage)
      .where(eq(templateUsage.templateId, templateId))
      .orderBy(desc(templateUsage.usedAt));
  }

  async getTemplateUsageForTask(taskId: string): Promise<TemplateUsage[]> {
    return await db
      .select()
      .from(templateUsage)
      .where(eq(templateUsage.taskId, taskId))
      .orderBy(desc(templateUsage.usedAt));
  }

  // Timeline and Events operations
  async createExecutionEvent(event: InsertExecutionEvent): Promise<ExecutionEvent> {
    const [newEvent] = await db.insert(executionEvents).values(event).returning();
    return newEvent;
  }

  async getExecutionEvent(id: string): Promise<ExecutionEvent | undefined> {
    const [event] = await db.select().from(executionEvents).where(eq(executionEvents.id, id));
    return event;
  }

  async getEventsForTask(taskId: string): Promise<ExecutionEvent[]> {
    return await db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.taskId, taskId))
      .orderBy(executionEvents.sequence, executionEvents.timestamp);
  }

  async getEventsForAgent(agentId: string): Promise<ExecutionEvent[]> {
    return await db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.agentId, agentId))
      .orderBy(desc(executionEvents.timestamp));
  }

  async getEventsByType(eventType: string): Promise<ExecutionEvent[]> {
    return await db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.eventType, eventType))
      .orderBy(desc(executionEvents.timestamp));
  }

  async getTaskWithTimeline(taskId: string): Promise<TaskWithTimeline | undefined> {
    const taskWithAgents = await this.getTaskWithAgents(taskId);
    if (!taskWithAgents) return undefined;

    const events = await this.getEventsForTask(taskId);
    const snapshots = await this.getSnapshotsForTask(taskId);

    return {
      ...taskWithAgents,
      events,
      snapshots,
    };
  }

  // Timeline Snapshot operations
  async createTimelineSnapshot(snapshot: Omit<TimelineSnapshot, 'id' | 'createdAt'>): Promise<TimelineSnapshot> {
    const [newSnapshot] = await db.insert(timelineSnapshots).values(snapshot).returning();
    return newSnapshot;
  }

  async getTimelineSnapshot(id: string): Promise<TimelineSnapshot | undefined> {
    const [snapshot] = await db.select().from(timelineSnapshots).where(eq(timelineSnapshots.id, id));
    return snapshot;
  }

  async getSnapshotsForTask(taskId: string): Promise<TimelineSnapshot[]> {
    return await db
      .select()
      .from(timelineSnapshots)
      .where(eq(timelineSnapshots.taskId, taskId))
      .orderBy(desc(timelineSnapshots.createdAt));
  }

  async getBookmarkedSnapshots(taskId: string): Promise<TimelineSnapshot[]> {
    return await db
      .select()
      .from(timelineSnapshots)
      .where(and(eq(timelineSnapshots.taskId, taskId), eq(timelineSnapshots.isBookmarked, true)))
      .orderBy(desc(timelineSnapshots.createdAt));
  }

  async updateTimelineSnapshot(id: string, updates: Partial<TimelineSnapshot>): Promise<TimelineSnapshot> {
    const [updatedSnapshot] = await db
      .update(timelineSnapshots)
      .set(updates)
      .where(eq(timelineSnapshots.id, id))
      .returning();
    return updatedSnapshot;
  }

  async deleteTimelineSnapshot(id: string): Promise<void> {
    await db.delete(timelineSnapshots).where(eq(timelineSnapshots.id, id));
  }

  // Enhanced log operations
  async getLogsByTask(taskId: string): Promise<SystemLog[]> {
    return await db
      .select()
      .from(systemLogs)
      .where(eq(systemLogs.taskId, taskId))
      .orderBy(desc(systemLogs.timestamp));
  }

  async getLogsByAgent(agentId: string): Promise<SystemLog[]> {
    return await db
      .select()
      .from(systemLogs)
      .where(eq(systemLogs.agentId, agentId))
      .orderBy(desc(systemLogs.timestamp));
  }
}

export const storage = new DatabaseStorage();
