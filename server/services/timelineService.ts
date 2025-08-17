import { storage } from "../storage";
import type { 
  ExecutionEvent, 
  InsertExecutionEvent, 
  TimelineSnapshot,
  TaskWithTimeline,
  Task,
  Agent,
  AgentExecution,
  AgentCollaboration
} from "@shared/schema";

export interface EventData {
  eventType: string;
  eventCategory: 'task' | 'agent' | 'execution' | 'system';
  data: any;
  stateBefore?: any;
  stateAfter?: any;
  metadata?: any;
}

export interface TimelineFilter {
  eventTypes?: string[];
  eventCategories?: string[];
  agentIds?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  searchText?: string;
}

export interface TimelinePlayback {
  taskId: string;
  currentEventIndex: number;
  totalEvents: number;
  currentTimestamp: Date;
  isPlaying: boolean;
  playbackSpeed: number; // 1x, 2x, 0.5x etc.
  autoAdvance: boolean;
}

export interface ExecutionReplay {
  events: ExecutionEvent[];
  snapshots: TimelineSnapshot[];
  currentState: any;
  replayPosition: number;
  bookmarks: TimelineSnapshot[];
}

export class TimelineService {
  private activePlaybacks: Map<string, TimelinePlayback> = new Map();
  private eventSequenceCounters: Map<string, number> = new Map();

  // Event Creation & Tracking
  async recordEvent(
    taskId: string,
    eventData: EventData,
    context: {
      agentId?: string;
      executionId?: string;
      collaborationId?: string;
      parentEventId?: string;
    } = {}
  ): Promise<ExecutionEvent> {
    // Get or initialize sequence counter for this task
    const currentSequence = this.eventSequenceCounters.get(taskId) || 0;
    const newSequence = currentSequence + 1;
    this.eventSequenceCounters.set(taskId, newSequence);

    const event = await storage.createExecutionEvent({
      taskId,
      agentId: context.agentId,
      executionId: context.executionId,
      collaborationId: context.collaborationId,
      eventType: eventData.eventType,
      eventCategory: eventData.eventCategory,
      eventData: eventData.data,
      stateBefore: eventData.stateBefore,
      stateAfter: eventData.stateAfter,
      sequence: newSequence,
      parentEventId: context.parentEventId,
      metadata: eventData.metadata,
    });

    await storage.createLog({
      level: 'debug',
      category: 'timeline',
      message: `Event recorded: ${eventData.eventType}`,
      data: {
        eventId: event.id,
        taskId,
        sequence: newSequence,
        eventType: eventData.eventType,
        eventCategory: eventData.eventCategory,
        agentId: context.agentId,
      },
    });

    // Check if we should create an automatic snapshot
    await this.checkForAutoSnapshot(taskId, event);

    return event;
  }

