import { storage } from '../storage';
import type { RealtimeUpdate } from '@shared/schema';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  persistent: boolean;
  metadata?: any;
  actions?: Array<{
    label: string;
    action: string;
    variant?: 'default' | 'destructive' | 'outline';
  }>;
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string;
  condition: {
    event: string;
    filters?: Record<string, any>;
  };
  notification: {
    type: Notification['type'];
    title: string;
    message: string;
    persistent?: boolean;
    actions?: Notification['actions'];
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class NotificationService {
  private notifications: Map<string, Notification> = new Map();
  private rules: Map<string, NotificationRule> = new Map();
  private subscribers: Set<(notification: Notification) => void> = new Set();

  async initialize(): Promise<void> {
    // Initialize default notification rules
    await this.createDefaultRules();
  }

  private async createDefaultRules(): Promise<void> {
    const defaultRules: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Task Completion',
        description: 'Notify when a task is completed',
        condition: {
          event: 'task_update',
          filters: { status: 'completed' }
        },
        notification: {
          type: 'success',
          title: 'Task Completed',
          message: 'Task "{taskTitle}" has been completed successfully',
          persistent: false,
          actions: [
            { label: 'View Results', action: 'navigate:output', variant: 'default' },
            { label: 'Export', action: 'export:pdf', variant: 'outline' }
          ]
        },
        enabled: true
      },
      {
        name: 'Task Failure',
        description: 'Notify when a task fails',
        condition: {
          event: 'task_update',
          filters: { status: 'failed' }
        },
        notification: {
          type: 'error',
          title: 'Task Failed',
          message: 'Task "{taskTitle}" has failed to complete',
          persistent: true,
          actions: [
            { label: 'View Logs', action: 'navigate:logs', variant: 'default' },
            { label: 'Retry', action: 'retry:task', variant: 'outline' }
          ]
        },
        enabled: true
      },
      {
        name: 'Budget Alert',
        description: 'Notify when budget threshold is reached',
        condition: {
          event: 'budget_alert',
          filters: { threshold: 0.8 }
        },
        notification: {
          type: 'warning',
          title: 'Budget Alert',
          message: 'Budget usage is at {percentage}% of limit',
          persistent: true,
          actions: [
            { label: 'View Budget', action: 'navigate:budget', variant: 'default' },
            { label: 'Adjust Limits', action: 'modify:budget', variant: 'outline' }
          ]
        },
        enabled: true
      },
      {
        name: 'Agent Error',
        description: 'Notify when an agent encounters an error',
        condition: {
          event: 'agent_update',
          filters: { status: 'error' }
        },
        notification: {
          type: 'error',
          title: 'Agent Error',
          message: 'Agent "{agentName}" encountered an error',
          persistent: false,
          actions: [
            { label: 'Inspect Agent', action: 'navigate:inspector', variant: 'default' },
            { label: 'Restart', action: 'restart:agent', variant: 'outline' }
          ]
        },
        enabled: true
      },
      {
        name: 'High Token Usage',
        description: 'Notify when token usage is high',
        condition: {
          event: 'execution_update',
          filters: { tokensUsed: { gt: 10000 } }
        },
        notification: {
          type: 'warning',
          title: 'High Token Usage',
          message: 'Task is using high token count: {tokensUsed} tokens',
          persistent: false,
          actions: [
            { label: 'View Details', action: 'navigate:inspector', variant: 'default' }
          ]
        },
        enabled: true
      }
    ];

    for (const rule of defaultRules) {
      const id = this.generateId();
      const now = new Date();
      this.rules.set(id, {
        ...rule,
        id,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  // Process real-time updates and trigger notifications
  async processUpdate(update: RealtimeUpdate): Promise<void> {
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;

      if (this.matchesCondition(update, rule.condition)) {
        await this.createNotification(rule, update);
      }
    }
  }

  private matchesCondition(update: RealtimeUpdate, condition: NotificationRule['condition']): boolean {
    if (update.type !== condition.event) return false;

    if (!condition.filters) return true;

    for (const [key, expectedValue] of Object.entries(condition.filters)) {
      const actualValue = this.getNestedValue(update.data, key);

      if (typeof expectedValue === 'object' && expectedValue !== null) {
        // Handle comparison operators
        if ('gt' in expectedValue && !(actualValue > expectedValue.gt)) return false;
        if ('lt' in expectedValue && !(actualValue < expectedValue.lt)) return false;
        if ('gte' in expectedValue && !(actualValue >= expectedValue.gte)) return false;
        if ('lte' in expectedValue && !(actualValue <= expectedValue.lte)) return false;
        if ('eq' in expectedValue && actualValue !== expectedValue.eq) return false;
        if ('ne' in expectedValue && actualValue === expectedValue.ne) return false;
      } else {
        // Direct equality check
        if (actualValue !== expectedValue) return false;
      }
    }

    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async createNotification(rule: NotificationRule, update: RealtimeUpdate): Promise<void> {
    const id = this.generateId();
    
    // Template substitution in title and message
    const title = this.substituteTemplate(rule.notification.title, update.data);
    const message = this.substituteTemplate(rule.notification.message, update.data);

    const notification: Notification = {
      id,
      type: rule.notification.type,
      title,
      message,
      timestamp: new Date(),
      read: false,
      persistent: rule.notification.persistent || false,
      metadata: {
        ruleId: rule.id,
        updateType: update.type,
        updateData: update.data
      },
      actions: rule.notification.actions || []
    };

    this.notifications.set(id, notification);

    // Notify subscribers
    this.subscribers.forEach(callback => callback(notification));

    // Auto-remove non-persistent notifications after 10 seconds
    if (!notification.persistent) {
      setTimeout(() => {
        this.notifications.delete(id);
      }, 10000);
    }

    // Store in database for persistence
    try {
      await storage.insertSystemLog({
        level: 'info',
        category: 'notification',
        message: `Notification created: ${title}`,
        metadata: { notificationId: id, ruleId: rule.id },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to store notification log:', error);
    }
  }

  private substituteTemplate(template: string, data: any): string {
    return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, path) => {
      const value = this.getNestedValue(data, path);
      return value !== undefined ? String(value) : match;
    });
  }

  // Public API methods
  async getNotifications(options: { 
    unreadOnly?: boolean; 
    limit?: number; 
    offset?: number 
  } = {}): Promise<Notification[]> {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;
    
    let notifications = Array.from(this.notifications.values());
    
    if (unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    return notifications
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.read = true;
    return true;
  }

  async markAllAsRead(): Promise<number> {
    let count = 0;
    for (const notification of this.notifications.values()) {
      if (!notification.read) {
        notification.read = true;
        count++;
      }
    }
    return count;
  }

  async deleteNotification(notificationId: string): Promise<boolean> {
    return this.notifications.delete(notificationId);
  }

  async clearNotifications(options: { olderThan?: Date; readOnly?: boolean } = {}): Promise<number> {
    const { olderThan, readOnly = false } = options;
    let count = 0;

    for (const [id, notification] of this.notifications) {
      let shouldDelete = false;

      if (readOnly && notification.read) {
        shouldDelete = true;
      } else if (olderThan && notification.timestamp < olderThan) {
        shouldDelete = true;
      } else if (!readOnly && !olderThan) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        this.notifications.delete(id);
        count++;
      }
    }

    return count;
  }

  // Notification rules management
  async createRule(rule: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationRule> {
    const id = this.generateId();
    const now = new Date();
    
    const newRule: NotificationRule = {
      ...rule,
      id,
      createdAt: now,
      updatedAt: now
    };

    this.rules.set(id, newRule);
    return newRule;
  }

  async updateRule(ruleId: string, updates: Partial<Omit<NotificationRule, 'id' | 'createdAt'>>): Promise<NotificationRule | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date()
    };

    this.rules.set(ruleId, updatedRule);
    return updatedRule;
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    return this.rules.delete(ruleId);
  }

  async getRules(): Promise<NotificationRule[]> {
    return Array.from(this.rules.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRule(ruleId: string): Promise<NotificationRule | null> {
    return this.rules.get(ruleId) || null;
  }

  // Subscription management
  subscribe(callback: (notification: Notification) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Statistics
  async getNotificationStats(): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
    recentCount: number;
  }> {
    const notifications = Array.from(this.notifications.values());
    const unread = notifications.filter(n => !n.read);
    const recent = notifications.filter(n => 
      Date.now() - n.timestamp.getTime() < 24 * 60 * 60 * 1000 // last 24 hours
    );

    const byType = notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: notifications.length,
      unread: unread.length,
      byType,
      recentCount: recent.length
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

export const notificationService = new NotificationService();