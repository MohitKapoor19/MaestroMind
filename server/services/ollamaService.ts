import { systemLogs } from "@shared/schema";
import { storage } from "../storage";

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaServiceConfig {
  baseUrl: string;
  model: string;
}

export class OllamaService {
  private config: OllamaServiceConfig;

  constructor() {
    this.config = {
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "llama3.2",
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateCompletion(
    messages: OllamaMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      taskId?: string;
      agentId?: string;
      stream?: boolean;
    } = {}
  ): Promise<{
    content: string;
    tokensUsed: number;
    cost: number;
  }> {
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error("Ollama service is not available. Make sure Ollama is running locally.");
    }

    const requestBody = {
      model: this.config.model,
      messages,
      stream: options.stream || false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 4096,
      },
    };

    try {
      await this.logRequest(requestBody, options.taskId, options.agentId);

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        await this.logError(`Ollama API error: ${response.status} - ${error}`, options.taskId, options.agentId);
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      let content = '';
      let tokensUsed = 0;

      if (options.stream) {
        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body available for streaming');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data: OllamaResponse = JSON.parse(line);
              if (data.message?.content) {
                content += data.message.content;
              }
              if (data.done && data.eval_count) {
                tokensUsed = (data.prompt_eval_count || 0) + (data.eval_count || 0);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      } else {
        // Handle non-streaming response
        const data: OllamaResponse = await response.json();
        content = data.message?.content || '';
        tokensUsed = (data.prompt_eval_count || 0) + (data.eval_count || 0);
      }

      const cost = this.calculateCost(tokensUsed);

      await this.logResponse({ content, tokensUsed }, options.taskId, options.agentId);

      return {
        content,
        tokensUsed,
        cost,
      };
    } catch (error) {
      await this.logError(`Ollama service error: ${error}`, options.taskId, options.agentId);
      throw error;
    }
  }

  async generateAgentTeam(taskDescription: string, taskId?: string): Promise<{
    agents: Array<{
      name: string;
      role: string;
      prompt: string;
      description: string;
      toolset: string[];
      suggestions: string;
    }>;
    executionPlan: {
      steps: string[];
      workflow: string;
      estimatedDuration: string;
    };
  }> {
    const plannerPrompt = `You are the Planner agent in the AutoAgents framework. Your role is to analyze the given task and generate a team of specialized agents following the A = {P, D, T, S} format where:
- P: Specific prompt for the agent
- D: Concise description of the agent's role
- T: Toolset (available tools/capabilities)
- S: High-level operational suggestions

Task: ${taskDescription}

Generate a team of 3-5 specialized agents that can collaboratively complete this task. Consider the task complexity and requirements. Each agent should have distinct expertise.

Respond in JSON format:
{
  "agents": [
    {
      "name": "Agent Name",
      "role": "Specific Role",
      "prompt": "Detailed prompt for this agent's behavior and expertise",
      "description": "Concise description of what this agent does",
      "toolset": ["tool1", "tool2", "tool3"],
      "suggestions": "High-level operational approach and best practices"
    }
  ],
  "executionPlan": {
    "steps": ["Step 1", "Step 2", "Step 3"],
    "workflow": "Description of how agents will collaborate",
    "estimatedDuration": "Expected completion time"
  }
}`;

    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content: 'You are an expert AI planner implementing the AutoAgents framework for dynamic agent generation and task orchestration.'
      },
      {
        role: 'user',
        content: plannerPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.2,
      taskId,
    });

    try {
      // Clean up potential markdown code blocks
      const cleanedContent = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      return JSON.parse(cleanedContent);
    } catch (error) {
      await this.logError(`Failed to parse agent team JSON: ${error}`, taskId);
      throw new Error('Failed to parse agent team response');
    }
  }

  async executeAgentAction(
    agentPrompt: string,
    agentContext: string,
    userInput: string,
    agentId?: string,
    taskId?: string
  ): Promise<{
    response: string;
    confidence: number;
    tokensUsed: number;
    cost: number;
  }> {
    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content: agentPrompt
      },
      {
        role: 'user',
        content: `Context: ${agentContext}\n\nRequest: ${userInput}`
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.7,
      agentId,
      taskId,
    });

    const confidence = Math.min(Math.max(response.content.length / 10, 20), 95);

    return {
      response: response.content,
      confidence,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  async observeAndCritique(
    planOrExecution: any,
    context: string,
    type: 'plan' | 'execution',
    taskId?: string
  ): Promise<{
    feedback: string;
    suggestions: string[];
    needsRefinement: boolean;
    confidence: number;
  }> {
    const observerPrompt = `You are the Observer agent in the AutoAgents framework. Your role is to critically evaluate ${type}s and provide constructive feedback for improvement.

${type === 'plan' ? 'Execution Plan' : 'Execution Result'}: ${JSON.stringify(planOrExecution)}
Context: ${context}

Evaluate this ${type} and provide:
1. Constructive feedback on strengths and weaknesses
2. Specific suggestions for improvement
3. Whether refinement is needed
4. Your confidence in the current ${type}

Respond in JSON format:
{
  "feedback": "Detailed analysis of the ${type}",
  "suggestions": ["suggestion1", "suggestion2"],
  "needsRefinement": boolean,
  "confidence": number (0-100)
}`;

    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content: 'You are an expert Observer agent specializing in plan evaluation and execution critique in multi-agent systems.'
      },
      {
        role: 'user',
        content: observerPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.3,
      taskId,
    });

    try {
      const cleanedContent = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      return JSON.parse(cleanedContent);
    } catch (error) {
      await this.logError(`Failed to parse observer feedback JSON: ${error}`, taskId);
      return {
        feedback: response.content,
        suggestions: [],
        needsRefinement: false,
        confidence: 50,
      };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Failed to list Ollama models');
      }
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }

  private calculateCost(tokens: number): number {
    // Ollama is free for local use
    return 0;
  }

  private async logRequest(request: any, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Ollama API request initiated',
        data: {
          model: request.model,
          messageCount: request.messages?.length,
          temperature: request.options?.temperature,
          maxTokens: request.options?.num_predict,
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Ollama request:', error);
    }
  }

  private async logResponse(response: any, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Ollama API response received',
        data: {
          tokensUsed: response.tokensUsed,
          cost: response.cost || 0,
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Ollama response:', error);
    }
  }

  private async logError(error: string, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'error',
        category: 'api',
        message: error,
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Ollama error:', error);
    }
  }
}

export const ollamaService = new OllamaService();