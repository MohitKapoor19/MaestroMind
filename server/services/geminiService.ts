import { systemLogs } from "@shared/schema";
import { storage } from "../storage";

interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    safetyRatings: Array<any>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiServiceConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class GeminiService {
  private config: GeminiServiceConfig;
  private complexReasoningModel = "gemini-2.5-pro"; // For complex reasoning tasks
  private standardModel = "gemini-1.5-flash"; // For standard tasks
  private lightModel = "gemini-1.5-flash-8b"; // For lightweight tasks

  constructor() {
    this.config = {
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
      model: process.env.GEMINI_MODEL || this.complexReasoningModel,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    };

    if (!this.config.apiKey) {
      console.warn("GEMINI_API_KEY not provided. Gemini service will not be available.");
    }
  }

  private selectModelForTask(options: { isComplexReasoning?: boolean; isLightweight?: boolean }): string {
    if (options.isComplexReasoning) {
      return this.complexReasoningModel;
    } else if (options.isLightweight) {
      return this.lightModel;
    }
    return this.standardModel;
  }

  async generateCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      taskId?: string;
      agentId?: string;
      isComplexReasoning?: boolean;
      isLightweight?: boolean;
    } = {}
  ): Promise<{
    content: string;
    tokensUsed: number;
    cost: number;
  }> {
    if (!this.config.apiKey) {
      throw new Error("Gemini API key not configured");
    }

    // Convert messages to Gemini format
    const geminiMessages = this.convertToGeminiFormat(messages);

    const requestBody = {
      contents: geminiMessages,
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 4096,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH"
        }
      ]
    };

    try {
      const selectedModel = this.selectModelForTask({
        isComplexReasoning: options.isComplexReasoning,
        isLightweight: options.isLightweight
      });

      await this.logRequest({ ...requestBody, model: selectedModel }, options.taskId, options.agentId);

      const response = await fetch(
        `${this.config.baseUrl}/models/${selectedModel}:generateContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        await this.logError(`Gemini API error: ${response.status} - ${error}`, options.taskId, options.agentId);
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const data: GeminiResponse = await response.json();
      const content = data.candidates[0]?.content?.parts[0]?.text || "";
      const tokensUsed = data.usageMetadata?.totalTokenCount || 0;
      const cost = this.calculateCost(tokensUsed);

      await this.logResponse(data, options.taskId, options.agentId);

      return {
        content,
        tokensUsed,
        cost,
      };
    } catch (error) {
      await this.logError(`Gemini service error: ${error}`, options.taskId, options.agentId);
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

    const messages = [
      {
        role: 'system' as const,
        content: 'You are an expert AI planner implementing the AutoAgents framework for dynamic agent generation and task orchestration.'
      },
      {
        role: 'user' as const,
        content: plannerPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.2,
      taskId,
      isComplexReasoning: true, // Agent team generation is complex reasoning
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
    const messages = [
      {
        role: 'system' as const,
        content: agentPrompt
      },
      {
        role: 'user' as const,
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

    const messages = [
      {
        role: 'system' as const,
        content: 'You are an expert Observer agent specializing in plan evaluation and execution critique in multi-agent systems.'
      },
      {
        role: 'user' as const,
        content: observerPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.3,
      taskId,
      isComplexReasoning: true, // Observation and critique requires complex reasoning
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

  private convertToGeminiFormat(messages: Array<{ role: string; content: string }>): GeminiMessage[] {
    const geminiMessages: GeminiMessage[] = [];
    
    // Combine system messages with the first user message
    let systemContent = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemContent += msg.content + '\n\n';
      } else if (msg.role === 'user') {
        const content = systemContent ? systemContent + msg.content : msg.content;
        geminiMessages.push({
          role: 'user',
          parts: [{ text: content }]
        });
        systemContent = ''; // Reset after using
      } else if (msg.role === 'assistant') {
        geminiMessages.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      }
    }
    
    return geminiMessages;
  }

  private calculateCost(tokens: number): number {
    // Gemini 2.5 Pro pricing (check latest rates)
    // Using estimated pricing - update with actual rates when available
    const costPerToken = 0.0000035; // Estimated for Gemini 2.5 Pro
    return tokens * costPerToken;
  }

  private async logRequest(request: any, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Gemini API request initiated',
        data: {
          model: request.model || this.config.model,
          messageCount: request.contents?.length,
          temperature: request.generationConfig?.temperature,
          maxTokens: request.generationConfig?.maxOutputTokens,
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Gemini request:', error);
    }
  }

  private async logResponse(response: GeminiResponse, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Gemini API response received',
        data: {
          tokensUsed: response.usageMetadata?.totalTokenCount,
          finishReason: response.candidates[0]?.finishReason,
          cost: this.calculateCost(response.usageMetadata?.totalTokenCount || 0),
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Gemini response:', error);
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
      console.error('Failed to log Gemini error:', error);
    }
  }
}

export const geminiService = new GeminiService();