import { storage } from "../storage";
import { taskService } from "./taskService";
import { agentService } from "./agentService";
import type { 
  TaskQueue, 
  InsertTaskQueue, 
  QueueEntry, 
  InsertQueueEntry,
  TaskSchedule,
  InsertTaskSchedule,
  Task,
  TaskCreationRequest
} from "@shared/schema";

export interface QueueExecutionOptions {
  maxConcurrency?: number;
  retryAttempts?: number;
  retryDelay?: number; // milliseconds
  onProgress?: (entry: QueueEntry, progress: number) => void;
  onComplete?: (entry: QueueEntry, result: any) => void;
  onError?: (entry: QueueEntry, error: Error) => void;
}

export interface ScheduleExecutionOptions {
  timezone?: string;
  maxRuns?: number;
  onScheduleRun?: (schedule: TaskSchedule, task: Task) => void;
  onScheduleError?: (schedule: TaskSchedule, error: Error) => void;
}

export class TaskQueueService {
  private executionIntervals: Map<string, NodeJS.Timeout> = new Map();
  private scheduleCheckers: Map<string, NodeJS.Timeout> = new Map();

  // Queue Management
  async createQueue(queueData: InsertTaskQueue): Promise<TaskQueue> {
    const queue = await storage.createTaskQueue({
      ...queueData,
      currentLoad: 0,
    });

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Task queue '${queue.name}' created`,
      data: { queueId: queue.id, priority: queue.priority, maxConcurrency: queue.maxConcurrency },
    });

    return queue;
  }

  async getQueue(id: string): Promise<TaskQueue | undefined> {
    return await storage.getTaskQueue(id);
  }

  async getQueueWithEntries(id: string) {
    return await storage.getTaskQueueWithEntries(id);
  }

  async getAllQueues(): Promise<TaskQueue[]> {
    return await storage.getAllTaskQueues();
  }

  async updateQueue(id: string, updates: Partial<TaskQueue>): Promise<TaskQueue> {
    const updatedQueue = await storage.updateTaskQueue(id, updates);
    
    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Task queue '${updatedQueue.name}' updated`,
      data: { queueId: id, updates },
    });

    return updatedQueue;
  }

  async deleteQueue(id: string): Promise<void> {
    // Check if queue has pending entries
    const entries = await storage.getQueueEntriesForQueue(id);
    const pendingEntries = entries.filter(e => e.status === 'queued' || e.status === 'running');
    
    if (pendingEntries.length > 0) {
      throw new Error(`Cannot delete queue with ${pendingEntries.length} pending entries`);
    }

    await storage.deleteTaskQueue(id);
    
    // Stop any execution intervals for this queue
    if (this.executionIntervals.has(id)) {
      clearInterval(this.executionIntervals.get(id)!);
      this.executionIntervals.delete(id);
    }

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Task queue deleted`,
      data: { queueId: id },
    });
  }

  // Queue Entry Management
  async addTaskToQueue(
    queueId: string, 
    taskId: string, 
    options: {
      priority?: number;
      estimatedDuration?: number;
      dependencies?: string[];
      scheduledFor?: Date;
      metadata?: any;
    } = {}
  ): Promise<QueueEntry> {
    const queue = await storage.getTaskQueue(queueId);
    if (!queue) {
      throw new Error(`Queue ${queueId} not found`);
    }

    const task = await storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Calculate position in queue
    const existingEntries = await storage.getQueueEntriesForQueue(queueId);
    const position = existingEntries.filter(e => e.status === 'queued').length + 1;

    const entry = await storage.createQueueEntry({
      queueId,
      taskId,
      position,
      priority: options.priority || 0,
      estimatedDuration: options.estimatedDuration,
      dependencies: options.dependencies || [],
      scheduledFor: options.scheduledFor,
      metadata: options.metadata,
      status: 'queued',
      retryCount: 0,
      maxRetries: 3,
    });

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Task '${task.title}' added to queue '${queue.name}'`,
      data: { 
        queueId, 
        taskId, 
        entryId: entry.id, 
        position, 
        priority: options.priority 
      },
    });

    return entry;
  }

  async updateQueueEntry(id: string, updates: Partial<QueueEntry>): Promise<QueueEntry> {
    return await storage.updateQueueEntry(id, updates);
  }

  async removeFromQueue(entryId: string): Promise<void> {
    const entry = await storage.getQueueEntry(entryId);
    if (!entry) {
      throw new Error(`Queue entry ${entryId} not found`);
    }

    if (entry.status === 'running') {
      throw new Error(`Cannot remove running queue entry`);
    }

    await storage.deleteQueueEntry(entryId);

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Queue entry removed`,
      data: { entryId, taskId: entry.taskId, queueId: entry.queueId },
    });
  }

  async getQueueEntries(queueId: string): Promise<QueueEntry[]> {
    return await storage.getQueueEntriesForQueue(queueId);
  }

  async getTaskQueueEntries(taskId: string): Promise<QueueEntry[]> {
    return await storage.getQueueEntriesForTask(taskId);
  }

  // Queue Execution
  async startQueueExecution(queueId: string, options: QueueExecutionOptions = {}): Promise<void> {
    const queue = await storage.getTaskQueue(queueId);
    if (!queue) {
      throw new Error(`Queue ${queueId} not found`);
    }

    if (queue.status !== 'active') {
      throw new Error(`Queue ${queue.name} is not active`);
    }

    // Stop any existing execution for this queue
    await this.stopQueueExecution(queueId);

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Started queue execution for '${queue.name}'`,
      data: { queueId, maxConcurrency: queue.maxConcurrency },
    });

    // Start execution interval
    const interval = setInterval(async () => {
      try {
        await this.processQueue(queueId, options);
      } catch (error) {
        await storage.createLog({
          level: 'error',
          category: 'queue',
          message: `Queue execution error: ${error}`,
          data: { queueId },
        });
      }
    }, 5000); // Check every 5 seconds

    this.executionIntervals.set(queueId, interval);
  }

  async stopQueueExecution(queueId: string): Promise<void> {
    if (this.executionIntervals.has(queueId)) {
      clearInterval(this.executionIntervals.get(queueId)!);
      this.executionIntervals.delete(queueId);

      await storage.createLog({
        level: 'info',
        category: 'queue',
        message: `Stopped queue execution`,
        data: { queueId },
      });
    }
  }

  async pauseQueue(queueId: string): Promise<void> {
    await this.updateQueue(queueId, { status: 'paused' });
    await this.stopQueueExecution(queueId);
  }

  async resumeQueue(queueId: string): Promise<void> {
    await this.updateQueue(queueId, { status: 'active' });
    await this.startQueueExecution(queueId);
  }

  private async processQueue(queueId: string, options: QueueExecutionOptions): Promise<void> {
    const queue = await storage.getTaskQueue(queueId);
    if (!queue || queue.status !== 'active') {
      return;
    }

    // Check if we have capacity for more tasks
    if (queue.currentLoad >= queue.maxConcurrency) {
      return;
    }

    // Get next entry that's ready to execute
    const nextEntry = await this.getNextReadyEntry(queueId);
    if (!nextEntry) {
      return;
    }

    // Execute the task
    await this.executeQueueEntry(nextEntry, options);
  }

  private async getNextReadyEntry(queueId: string): Promise<QueueEntry | undefined> {
    const entries = await storage.getQueueEntriesForQueue(queueId);
    
    // Filter for queued entries that are ready to run
    const readyEntries = entries.filter(entry => {
      if (entry.status !== 'queued') return false;
      
      // Check if scheduled time has passed
      if (entry.scheduledFor && new Date(entry.scheduledFor) > new Date()) {
        return false;
      }

      // Check dependencies (simplified - check if all dependency tasks are completed)
      if (entry.dependencies && Array.isArray(entry.dependencies) && entry.dependencies.length > 0) {
        // Would need to check if dependent tasks are completed
        // For now, skip dependency checking in this implementation
      }

      return true;
    });

    // Return highest priority entry
    return readyEntries.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
  }

  private async executeQueueEntry(entry: QueueEntry, options: QueueExecutionOptions): Promise<void> {
    try {
      // Update entry status and queue load
      await storage.updateQueueEntry(entry.id, { 
        status: 'running',
        updatedAt: new Date() 
      });
      
      const queue = await storage.getTaskQueue(entry.queueId);
      if (queue) {
        await storage.updateTaskQueue(entry.queueId, { 
          currentLoad: queue.currentLoad + 1 
        });
      }

      await storage.createLog({
        level: 'info',
        category: 'queue',
        message: `Started executing queue entry`,
        data: { entryId: entry.id, taskId: entry.taskId, queueId: entry.queueId },
      });

      // Execute the task
      const result = await taskService.executeTask({ 
        taskId: entry.taskId, 
        autoStart: true 
      });

      // Mark as completed
      await storage.updateQueueEntry(entry.id, { 
        status: 'completed',
        updatedAt: new Date() 
      });

      options.onComplete?.(entry, result);

      await storage.createLog({
        level: 'info',
        category: 'queue',
        message: `Queue entry completed successfully`,
        data: { entryId: entry.id, taskId: entry.taskId },
      });

    } catch (error) {
      // Handle retry logic
      const updatedEntry = await storage.getQueueEntry(entry.id);
      if (updatedEntry && updatedEntry.retryCount < updatedEntry.maxRetries) {
        // Retry
        await storage.updateQueueEntry(entry.id, {
          status: 'queued',
          retryCount: updatedEntry.retryCount + 1,
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date()
        });

        await storage.createLog({
          level: 'warn',
          category: 'queue',
          message: `Queue entry failed, retrying (${updatedEntry.retryCount + 1}/${updatedEntry.maxRetries})`,
          data: { entryId: entry.id, taskId: entry.taskId, error: error instanceof Error ? error.message : String(error) },
        });
      } else {
        // Max retries reached, mark as failed
        await storage.updateQueueEntry(entry.id, {
          status: 'failed',
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date()
        });

        await storage.createLog({
          level: 'error',
          category: 'queue',
          message: `Queue entry failed permanently`,
          data: { entryId: entry.id, taskId: entry.taskId, error: error instanceof Error ? error.message : String(error) },
        });
      }

      options.onError?.(entry, error instanceof Error ? error : new Error(String(error)));
    } finally {
      // Decrease queue load
      const queue = await storage.getTaskQueue(entry.queueId);
      if (queue && queue.currentLoad > 0) {
        await storage.updateTaskQueue(entry.queueId, { 
          currentLoad: queue.currentLoad - 1 
        });
      }
    }
  }

  // Task Scheduling
  async createSchedule(scheduleData: InsertTaskSchedule): Promise<TaskSchedule> {
    const schedule = await storage.createTaskSchedule(scheduleData);

    await storage.createLog({
      level: 'info',
      category: 'scheduler',
      message: `Task schedule '${schedule.name}' created`,
      data: { 
        scheduleId: schedule.id, 
        cronExpression: schedule.cronExpression,
        isActive: schedule.isActive 
      },
    });

    if (schedule.isActive) {
      await this.startScheduleChecker(schedule.id);
    }

    return schedule;
  }

  async updateSchedule(id: string, updates: Partial<TaskSchedule>): Promise<TaskSchedule> {
    const schedule = await storage.updateTaskSchedule(id, updates);

    if (updates.isActive === false) {
      await this.stopScheduleChecker(id);
    } else if (updates.isActive === true) {
      await this.startScheduleChecker(id);
    }

    await storage.createLog({
      level: 'info',
      category: 'scheduler',
      message: `Task schedule '${schedule.name}' updated`,
      data: { scheduleId: id, updates },
    });

    return schedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.stopScheduleChecker(id);
    await storage.deleteTaskSchedule(id);

    await storage.createLog({
      level: 'info',
      category: 'scheduler',
      message: `Task schedule deleted`,
      data: { scheduleId: id },
    });
  }

  async getAllSchedules(): Promise<TaskSchedule[]> {
    return await storage.getAllTaskSchedules();
  }

  async getActiveSchedules(): Promise<TaskSchedule[]> {
    return await storage.getActiveSchedules();
  }

  private async startScheduleChecker(scheduleId: string): Promise<void> {
    // Stop any existing checker
    await this.stopScheduleChecker(scheduleId);

    // Start checking every minute
    const interval = setInterval(async () => {
      try {
        await this.checkSchedule(scheduleId);
      } catch (error) {
        await storage.createLog({
          level: 'error',
          category: 'scheduler',
          message: `Schedule checker error: ${error}`,
          data: { scheduleId },
        });
      }
    }, 60000); // Check every minute

    this.scheduleCheckers.set(scheduleId, interval);
  }

  private async stopScheduleChecker(scheduleId: string): Promise<void> {
    if (this.scheduleCheckers.has(scheduleId)) {
      clearInterval(this.scheduleCheckers.get(scheduleId)!);
      this.scheduleCheckers.delete(scheduleId);
    }
  }

  private async checkSchedule(scheduleId: string): Promise<void> {
    const schedule = await storage.getTaskSchedule(scheduleId);
    if (!schedule || !schedule.isActive) {
      return;
    }

    const now = new Date();
    
    // Check if it's time to run
    if (schedule.nextRunAt && schedule.nextRunAt <= now) {
      await this.executeScheduledTask(schedule);
    }
  }

  private async executeScheduledTask(schedule: TaskSchedule): Promise<void> {
    try {
      // Create task from template
      const taskRequest: TaskCreationRequest = {
        ...(schedule.taskTemplate as any),
        metadata: {
          ...(schedule.taskTemplate as any)?.metadata,
          scheduleId: schedule.id,
          scheduledExecution: true,
          executionTime: new Date().toISOString(),
        }
      };

      const task = await taskService.createTask(taskRequest);

      // Update schedule stats
      await storage.updateTaskSchedule(schedule.id, {
        lastRunAt: new Date(),
        totalRuns: schedule.totalRuns + 1,
        nextRunAt: this.calculateNextRun(schedule),
      });

      await storage.createLog({
        level: 'info',
        category: 'scheduler',
        message: `Scheduled task '${task.title}' created and queued`,
        data: { 
          scheduleId: schedule.id, 
          taskId: task.id, 
          totalRuns: schedule.totalRuns + 1 
        },
      });

      // Auto-execute the task
      await taskService.executeTask({ taskId: task.id, autoStart: true });

    } catch (error) {
      // Update failure count
      await storage.updateTaskSchedule(schedule.id, {
        failureCount: schedule.failureCount + 1,
      });

      await storage.createLog({
        level: 'error',
        category: 'scheduler',
        message: `Scheduled task execution failed: ${error}`,
        data: { scheduleId: schedule.id },
      });
    }
  }

  private calculateNextRun(schedule: TaskSchedule): Date | null {
    // Simplified cron calculation - would need a proper cron parser for production
    // For now, just add 1 hour as a placeholder
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + 1);
    
    // Check max runs limit
    if (schedule.maxRuns && schedule.totalRuns >= schedule.maxRuns) {
      return null;
    }
    
    return nextRun;
  }

  // Queue Statistics
  async getQueueStatistics(queueId: string) {
    const entries = await storage.getQueueEntriesForQueue(queueId);
    
    const stats = {
      total: entries.length,
      queued: entries.filter(e => e.status === 'queued').length,
      running: entries.filter(e => e.status === 'running').length,
      completed: entries.filter(e => e.status === 'completed').length,
      failed: entries.filter(e => e.status === 'failed').length,
      avgWaitTime: 0,
      avgExecutionTime: 0,
    };

    // Calculate average times
    const completedEntries = entries.filter(e => e.status === 'completed');
    if (completedEntries.length > 0) {
      const waitTimes = completedEntries.map(e => 
        new Date(e.updatedAt).getTime() - new Date(e.createdAt).getTime()
      );
      stats.avgWaitTime = waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length;
    }

    return stats;
  }

  // Cleanup and initialization
  async startAllActiveQueues(): Promise<void> {
    const queues = await storage.getAllTaskQueues();
    const activeQueues = queues.filter(q => q.status === 'active');

    for (const queue of activeQueues) {
      await this.startQueueExecution(queue.id);
    }

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: `Started ${activeQueues.length} active queues`,
      data: { activeQueueCount: activeQueues.length },
    });
  }

  async startAllActiveSchedules(): Promise<void> {
    const schedules = await storage.getActiveSchedules();

    for (const schedule of schedules) {
      await this.startScheduleChecker(schedule.id);
    }

    await storage.createLog({
      level: 'info',
      category: 'scheduler',
      message: `Started ${schedules.length} active schedules`,
      data: { activeScheduleCount: schedules.length },
    });
  }

  async shutdown(): Promise<void> {
    // Stop all queue executions
    for (const [queueId, interval] of this.executionIntervals) {
      clearInterval(interval);
    }
    this.executionIntervals.clear();

    // Stop all schedule checkers
    for (const [scheduleId, interval] of this.scheduleCheckers) {
      clearInterval(interval);
    }
    this.scheduleCheckers.clear();

    await storage.createLog({
      level: 'info',
      category: 'queue',
      message: 'Task queue service shutdown completed',
      data: {},
    });
  }
}

export const taskQueueService = new TaskQueueService();