import { systemLogs } from "@shared/schema";
import { storage } from "../storage";

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqServiceConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class GroqService {
  private config: GroqServiceConfig;

  constructor() {
    this.config = {
      apiKey: process.env.GROQ_API_KEY || process.env.GROQ_KEY || "",
      model: process.env.GROQ_MODEL || "llama-3.1-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
    };

    if (!this.config.apiKey) {
      console.warn("GROQ_API_KEY not provided. Groq service will not be available.");
    }
  }

  async generateCompletion(
    messages: GroqMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      taskId?: string;
      agentId?: string;
    } = {}
  ): Promise<{
    content: string;
    tokensUsed: number;
    cost: number;
  }> {
    if (!this.config.apiKey) {
      throw new Error("Groq API key not configured");
    }

    const requestBody = {
      model: this.config.model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4096,
      stream: false,
    };

    try {
      await this.logRequest(requestBody, options.taskId, options.agentId);

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        await this.logError(`Groq API error: ${response.status} - ${error}`, options.taskId, options.agentId);
        throw new Error(`Groq API error: ${response.status} - ${error}`);
      }

      const data: GroqResponse = await response.json();
      const content = data.choices[0]?.message?.content || "";
      const tokensUsed = data.usage?.total_tokens || 0;
      const cost = this.calculateCost(tokensUsed);

      await this.logResponse(data, options.taskId, options.agentId);

      return {
        content,
        tokensUsed,
        cost,
      };
    } catch (error) {
      await this.logError(`Groq service error: ${error}`, options.taskId, options.agentId);
      throw error;
    }
  }

  // Agent generation prompt based on AutoAgents framework
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

    const messages: GroqMessage[] = [
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
      temperature: 0.2, // Lower temperature for more consistent planning
      taskId,
    });

    try {
      return JSON.parse(response.content);
    } catch (error) {
      await this.logError(`Failed to parse agent team JSON: ${error}`, taskId);
      throw new Error('Failed to parse agent team response');
    }
  }

  // Agent execution with specific role and context
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
    const messages: GroqMessage[] = [
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

    // Simple confidence calculation based on response length and coherence
    const confidence = Math.min(Math.max(response.content.length / 10, 20), 95);

    return {
      response: response.content,
      confidence,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  // Observer agent for plan and execution critique
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

    const messages: GroqMessage[] = [
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
      return JSON.parse(response.content);
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

  private calculateCost(tokens: number): number {
    // Groq pricing (approximate - check current rates)
    const costPerToken = 0.00000059; // $0.59 per 1M tokens for llama-3.1-70b
    return tokens * costPerToken;
  }

  private async logRequest(request: any, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Groq API request initiated',
        data: {
          model: request.model,
          messageCount: request.messages?.length,
          temperature: request.temperature,
          maxTokens: request.max_tokens,
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Groq request:', error);
    }
  }

  private async logResponse(response: GroqResponse, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Groq API response received',
        data: {
          tokensUsed: response.usage?.total_tokens,
          finishReason: response.choices[0]?.finish_reason,
          cost: this.calculateCost(response.usage?.total_tokens || 0),
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Groq response:', error);
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
      console.error('Failed to log Groq error:', error);
    }
  }
}

export const groqService = new GroqService();
