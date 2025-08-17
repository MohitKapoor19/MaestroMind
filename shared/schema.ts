import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  uuid, 
  jsonb, 
  integer,
  decimal,
  boolean,
  index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Tasks table - represents user-submitted tasks
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  estimatedDuration: varchar("estimated_duration", { length: 50 }),
  actualDuration: integer("actual_duration"), // in minutes
  progress: integer("progress").default(0), // percentage 0-100
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Agents table - represents dynamically generated agents
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  prompt: text("prompt").notNull(), // P in A = {P, D, T, S}
  description: text("description").notNull(), // D
  toolset: jsonb("toolset").notNull(), // T - array of available tools
  suggestions: text("suggestions"), // S - operational suggestions
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0.00-100.00
  memoryContext: jsonb("memory_context"), // agent's working memory
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent execution logs - tracks agent activities
export const agentExecutions = pgTable("agent_executions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  status: varchar("status", { length: 50 }).notNull(),
  tokensUsed: integer("tokens_used"),
  cost: decimal("cost", { precision: 10, scale: 6 }), // API cost in dollars
  duration: integer("duration"), // execution time in milliseconds
  error: text("error"),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Agent collaborations - tracks inter-agent communications
export const agentCollaborations = pgTable("agent_collaborations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  fromAgentId: uuid("from_agent_id").references(() => agents.id),
  toAgentId: uuid("to_agent_id").references(() => agents.id),
  collaborationType: varchar("collaboration_type", { length: 50 }).notNull(), // "refinement", "critique", "handoff"
  content: jsonb("content").notNull(),
  response: jsonb("response"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Task execution plans - represents the execution strategy
export const executionPlans = pgTable("execution_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  plannerOutput: jsonb("planner_output").notNull(), // full planner analysis
  agentRoles: jsonb("agent_roles").notNull(), // proposed agent team
  executionSteps: jsonb("execution_steps").notNull(), // step-by-step plan
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  version: integer("version").default(1),
  observerFeedback: jsonb("observer_feedback"),
  refinementCount: integer("refinement_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// System logs - comprehensive activity logging
export const systemLogs = pgTable("system_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  level: varchar("level", { length: 20 }).notNull(), // info, warn, error, debug
  category: varchar("category", { length: 50 }).notNull(), // agent, task, system, api
  message: text("message").notNull(),
  data: jsonb("data"),
  taskId: uuid("task_id").references(() => tasks.id),
  agentId: uuid("agent_id").references(() => agents.id),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("idx_logs_timestamp").on(table.timestamp),
  index("idx_logs_level").on(table.level),
  index("idx_logs_category").on(table.category),
]);

// File uploads - user-provided files for tasks
export const fileUploads = pgTable("file_uploads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), // bytes
  path: text("path").notNull(), // storage path
  processed: boolean("processed").default(false),
  metadata: jsonb("metadata"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Define relations
export const tasksRelations = relations(tasks, ({ many }) => ({
  agents: many(agents),
  executions: many(agentExecutions),
  collaborations: many(agentCollaborations),
  executionPlans: many(executionPlans),
  files: many(fileUploads),
  logs: many(systemLogs),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  task: one(tasks, {
    fields: [agents.taskId],
    references: [tasks.id],
  }),
  executions: many(agentExecutions),
  collaborationsFrom: many(agentCollaborations, {
    relationName: "fromAgent",
  }),
  collaborationsTo: many(agentCollaborations, {
    relationName: "toAgent",
  }),
  logs: many(systemLogs),
}));

export const agentExecutionsRelations = relations(agentExecutions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentExecutions.agentId],
    references: [agents.id],
  }),
  task: one(tasks, {
    fields: [agentExecutions.taskId],
    references: [tasks.id],
  }),
}));

export const agentCollaborationsRelations = relations(agentCollaborations, ({ one }) => ({
  task: one(tasks, {
    fields: [agentCollaborations.taskId],
    references: [tasks.id],
  }),
  fromAgent: one(agents, {
    fields: [agentCollaborations.fromAgentId],
    references: [agents.id],
    relationName: "fromAgent",
  }),
  toAgent: one(agents, {
    fields: [agentCollaborations.toAgentId],
    references: [agents.id],
    relationName: "toAgent",
  }),
}));

export const executionPlansRelations = relations(executionPlans, ({ one }) => ({
  task: one(tasks, {
    fields: [executionPlans.taskId],
    references: [tasks.id],
  }),
}));

export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
  task: one(tasks, {
    fields: [systemLogs.taskId],
    references: [tasks.id],
  }),
  agent: one(agents, {
    fields: [systemLogs.agentId],
    references: [agents.id],
  }),
}));

export const fileUploadsRelations = relations(fileUploads, ({ one }) => ({
  task: one(tasks, {
    fields: [fileUploads.taskId],
    references: [tasks.id],
  }),
}));

