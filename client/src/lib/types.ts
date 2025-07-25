export interface TaskMetrics {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  successRate: number;
  avgCompletionTime: number;
}

export interface AgentMetrics {
  totalAgents: number;
  activeAgents: number;
  avgConfidence: number;
  totalExecutions: number;
  totalCost: number;
}

export interface DashboardMetrics {
  overview: TaskMetrics & AgentMetrics;
  activeTasks: Array<{
    id: string;
    title: string;
    status: string;
    progress: number;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    level: string;
    category: string;
    message: string;
    timestamp: string;
    taskId?: string;
    agentId?: string;
  }>;
  systemHealth: {
    status: string;
    uptime: number;
    memoryUsage: any;
  };
}

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: string;
  confidence?: number;
  lastActivity?: string;
}

export interface TaskStatus {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  agents: AgentStatus[];
  metrics: {
    totalExecutions: number;
    totalCollaborations: number;
    totalCost: number;
    totalTokens: number;
    avgExecutionTime: number;
    successRate: number;
  };
  recentActivity: Array<{
    id: string;
    message: string;
    timestamp: string;
    level: string;
  }>;
}

export interface RealtimeUpdate {
  type: 'task_update' | 'agent_update' | 'execution_update' | 'log_update';
  data: any;
  timestamp: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimatedDuration?: string;
  files?: File[];
}

export interface AgentExecutionRequest {
  agentId: string;
  action: string;
  input: any;
  context?: string;
}

export interface CollaborationRequest {
  fromAgentId: string;
  toAgentId: string;
  collaborationType: 'refinement' | 'critique' | 'handoff';
  content: any;
}

export interface LogFilter {
  level?: string;
  category?: string;
  taskId?: string;
  agentId?: string;
  limit?: number;
}

export type TabType = 'create' | 'network' | 'workflow' | 'output' | 'logs' | 'inspector';