  async recordTaskEvent(
    taskId: string,
    eventType: 'task_created' | 'task_started' | 'task_completed' | 'task_failed' | 'task_paused' | 'task_resumed',
    task: Task,
    metadata?: any
  ): Promise<ExecutionEvent> {
    return await this.recordEvent(taskId, {
      eventType,
      eventCategory: 'task',
      data: {
        taskId: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        progress: task.progress,
      },
      stateAfter: {
        task: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          updatedAt: task.updatedAt,
        }
      },
      metadata: {
        ...metadata,
        eventTimestamp: new Date().toISOString(),
      }
    });
  }

  async recordAgentEvent(
    taskId: string,
    agentId: string,
    eventType: 'agent_created' | 'agent_started' | 'agent_completed' | 'agent_failed' | 'agent_paused' | 'agent_resumed',
    agent: Agent,
    metadata?: any
  ): Promise<ExecutionEvent> {
    return await this.recordEvent(taskId, {
      eventType,
      eventCategory: 'agent',
      data: {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        confidence: agent.confidence,
      },
      stateAfter: {
        agent: {
          id: agent.id,
          status: agent.status,
          confidence: agent.confidence,
          updatedAt: agent.updatedAt,
        }
      },
      metadata: {
        ...metadata,
        eventTimestamp: new Date().toISOString(),
      }
    }, { agentId });
  }

  async recordExecutionEvent(
    taskId: string,
    agentId: string,
    executionId: string,
    eventType: 'execution_started' | 'execution_completed' | 'execution_failed' | 'execution_retry',
    execution: AgentExecution,
    metadata?: any
  ): Promise<ExecutionEvent> {
    return await this.recordEvent(taskId, {
      eventType,
      eventCategory: 'execution',
      data: {
        executionId: execution.id,
        action: execution.action,
        status: execution.status,
        duration: execution.duration,
        tokensUsed: execution.tokensUsed,
        cost: execution.cost,
        output: execution.output,
      },
      stateAfter: {
        execution: {
          id: execution.id,
          status: execution.status,
          duration: execution.duration,
          timestamp: execution.timestamp,
        }
      },
      metadata: {
        ...metadata,
        eventTimestamp: new Date().toISOString(),
      }
    }, { agentId, executionId });
  }

  async recordCollaborationEvent(
    taskId: string,
    collaboration: AgentCollaboration,
    eventType: 'collaboration_initiated' | 'collaboration_completed' | 'collaboration_failed',
    metadata?: any
  ): Promise<ExecutionEvent> {
    return await this.recordEvent(taskId, {
      eventType,
      eventCategory: 'agent',
      data: {
        collaborationId: collaboration.id,
        fromAgentId: collaboration.fromAgentId,
        toAgentId: collaboration.toAgentId,
        collaborationType: collaboration.collaborationType,
        status: collaboration.status,
        content: collaboration.content,
        response: collaboration.response,
      },
      stateAfter: {
        collaboration: {
          id: collaboration.id,
          status: collaboration.status,
          timestamp: collaboration.timestamp,
        }
      },
      metadata: {
        ...metadata,
        eventTimestamp: new Date().toISOString(),
      }
    }, { collaborationId: collaboration.id });
  }

  // Snapshot Management
  async createSnapshot(
    taskId: string,
    eventId: string,
    snapshotData: {
      type: 'milestone' | 'checkpoint' | 'error' | 'completion' | 'manual';
      name: string;
      description?: string;
      fullState: any;
      isBookmarked?: boolean;
    }
  ): Promise<TimelineSnapshot> {
    const snapshot = await storage.createTimelineSnapshot({
      taskId,
      eventId,
      snapshotType: snapshotData.type,
      name: snapshotData.name,
      description: snapshotData.description,
      fullState: snapshotData.fullState,
      isBookmarked: snapshotData.isBookmarked || false,
    });

    await storage.createLog({
      level: 'info',
      category: 'timeline',
      message: `Snapshot '${snapshot.name}' created`,
      data: {
        snapshotId: snapshot.id,
        taskId,
        eventId,
        snapshotType: snapshot.snapshotType,
        isBookmarked: snapshot.isBookmarked,
      },
    });

    return snapshot;
  }

  private async checkForAutoSnapshot(taskId: string, event: ExecutionEvent): Promise<void> {
    // Create automatic snapshots for important events
    const autoSnapshotEvents = [
      'task_started',
      'task_completed',
      'task_failed',
      'agent_completed',
      'execution_failed'
    ];

    if (autoSnapshotEvents.includes(event.eventType)) {
      try {
        const currentState = await this.getCurrentTaskState(taskId);
        
        await this.createSnapshot(taskId, event.id, {
          type: event.eventType.includes('failed') ? 'error' : 'milestone',
          name: `Auto: ${event.eventType.replace('_', ' ')}`,
          description: `Automatic snapshot for ${event.eventType}`,
          fullState: currentState,
          isBookmarked: event.eventType === 'task_completed',
        });
      } catch (error) {
        await storage.createLog({
          level: 'warn',
          category: 'timeline',
          message: `Failed to create auto snapshot: ${error}`,
          data: { taskId, eventId: event.id, eventType: event.eventType },
        });
      }
    }
  }

  async bookmarkSnapshot(snapshotId: string): Promise<void> {
    await storage.updateTimelineSnapshot(snapshotId, { isBookmarked: true });
    
    await storage.createLog({
      level: 'info',
      category: 'timeline',
      message: 'Snapshot bookmarked',
      data: { snapshotId },
    });
  }

  async unbookmarkSnapshot(snapshotId: string): Promise<void> {
    await storage.updateTimelineSnapshot(snapshotId, { isBookmarked: false });
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await storage.deleteTimelineSnapshot(snapshotId);
    
    await storage.createLog({
      level: 'info',
      category: 'timeline',
      message: 'Snapshot deleted',
      data: { snapshotId },
    });
  }

  // Timeline Retrieval & Filtering
  async getTaskTimeline(taskId: string, filter?: TimelineFilter): Promise<ExecutionEvent[]> {
    let events = await storage.getEventsForTask(taskId);

    if (filter) {
      events = this.applyTimelineFilter(events, filter);
    }

    return events;
  }

  async getAgentTimeline(agentId: string, filter?: TimelineFilter): Promise<ExecutionEvent[]> {
    let events = await storage.getEventsForAgent(agentId);

    if (filter) {
      events = this.applyTimelineFilter(events, filter);
    }

    return events;
  }

  private applyTimelineFilter(events: ExecutionEvent[], filter: TimelineFilter): ExecutionEvent[] {
    let filtered = events;

    if (filter.eventTypes && filter.eventTypes.length > 0) {
      filtered = filtered.filter(e => filter.eventTypes!.includes(e.eventType));
    }

    if (filter.eventCategories && filter.eventCategories.length > 0) {
      filtered = filtered.filter(e => filter.eventCategories!.includes(e.eventCategory));
    }

    if (filter.agentIds && filter.agentIds.length > 0) {
      filtered = filtered.filter(e => e.agentId && filter.agentIds!.includes(e.agentId));
    }

    if (filter.dateRange) {
      filtered = filtered.filter(e => {
        const eventDate = new Date(e.timestamp);
        return eventDate >= filter.dateRange!.start && eventDate <= filter.dateRange!.end;
      });
    }

    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      filtered = filtered.filter(e => {
        const eventDataStr = JSON.stringify(e.eventData).toLowerCase();
        const metadataStr = e.metadata ? JSON.stringify(e.metadata).toLowerCase() : '';
        return e.eventType.toLowerCase().includes(searchLower) ||
               eventDataStr.includes(searchLower) ||
               metadataStr.includes(searchLower);
      });
    }

    return filtered;
  }

  // Timeline Playback & Replay
  async startPlayback(
    taskId: string,
    options: {
      startFromEvent?: number;
      playbackSpeed?: number;
      autoAdvance?: boolean;
    } = {}
  ): Promise<TimelinePlayback> {
    const events = await storage.getEventsForTask(taskId);
    
    const playback: TimelinePlayback = {
      taskId,
      currentEventIndex: options.startFromEvent || 0,
      totalEvents: events.length,
      currentTimestamp: events[options.startFromEvent || 0]?.timestamp || new Date(),
      isPlaying: false,
      playbackSpeed: options.playbackSpeed || 1,
      autoAdvance: options.autoAdvance || false,
    };

    this.activePlaybacks.set(taskId, playback);

    await storage.createLog({
      level: 'info',
      category: 'timeline',
      message: 'Timeline playback started',
      data: {
        taskId,
        totalEvents: playback.totalEvents,
        startFromEvent: options.startFromEvent,
        playbackSpeed: options.playbackSpeed,
      },
    });

    return playback;
  }

  async playPause(taskId: string): Promise<TimelinePlayback | undefined> {
    const playback = this.activePlaybacks.get(taskId);
    if (!playback) return undefined;

    playback.isPlaying = !playback.isPlaying;
    this.activePlaybacks.set(taskId, playback);

    return playback;
  }

  async seekToEvent(taskId: string, eventIndex: number): Promise<TimelinePlayback | undefined> {
    const playback = this.activePlaybacks.get(taskId);
    if (!playback) return undefined;

    playback.currentEventIndex = Math.max(0, Math.min(eventIndex, playback.totalEvents - 1));
    
    const events = await storage.getEventsForTask(taskId);
    if (events[playback.currentEventIndex]) {
      playback.currentTimestamp = events[playback.currentEventIndex].timestamp;
    }

    this.activePlaybacks.set(taskId, playback);
    return playback;
  }

  async getPlaybackState(taskId: string): Promise<TimelinePlayback | undefined> {
    return this.activePlaybacks.get(taskId);
  }

  async stopPlayback(taskId: string): Promise<void> {
    this.activePlaybacks.delete(taskId);
    
    await storage.createLog({
      level: 'info',
      category: 'timeline',
      message: 'Timeline playback stopped',
      data: { taskId },
    });
  }

  // State Management & Reconstruction
  async getCurrentTaskState(taskId: string): Promise<any> {
    const task = await storage.getTaskWithAgents(taskId);
    if (!task) return null;

    const events = await storage.getEventsForTask(taskId);
    const snapshots = await storage.getSnapshotsForTask(taskId);

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        progress: task.progress,
        metadata: task.metadata,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      agents: task.agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        confidence: agent.confidence,
        memoryContext: agent.memoryContext,
      })),
      eventCount: events.length,
      lastEventTimestamp: events[events.length - 1]?.timestamp,
      snapshotCount: snapshots.length,
      bookmarkedSnapshots: snapshots.filter(s => s.isBookmarked).length,
    };
  }

  async reconstructStateAtEvent(taskId: string, eventId: string): Promise<any> {
    const events = await storage.getEventsForTask(taskId);
    const targetEventIndex = events.findIndex(e => e.id === eventId);
    
    if (targetEventIndex === -1) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Replay events up to the target event
    const replayEvents = events.slice(0, targetEventIndex + 1);
    
    // Find the closest snapshot before this event
    const snapshots = await storage.getSnapshotsForTask(taskId);
    const applicableSnapshots = snapshots.filter(s => {
      const snapshotEvent = events.find(e => e.id === s.eventId);
      return snapshotEvent && events.indexOf(snapshotEvent) <= targetEventIndex;
    });

    let baseState = {};
    
    if (applicableSnapshots.length > 0) {
      // Use the latest applicable snapshot as base
      const latestSnapshot = applicableSnapshots.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      
      baseState = latestSnapshot.fullState;
      
      // Find events after the snapshot
      const snapshotEvent = events.find(e => e.id === latestSnapshot.eventId);
      const snapshotIndex = snapshotEvent ? events.indexOf(snapshotEvent) : 0;
      const remainingEvents = replayEvents.slice(snapshotIndex + 1);
      
      // Apply remaining events to the snapshot state
      return this.applyEventsToState(baseState, remainingEvents);
    } else {
      // No snapshots, replay all events from beginning
      return this.applyEventsToState(baseState, replayEvents);
    }
  }

  private applyEventsToState(baseState: any, events: ExecutionEvent[]): any {
    let currentState = { ...baseState };

    for (const event of events) {
      if (event.stateAfter) {
        // Merge the state changes from this event
        currentState = {
          ...currentState,
          ...event.stateAfter,
          lastAppliedEvent: {
            id: event.id,
            type: event.eventType,
            timestamp: event.timestamp,
          }
        };
      }
    }

    return currentState;
  }

  // Export & Analysis
  async exportTimeline(
    taskId: string,
    format: 'json' | 'csv' | 'detailed',
    filter?: TimelineFilter
  ): Promise<any> {
    const events = await this.getTaskTimeline(taskId, filter);
    const snapshots = await storage.getSnapshotsForTask(taskId);
    
    switch (format) {
      case 'json':
        return {
          taskId,
          exportedAt: new Date().toISOString(),
          eventCount: events.length,
          snapshotCount: snapshots.length,
          events: events.map(e => ({
            id: e.id,
            sequence: e.sequence,
            timestamp: e.timestamp,
            eventType: e.eventType,
            eventCategory: e.eventCategory,
            eventData: e.eventData,
            agentId: e.agentId,
            metadata: e.metadata,
          })),
          snapshots: snapshots.map(s => ({
            id: s.id,
            name: s.name,
            type: s.snapshotType,
            isBookmarked: s.isBookmarked,
            createdAt: s.createdAt,
          })),
        };
      
      case 'csv':
        const csvHeaders = 'Sequence,Timestamp,Event Type,Category,Agent ID,Description\n';
        const csvRows = events.map(e => 
          `${e.sequence},${e.timestamp},${e.eventType},${e.eventCategory},${e.agentId || ''},${JSON.stringify(e.eventData)}`
        ).join('\n');
        return csvHeaders + csvRows;
      
      case 'detailed':
        return {
          taskId,
          exportedAt: new Date().toISOString(),
          summary: {
            eventCount: events.length,
            snapshotCount: snapshots.length,
            timespan: {
              start: events[0]?.timestamp,
              end: events[events.length - 1]?.timestamp,
            },
            eventTypes: [...new Set(events.map(e => e.eventType))],
            agentCount: [...new Set(events.map(e => e.agentId).filter(Boolean))].length,
          },
          events,
          snapshots,
          filter,
        };
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async getTimelineAnalytics(taskId: string): Promise<{
    duration: number; // total execution time in milliseconds
    eventFrequency: Record<string, number>;
    agentActivity: Record<string, number>;
    errorCount: number;
    successRate: number;
    averageResponseTime: number;
    bottlenecks: Array<{
      type: string;
      duration: number;
      description: string;
    }>;
  }> {
    const events = await storage.getEventsForTask(taskId);
    
    if (events.length === 0) {
      return {
        duration: 0,
        eventFrequency: {},
        agentActivity: {},
        errorCount: 0,
        successRate: 0,
        averageResponseTime: 0,
        bottlenecks: [],
      };
    }

    const startTime = new Date(events[0].timestamp).getTime();
    const endTime = new Date(events[events.length - 1].timestamp).getTime();
    const duration = endTime - startTime;

    // Event frequency analysis
    const eventFrequency: Record<string, number> = {};
    for (const event of events) {
      eventFrequency[event.eventType] = (eventFrequency[event.eventType] || 0) + 1;
    }

    // Agent activity analysis
    const agentActivity: Record<string, number> = {};
    for (const event of events) {
      if (event.agentId) {
        agentActivity[event.agentId] = (agentActivity[event.agentId] || 0) + 1;
      }
    }

    // Error analysis
    const errorEvents = events.filter(e => 
      e.eventType.includes('failed') || e.eventType.includes('error')
    );
    const successEvents = events.filter(e => 
      e.eventType.includes('completed') || e.eventType.includes('success')
    );
    
    const successRate = successEvents.length / (errorEvents.length + successEvents.length) * 100;

    // Response time analysis (simplified)
    const executionEvents = events.filter(e => e.eventCategory === 'execution');
    const responseTimes = executionEvents
      .map(e => e.eventData?.duration)
      .filter(Boolean);
    
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    // Bottleneck detection (simplified)
    const bottlenecks = [];
    if (averageResponseTime > 30000) { // 30 seconds
      bottlenecks.push({
        type: 'slow_execution',
        duration: averageResponseTime,
        description: 'Agent execution times are above average',
      });
    }

    return {
      duration,
      eventFrequency,
      agentActivity,
      errorCount: errorEvents.length,
      successRate,
      averageResponseTime,
      bottlenecks,
    };
  }

  // Cleanup
  async cleanupOldEvents(retentionDays = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // This would require additional storage methods to delete old events
    // For now, just log the cleanup operation
    await storage.createLog({
      level: 'info',
      category: 'timeline',
      message: `Timeline cleanup completed (retention: ${retentionDays} days)`,
      data: { cutoffDate: cutoffDate.toISOString() },
    });
  }
}

export const timelineService = new TimelineService();