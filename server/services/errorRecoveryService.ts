import { storage } from "../storage";
import type { 
  ErrorInstance, 
  InsertErrorInstance, 
  RecoveryStrategy,
  Task,
  Agent
} from "@shared/schema";

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface FallbackConfig {
  fallbackProviders: string[];
  fallbackModels: string[];
  degradedMode: boolean;
  skipNonEssential: boolean;
}

export interface RecoveryResult {
  success: boolean;
  strategy: string;
  attempts: number;
  finalError?: Error;
  fallbackUsed?: string;
  recoveryTime: number; // milliseconds
}

export interface ErrorPattern {
  errorType: string;
  provider?: string;
  frequency: number;
  lastOccurrence: Date;
  averageRecoveryTime: number;
  mostSuccessfulStrategy: string;
}

export class ErrorRecoveryService {
  private defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  };

  // Error Tracking
  async trackError(
    error: Error,
    context: {
      taskId?: string;
      agentId?: string;
      executionId?: string;
      provider?: string;
      operation?: string;
      stackTrace?: string;
      metadata?: any;
    }
  ): Promise<ErrorInstance> {
    const errorType = this.categorizeError(error);
    const severity = this.determineSeverity(error, errorType);

    const errorInstance = await storage.createErrorInstance({
      taskId: context.taskId,
      agentId: context.agentId,
      executionId: context.executionId,
      errorType,
      errorCode: this.extractErrorCode(error),
      errorMessage: error.message,
      stackTrace: context.stackTrace || error.stack,
      provider: context.provider,
      operation: context.operation,
      severity,
      metadata: {
        ...context.metadata,
        originalError: error.name,
        timestamp: new Date().toISOString(),
      },
    });

    await storage.createLog({
      level: severity === 'critical' ? 'error' : 'warn',
      category: 'error',
      message: `Error tracked: ${errorType} - ${error.message}`,
      data: {
        errorId: errorInstance.id,
        errorType,
        severity,
        provider: context.provider,
        operation: context.operation,
        taskId: context.taskId,
        agentId: context.agentId,
      },
    });

    return errorInstance;
  }

  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
      return 'rate_limit';
    }

    // Authentication
    if (message.includes('unauthorized') || message.includes('invalid api key') || message.includes('401')) {
      return 'auth';
    }

    // Network issues
    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return 'network';
    }

    // Server errors
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return 'server';
    }

    // Timeout
    if (message.includes('timeout') || name.includes('timeout')) {
      return 'timeout';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid input')) {
      return 'validation';
    }

    // Generic application error
    return 'application';
  }

  private determineSeverity(error: Error, errorType: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (errorType) {
      case 'auth':
        return 'critical';
      case 'server':
      case 'network':
        return 'high';
      case 'rate_limit':
      case 'timeout':
        return 'medium';
      default:
        return 'low';
    }
  }

  private extractErrorCode(error: Error): string | undefined {
    // Extract HTTP status codes or error codes from error message
    const codeMatch = error.message.match(/\b(\d{3})\b/); // HTTP status codes
    return codeMatch ? codeMatch[1] : undefined;
  }

  // Recovery Strategy Management
  async createRecoveryStrategy(strategy: {
    name: string;
    errorType: string;
    provider?: string;
    strategy: {
      type: 'retry' | 'fallback' | 'circuit_breaker' | 'graceful_degradation';
      config: any;
    };
    priority?: number;
  }): Promise<RecoveryStrategy> {
    const recoveryStrategy = await storage.createRecoveryStrategy({
      name: strategy.name,
      errorType: strategy.errorType,
      provider: strategy.provider,
      strategy: strategy.strategy,
      priority: strategy.priority || 0,
      isActive: true,
      successRate: '0.00',
      totalAttempts: 0,
      successfulAttempts: 0,
    });

    await storage.createLog({
      level: 'info',
      category: 'error',
      message: `Recovery strategy '${strategy.name}' created for ${strategy.errorType}`,
      data: {
        strategyId: recoveryStrategy.id,
        errorType: strategy.errorType,
        provider: strategy.provider,
      },
    });

    return recoveryStrategy;
  }

  async getRecoveryStrategies(errorType: string, provider?: string): Promise<RecoveryStrategy[]> {
    let strategies = await storage.getRecoveryStrategiesByErrorType(errorType);
    
    if (provider) {
      // Prefer provider-specific strategies, then fall back to generic ones
      const providerSpecific = strategies.filter(s => s.provider === provider);
      const generic = strategies.filter(s => !s.provider);
      strategies = [...providerSpecific, ...generic];
    }

    return strategies;
  }

  // Error Recovery Execution
  async attemptRecovery<T>(
    operation: () => Promise<T>,
    context: {
      taskId?: string;
      agentId?: string;
      executionId?: string;
      provider?: string;
      operation?: string;
      customRetryConfig?: Partial<RetryConfig>;
    }
  ): Promise<RecoveryResult & { result?: T }> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;
    let fallbackUsed: string | undefined;

    const retryConfig = { ...this.defaultRetryConfig, ...context.customRetryConfig };

    while (attempts < retryConfig.maxAttempts) {
      attempts++;

      try {
        const result = await operation();
        
        const recoveryTime = Date.now() - startTime;
        
        // If we succeeded after failures, log the recovery
        if (attempts > 1 && lastError) {
          await this.updateRecoverySuccess(lastError, context, 'retry', attempts);
        }

        return {
          success: true,
          strategy: attempts > 1 ? 'retry' : 'direct',
          attempts,
          recoveryTime,
          result,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Track the error
        const errorInstance = await this.trackError(lastError, context);

        // If this is not the last attempt, try recovery strategies
        if (attempts < retryConfig.maxAttempts) {
          const recoveryStrategy = await this.selectRecoveryStrategy(lastError, context);
          
          if (recoveryStrategy) {
            try {
              const strategyResult = await this.applyRecoveryStrategy(
                recoveryStrategy, 
                lastError, 
                operation, 
                context
              );
              
              if (strategyResult.success) {
                const recoveryTime = Date.now() - startTime;
                await this.updateRecoverySuccess(lastError, context, recoveryStrategy.name, attempts);
                
                return {
                  success: true,
                  strategy: recoveryStrategy.name,
                  attempts,
                  fallbackUsed: strategyResult.fallbackUsed,
                  recoveryTime,
                  result: strategyResult.result,
                };
              }
            } catch (strategyError) {
              // Strategy failed, continue with normal retry
              await storage.createLog({
                level: 'warn',
                category: 'error',
                message: `Recovery strategy '${recoveryStrategy.name}' failed: ${strategyError}`,
                data: { errorId: errorInstance.id, strategyId: recoveryStrategy.id },
              });
            }
          }

          // Wait before retry with exponential backoff
          const delay = this.calculateDelay(attempts, retryConfig);
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    const recoveryTime = Date.now() - startTime;
    
    if (lastError) {
      await this.updateRecoveryFailure(lastError, context, attempts);
    }

    return {
      success: false,
      strategy: 'retry_exhausted',
      attempts,
      finalError: lastError || new Error('Unknown error'),
      recoveryTime,
    };
  }

  private async selectRecoveryStrategy(
    error: Error, 
    context: { provider?: string; operation?: string }
  ): Promise<RecoveryStrategy | null> {
    const errorType = this.categorizeError(error);
    const strategies = await this.getRecoveryStrategies(errorType, context.provider);
    
    // Return highest priority strategy
    return strategies.length > 0 ? strategies[0] : null;
  }

  private async applyRecoveryStrategy<T>(
    strategy: RecoveryStrategy,
    error: Error,
    operation: () => Promise<T>,
    context: any
  ): Promise<{ success: boolean; fallbackUsed?: string; result?: T }> {
    const strategyConfig = strategy.strategy as any;

    switch (strategyConfig.type) {
      case 'fallback':
        return await this.applyFallbackStrategy(strategyConfig.config, operation, context);
      
      case 'circuit_breaker':
        return await this.applyCircuitBreakerStrategy(strategyConfig.config, operation, context);
      
      case 'graceful_degradation':
        return await this.applyGracefulDegradationStrategy(strategyConfig.config, operation, context);
      
      default:
        throw new Error(`Unknown recovery strategy type: ${strategyConfig.type}`);
    }
  }

  private async applyFallbackStrategy<T>(
    config: FallbackConfig,
    operation: () => Promise<T>,
    context: any
  ): Promise<{ success: boolean; fallbackUsed?: string; result?: T }> {
    // Try fallback providers
    for (const fallbackProvider of config.fallbackProviders) {
      try {
        // Would need to modify operation to use different provider
        // This is a simplified implementation
        const result = await operation();
        return { success: true, fallbackUsed: fallbackProvider, result };
      } catch (error) {
        continue;
      }
    }

    return { success: false };
  }

  private async applyCircuitBreakerStrategy<T>(
    config: any,
    operation: () => Promise<T>,
    context: any
  ): Promise<{ success: boolean; result?: T }> {
    // Simplified circuit breaker - would need state management in production
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      return { success: false };
    }
  }

  private async applyGracefulDegradationStrategy<T>(
    config: any,
    operation: () => Promise<T>,
    context: any
  ): Promise<{ success: boolean; result?: T }> {
    try {
      // Try with degraded parameters
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      return { success: false };
    }
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, config.maxDelay);
    
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5); // Add ±25% jitter
    }
    
    return Math.floor(delay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Recovery Statistics
  private async updateRecoverySuccess(
    error: Error,
    context: any,
    strategy: string,
    attempts: number
  ): Promise<void> {
    const errorType = this.categorizeError(error);
    const strategies = await this.getRecoveryStrategies(errorType, context.provider);
    
    for (const strategyRecord of strategies) {
      if (strategyRecord.name === strategy) {
        const newTotal = strategyRecord.totalAttempts + 1;
        const newSuccessful = strategyRecord.successfulAttempts + 1;
        const newSuccessRate = (newSuccessful / newTotal) * 100;

        await storage.updateRecoveryStrategy(strategyRecord.id, {
          totalAttempts: newTotal,
          successfulAttempts: newSuccessful,
          successRate: newSuccessRate.toString(),
        });
        break;
      }
    }

    await storage.createLog({
      level: 'info',
      category: 'error',
      message: `Error recovered using strategy '${strategy}' after ${attempts} attempts`,
      data: {
        errorType,
        strategy,
        attempts,
        provider: context.provider,
        operation: context.operation,
      },
    });
  }

  private async updateRecoveryFailure(
    error: Error,
    context: any,
    attempts: number
  ): Promise<void> {
    await storage.createLog({
      level: 'error',
      category: 'error',
      message: `Error recovery failed after ${attempts} attempts: ${error.message}`,
      data: {
        errorType: this.categorizeError(error),
        attempts,
        provider: context.provider,
        operation: context.operation,
        taskId: context.taskId,
        agentId: context.agentId,
      },
    });
  }

  // Error Analysis & Reporting
  async getErrorPatterns(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<ErrorPattern[]> {
    const errors = await storage.getUnresolvedErrors();
    const patternMap = new Map<string, ErrorPattern>();

    const timeLimit = this.getTimeLimit(timeframe);

    for (const error of errors) {
      if (new Date(error.occurredAt) < timeLimit) continue;

      const key = `${error.errorType}-${error.provider || 'any'}`;
      
      if (!patternMap.has(key)) {
        patternMap.set(key, {
          errorType: error.errorType,
          provider: error.provider || undefined,
          frequency: 0,
          lastOccurrence: new Date(error.occurredAt),
          averageRecoveryTime: 0,
          mostSuccessfulStrategy: 'none',
        });
      }

      const pattern = patternMap.get(key)!;
      pattern.frequency++;
      
      if (new Date(error.occurredAt) > pattern.lastOccurrence) {
        pattern.lastOccurrence = new Date(error.occurredAt);
      }
    }

    return Array.from(patternMap.values()).sort((a, b) => b.frequency - a.frequency);
  }

  private getTimeLimit(timeframe: 'hour' | 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (timeframe) {
      case 'hour':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  async getErrorsByTask(taskId: string): Promise<ErrorInstance[]> {
    return await storage.getErrorsByTask(taskId);
  }

  async getErrorsByAgent(agentId: string): Promise<ErrorInstance[]> {
    return await storage.getErrorsByAgent(agentId);
  }

  async resolveError(errorId: string, resolutionStrategy: string): Promise<void> {
    await storage.updateErrorInstance(errorId, {
      isResolved: true,
      resolutionStrategy,
      resolvedAt: new Date(),
    });

    await storage.createLog({
      level: 'info',
      category: 'error',
      message: `Error resolved using strategy: ${resolutionStrategy}`,
      data: { errorId, resolutionStrategy },
    });
  }

  // Initialize default recovery strategies
  async initializeDefaultStrategies(): Promise<void> {
    const defaultStrategies = [
      {
        name: 'Rate Limit Retry with Backoff',
        errorType: 'rate_limit',
        strategy: {
          type: 'retry',
          config: {
            maxAttempts: 5,
            baseDelay: 2000,
            maxDelay: 60000,
            backoffMultiplier: 2,
            jitter: true,
          },
        },
        priority: 10,
      },
      {
        name: 'Provider Fallback for Network Errors',
        errorType: 'network',
        strategy: {
          type: 'fallback',
          config: {
            fallbackProviders: ['groq', 'gemini', 'ollama'],
            degradedMode: true,
          },
        },
        priority: 8,
      },
      {
        name: 'Server Error Retry',
        errorType: 'server',
        strategy: {
          type: 'retry',
          config: {
            maxAttempts: 3,
            baseDelay: 5000,
            maxDelay: 30000,
            backoffMultiplier: 2,
          },
        },
        priority: 7,
      },
    ];

    for (const strategy of defaultStrategies) {
      try {
        await this.createRecoveryStrategy(strategy);
      } catch (error) {
        // Strategy might already exist, continue
        continue;
      }
    }

    await storage.createLog({
      level: 'info',
      category: 'error',
      message: 'Default recovery strategies initialized',
      data: { strategiesCount: defaultStrategies.length },
    });
  }
}

export const errorRecoveryService = new ErrorRecoveryService();