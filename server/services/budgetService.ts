import { storage } from "../storage";
import type { 
  Budget, 
  InsertBudget, 
  CostEntry, 
  InsertCostEntry,
  BudgetWithCosts 
} from "@shared/schema";

export interface BudgetAlert {
  budgetId: string;
  budgetName: string;
  currentSpent: number;
  limitAmount: number;
  utilizationPercentage: number;
  thresholdReached: number; // which threshold was crossed (50, 75, 90, etc.)
  alertLevel: 'warning' | 'critical' | 'exceeded';
  entityType: string;
  entityId?: string;
}

export interface CostTrackingOptions {
  provider: string;
  operation: string;
  tokensInput?: number;
  tokensOutput?: number;
  tokensTotal?: number;
  cost: number;
  currency?: string;
  ratePerToken?: number;
  metadata?: any;
}

export interface PeriodCostSummary {
  period: string;
  startDate: Date;
  endDate: Date;
  totalCost: number;
  totalTokens: number;
  averageCostPerToken: number;
  operationBreakdown: Record<string, { cost: number; tokens: number; count: number }>;
  providerBreakdown: Record<string, { cost: number; tokens: number; count: number }>;
}

export class BudgetService {
  // Budget Management
  async createBudget(budgetData: InsertBudget): Promise<Budget> {
    // Calculate period end if not provided
    if (!budgetData.periodEnd && budgetData.period !== 'total') {
      budgetData.periodEnd = this.calculatePeriodEnd(budgetData.period, budgetData.periodStart || new Date());
    }

    const budget = await storage.createBudget(budgetData);

    await storage.createLog({
      level: 'info',
      category: 'budget',
      message: `Budget '${budget.name}' created`,
      data: {
        budgetId: budget.id,
        type: budget.type,
        limitAmount: budget.limitAmount,
        period: budget.period,
        entityId: budget.entityId,
      },
    });

    return budget;
  }

  async getBudget(id: string): Promise<Budget | undefined> {
    return await storage.getBudget(id);
  }

  async getBudgetWithCosts(id: string): Promise<BudgetWithCosts | undefined> {
    return await storage.getBudgetWithCosts(id);
  }

  async getAllBudgets(): Promise<Budget[]> {
    return await storage.getAllBudgets();
  }

  async getBudgetsByType(type: string, entityId?: string): Promise<Budget[]> {
    return await storage.getBudgetsByType(type, entityId);
  }

  async updateBudget(id: string, updates: Partial<Budget>): Promise<Budget> {
    const budget = await storage.updateBudget(id, updates);

    await storage.createLog({
      level: 'info',
      category: 'budget',
      message: `Budget '${budget.name}' updated`,
      data: { budgetId: id, updates },
    });

    return budget;
  }

  async deleteBudget(id: string): Promise<void> {
    await storage.deleteBudget(id);

    await storage.createLog({
      level: 'info',
      category: 'budget',
      message: `Budget deleted`,
      data: { budgetId: id },
    });
  }

  // Cost Tracking
  async trackCost(
    taskId: string,
    agentId: string,
    executionId: string,
    options: CostTrackingOptions
  ): Promise<CostEntry> {
    // Find applicable budgets
    const budgets = await this.findApplicableBudgets(taskId, agentId);

    // Create cost entry for each applicable budget
    const costEntries: CostEntry[] = [];

    for (const budget of budgets) {
      const costEntry = await storage.createCostEntry({
        budgetId: budget.id,
        taskId,
        agentId,
        executionId,
        provider: options.provider,
        operation: options.operation,
        tokensInput: options.tokensInput,
        tokensOutput: options.tokensOutput,
        tokensTotal: options.tokensTotal || ((options.tokensInput || 0) + (options.tokensOutput || 0)),
        cost: options.cost.toString(),
        currency: options.currency || 'USD',
        ratePerToken: options.ratePerToken?.toString(),
        metadata: options.metadata,
      });

      costEntries.push(costEntry);

      // Update budget current spent
      await this.updateBudgetSpent(budget.id, options.cost);

      await storage.createLog({
        level: 'debug',
        category: 'budget',
        message: `Cost tracked: $${options.cost} for ${options.operation}`,
        data: {
          budgetId: budget.id,
          taskId,
          agentId,
          provider: options.provider,
          operation: options.operation,
          cost: options.cost,
          tokens: options.tokensTotal,
        },
      });
    }

    // Return the first cost entry (main budget)
    return costEntries[0];
  }

