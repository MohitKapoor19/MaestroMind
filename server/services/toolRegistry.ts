import { storage } from "../storage";
import { EventEmitter } from 'events';

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'code' | 'file' | 'vector' | 'api' | 'custom';
  capabilities: string[];
  requiredPermissions?: string[];
  execute: (params: any, context: ToolContext) => Promise<any>;
  validate?: (params: any) => boolean;
}

export interface ToolContext {
  agentId: string;
  taskId?: string;
  userId?: string;
  permissions: string[];
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  toolId: string;
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, Tool> = new Map();
  private agentToolsets: Map<string, Set<string>> = new Map();
  private executionHistory: ToolExecutionResult[] = [];

  constructor() {
    super();
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // Search tool
    this.registerTool({
      id: 'web-search',
      name: 'Web Search',
      description: 'Search the web for information',
      category: 'search',
      capabilities: ['query', 'filter', 'summarize'],
      requiredPermissions: ['search:web'],
      execute: async (params: { query: string; limit?: number }, context: ToolContext) => {
        await this.logToolExecution('web-search', params, context);
        
        // Simulate web search (in production, integrate with actual search API)
        return {
          results: [
            { title: 'Result 1', url: 'https://example.com/1', snippet: 'Sample result for ' + params.query },
            { title: 'Result 2', url: 'https://example.com/2', snippet: 'Another result for ' + params.query },
          ],
          query: params.query,
          timestamp: new Date().toISOString(),
        };
      },
      validate: (params: any) => {
        return params.query && typeof params.query === 'string';
      }
    });

    // Code execution sandbox
    this.registerTool({
      id: 'code-sandbox',
      name: 'Code Sandbox',
      description: 'Execute code in a safe sandboxed environment',
      category: 'code',
      capabilities: ['execute', 'test', 'validate'],
      requiredPermissions: ['code:execute'],
      execute: async (params: { language: string; code: string }, context: ToolContext) => {
        await this.logToolExecution('code-sandbox', params, context);
        
        // Simulate code execution (in production, use actual sandbox like VM2 or Docker)
        if (params.language === 'javascript') {
          try {
            // WARNING: This is just a simulation. Never use eval in production!
            // Use proper sandboxing like VM2, isolated-vm, or containerized execution
            const result = `// Code execution simulated\n// Input: ${params.code}\n// Output: [simulated result]`;
            return {
              success: true,
              output: result,
              language: params.language,
              executionTime: Math.random() * 1000,
            };
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              language: params.language,
            };
          }
        }
        
        return {
          success: false,
          error: `Language ${params.language} not supported`,
        };
      },
      validate: (params: any) => {
        return params.code && params.language && 
               ['javascript', 'python', 'typescript'].includes(params.language);
      }
    });

    // File I/O tool
    this.registerTool({
      id: 'file-io',
      name: 'File I/O',
      description: 'Read and write files in the workspace',
      category: 'file',
      capabilities: ['read', 'write', 'list', 'delete'],
      requiredPermissions: ['file:read', 'file:write'],
      execute: async (params: { operation: string; path: string; content?: string }, context: ToolContext) => {
        await this.logToolExecution('file-io', params, context);
        
        // Simulate file operations (in production, use actual file system with proper sandboxing)
        switch (params.operation) {
          case 'read':
            return {
              success: true,
              content: `// File content of ${params.path}\n// [simulated content]`,
              path: params.path,
            };
          case 'write':
            return {
              success: true,
              message: `File ${params.path} written successfully`,
              bytesWritten: params.content?.length || 0,
            };
          case 'list':
            return {
              success: true,
              files: ['file1.txt', 'file2.js', 'README.md'],
              directory: params.path,
            };
          default:
            return {
              success: false,
              error: `Operation ${params.operation} not supported`,
            };
        }
      },
      validate: (params: any) => {
        return params.operation && params.path &&
               ['read', 'write', 'list', 'delete'].includes(params.operation);
      }
    });

    // Vector memory recall
    this.registerTool({
      id: 'vector-recall',
      name: 'Vector Memory Recall',
      description: 'Search and retrieve from vector memory store',
      category: 'vector',
      capabilities: ['search', 'store', 'update'],
      requiredPermissions: ['memory:read', 'memory:write'],
      execute: async (params: { operation: string; query?: string; data?: any }, context: ToolContext) => {
        await this.logToolExecution('vector-recall', params, context);
        
        // Simulate vector operations (in production, integrate with vector DB like Pinecone, Weaviate, etc.)
        if (params.operation === 'search' && params.query) {
          return {
            success: true,
            results: [
              { id: '1', content: 'Related memory 1', similarity: 0.95 },
              { id: '2', content: 'Related memory 2', similarity: 0.87 },
            ],
            query: params.query,
          };
        } else if (params.operation === 'store' && params.data) {
          return {
            success: true,
            id: Math.random().toString(36).substr(2, 9),
            message: 'Data stored in vector memory',
          };
        }
        
        return {
          success: false,
          error: 'Invalid operation or missing parameters',
        };
      },
      validate: (params: any) => {
        return params.operation && 
               ['search', 'store', 'update'].includes(params.operation);
      }
    });