// Insert schemas
export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentExecutionSchema = createInsertSchema(agentExecutions).omit({
  id: true,
  timestamp: true,
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  timestamp: true,
});

// Types
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type InsertAgentExecution = z.infer<typeof insertAgentExecutionSchema>;
export type AgentCollaboration = typeof agentCollaborations.$inferSelect;
export type ExecutionPlan = typeof executionPlans.$inferSelect;
export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type FileUpload = typeof fileUploads.$inferSelect;

// Extended types for API responses
export type TaskWithAgents = Task & {
  agents: Agent[];
  executionPlans: ExecutionPlan[];
  files: FileUpload[];
};

export type AgentWithExecutions = Agent & {
  executions: AgentExecution[];
  collaborationsFrom: AgentCollaboration[];
  collaborationsTo: AgentCollaboration[];
};

export type RealtimeUpdate = {
  type: 'task_update' | 'agent_update' | 'execution_update' | 'log_update';
  data: any;
  timestamp: string;
};

// Task creation request type
export type TaskCreationRequest = {
  title: string;
  description: string;
  priority: string;
  status?: string;
  estimatedDuration?: string;
  metadata?: any;
  files?: FileUploadData[];
};

export type FileUploadData = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
};

// n8n Workflow schema
export const n8nWorkflows = pgTable("n8n_workflows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  workflowData: jsonb("workflow_data").notNull(),
  nodes: jsonb("nodes").notNull(),
  connections: jsonb("connections").notNull(),
  settings: jsonb("settings"),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  name: text("name").notNull(),
  description: text("description"),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const n8nWorkflowsRelations = relations(n8nWorkflows, ({ one }) => ({
  task: one(tasks, {
    fields: [n8nWorkflows.taskId],
    references: [tasks.id],
  }),
}));

export type N8nWorkflow = typeof n8nWorkflows.$inferSelect;
export type InsertN8nWorkflow = typeof n8nWorkflows.$inferInsert;

// Task Queue system - manages task execution order and scheduling
export const taskQueues = pgTable("task_queues", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"), // high, medium, low
  status: varchar("status", { length: 50 }).notNull().default("active"), // active, paused, stopped
  maxConcurrency: integer("max_concurrency").default(1), // max concurrent tasks
  currentLoad: integer("current_load").default(0), // current running tasks
  settings: jsonb("settings"), // queue-specific settings
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Queue entries - tasks waiting in queues
export const queueEntries = pgTable("queue_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  queueId: uuid("queue_id").references(() => taskQueues.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // position in queue
  priority: integer("priority").default(0), // higher number = higher priority
  estimatedDuration: integer("estimated_duration"), // in minutes
  dependencies: jsonb("dependencies"), // task IDs this entry depends on
  scheduledFor: timestamp("scheduled_for"), // when to execute (if scheduled)
  status: varchar("status", { length: 50 }).notNull().default("queued"), // queued, running, completed, failed, cancelled
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  lastError: text("last_error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task schedules - for recurring/scheduled tasks
export const taskSchedules = pgTable("task_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  taskTemplate: jsonb("task_template").notNull(), // template for creating tasks
  cronExpression: text("cron_expression"), // cron format for scheduling
  timezone: text("timezone").default("UTC"),
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  totalRuns: integer("total_runs").default(0),
  maxRuns: integer("max_runs"), // optional limit
  failureCount: integer("failure_count").default(0),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Budget tracking for cost control
export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // global, task, agent, user
  entityId: uuid("entity_id"), // task/agent/user ID (null for global)
  limitAmount: decimal("limit_amount", { precision: 10, scale: 2 }).notNull(),
  currentSpent: decimal("current_spent", { precision: 10, scale: 2 }).default("0.00"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  period: varchar("period", { length: 20 }).notNull(), // daily, weekly, monthly, total
  periodStart: timestamp("period_start").defaultNow(),
  periodEnd: timestamp("period_end"),
  alertThresholds: jsonb("alert_thresholds"), // [50, 75, 90] percentage thresholds
  isActive: boolean("is_active").default(true),
  resetOnPeriod: boolean("reset_on_period").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cost tracking entries
export const costEntries = pgTable("cost_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: uuid("budget_id").references(() => budgets.id),
  taskId: uuid("task_id").references(() => tasks.id),
  agentId: uuid("agent_id").references(() => agents.id),
  executionId: uuid("execution_id").references(() => agentExecutions.id),
  provider: varchar("provider", { length: 50 }).notNull(), // groq, gemini, ollama
  operation: varchar("operation", { length: 100 }).notNull(), // chat, generation, embedding
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  tokensTotal: integer("tokens_total"),
  cost: decimal("cost", { precision: 10, scale: 6 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  ratePerToken: decimal("rate_per_token", { precision: 12, scale: 8 }),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Error tracking and recovery
export const errorInstances = pgTable("error_instances", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id),
  agentId: uuid("agent_id").references(() => agents.id),
  executionId: uuid("execution_id").references(() => agentExecutions.id),
  errorType: varchar("error_type", { length: 100 }).notNull(), // rate_limit, auth, server, network, timeout
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  provider: varchar("provider", { length: 50 }),
  operation: varchar("operation", { length: 100 }),
  isResolved: boolean("is_resolved").default(false),
  resolutionStrategy: varchar("resolution_strategy", { length: 100 }),
  retryCount: integer("retry_count").default(0),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"), // low, medium, high, critical
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Recovery strategies for different error types
export const recoveryStrategies = pgTable("recovery_strategies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  errorType: varchar("error_type", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 50 }),
  strategy: jsonb("strategy").notNull(), // retry config, fallback providers, etc.
  isActive: boolean("is_active").default(true),
  successRate: decimal("success_rate", { precision: 5, scale: 2 }),
  totalAttempts: integer("total_attempts").default(0),
  successfulAttempts: integer("successful_attempts").default(0),
  priority: integer("priority").default(0), // higher number = higher priority
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent templates for reusable configurations
export const agentTemplates = pgTable("agent_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // research, coding, analysis, etc.
  agentConfig: jsonb("agent_config").notNull(), // {name, role, prompt, description, toolset, suggestions}
  tags: jsonb("tags"), // array of tags for searching
  isPublic: boolean("is_public").default(false),
  createdBy: text("created_by"), // user identifier
  usageCount: integer("usage_count").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }), // 0.00-5.00
  ratingCount: integer("rating_count").default(0),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Template usage tracking
export const templateUsage = pgTable("template_usage", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").references(() => agentTemplates.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id),
  agentId: uuid("agent_id").references(() => agents.id),
  usedBy: text("used_by"), // user identifier
  rating: integer("rating"), // 1-5 rating
  feedback: text("feedback"),
  modifications: jsonb("modifications"), // what was changed from template
  usedAt: timestamp("used_at").defaultNow(),
});

// Execution timeline events for replay and debugging
export const executionEvents = pgTable("execution_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id),
  executionId: uuid("execution_id").references(() => agentExecutions.id),
  collaborationId: uuid("collaboration_id").references(() => agentCollaborations.id),
  eventType: varchar("event_type", { length: 50 }).notNull(), // task_start, agent_created, execution_start, collaboration, state_change, etc.
  eventCategory: varchar("event_category", { length: 50 }).notNull(), // task, agent, execution, system
  eventData: jsonb("event_data").notNull(),
  stateBefore: jsonb("state_before"), // snapshot of relevant state before event
  stateAfter: jsonb("state_after"), // snapshot of relevant state after event
  sequence: integer("sequence").notNull(), // order within task execution
  parentEventId: uuid("parent_event_id").references(() => executionEvents.id),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("idx_events_task_sequence").on(table.taskId, table.sequence),
  index("idx_events_type_timestamp").on(table.eventType, table.timestamp),
  index("idx_events_category_timestamp").on(table.eventCategory, table.timestamp),
]);

// Timeline snapshots for quick access to execution states
export const timelineSnapshots = pgTable("timeline_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => executionEvents.id),
  snapshotType: varchar("snapshot_type", { length: 50 }).notNull(), // milestone, checkpoint, error, completion
  name: text("name").notNull(),
  description: text("description"),
  fullState: jsonb("full_state").notNull(), // complete state snapshot
  isBookmarked: boolean("is_bookmarked").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define relations for new tables
export const taskQueuesRelations = relations(taskQueues, ({ many }) => ({
  entries: many(queueEntries),
}));

export const queueEntriesRelations = relations(queueEntries, ({ one }) => ({
  queue: one(taskQueues, {
    fields: [queueEntries.queueId],
    references: [taskQueues.id],
  }),
  task: one(tasks, {
    fields: [queueEntries.taskId],
    references: [tasks.id],
  }),
}));

export const taskSchedulesRelations = relations(taskSchedules, ({ many }) => ({
  // Could link to generated tasks if needed
}));

export const budgetsRelations = relations(budgets, ({ many }) => ({
  costEntries: many(costEntries),
}));

export const costEntriesRelations = relations(costEntries, ({ one }) => ({
  budget: one(budgets, {
    fields: [costEntries.budgetId],
    references: [budgets.id],
  }),
  task: one(tasks, {
    fields: [costEntries.taskId],
    references: [tasks.id],
  }),
  agent: one(agents, {
    fields: [costEntries.agentId],
    references: [agents.id],
  }),
  execution: one(agentExecutions, {
    fields: [costEntries.executionId],
    references: [agentExecutions.id],
  }),
}));

export const errorInstancesRelations = relations(errorInstances, ({ one }) => ({
  task: one(tasks, {
    fields: [errorInstances.taskId],
    references: [tasks.id],
  }),
  agent: one(agents, {
    fields: [errorInstances.agentId],
    references: [agents.id],
  }),
  execution: one(agentExecutions, {
    fields: [errorInstances.executionId],
    references: [agentExecutions.id],
  }),
}));

export const agentTemplatesRelations = relations(agentTemplates, ({ many }) => ({
  usage: many(templateUsage),
}));

export const templateUsageRelations = relations(templateUsage, ({ one }) => ({
  template: one(agentTemplates, {
    fields: [templateUsage.templateId],
    references: [agentTemplates.id],
  }),
  task: one(tasks, {
    fields: [templateUsage.taskId],
    references: [tasks.id],
  }),
  agent: one(agents, {
    fields: [templateUsage.agentId],
    references: [agents.id],
  }),
}));

export const executionEventsRelations = relations(executionEvents, ({ one, many }) => ({
  task: one(tasks, {
    fields: [executionEvents.taskId],
    references: [tasks.id],
  }),
  agent: one(agents, {
    fields: [executionEvents.agentId],
    references: [agents.id],
  }),
  execution: one(agentExecutions, {
    fields: [executionEvents.executionId],
    references: [agentExecutions.id],
  }),
  collaboration: one(agentCollaborations, {
    fields: [executionEvents.collaborationId],
    references: [agentCollaborations.id],
  }),
  parentEvent: one(executionEvents, {
    fields: [executionEvents.parentEventId],
    references: [executionEvents.id],
    relationName: "parentEvent",
  }),
  childEvents: many(executionEvents, {
    relationName: "parentEvent",
  }),
  snapshots: many(timelineSnapshots),
}));

export const timelineSnapshotsRelations = relations(timelineSnapshots, ({ one }) => ({
  task: one(tasks, {
    fields: [timelineSnapshots.taskId],
    references: [tasks.id],
  }),
  event: one(executionEvents, {
    fields: [timelineSnapshots.eventId],
    references: [executionEvents.id],
  }),
}));

// Add new insert schemas
export const insertTaskQueueSchema = createInsertSchema(taskQueues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQueueEntrySchema = createInsertSchema(queueEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskScheduleSchema = createInsertSchema(taskSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetSchema = createInsertSchema(budgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCostEntrySchema = createInsertSchema(costEntries).omit({
  id: true,
  timestamp: true,
});

export const insertErrorInstanceSchema = createInsertSchema(errorInstances).omit({
  id: true,
  occurredAt: true,
});

export const insertAgentTemplateSchema = createInsertSchema(agentTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExecutionEventSchema = createInsertSchema(executionEvents).omit({
  id: true,
  timestamp: true,
});

// Add new types
export type TaskQueue = typeof taskQueues.$inferSelect;
export type InsertTaskQueue = z.infer<typeof insertTaskQueueSchema>;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type InsertQueueEntry = z.infer<typeof insertQueueEntrySchema>;
export type TaskSchedule = typeof taskSchedules.$inferSelect;
export type InsertTaskSchedule = z.infer<typeof insertTaskScheduleSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type CostEntry = typeof costEntries.$inferSelect;
export type InsertCostEntry = z.infer<typeof insertCostEntrySchema>;
export type ErrorInstance = typeof errorInstances.$inferSelect;
export type InsertErrorInstance = z.infer<typeof insertErrorInstanceSchema>;
export type RecoveryStrategy = typeof recoveryStrategies.$inferSelect;
export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type InsertAgentTemplate = z.infer<typeof insertAgentTemplateSchema>;
export type TemplateUsage = typeof templateUsage.$inferSelect;
export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type InsertExecutionEvent = z.infer<typeof insertExecutionEventSchema>;
export type TimelineSnapshot = typeof timelineSnapshots.$inferSelect;

// Extended types for API responses
export type TaskQueueWithEntries = TaskQueue & {
  entries: QueueEntry[];
};

export type QueueEntryWithTask = QueueEntry & {
  task: Task;
};

export type BudgetWithCosts = Budget & {
  costEntries: CostEntry[];
  totalSpent: number;
  remainingBudget: number;
  utilizationPercentage: number;
};

export type AgentTemplateWithUsage = AgentTemplate & {
  usage: TemplateUsage[];
  averageRating: number;
  recentUsage: number;
};

export type TaskWithTimeline = TaskWithAgents & {
  events: ExecutionEvent[];
  snapshots: TimelineSnapshot[];
};

// New realtime update types
export type RealtimeUpdate = {
  type: 'task_update' | 'agent_update' | 'execution_update' | 'log_update' | 'queue_update' | 'budget_update' | 'error_update' | 'timeline_update';
  data: any;
  timestamp: string;
};
