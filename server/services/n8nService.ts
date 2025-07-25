import { storage } from '../storage';
import type { N8nWorkflow } from '@shared/schema';

export interface WorkflowExecutionResult {
  executionId: string;
  status: 'success' | 'error' | 'running';
  startedAt: Date;
  finishedAt?: Date;
  data?: any;
  error?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  parameters: Record<string, any>;
  credentials?: Record<string, any>;
}

export interface WorkflowConnection {
  source: string;
  target: string;
  sourceOutput: string;
  targetInput: string;
}

class N8nService {
  async createWorkflow(workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<N8nWorkflow> {
    return await storage.createN8nWorkflow(workflow);
  }

  async getWorkflow(id: string): Promise<N8nWorkflow | null> {
    return await storage.getN8nWorkflow(id);
  }

  async getWorkflowsByTask(taskId: string): Promise<N8nWorkflow[]> {
    return await storage.getN8nWorkflowsByTask(taskId);
  }

  async updateWorkflow(id: string, updates: Partial<N8nWorkflow>): Promise<N8nWorkflow | null> {
    return await storage.updateN8nWorkflow(id, updates);
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    return await storage.deleteN8nWorkflow(id);
  }

  async executeWorkflow(workflowId: string): Promise<WorkflowExecutionResult> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const executionId = `exec_${Date.now()}`;
      const startedAt = new Date();

      // Update workflow status to running
      await this.updateWorkflow(workflowId, { status: 'active' });

      // Simulate workflow execution based on nodes
      const result = await this.processWorkflowNodes(workflow);

      const executionResult: WorkflowExecutionResult = {
        executionId,
        status: 'success',
        startedAt,
        finishedAt: new Date(),
        data: result,
      };

      // Update workflow status back to active
      await this.updateWorkflow(workflowId, { status: 'active' });

      return executionResult;

    } catch (error) {
      console.error('Workflow execution failed:', error);
      
      await this.updateWorkflow(workflowId, { status: 'error' });
      
      return {
        executionId: `exec_${Date.now()}`,
        status: 'error',
        startedAt: new Date(),
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async processWorkflowNodes(workflow: N8nWorkflow): Promise<any> {
    const { nodes, connections } = workflow;
    const nodeResults: Record<string, any> = {};
    
    // Sort nodes by execution order (simple topological sort)
    const executionOrder = this.getExecutionOrder(nodes, connections);
    
    for (const nodeId of executionOrder) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      try {
        const nodeResult = await this.executeNode(node, nodeResults);
        nodeResults[nodeId] = nodeResult;
      } catch (error) {
        console.error(`Node ${nodeId} execution failed:`, error);
        throw new Error(`Node ${node.name} failed: ${error}`);
      }
    }

    return nodeResults;
  }

  private getExecutionOrder(nodes: WorkflowNode[], connections: WorkflowConnection[]): string[] {
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    
    // Initialize graph
    nodes.forEach(node => {
      graph[node.id] = [];
      inDegree[node.id] = 0;
    });
    
    // Build graph from connections
    connections.forEach(conn => {
      graph[conn.source].push(conn.target);
      inDegree[conn.target] = (inDegree[conn.target] || 0) + 1;
    });
    
    // Topological sort
    const queue: string[] = [];
    const result: string[] = [];
    
    // Find nodes with no incoming edges
    Object.keys(inDegree).forEach(nodeId => {
      if (inDegree[nodeId] === 0) {
        queue.push(nodeId);
      }
    });
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      
      graph[nodeId].forEach(neighborId => {
        inDegree[neighborId]--;
        if (inDegree[neighborId] === 0) {
          queue.push(neighborId);
        }
      });
    }
    
    return result;
  }

  private async executeNode(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    switch (node.type) {
      case 'http-request':
        return await this.executeHttpRequest(node, previousResults);
      case 'webhook':
        return await this.executeWebhook(node, previousResults);
      case 'schedule':
        return await this.executeSchedule(node, previousResults);
      case 'database':
        return await this.executeDatabase(node, previousResults);
      case 'email':
        return await this.executeEmail(node, previousResults);
      case 'file':
        return await this.executeFile(node, previousResults);
      case 'code':
        return await this.executeCode(node, previousResults);
      case 'ai-agent':
        return await this.executeAiAgent(node, previousResults);
      default:
        return { message: `Node type ${node.type} not implemented`, data: null };
    }
  }

