import { groqService } from './groqService';
import { geminiService } from './geminiService';
import { ollamaService } from './ollamaService';
import { perplexityService } from './perplexityService';
import { budgetService } from './budgetService';
import { errorRecoveryService } from './errorRecoveryService';
import { storage } from '../storage';
import { EventEmitter } from 'events';

export type LLMProvider = 'groq' | 'gemini' | 'ollama' | 'perplexity';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  tokensUsed: number;
  cost: number;
  provider: LLMProvider;
  latency: number;
}

interface RouterOptions {
  temperature?: number;
  maxTokens?: number;
  taskId?: string;
  agentId?: string;
  executionId?: string;
  stream?: boolean;
  preferredProvider?: LLMProvider;
  fallbackOrder?: LLMProvider[];
  trackCosts?: boolean;
  useErrorRecovery?: boolean;
  isComplexReasoning?: boolean;
  isLightweight?: boolean;
  isResearch?: boolean;
}

interface ProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  totalLatency: number;
  averageLatency: number;
  lastError?: string;
  lastErrorTime?: Date;
}

export class LLMRouter extends EventEmitter {
  private providers: Map<LLMProvider, any>;
  private metrics: Map<LLMProvider, ProviderMetrics>;
  private defaultFallbackOrder: LLMProvider[] = ['groq', 'gemini']; // Ollama only when explicitly requested

