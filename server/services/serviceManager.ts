import { storage } from "../storage";
import { budgetService } from "./budgetService";
import { errorRecoveryService } from "./errorRecoveryService";
import { templateService } from "./templateService";
import { taskQueueService } from "./taskQueueService";
import { timelineService } from "./timelineService";
import { llmRouter } from "./llmRouter";

export class ServiceManager {
  private static instance: ServiceManager;
  private initialized = false;

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Services already initialized');
      return;
    }

    console.log('🚀 Initializing MaestroMind services...');

    try {
      // Initialize services in order of dependencies
      
      // 1. Initialize Error Recovery Service with default strategies
      console.log('🛡️ Initializing Error Recovery Service...');
      await errorRecoveryService.initializeDefaultStrategies();

      // 2. Initialize Template Service with built-in templates
      console.log('📋 Initializing Template Service...');
      await templateService.initializeBuiltInTemplates();

      // 3. Start Budget Monitoring (background process)
      console.log('💰 Starting Budget Monitoring Service...');
      await budgetService.startBudgetMonitoring();

      // 4. Initialize Task Queue Service
      console.log('📋 Initializing Task Queue Service...');
      // Task queue service is ready to use without special initialization
      
      // 5. LLM Router is already initialized in constructor
      console.log('🤖 LLM Router ready with providers: groq, gemini, ollama');

      // Log successful initialization
      await storage.createLog({
        level: 'info',
        category: 'system',
        message: 'All MaestroMind services initialized successfully',
        data: {
          services: [
            'error-recovery',
            'template-service',
            'budget-monitoring',
            'task-queue',
            'timeline-service',
            'llm-router'
          ],
          timestamp: new Date().toISOString(),
        },
      });

      this.initialized = true;
      console.log('✅ All services initialized successfully!');

    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
      
      await storage.createLog({
        level: 'error',
        category: 'system',
        message: `Service initialization failed: ${error}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      });

      throw error;
    }
  }

  async createDefaultBudgets(): Promise<void> {
    console.log('💰 Creating default budgets...');

    try {
      // Create a global daily budget
      await budgetService.createBudget({
        name: 'Global Daily Budget',
        description: 'Default daily spending limit for all operations',
        type: 'global',
        limitAmount: '10.00', // $10 per day
        period: 'daily',
        periodStart: new Date(),
        isActive: true,
        resetOnPeriod: true,
        alertThresholds: [50, 75, 90, 100], // Alert at 50%, 75%, 90%, 100%
        currentSpent: '0.00',
      });

      // Create a global weekly budget  
      await budgetService.createBudget({
        name: 'Global Weekly Budget',
        description: 'Weekly spending limit for all operations',
        type: 'global',
        limitAmount: '50.00', // $50 per week
        period: 'weekly',
        periodStart: new Date(),
        isActive: true,
        resetOnPeriod: true,
        alertThresholds: [60, 80, 95], // Alert at 60%, 80%, 95%
        currentSpent: '0.00',
      });

      console.log('✅ Default budgets created successfully');

      await storage.createLog({
        level: 'info',
        category: 'budget',
        message: 'Default budgets created',
        data: {
          budgets: ['Global Daily Budget', 'Global Weekly Budget'],
        },
      });

    } catch (error) {
      // Don't fail if budgets already exist
      console.log('ℹ️ Default budgets may already exist or creation failed:', error);
    }
  }

  async createDefaultQueues(): Promise<void> {
    console.log('📋 Creating default task queues...');

    try {
      // Create default priority queue
      await taskQueueService.createQueue({
        name: 'Default Priority Queue',
        description: 'Main queue for task execution with priority ordering',
        isActive: true,
        concurrentTasks: 3,
        metadata: {
          type: 'priority',
          autoStart: true,
        },
      });

      // Create high priority queue
      await taskQueueService.createQueue({
        name: 'High Priority Queue',
        description: 'Queue for urgent tasks requiring immediate execution',
        isActive: true,
        concurrentTasks: 2,
        metadata: {
          type: 'high_priority',
          autoStart: true,
        },
      });

      console.log('✅ Default queues created successfully');

      await storage.createLog({
        level: 'info',
        category: 'queue',
        message: 'Default task queues created',
        data: {
          queues: ['Default Priority Queue', 'High Priority Queue'],
        },
      });

    } catch (error) {
      console.log('ℹ️ Default queues may already exist or creation failed:', error);
    }
  }

  async getSystemStatus(): Promise<{
    services: Record<string, boolean>;
    budgets: any[];
    queues: any[];
    metrics: any;
  }> {
    try {
      const [budgets, queues] = await Promise.all([
        budgetService.getAllBudgets(),
        taskQueueService.getAllQueues(),
      ]);

      const llmMetrics = llmRouter.getMetrics();
      const providerStatus = llmRouter.getProviderStatus();

      return {
        services: {
          initialized: this.initialized,
          budgetService: true,
          errorRecovery: true,
          templateService: true,
          taskQueue: true,
          timelineService: true,
          llmRouter: true,
          groqProvider: providerStatus.get('groq') || false,
          geminiProvider: providerStatus.get('gemini') || false,
          ollamaProvider: providerStatus.get('ollama') || false,
        },
        budgets: budgets.slice(0, 5), // Latest 5 budgets
        queues: queues.slice(0, 5), // Latest 5 queues
        metrics: {
          llmProviders: Object.fromEntries(llmMetrics as Map<string, any>),
        },
      };
    } catch (error) {
      console.error('Failed to get system status:', error);
      return {
        services: { initialized: this.initialized },
        budgets: [],
        queues: [],
        metrics: {},
      };
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, 'ok' | 'error' | 'warning'>;
    timestamp: string;
  }> {
    const timestamp = new Date().toISOString();
    const services: Record<string, 'ok' | 'error' | 'warning'> = {};

    try {
      // Check LLM providers
      const providerStatus = llmRouter.getProviderStatus();
      services.groq = providerStatus.get('groq') ? 'ok' : 'warning';
      services.gemini = providerStatus.get('gemini') ? 'ok' : 'warning';
      services.ollama = providerStatus.get('ollama') ? 'ok' : 'warning';

      // Check if at least one provider is working
      const hasWorkingProvider = Array.from(providerStatus.values()).some(status => status);
      services.llmRouter = hasWorkingProvider ? 'ok' : 'error';

      // Check other services (simplified)
      services.budgetService = 'ok';
      services.errorRecovery = 'ok';
      services.templateService = 'ok';
      services.taskQueue = 'ok';
      services.timelineService = 'ok';

      // Determine overall status
      const errorCount = Object.values(services).filter(s => s === 'error').length;
      const warningCount = Object.values(services).filter(s => s === 'warning').length;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (errorCount > 0) {
        status = 'unhealthy';
      } else if (warningCount > 2) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return {
        status,
        services,
        timestamp,
      };

    } catch (error) {
      console.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        services: { healthCheck: 'error' },
        timestamp,
      };
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const serviceManager = ServiceManager.getInstance();