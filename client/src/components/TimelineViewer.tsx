import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Badge } from '@components/ui/badge';
import { Slider } from '@components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { 
  Play, Pause, SkipBack, SkipForward, RotateCcw,
  Calendar, Clock, Search, Filter, Download,
  CheckCircle, XCircle, AlertTriangle, Info,
  Bookmark, Activity, Zap, Users, FileText,
  ChevronLeft, ChevronRight, Eye, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface TimelineEvent {
  id: string;
  type: 'task_created' | 'task_started' | 'task_completed' | 'task_failed' |
        'agent_created' | 'agent_started' | 'agent_completed' | 'agent_failed' |
        'execution_started' | 'execution_completed' | 'execution_failed' |
        'collaboration_initiated' | 'collaboration_completed' |
        'plan_created' | 'plan_updated' | 'plan_approved';
  title: string;
  description: string;
  taskId?: string;
  agentId?: string;
  executionId?: string;
  timestamp: Date;
  duration?: number;
  metadata: any;
  severity: 'info' | 'success' | 'warning' | 'error';
  category: string;
}

interface TimelineSnapshot {
  id: string;
  name: string;
  description: string;
  timestamp: Date;
  taskId: string;
  state: any;
  isAutomatic: boolean;
  metadata: any;
}

interface TimelineFilter {
  eventTypes: string[];
  severities: string[];
  categories: string[];
  taskIds: string[];
  agentIds: string[];
  dateRange: {
    start?: Date;
    end?: Date;
  };
}

interface PlaybackState {
  isPlaying: boolean;
  currentEventIndex: number;
  speed: number;
  totalEvents: number;
  currentTime: Date;
  startTime: Date;
  endTime: Date;
}