    // API caller
    this.registerTool({
      id: 'api-caller',
      name: 'API Caller',
      description: 'Make HTTP API calls to external services',
      category: 'api',
      capabilities: ['GET', 'POST', 'PUT', 'DELETE'],
      requiredPermissions: ['api:call'],
      execute: async (params: { method: string; url: string; headers?: any; body?: any }, context: ToolContext) => {
        await this.logToolExecution('api-caller', params, context);
        
        // Validate URL is allowed (whitelist approach)
        const allowedDomains = ['api.github.com', 'api.openai.com', 'jsonplaceholder.typicode.com'];
        const url = new URL(params.url);
        
        if (!allowedDomains.includes(url.hostname)) {
          return {
            success: false,
            error: `Domain ${url.hostname} not in allowlist`,
          };
        }
        
        try {
          const response = await fetch(params.url, {
            method: params.method,
            headers: params.headers || {},
            body: params.body ? JSON.stringify(params.body) : undefined,
          });
          
          const data = await response.json();
          
          return {
            success: response.ok,
            status: response.status,
            data,
            headers: Object.fromEntries(response.headers.entries()),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      validate: (params: any) => {
        try {
          new URL(params.url);
          return params.method && params.url &&
                 ['GET', 'POST', 'PUT', 'DELETE'].includes(params.method);
        } catch {
          return false;
        }
      }
    });
  }

  registerTool(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} is already registered`);
    }
    
    this.tools.set(tool.id, tool);
    this.emit('tool:registered', tool);
  }

  unregisterTool(toolId: string): void {
    if (this.tools.delete(toolId)) {
      this.emit('tool:unregistered', toolId);
    }
  }

  getTool(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: string): Tool[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  async executeTool(
    toolId: string, 
    params: any, 
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const tool = this.tools.get(toolId);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolId} not found`,
        duration: Date.now() - startTime,
        toolId,
      };
    }
    
    // Check permissions
    if (tool.requiredPermissions) {
      const hasPermissions = tool.requiredPermissions.every(perm => 
        context.permissions.includes(perm)
      );
      
      if (!hasPermissions) {
        return {
          success: false,
          error: `Insufficient permissions for tool ${toolId}`,
          duration: Date.now() - startTime,
          toolId,
        };
      }
    }
    
    // Validate parameters
    if (tool.validate && !tool.validate(params)) {
      return {
        success: false,
        error: `Invalid parameters for tool ${toolId}`,
        duration: Date.now() - startTime,
        toolId,
      };
    }
    
    try {
      const result = await tool.execute(params, context);
      const executionResult: ToolExecutionResult = {
        success: true,
        result,
        duration: Date.now() - startTime,
        toolId,
      };
      
      this.executionHistory.push(executionResult);
      this.emit('tool:executed', executionResult);
      
      return executionResult;
    } catch (error) {
      const executionResult: ToolExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        toolId,
      };
      
      this.executionHistory.push(executionResult);
      this.emit('tool:error', executionResult);
      
      return executionResult;
    }
  }

  assignToolsToAgent(agentId: string, toolIds: string[]): void {
    const validToolIds = toolIds.filter(id => this.tools.has(id));
    this.agentToolsets.set(agentId, new Set(validToolIds));
    this.emit('agent:tools:assigned', { agentId, toolIds: validToolIds });
  }

  getAgentTools(agentId: string): Tool[] {
    const toolIds = this.agentToolsets.get(agentId);
    if (!toolIds) return [];
    
    return Array.from(toolIds)
      .map(id => this.tools.get(id))
      .filter(tool => tool !== undefined) as Tool[];
  }

  canAgentUseTool(agentId: string, toolId: string): boolean {
    const agentTools = this.agentToolsets.get(agentId);
    return agentTools?.has(toolId) || false;
  }

  getExecutionHistory(limit?: number): ToolExecutionResult[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return this.executionHistory;
  }

  clearExecutionHistory(): void {
    this.executionHistory = [];
    this.emit('history:cleared');
  }

  private async logToolExecution(
    toolId: string, 
    params: any, 
    context: ToolContext
  ): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'tool',
        message: `Executing tool ${toolId}`,
        data: {
          toolId,
          params,
          agentId: context.agentId,
        },
        taskId: context.taskId || null,
        agentId: context.agentId || null,
      });
    } catch (error) {
      console.error('Failed to log tool execution:', error);
    }
  }
}

export const toolRegistry = new ToolRegistry();