import { systemLogs } from "@shared/schema";
import { storage } from "../storage";

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
}

interface PerplexityServiceConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class PerplexityService {
  private config: PerplexityServiceConfig;

  constructor() {
    this.config = {
      apiKey: process.env.PERPLEXITY_API_KEY || "",
      model: process.env.PERPLEXITY_MODEL || "llama-3.1-sonar-large-128k-online",
      baseUrl: "https://api.perplexity.ai",
    };

    if (!this.config.apiKey) {
      console.warn("PERPLEXITY_API_KEY not provided. Perplexity service will not be available for research tasks.");
    }
  }

  async generateCompletion(
    messages: PerplexityMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      taskId?: string;
      agentId?: string;
      isResearch?: boolean;
      searchDomainFilter?: string[];
      searchRecency?: 'day' | 'week' | 'month' | 'year';
      returnCitations?: boolean;
    } = {}
  ): Promise<{
    content: string;
    tokensUsed: number;
    cost: number;
    citations?: string[];
  }> {
    if (!this.config.apiKey) {
      throw new Error("Perplexity API key not configured");
    }

    const requestBody: any = {
      model: options.isResearch ? "llama-3.1-sonar-large-128k-online" : this.config.model,
      messages,
      temperature: options.temperature || 0.2,
      max_tokens: options.maxTokens || 4096,
      top_p: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
      stream: false,
    };

    // Add search parameters for research queries
    if (options.isResearch) {
      requestBody.search_domain_filter = options.searchDomainFilter || [];
      requestBody.search_recency_filter = options.searchRecency || 'month';
      requestBody.return_citations = options.returnCitations !== false;
    }

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
        await this.logError(`Perplexity API error: ${response.status} - ${error}`, options.taskId, options.agentId);
        throw new Error(`Perplexity API error: ${response.status} - ${error}`);
      }

      const data: PerplexityResponse = await response.json();
      const content = data.choices[0]?.message?.content || "";
      const tokensUsed = data.usage?.total_tokens || 0;
      const cost = this.calculateCost(tokensUsed, options.isResearch);

      await this.logResponse(data, options.taskId, options.agentId);

      return {
        content,
        tokensUsed,
        cost,
        citations: data.citations,
      };
    } catch (error) {
      await this.logError(`Perplexity service error: ${error}`, options.taskId, options.agentId);
      throw error;
    }
  }

  async performResearch(
    query: string,
    options: {
      taskId?: string;
      agentId?: string;
      searchDomainFilter?: string[];
      searchRecency?: 'day' | 'week' | 'month' | 'year';
      focusAreas?: string[];
    } = {}
  ): Promise<{
    research: string;
    citations: string[];
    tokensUsed: number;
    cost: number;
  }> {
    const researchPrompt = `You are a research assistant. Perform comprehensive research on the following topic and provide detailed, factual information with citations.

Research Query: ${query}

${options.focusAreas ? `Focus Areas: ${options.focusAreas.join(', ')}` : ''}

Provide:
1. Comprehensive overview of the topic
2. Latest developments and current state
3. Key facts and statistics
4. Relevant examples and case studies
5. Expert opinions if available
6. Future trends or predictions

Ensure all information is accurate, up-to-date, and properly cited.`;

    const messages: PerplexityMessage[] = [
      {
        role: 'system',
        content: 'You are an expert research assistant with access to real-time information. Provide comprehensive, accurate, and well-cited research.'
      },
      {
        role: 'user',
        content: researchPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.2,
      maxTokens: 4096,
      taskId: options.taskId,
      agentId: options.agentId,
      isResearch: true,
      searchDomainFilter: options.searchDomainFilter,
      searchRecency: options.searchRecency,
      returnCitations: true,
    });

    return {
      research: response.content,
      citations: response.citations || [],
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
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
    // First, research best practices for this type of task
    const research = await this.performResearch(
      `Best practices and methodologies for: ${taskDescription}`,
      {
        taskId,
        focusAreas: ['automation', 'AI agents', 'workflow optimization', 'tool selection'],
        searchRecency: 'month'
      }
    );

    const plannerPrompt = `Based on the following research about best practices, generate an optimal team of AI agents for this task.

Research Context:
${research.research}

Task: ${taskDescription}

Generate a team of 3-5 specialized agents following the AutoAgents A = {P, D, T, S} framework. Consider the latest methodologies and tools mentioned in the research.

Respond in JSON format with agents array and executionPlan object.`;

    const messages: PerplexityMessage[] = [
      {
        role: 'system',
        content: 'You are an expert AI planner with knowledge of the latest tools and methodologies.'
      },
      {
        role: 'user',
        content: plannerPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.3,
      taskId,
      isResearch: false, // Use regular model for generation
    });

    try {
      const cleanedContent = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      return JSON.parse(cleanedContent);
    } catch (error) {
      await this.logError(`Failed to parse agent team JSON: ${error}`, taskId);
      throw new Error('Failed to parse agent team response from Perplexity');
    }
  }

  async executeAgentAction(
    agentPrompt: string,
    agentContext: string,
    userInput: string,
    agentId?: string,
    taskId?: string,
    requiresResearch: boolean = false
  ): Promise<{
    response: string;
    confidence: number;
    tokensUsed: number;
    cost: number;
    citations?: string[];
  }> {
    let enhancedContext = agentContext;
    let citations: string[] = [];

    // If research is required, gather current information
    if (requiresResearch) {
      const research = await this.performResearch(userInput, {
        taskId,
        agentId,
        searchRecency: 'week'
      });
      enhancedContext = `${agentContext}\n\nCurrent Research:\n${research.research}`;
      citations = research.citations;
    }

    const messages: PerplexityMessage[] = [
      {
        role: 'system',
        content: agentPrompt
      },
      {
        role: 'user',
        content: `Context: ${enhancedContext}\n\nRequest: ${userInput}`
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.7,
      agentId,
      taskId,
      isResearch: requiresResearch,
    });

    const confidence = requiresResearch ? 95 : 85; // Higher confidence with research

    return {
      response: response.content,
      confidence,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
      citations: citations.length > 0 ? citations : response.citations,
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
    // Research current best practices for evaluation
    const research = await this.performResearch(
      `Best practices for evaluating ${type === 'plan' ? 'project plans' : 'execution results'} in ${context}`,
      {
        taskId,
        searchRecency: 'month',
        focusAreas: ['quality metrics', 'evaluation criteria', 'improvement strategies']
      }
    );

    const observerPrompt = `You are an Observer agent with knowledge of current best practices. Evaluate the following ${type} based on the latest industry standards.

Research on Best Practices:
${research.research}

${type === 'plan' ? 'Execution Plan' : 'Execution Result'}: ${JSON.stringify(planOrExecution)}
Context: ${context}

Provide detailed feedback with specific, actionable suggestions based on current best practices.

Respond in JSON format with feedback, suggestions array, needsRefinement boolean, and confidence score.`;

    const messages: PerplexityMessage[] = [
      {
        role: 'system',
        content: 'You are an expert Observer agent with access to current industry best practices.'
      },
      {
        role: 'user',
        content: observerPrompt
      }
    ];

    const response = await this.generateCompletion(messages, {
      temperature: 0.3,
      taskId,
      isResearch: false,
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
        confidence: 70,
      };
    }
  }

  private calculateCost(tokens: number, isResearch: boolean = false): number {
    // Perplexity pricing (approximate)
    // Sonar models: ~$1 per 1000 requests or ~$0.001 per request
    // For token-based pricing, using estimated rates
    const costPerToken = isResearch ? 0.000001 : 0.0000005; // Research queries cost more
    return tokens * costPerToken;
  }

  private async logRequest(request: any, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Perplexity API request initiated',
        data: {
          model: request.model,
          messageCount: request.messages?.length,
          temperature: request.temperature,
          maxTokens: request.max_tokens,
          isResearch: request.return_citations || false,
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Perplexity request:', error);
    }
  }

  private async logResponse(response: PerplexityResponse, taskId?: string, agentId?: string): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'api',
        message: 'Perplexity API response received',
        data: {
          tokensUsed: response.usage?.total_tokens,
          finishReason: response.choices[0]?.finish_reason,
          hasCitations: !!response.citations && response.citations.length > 0,
          citationCount: response.citations?.length || 0,
        },
        taskId: taskId || null,
        agentId: agentId || null,
      });
    } catch (error) {
      console.error('Failed to log Perplexity response:', error);
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
      console.error('Failed to log Perplexity error:', error);
    }
  }
}

export const perplexityService = new PerplexityService();