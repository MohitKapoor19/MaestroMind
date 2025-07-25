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