export function TimelineViewer() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentEventIndex: 0,
    speed: 1,
    totalEvents: 0,
    currentTime: new Date(),
    startTime: new Date(),
    endTime: new Date()
  });
  const [filters, setFilters] = useState<TimelineFilter>({
    eventTypes: [],
    severities: [],
    categories: [],
    taskIds: [],
    agentIds: [],
    dateRange: {}
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

  // Fetch tasks for timeline selection
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await fetch('/api/tasks');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    }
  });

  // Fetch timeline events
  const { data: events = [], isLoading: eventsLoading } = useQuery<TimelineEvent[]>({
    queryKey: ['timeline', selectedTaskId, filters],
    queryFn: async () => {
      if (!selectedTaskId) return [];
      
      const params = new URLSearchParams();
      params.append('taskId', selectedTaskId);
      
      if (filters.eventTypes.length > 0) {
        params.append('eventTypes', filters.eventTypes.join(','));
      }
      if (filters.severities.length > 0) {
        params.append('severities', filters.severities.join(','));
      }
      if (filters.categories.length > 0) {
        params.append('categories', filters.categories.join(','));
      }
      if (filters.dateRange.start) {
        params.append('startDate', filters.dateRange.start.toISOString());
      }
      if (filters.dateRange.end) {
        params.append('endDate', filters.dateRange.end.toISOString());
      }

      const response = await fetch(`/api/timeline/events?${params}`);
      if (!response.ok) throw new Error('Failed to fetch timeline events');
      return response.json();
    },
    enabled: !!selectedTaskId
  });

  // Fetch snapshots
  const { data: snapshots = [] } = useQuery<TimelineSnapshot[]>({
    queryKey: ['timeline', 'snapshots', selectedTaskId],
    queryFn: async () => {
      if (!selectedTaskId) return [];
      
      const response = await fetch(`/api/timeline/snapshots?taskId=${selectedTaskId}`);
      if (!response.ok) throw new Error('Failed to fetch snapshots');
      return response.json();
    },
    enabled: !!selectedTaskId
  });

  // Create snapshot mutation
  const createSnapshotMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const response = await fetch('/api/timeline/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          taskId: selectedTaskId,
          eventIndex: playbackState.currentEventIndex
        })
      });
      if (!response.ok) throw new Error('Failed to create snapshot');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', 'snapshots'] });
      toast.success('Snapshot created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create snapshot: ${error.message}`);
    }
  });

  // Restore snapshot mutation
  const restoreSnapshotMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const response = await fetch(`/api/timeline/snapshots/${snapshotId}/restore`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to restore snapshot');
      return response.json();
    },
    onSuccess: (data) => {
      setPlaybackState(prev => ({
        ...prev,
        currentEventIndex: data.eventIndex,
        currentTime: new Date(data.timestamp)
      }));
      toast.success('Snapshot restored successfully');
    },
    onError: (error) => {
      toast.error(`Failed to restore snapshot: ${error.message}`);
    }
  });

  // Export timeline mutation
  const exportTimelineMutation = useMutation({
    mutationFn: async (format: 'json' | 'csv') => {
      const params = new URLSearchParams();
      params.append('taskId', selectedTaskId);
      params.append('format', format);
      
      const response = await fetch(`/api/timeline/export?${params}`);
      if (!response.ok) throw new Error('Failed to export timeline');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline-${selectedTaskId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('Timeline exported successfully');
    },
    onError: (error) => {
      toast.error(`Failed to export timeline: ${error.message}`);
    }
  });

  // Initialize playback state when events change
  useEffect(() => {
    if (events.length > 0) {
      const sortedEvents = [...events].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      setPlaybackState(prev => ({
        ...prev,
        totalEvents: sortedEvents.length,
        startTime: new Date(sortedEvents[0].timestamp),
        endTime: new Date(sortedEvents[sortedEvents.length - 1].timestamp),
        currentTime: new Date(sortedEvents[0].timestamp)
      }));
    }
  }, [events]);

  // Playback control
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (playbackState.isPlaying && playbackState.currentEventIndex < playbackState.totalEvents - 1) {
      interval = setInterval(() => {
        setPlaybackState(prev => {
          const nextIndex = Math.min(prev.currentEventIndex + 1, prev.totalEvents - 1);
          const nextEvent = events[nextIndex];
          
          return {
            ...prev,
            currentEventIndex: nextIndex,
            currentTime: nextEvent ? new Date(nextEvent.timestamp) : prev.currentTime,
            isPlaying: nextIndex < prev.totalEvents - 1
          };
        });
      }, 1000 / playbackState.speed);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [playbackState.isPlaying, playbackState.speed, playbackState.currentEventIndex, events]);

  const handlePlayPause = () => {
    setPlaybackState(prev => ({
      ...prev,
      isPlaying: !prev.isPlaying
    }));
  };

  const handleSeek = (index: number) => {
    const event = events[index];
    setPlaybackState(prev => ({
      ...prev,
      currentEventIndex: index,
      currentTime: event ? new Date(event.timestamp) : prev.currentTime,
      isPlaying: false
    }));
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackState(prev => ({
      ...prev,
      speed
    }));
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_created':
      case 'task_started':
        return <FileText className="w-4 h-4" />;
      case 'task_completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'task_failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'agent_created':
      case 'agent_started':
        return <Users className="w-4 h-4" />;
      case 'agent_completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'agent_failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'execution_started':
        return <Play className="w-4 h-4" />;
      case 'execution_completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'execution_failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'collaboration_initiated':
      case 'collaboration_completed':
        return <Users className="w-4 h-4" />;
      case 'plan_created':
      case 'plan_updated':
      case 'plan_approved':
        return <BarChart3 className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'success':
        return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'warning':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950';
      case 'error':
        return 'border-red-500 bg-red-50 dark:bg-red-950';
      default:
        return 'border-blue-500 bg-blue-50 dark:bg-blue-950';
    }
  };

  const visibleEvents = events.slice(0, playbackState.currentEventIndex + 1);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Timeline Viewer</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          {selectedTaskId && (
            <Button
              variant="outline"
              onClick={() => exportTimelineMutation.mutate('json')}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Task Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Task</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a task to view its timeline" />
            </SelectTrigger>
            <SelectContent>
              {tasks.map((task: any) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title} - {format(new Date(task.createdAt), 'MMM dd, yyyy')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>Event Types</Label>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {['task_created', 'agent_created', 'execution_started', 'collaboration_initiated'].map(type => (
                  <label key={type} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.eventTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            eventTypes: [...prev.eventTypes, type]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            eventTypes: prev.eventTypes.filter(t => t !== type)
                          }));
                        }
                      }}
                    />
                    <span className="text-sm">{type.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Severities</Label>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {['info', 'success', 'warning', 'error'].map(severity => (
                  <label key={severity} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.severities.includes(severity)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            severities: [...prev.severities, severity]
                          }));
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            severities: prev.severities.filter(s => s !== severity)
                          }));
                        }
                      }}
                    />
                    <span className="text-sm capitalize">{severity}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Date Range</Label>
              <div className="space-y-2 mt-2">
                <Input
                  type="date"
                  value={filters.dateRange.start ? format(filters.dateRange.start, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: {
                      ...prev.dateRange,
                      start: e.target.value ? new Date(e.target.value) : undefined
                    }
                  }))}
                />
                <Input
                  type="date"
                  value={filters.dateRange.end ? format(filters.dateRange.end, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dateRange: {
                      ...prev.dateRange,
                      end: e.target.value ? new Date(e.target.value) : undefined
                    }
                  }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedTaskId && (
        <>
          {/* Playback Controls */}
          <Card>
            <CardContent className="py-4">
              <div className="space-y-4">
                {/* Timeline Scrubber */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{format(playbackState.startTime, 'MMM dd, yyyy HH:mm')}</span>
                    <span>Event {playbackState.currentEventIndex + 1} of {playbackState.totalEvents}</span>
                    <span>{format(playbackState.endTime, 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                  <Slider
                    value={[playbackState.currentEventIndex]}
                    onValueChange={([value]) => handleSeek(value)}
                    max={Math.max(0, playbackState.totalEvents - 1)}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-center text-sm text-muted-foreground">
                    Current: {format(playbackState.currentTime, 'MMM dd, yyyy HH:mm:ss')}
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSeek(0)}
                    disabled={playbackState.currentEventIndex === 0}
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSeek(Math.max(0, playbackState.currentEventIndex - 1))}
                    disabled={playbackState.currentEventIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button onClick={handlePlayPause}>
                    {playbackState.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSeek(Math.min(playbackState.totalEvents - 1, playbackState.currentEventIndex + 1))}
                    disabled={playbackState.currentEventIndex >= playbackState.totalEvents - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSeek(playbackState.totalEvents - 1)}
                    disabled={playbackState.currentEventIndex >= playbackState.totalEvents - 1}
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>

                {/* Speed Control */}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm">Speed:</span>
                  {[0.5, 1, 2, 4].map(speed => (
                    <Button
                      key={speed}
                      size="sm"
                      variant={playbackState.speed === speed ? "default" : "outline"}
                      onClick={() => handleSpeedChange(speed)}
                    >
                      {speed}x
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="grid grid-cols-3 gap-6">
            {/* Timeline Events */}
            <div className="col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Timeline Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {eventsLoading ? (
                      <div className="text-center py-8">Loading timeline...</div>
                    ) : visibleEvents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No events to display
                      </div>
                    ) : (
                      visibleEvents.map((event, index) => (
                        <div
                          key={event.id}
                          className={`p-3 border rounded-lg transition-all ${
                            index === playbackState.currentEventIndex
                              ? 'ring-2 ring-primary'
                              : ''
                          } ${getSeverityColor(event.severity)}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-1">
                              {getEventIcon(event.type)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium">{event.title}</h4>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {event.category}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(event.timestamp), 'HH:mm:ss')}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {event.description}
                              </p>
                              {event.duration && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span>Duration: {event.duration}ms</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Snapshots */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Snapshots</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        const name = prompt('Snapshot name:');
                        const description = prompt('Description (optional):');
                        if (name) {
                          createSnapshotMutation.mutate({ name, description: description || '' });
                        }
                      }}
                    >
                      <Bookmark className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {snapshots.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        No snapshots saved
                      </div>
                    ) : (
                      snapshots.map((snapshot) => (
                        <div
                          key={snapshot.id}
                          className="p-2 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => restoreSnapshotMutation.mutate(snapshot.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h5 className="text-sm font-medium">{snapshot.name}</h5>
                              {snapshot.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {snapshot.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(snapshot.timestamp), 'MMM dd, HH:mm')}
                                </span>
                                {snapshot.isAutomatic && (
                                  <Badge variant="secondary" className="text-xs">
                                    Auto
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant="ghost">
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}