  private async findApplicableBudgets(taskId: string, agentId: string): Promise<Budget[]> {
    const budgets: Budget[] = [];

    // Global budgets
    const globalBudgets = await storage.getBudgetsByType('global');
    budgets.push(...globalBudgets.filter(b => b.isActive));

    // Task-specific budgets
    const taskBudgets = await storage.getBudgetsByType('task', taskId);
    budgets.push(...taskBudgets.filter(b => b.isActive));

    // Agent-specific budgets
    const agentBudgets = await storage.getBudgetsByType('agent', agentId);
    budgets.push(...agentBudgets.filter(b => b.isActive));

    return budgets;
  }

  private async updateBudgetSpent(budgetId: string, additionalCost: number): Promise<void> {
    const budget = await storage.getBudget(budgetId);
    if (!budget) return;

    const currentSpent = parseFloat(budget.currentSpent) + additionalCost;
    
    await storage.updateBudget(budgetId, {
      currentSpent: currentSpent.toString(),
    });

    // Check for budget alerts
    await this.checkBudgetAlerts(budgetId);
  }

  // Budget Monitoring & Alerts
  async checkBudgetAlerts(budgetId: string): Promise<BudgetAlert[]> {
    const budgetWithCosts = await storage.getBudgetWithCosts(budgetId);
    if (!budgetWithCosts) return [];

    const alerts: BudgetAlert[] = [];
    const utilizationPercentage = budgetWithCosts.utilizationPercentage;
    const thresholds = (budgetWithCosts.alertThresholds as number[]) || [50, 75, 90];

    for (const threshold of thresholds) {
      if (utilizationPercentage >= threshold) {
        const alert: BudgetAlert = {
          budgetId: budgetWithCosts.id,
          budgetName: budgetWithCosts.name,
          currentSpent: budgetWithCosts.totalSpent,
          limitAmount: parseFloat(budgetWithCosts.limitAmount),
          utilizationPercentage,
          thresholdReached: threshold,
          alertLevel: this.getAlertLevel(utilizationPercentage),
          entityType: budgetWithCosts.type,
          entityId: budgetWithCosts.entityId || undefined,
        };

        alerts.push(alert);

        // Log the alert
        await storage.createLog({
          level: alert.alertLevel === 'exceeded' ? 'error' : 'warn',
          category: 'budget',
          message: `Budget alert: ${budgetWithCosts.name} is ${utilizationPercentage.toFixed(1)}% utilized`,
          data: alert,
        });
      }
    }

    return alerts;
  }

  private getAlertLevel(utilizationPercentage: number): 'warning' | 'critical' | 'exceeded' {
    if (utilizationPercentage >= 100) return 'exceeded';
    if (utilizationPercentage >= 90) return 'critical';
    return 'warning';
  }

  async getAllBudgetAlerts(): Promise<BudgetAlert[]> {
    const budgets = await storage.getAllBudgets();
    const alerts: BudgetAlert[] = [];

    for (const budget of budgets.filter(b => b.isActive)) {
      const budgetAlerts = await this.checkBudgetAlerts(budget.id);
      alerts.push(...budgetAlerts);
    }

    return alerts.sort((a, b) => b.utilizationPercentage - a.utilizationPercentage);
  }

  async getCriticalAlerts(): Promise<BudgetAlert[]> {
    const allAlerts = await this.getAllBudgetAlerts();
    return allAlerts.filter(alert => alert.alertLevel === 'critical' || alert.alertLevel === 'exceeded');
  }