  private async executeHttpRequest(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { method = 'GET', url, headers = {} } = node.parameters;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });
      
      const data = await response.json();
      
      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: data,
      };
    } catch (error) {
      throw new Error(`HTTP request failed: ${error}`);
    }
  }

  private async executeWebhook(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { path, httpMethod = 'POST' } = node.parameters;
    
    return {
      message: `Webhook endpoint created at /${path}`,
      method: httpMethod,
      url: `/webhook/${path}`,
      listening: true,
    };
  }

  private async executeSchedule(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { triggerInterval = '15 minutes' } = node.parameters;
    
    return {
      message: `Scheduled trigger configured for every ${triggerInterval}`,
      interval: triggerInterval,
      nextRun: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  private async executeDatabase(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { operation = 'select', table, query } = node.parameters;
    
    // Simulate database operation
    return {
      operation,
      table,
      query,
      result: `Simulated ${operation} operation on ${table}`,
      rowsAffected: Math.floor(Math.random() * 100),
    };
  }

  private async executeEmail(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { to, subject, text } = node.parameters;
    
    // Simulate email sending
    return {
      to,
      subject,
      text,
      messageId: `msg_${Date.now()}`,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }

  private async executeFile(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { operation = 'read', path } = node.parameters;
    
    // Simulate file operation
    return {
      operation,
      path,
      result: `Simulated ${operation} operation on ${path}`,
      size: Math.floor(Math.random() * 10000),
      lastModified: new Date().toISOString(),
    };
  }

  private async executeCode(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { language = 'javascript', code } = node.parameters;
    
    try {
      // Simulate code execution (in real implementation, use a sandbox)
      if (language === 'javascript') {
        // This is a simplified simulation - in production, use a proper sandbox
        const result = {
          language,
          code,
          output: 'Code executed successfully',
          logs: ['Execution started', 'Processing data...', 'Execution completed'],
          executionTime: Math.floor(Math.random() * 1000) + 'ms',
        };
        
        return result;
      }
      
      throw new Error(`Language ${language} not supported`);
    } catch (error) {
      throw new Error(`Code execution failed: ${error}`);
    }
  }

  private async executeAiAgent(node: WorkflowNode, previousResults: Record<string, any>): Promise<any> {
    const { model = 'groq', prompt, maxTokens = 1000 } = node.parameters;
    
    // This would integrate with the existing agent service
    // For now, simulate AI response
    return {
      model,
      prompt,
      maxTokens,
      response: `AI response to: ${prompt}`,
      tokensUsed: Math.floor(Math.random() * maxTokens),
      cost: (Math.random() * 0.01).toFixed(4),
      executionTime: Math.floor(Math.random() * 2000) + 'ms',
    };
  }

  async validateWorkflow(workflow: Partial<N8nWorkflow>): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!workflow.name || workflow.name.trim().length === 0) {
      errors.push('Workflow name is required');
    }
    
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }
    
    if (workflow.nodes) {
      // Check for duplicate node IDs
      const nodeIds = workflow.nodes.map(n => n.id);
      const duplicates = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate node IDs found: ${duplicates.join(', ')}`);
      }
      
      // Validate node parameters
      workflow.nodes.forEach(node => {
        if (!node.name || node.name.trim().length === 0) {
          errors.push(`Node ${node.id} is missing a name`);
        }
        
        if (!node.type) {
          errors.push(`Node ${node.id} is missing a type`);
        }
      });
    }
    
    if (workflow.connections) {
      // Validate connections reference existing nodes
      const nodeIds = workflow.nodes?.map(n => n.id) || [];
      workflow.connections.forEach(conn => {
        if (!nodeIds.includes(conn.source)) {
          errors.push(`Connection references non-existent source node: ${conn.source}`);
        }
        if (!nodeIds.includes(conn.target)) {
          errors.push(`Connection references non-existent target node: ${conn.target}`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export const n8nService = new N8nService();