  constructor() {
    super();
    this.providers = new Map();
    this.metrics = new Map();

    // Initialize providers
    this.providers.set('groq', groqService);
    this.providers.set('gemini', geminiService);
    this.providers.set('ollama', ollamaService);
    this.providers.set('perplexity', perplexityService);

    // Initialize metrics for active providers only
    for (const provider of ['groq', 'gemini', 'perplexity'] as LLMProvider[]) {
      this.metrics.set(provider, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        totalLatency: 0,
        averageLatency: 0,
      });
    }
    // Ollama metrics will be initialized only if/when it's used
  }

  private getOptimalProviderOrder(options: RouterOptions): LLMProvider[] {
    // For research tasks, always use Perplexity
    if (options.isResearch) {
      return ['perplexity', 'gemini', 'groq'];
    }
    // For complex reasoning tasks, prefer Gemini 2.5 Pro
    if (options.isComplexReasoning) {
      return ['gemini', 'groq'];
    }
    // For lightweight tasks, prefer faster providers (Groq GPT-OSS-120B)
    if (options.isLightweight) {
      return ['groq', 'gemini'];
    }
    // Only include Ollama if explicitly requested
    if (options.preferredProvider === 'ollama') {
      return ['ollama', 'groq', 'gemini'];
    }
    // Default order for standard tasks
    return this.defaultFallbackOrder;
  }

  async chat(
    messages: LLMMessage[],
    options: RouterOptions = {}
  ): Promise<LLMResponse> {
    const operation = async (): Promise<LLMResponse> => {
      const optimalOrder = this.getOptimalProviderOrder(options);
      const fallbackOrder = options.preferredProvider 
        ? [options.preferredProvider, ...optimalOrder.filter(p => p !== options.preferredProvider)]
        : (options.fallbackOrder || optimalOrder);

      let lastError: Error | null = null;

      for (const provider of fallbackOrder) {
        try {
          const startTime = Date.now();
          const service = this.providers.get(provider);
          
          if (!service) {
            console.warn(`Provider ${provider} not available`);
            continue;
          }

          // Check if provider is available (especially for Ollama)
          if (provider === 'ollama') {
            const isAvailable = await ollamaService.isAvailable();
            if (!isAvailable) {
              console.warn('Ollama is not running locally, skipping...');
              continue;
            }
          }

          // Log attempt
          await this.logProviderAttempt(provider, messages, options);

          // Make the request
          const response = await service.generateCompletion(messages, {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            taskId: options.taskId,
            agentId: options.agentId,
            isComplexReasoning: options.isComplexReasoning,
            isLightweight: options.isLightweight,
          });

          const latency = Date.now() - startTime;

          // Track costs if enabled and required context is provided
          if (options.trackCosts !== false && options.taskId && options.agentId && options.executionId) {
            try {
              await this.trackCostForProvider(provider, response, options);
            } catch (costError) {
              console.warn('Failed to track cost:', costError);
              // Continue execution even if cost tracking fails
            }
          }

          // Update metrics
          this.updateMetrics(provider, true, response.tokensUsed, response.cost, latency);

          // Emit success event
          this.emit('completion', {
            provider,
            tokensUsed: response.tokensUsed,
            cost: response.cost,
            latency,
            taskId: options.taskId,
            agentId: options.agentId,
          });

          // Log success
          await this.logProviderSuccess(provider, response, latency, options);

          return {
            ...response,
            provider,
            latency,
          };
        } catch (error) {
          lastError = error as Error;
          console.error(`Provider ${provider} failed:`, error);
          
          // Update metrics
          this.updateMetrics(provider, false, 0, 0, 0, error as Error);

          // Log failure
          await this.logProviderFailure(provider, error as Error, options);

          // Try next provider
          continue;
        }
      }

      // All providers failed
      throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
    };

    // Use error recovery if enabled
    if (options.useErrorRecovery !== false) {
      const recoveryResult = await errorRecoveryService.attemptRecovery(operation, {
        taskId: options.taskId,
        agentId: options.agentId,
        executionId: options.executionId,
        provider: options.preferredProvider,
        operation: 'chat_completion',
      });

      if (recoveryResult.success && recoveryResult.result) {
        return recoveryResult.result;
      } else {
        throw recoveryResult.finalError || new Error('Recovery failed');
      }
    } else {
      return await operation();
    }
  }

  async stream(
    messages: LLMMessage[],
    options: RouterOptions = {}
  ): Promise<AsyncGenerator<string, LLMResponse, unknown>> {
    const fallbackOrder = options.preferredProvider 
      ? [options.preferredProvider, ...this.defaultFallbackOrder.filter(p => p !== options.preferredProvider)]
      : (options.fallbackOrder || this.defaultFallbackOrder);

    let lastError: Error | null = null;

    for (const provider of fallbackOrder) {
      try {
        const startTime = Date.now();
        const service = this.providers.get(provider);
        
        if (!service) {
          console.warn(`Provider ${provider} not available`);
          continue;
        }

        // Check if provider supports streaming
        if (provider === 'ollama') {
          const isAvailable = await ollamaService.isAvailable();
          if (!isAvailable) {
            console.warn('Ollama is not running locally, skipping...');
            continue;
          }
        }

        // For now, return a simple async generator that yields the full response
        // In a real implementation, you'd implement actual streaming for each provider
        const response = await this.chat(messages, { ...options, stream: true });
        
        async function* generator(): AsyncGenerator<string, LLMResponse, unknown> {
          yield response.content;
          return response;
        }

        return generator();
      } catch (error) {
        lastError = error as Error;
        console.error(`Provider ${provider} streaming failed:`, error);
        continue;
      }
    }

    throw new Error(`All LLM providers failed for streaming. Last error: ${lastError?.message}`);
  }

  async generateAgentTeam(
    taskDescription: string,
    options: RouterOptions = {}
  ): Promise<any> {
    // Agent team generation is a complex reasoning task
    const enhancedOptions = { ...options, isComplexReasoning: true };
    const optimalOrder = this.getOptimalProviderOrder(enhancedOptions);
    const fallbackOrder = options.preferredProvider 
      ? [options.preferredProvider, ...optimalOrder.filter(p => p !== options.preferredProvider)]
      : (options.fallbackOrder || optimalOrder);

    let lastError: Error | null = null;

    for (const provider of fallbackOrder) {
      try {
        const service = this.providers.get(provider);
        
        if (!service) {
          console.warn(`Provider ${provider} not available`);
          continue;
        }

        if (provider === 'ollama') {
          const isAvailable = await ollamaService.isAvailable();
          if (!isAvailable) {
            console.warn('Ollama is not running locally, skipping...');
            continue;
          }
        }

        const startTime = Date.now();
        const result = await service.generateAgentTeam(taskDescription, options.taskId);
        const latency = Date.now() - startTime;

        await this.logProviderSuccess(provider, { content: JSON.stringify(result), tokensUsed: 0, cost: 0 }, latency, options);

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`Provider ${provider} failed for agent team generation:`, error);
        await this.logProviderFailure(provider, error as Error, options);
        continue;
      }
    }

    throw new Error(`All providers failed for agent team generation. Last error: ${lastError?.message}`);
  }

  async executeAgentAction(
    agentPrompt: string,
    agentContext: string,
    userInput: string,
    options: RouterOptions = {}
  ): Promise<any> {
    const operation = async (): Promise<any> => {
      const fallbackOrder = options.preferredProvider 
        ? [options.preferredProvider, ...this.defaultFallbackOrder.filter(p => p !== options.preferredProvider)]
        : (options.fallbackOrder || this.defaultFallbackOrder);

      let lastError: Error | null = null;

      for (const provider of fallbackOrder) {
        try {
          const service = this.providers.get(provider);
          
          if (!service) {
            console.warn(`Provider ${provider} not available`);
            continue;
          }

          if (provider === 'ollama') {
            const isAvailable = await ollamaService.isAvailable();
            if (!isAvailable) {
              console.warn('Ollama is not running locally, skipping...');
              continue;
            }
          }

          const startTime = Date.now();
          const result = await service.executeAgentAction(
            agentPrompt,
            agentContext,
            userInput,
            options.agentId,
            options.taskId
          );
          const latency = Date.now() - startTime;

          // Track costs if enabled and required context is provided
          if (options.trackCosts !== false && options.taskId && options.agentId && options.executionId) {
            try {
              await this.trackCostForProvider(provider, result, options);
            } catch (costError) {
              console.warn('Failed to track cost for agent action:', costError);
            }
          }

          this.updateMetrics(provider, true, result.tokensUsed, result.cost, latency);

          return {
            ...result,
            provider,
            latency,
          };
        } catch (error) {
          lastError = error as Error;
          console.error(`Provider ${provider} failed for agent action:`, error);
          this.updateMetrics(provider, false, 0, 0, 0, error as Error);
          continue;
        }
      }

      throw new Error(`All providers failed for agent action. Last error: ${lastError?.message}`);
    };

    // Use error recovery if enabled
    if (options.useErrorRecovery !== false) {
      const recoveryResult = await errorRecoveryService.attemptRecovery(operation, {
        taskId: options.taskId,
        agentId: options.agentId,
        executionId: options.executionId,
        provider: options.preferredProvider,
        operation: 'agent_action',
      });

      if (recoveryResult.success && recoveryResult.result) {
        return recoveryResult.result;
      } else {
        throw recoveryResult.finalError || new Error('Agent action recovery failed');
      }
    } else {
      return await operation();
    }
  }

  async observeAndCritique(
    planOrExecution: any,
    context: string,
    type: 'plan' | 'execution',
    options: RouterOptions = {}
  ): Promise<any> {
    // Observation and critique is a complex reasoning task
    const enhancedOptions = { ...options, isComplexReasoning: true };
    const optimalOrder = this.getOptimalProviderOrder(enhancedOptions);
    const fallbackOrder = options.preferredProvider 
      ? [options.preferredProvider, ...optimalOrder.filter(p => p !== options.preferredProvider)]
      : (options.fallbackOrder || optimalOrder);

    let lastError: Error | null = null;

    for (const provider of fallbackOrder) {
      try {
        const service = this.providers.get(provider);
        
        if (!service) {
          console.warn(`Provider ${provider} not available`);
          continue;
        }

        if (provider === 'ollama') {
          const isAvailable = await ollamaService.isAvailable();
          if (!isAvailable) {
            console.warn('Ollama is not running locally, skipping...');
            continue;
          }
        }

        const startTime = Date.now();
        const result = await service.observeAndCritique(
          planOrExecution,
          context,
          type,
          options.taskId
        );
        const latency = Date.now() - startTime;

        await this.logProviderSuccess(provider, { content: JSON.stringify(result), tokensUsed: 0, cost: 0 }, latency, options);

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`Provider ${provider} failed for observation:`, error);
        await this.logProviderFailure(provider, error as Error, options);
        continue;
      }
    }

    throw new Error(`All providers failed for observation. Last error: ${lastError?.message}`);
  }

  getMetrics(provider?: LLMProvider): ProviderMetrics | Map<LLMProvider, ProviderMetrics> {
    if (provider) {
      return this.metrics.get(provider) || this.createDefaultMetrics();
    }
    return this.metrics;
  }

  getProviderStatus(): Map<LLMProvider, boolean> {
    const status = new Map<LLMProvider, boolean>();
    
    for (const [provider, metrics] of this.metrics) {
      // Consider a provider healthy if it has successful requests and no recent errors
      const isHealthy = metrics.successfulRequests > 0 && 
        (!metrics.lastErrorTime || 
         (Date.now() - metrics.lastErrorTime.getTime()) > 300000); // 5 minutes
      
      status.set(provider, isHealthy);
    }
    
    return status;
  }

  private updateMetrics(
    provider: LLMProvider,
    success: boolean,
    tokensUsed: number,
    cost: number,
    latency: number,
    error?: Error
  ): void {
    // Initialize metrics for Ollama if it's being used for the first time
    if (!this.metrics.has(provider)) {
      this.metrics.set(provider, this.createDefaultMetrics());
    }
    
    const metrics = this.metrics.get(provider)!;
    
    metrics.totalRequests++;
    
    if (success) {
      metrics.successfulRequests++;
      metrics.totalTokens += tokensUsed;
      metrics.totalCost += cost;
      metrics.totalLatency += latency;
      metrics.averageLatency = metrics.totalLatency / metrics.successfulRequests;
    } else {
      metrics.failedRequests++;
      if (error) {
        metrics.lastError = error.message;
        metrics.lastErrorTime = new Date();
      }
    }
    
    this.metrics.set(provider, metrics);
  }

  private createDefaultMetrics(): ProviderMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      totalLatency: 0,
      averageLatency: 0,
    };
  }

  private async logProviderAttempt(
    provider: LLMProvider,
    messages: LLMMessage[],
    options: RouterOptions
  ): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'llm-router',
        message: `Attempting ${provider} provider`,
        data: {
          provider,
          messageCount: messages.length,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        },
        taskId: options.taskId || null,
        agentId: options.agentId || null,
      });
    } catch (error) {
      console.error('Failed to log provider attempt:', error);
    }
  }

  private async logProviderSuccess(
    provider: LLMProvider,
    response: any,
    latency: number,
    options: RouterOptions
  ): Promise<void> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'llm-router',
        message: `${provider} provider succeeded`,
        data: {
          provider,
          tokensUsed: response.tokensUsed,
          cost: response.cost,
          latency,
        },
        taskId: options.taskId || null,
        agentId: options.agentId || null,
      });
    } catch (error) {
      console.error('Failed to log provider success:', error);
    }
  }

  private async logProviderFailure(
    provider: LLMProvider,
    error: Error,
    options: RouterOptions
  ): Promise<void> {
    try {
      await storage.createLog({
        level: 'error',
        category: 'llm-router',
        message: `${provider} provider failed: ${error.message}`,
        data: {
          provider,
          error: error.message,
        },
        taskId: options.taskId || null,
        agentId: options.agentId || null,
      });
    } catch (logError) {
      console.error('Failed to log provider failure:', logError);
    }
  }

  setFallbackOrder(order: LLMProvider[]): void {
    this.defaultFallbackOrder = order;
  }

  addProvider(name: LLMProvider, service: any): void {
    this.providers.set(name, service);
    this.metrics.set(name, this.createDefaultMetrics());
  }

  private async trackCostForProvider(
    provider: LLMProvider,
    response: any,
    options: RouterOptions
  ): Promise<void> {
    if (!options.taskId || !options.agentId || !options.executionId) {
      return;
    }

    try {
      await budgetService.trackCost(
        options.taskId,
        options.agentId,
        options.executionId,
        {
          provider,
          operation: 'llm_completion',
          tokensInput: response.tokensInput || 0,
          tokensOutput: response.tokensOutput || 0,
          tokensTotal: response.tokensUsed || 0,
          cost: response.cost || 0,
          currency: 'USD',
          ratePerToken: response.tokensUsed ? (response.cost / response.tokensUsed) : 0,
          metadata: {
            provider,
            model: response.model || 'unknown',
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            executionTime: response.latency,
          },
        }
      );
    } catch (error) {
      console.error('Failed to track cost for provider:', provider, error);
      // Re-throw to let caller handle it
      throw error;
    }
  }

  async getBudgetStatus(taskId?: string, agentId?: string): Promise<{
    globalBudgets: any[];
    taskBudgets: any[];
    agentBudgets: any[];
    alerts: any[];
  }> {
    try {
      const [globalBudgets, taskBudgets, agentBudgets, alerts] = await Promise.all([
        budgetService.getBudgetsByType('global'),
        taskId ? budgetService.getBudgetsByType('task', taskId) : [],
        agentId ? budgetService.getBudgetsByType('agent', agentId) : [],
        budgetService.getAllBudgetAlerts(),
      ]);

      return {
        globalBudgets,
        taskBudgets,
        agentBudgets,
        alerts: alerts.filter(alert => 
          !taskId || alert.entityId === taskId ||
          !agentId || alert.entityId === agentId ||
          alert.entityType === 'global'
        ),
      };
    } catch (error) {
      console.error('Failed to get budget status:', error);
      return {
        globalBudgets: [],
        taskBudgets: [],
        agentBudgets: [],
        alerts: [],
      };
    }
  }

  async performResearch(
    query: string,
    options: RouterOptions = {}
  ): Promise<{
    research: string;
    citations: string[];
    tokensUsed: number;
    cost: number;
    provider: LLMProvider;
  }> {
    // Always prioritize Perplexity for research
    const enhancedOptions = { ...options, isResearch: true };
    const optimalOrder = this.getOptimalProviderOrder(enhancedOptions);
    
    let lastError: Error | null = null;

    for (const provider of optimalOrder) {
      try {
        const service = this.providers.get(provider);
        
        if (!service) {
          console.warn(`Provider ${provider} not available`);
          continue;
        }

        // Check if provider supports research (only Perplexity has performResearch method)
        if (provider === 'perplexity' && 'performResearch' in service) {
          const startTime = Date.now();
          const result = await service.performResearch(query, {
            taskId: options.taskId,
            agentId: options.agentId,
          });
          const latency = Date.now() - startTime;

          this.updateMetrics(provider, true, result.tokensUsed, result.cost, latency);

          return {
            ...result,
            provider,
          };
        } else {
          // Fallback to regular completion for other providers
          const messages: LLMMessage[] = [
            {
              role: 'system',
              content: 'You are a research assistant. Provide comprehensive, factual information.'
            },
            {
              role: 'user',
              content: `Research the following topic and provide detailed information: ${query}`
            }
          ];

          const response = await this.chat(messages, enhancedOptions);
          
          return {
            research: response.content,
            citations: [], // Other providers don't provide citations
            tokensUsed: response.tokensUsed,
            cost: response.cost,
            provider: response.provider,
          };
        }
      } catch (error) {
        lastError = error as Error;
        console.error(`Provider ${provider} failed for research:`, error);
        continue;
      }
    }

    throw new Error(`All providers failed for research. Last error: ${lastError?.message}`);
  }

  async getCostSummary(taskId?: string, agentId?: string): Promise<{
    taskCosts?: any;
    agentCosts?: any;
    totalCost: number;
    totalTokens: number;
  }> {
    try {
      const [taskCosts, agentCosts] = await Promise.all([
        taskId ? budgetService.getCostSummaryForTask(taskId) : null,
        agentId ? budgetService.getCostSummaryForAgent(agentId) : null,
      ]);

      return {
        taskCosts,
        agentCosts,
        totalCost: (taskCosts?.totalCost || 0) + (agentCosts?.totalCost || 0),
        totalTokens: (taskCosts?.totalTokens || 0) + (agentCosts?.totalTokens || 0),
      };
    } catch (error) {
      console.error('Failed to get cost summary:', error);
      return {
        totalCost: 0,
        totalTokens: 0,
      };
    }
  }
}

export const llmRouter = new LLMRouter();