  // Cost Analysis & Reporting
  async getCostSummaryForTask(taskId: string): Promise<{
    totalCost: number;
    totalTokens: number;
    costByProvider: Record<string, number>;
    costByOperation: Record<string, number>;
    costByAgent: Record<string, number>;
  }> {
    const costEntries = await storage.getCostEntriesForTask(taskId);

    const summary = {
      totalCost: 0,
      totalTokens: 0,
      costByProvider: {} as Record<string, number>,
      costByOperation: {} as Record<string, number>,
      costByAgent: {} as Record<string, number>,
    };

    for (const entry of costEntries) {
      const cost = parseFloat(entry.cost);
      const tokens = entry.tokensTotal || 0;

      summary.totalCost += cost;
      summary.totalTokens += tokens;

      summary.costByProvider[entry.provider] = (summary.costByProvider[entry.provider] || 0) + cost;
      summary.costByOperation[entry.operation] = (summary.costByOperation[entry.operation] || 0) + cost;
      
      if (entry.agentId) {
        summary.costByAgent[entry.agentId] = (summary.costByAgent[entry.agentId] || 0) + cost;
      }
    }

    return summary;
  }

  async getCostSummaryForAgent(agentId: string): Promise<{
    totalCost: number;
    totalTokens: number;
    executionCount: number;
    avgCostPerExecution: number;
    costByProvider: Record<string, number>;
    costByOperation: Record<string, number>;
  }> {
    const costEntries = await storage.getCostEntriesForAgent(agentId);

    const summary = {
      totalCost: 0,
      totalTokens: 0,
      executionCount: new Set(costEntries.map(e => e.executionId)).size,
      avgCostPerExecution: 0,
      costByProvider: {} as Record<string, number>,
      costByOperation: {} as Record<string, number>,
    };

    for (const entry of costEntries) {
      const cost = parseFloat(entry.cost);
      const tokens = entry.tokensTotal || 0;

      summary.totalCost += cost;
      summary.totalTokens += tokens;

      summary.costByProvider[entry.provider] = (summary.costByProvider[entry.provider] || 0) + cost;
      summary.costByOperation[entry.operation] = (summary.costByOperation[entry.operation] || 0) + cost;
    }

    summary.avgCostPerExecution = summary.executionCount > 0 ? summary.totalCost / summary.executionCount : 0;

    return summary;
  }

  async getPeriodCostSummary(
    budgetId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<PeriodCostSummary> {
    const budget = await storage.getBudget(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const start = startDate || budget.periodStart;
    const end = endDate || budget.periodEnd || new Date();

    const costEntries = await storage.getCostEntriesForBudget(budgetId);
    const periodEntries = costEntries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= start && entryDate <= end;
    });

    const summary: PeriodCostSummary = {
      period: budget.period,
      startDate: start,
      endDate: end,
      totalCost: 0,
      totalTokens: 0,
      averageCostPerToken: 0,
      operationBreakdown: {},
      providerBreakdown: {},
    };

    for (const entry of periodEntries) {
      const cost = parseFloat(entry.cost);
      const tokens = entry.tokensTotal || 0;

      summary.totalCost += cost;
      summary.totalTokens += tokens;

      // Operation breakdown
      if (!summary.operationBreakdown[entry.operation]) {
        summary.operationBreakdown[entry.operation] = { cost: 0, tokens: 0, count: 0 };
      }
      summary.operationBreakdown[entry.operation].cost += cost;
      summary.operationBreakdown[entry.operation].tokens += tokens;
      summary.operationBreakdown[entry.operation].count += 1;

      // Provider breakdown
      if (!summary.providerBreakdown[entry.provider]) {
        summary.providerBreakdown[entry.provider] = { cost: 0, tokens: 0, count: 0 };
      }
      summary.providerBreakdown[entry.provider].cost += cost;
      summary.providerBreakdown[entry.provider].tokens += tokens;
      summary.providerBreakdown[entry.provider].count += 1;
    }

    summary.averageCostPerToken = summary.totalTokens > 0 ? summary.totalCost / summary.totalTokens : 0;

    return summary;
  }

  // Predictive Cost Estimation
  async estimateTaskCost(
    taskDescription: string,
    estimatedTokens?: number,
    provider?: string
  ): Promise<{
    estimatedCost: number;
    confidence: number;
    basedOnSimilarTasks: number;
    breakdown: Record<string, number>;
  }> {
    // Simplified cost estimation - would use ML models in production
    const defaultProvider = provider || 'groq';
    const defaultTokens = estimatedTokens || 1000;

    // Rough token pricing (would be dynamic in production)
    const tokenPricing: Record<string, number> = {
      'groq': 0.0001,    // $0.0001 per token (example)
      'gemini': 0.00015, // $0.00015 per token (example)  
      'ollama': 0,       // Free (local)
    };

    const baseTokenCost = tokenPricing[defaultProvider] || 0.0001;
    const estimatedCost = defaultTokens * baseTokenCost;

    return {
      estimatedCost,
      confidence: 0.7, // 70% confidence (would be calculated based on historical data)
      basedOnSimilarTasks: 0, // Would count similar tasks from history
      breakdown: {
        tokenCost: estimatedCost,
        providerFees: 0,
        infrastructureCost: 0,
      },
    };
  }

  // Budget Period Management
  async resetPeriodBudgets(): Promise<void> {
    const budgets = await storage.getAllBudgets();
    const now = new Date();

    for (const budget of budgets.filter(b => b.isActive && b.resetOnPeriod)) {
      if (budget.periodEnd && budget.periodEnd <= now) {
        // Reset the budget for new period
        const newPeriodStart = budget.periodEnd;
        const newPeriodEnd = this.calculatePeriodEnd(budget.period, newPeriodStart);

        await storage.updateBudget(budget.id, {
          currentSpent: '0.00',
          periodStart: newPeriodStart,
          periodEnd: newPeriodEnd,
        });

        await storage.createLog({
          level: 'info',
          category: 'budget',
          message: `Budget '${budget.name}' reset for new ${budget.period} period`,
          data: {
            budgetId: budget.id,
            newPeriodStart,
            newPeriodEnd,
          },
        });
      }
    }
  }

  private calculatePeriodEnd(period: string, startDate: Date): Date {
    const end = new Date(startDate);

    switch (period) {
      case 'daily':
        end.setDate(end.getDate() + 1);
        break;
      case 'weekly':
        end.setDate(end.getDate() + 7);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'yearly':
        end.setFullYear(end.getFullYear() + 1);
        break;
      default:
        // For 'total' budget, return far future date
        end.setFullYear(end.getFullYear() + 100);
    }

    return end;
  }

  // Cost Optimization Suggestions
  async getCostOptimizationSuggestions(): Promise<{
    suggestions: Array<{
      type: 'provider_switch' | 'operation_optimization' | 'usage_reduction';
      description: string;
      estimatedSavings: number;
      difficulty: 'easy' | 'medium' | 'hard';
      action: string;
    }>;
    totalPotentialSavings: number;
  }> {
    // Simplified optimization suggestions - would be more sophisticated in production
    const suggestions = [
      {
        type: 'provider_switch' as const,
        description: 'Consider using Ollama for development tasks to reduce costs',
        estimatedSavings: 0.50, // $0.50 per day
        difficulty: 'easy' as const,
        action: 'Switch to Ollama provider for non-production tasks',
      },
      {
        type: 'operation_optimization' as const,
        description: 'Optimize prompts to reduce token usage',
        estimatedSavings: 0.25,
        difficulty: 'medium' as const,
        action: 'Review and optimize agent prompts for efficiency',
      },
    ];

    const totalPotentialSavings = suggestions.reduce((sum, s) => sum + s.estimatedSavings, 0);

    return {
      suggestions,
      totalPotentialSavings,
    };
  }

  // Initialize budget monitoring
  async startBudgetMonitoring(): Promise<void> {
    // Check for budget resets every hour
    setInterval(async () => {
      try {
        await this.resetPeriodBudgets();
      } catch (error) {
        await storage.createLog({
          level: 'error',
          category: 'budget',
          message: `Budget monitoring error: ${error}`,
          data: {},
        });
      }
    }, 60 * 60 * 1000); // 1 hour

    await storage.createLog({
      level: 'info',
      category: 'budget',
      message: 'Budget monitoring service started',
      data: {},
    });
  }
}

export const budgetService = new BudgetService();