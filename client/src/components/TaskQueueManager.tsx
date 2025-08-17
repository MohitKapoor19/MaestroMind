import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Badge } from '@components/ui/badge';
import { Switch } from '@components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { AlertCircle, Play, Pause, Trash2, Plus, Clock, CheckCircle, XCircle, RefreshCw, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface TaskQueue {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed';
  concurrency: number;
  retryLimit: number;
  retryDelay: number;
  cronExpression?: string;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  pendingTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
}

interface QueuedTask {
  id: string;
  queueId: string;
  taskId: string;
  title: string;
  description?: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  retryCount: number;
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: any;
}

export function TaskQueueManager() {
  const queryClient = useQueryClient();
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [showCreateQueue, setShowCreateQueue] = useState(false);
  const [newQueue, setNewQueue] = useState({
    name: '',
    description: '',
    concurrency: 5,
    retryLimit: 3,
    retryDelay: 5000,
    priority: 1,
    cronExpression: ''
  });

  // Fetch all queues
  const { data: queues = [], isLoading: queuesLoading } = useQuery<TaskQueue[]>({
    queryKey: ['taskQueues'],
    queryFn: async () => {
      const response = await fetch('/api/queues');
      if (!response.ok) throw new Error('Failed to fetch queues');
      return response.json();
    },
    refetchInterval: 5000 // Auto-refresh every 5 seconds
  });

  // Fetch tasks for selected queue
  const { data: queueTasks = [], isLoading: tasksLoading } = useQuery<QueuedTask[]>({
    queryKey: ['queueTasks', selectedQueue],
    queryFn: async () => {
      if (!selectedQueue) return [];
      const response = await fetch(`/api/queues/${selectedQueue}/tasks`);
      if (!response.ok) throw new Error('Failed to fetch queue tasks');
      return response.json();
    },
    enabled: !!selectedQueue,
    refetchInterval: 2000 // More frequent updates for task status
  });

  // Create queue mutation
  const createQueueMutation = useMutation({
    mutationFn: async (queue: typeof newQueue) => {
      const response = await fetch('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queue)
      });
      if (!response.ok) throw new Error('Failed to create queue');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskQueues'] });
      toast.success('Queue created successfully');
      setShowCreateQueue(false);
      setNewQueue({
        name: '',
        description: '',
        concurrency: 5,
        retryLimit: 3,
        retryDelay: 5000,
        priority: 1,
        cronExpression: ''
      });
    },
    onError: (error) => {
      toast.error(`Failed to create queue: ${error.message}`);
    }
  });

  // Activate/Deactivate queue mutation
  const toggleQueueMutation = useMutation({
    mutationFn: async ({ queueId, activate }: { queueId: string; activate: boolean }) => {
      const response = await fetch(`/api/queues/${queueId}/${activate ? 'activate' : 'deactivate'}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`Failed to ${activate ? 'activate' : 'deactivate'} queue`);
      return response.json();
    },
    onSuccess: (_, { activate }) => {
      queryClient.invalidateQueries({ queryKey: ['taskQueues'] });
      toast.success(`Queue ${activate ? 'activated' : 'deactivated'} successfully`);
    },
    onError: (error) => {
      toast.error(`Failed to toggle queue: ${error.message}`);
    }
  });

  // Execute queue mutation
  const executeQueueMutation = useMutation({
    mutationFn: async (queueId: string) => {
      const response = await fetch(`/api/queues/${queueId}/execute`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to execute queue');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskQueues'] });
      queryClient.invalidateQueries({ queryKey: ['queueTasks'] });
      toast.success('Queue execution started');
    },
    onError: (error) => {
      toast.error(`Failed to execute queue: ${error.message}`);
    }
  });

  // Delete queue mutation
  const deleteQueueMutation = useMutation({
    mutationFn: async (queueId: string) => {
      const response = await fetch(`/api/queues/${queueId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete queue');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskQueues'] });
      if (selectedQueue === queues.find(q => q.id === selectedQueue)?.id) {
        setSelectedQueue(null);
      }
      toast.success('Queue deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete queue: ${error.message}`);
    }
  });

  // Retry task mutation
  const retryTaskMutation = useMutation({
    mutationFn: async ({ queueId, taskId }: { queueId: string; taskId: string }) => {
      const response = await fetch(`/api/queues/${queueId}/tasks/${taskId}/retry`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to retry task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queueTasks'] });
      toast.success('Task retry initiated');
    },
    onError: (error) => {
      toast.error(`Failed to retry task: ${error.message}`);
    }
  });

  // Cancel task mutation
  const cancelTaskMutation = useMutation({
    mutationFn: async ({ queueId, taskId }: { queueId: string; taskId: string }) => {
      const response = await fetch(`/api/queues/${queueId}/tasks/${taskId}/cancel`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to cancel task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queueTasks'] });
      toast.success('Task cancelled');
    },
    onError: (error) => {
      toast.error(`Failed to cancel task: ${error.message}`);
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-blue-500';
      case 'paused':
      case 'pending':
        return 'bg-yellow-500';
      case 'failed':
        return 'bg-red-500';
      case 'cancelled':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      case 'processing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Task Queue Manager</h2>
        <Button onClick={() => setShowCreateQueue(!showCreateQueue)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Queue
        </Button>
      </div>

      {/* Create Queue Form */}
      {showCreateQueue && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Queue Name</Label>
                <Input
                  id="name"
                  value={newQueue.name}
                  onChange={(e) => setNewQueue({ ...newQueue, name: e.target.value })}
                  placeholder="Enter queue name"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={newQueue.description}
                  onChange={(e) => setNewQueue({ ...newQueue, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <Label htmlFor="concurrency">Concurrency</Label>
                <Input
                  id="concurrency"
                  type="number"
                  value={newQueue.concurrency}
                  onChange={(e) => setNewQueue({ ...newQueue, concurrency: parseInt(e.target.value) })}
                  min="1"
                  max="20"
                />
              </div>
              <div>
                <Label htmlFor="retryLimit">Retry Limit</Label>
                <Input
                  id="retryLimit"
                  type="number"
                  value={newQueue.retryLimit}
                  onChange={(e) => setNewQueue({ ...newQueue, retryLimit: parseInt(e.target.value) })}
                  min="0"
                  max="10"
                />
              </div>
              <div>
                <Label htmlFor="retryDelay">Retry Delay (ms)</Label>
                <Input
                  id="retryDelay"
                  type="number"
                  value={newQueue.retryDelay}
                  onChange={(e) => setNewQueue({ ...newQueue, retryDelay: parseInt(e.target.value) })}
                  min="1000"
                  step="1000"
                />
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={newQueue.priority}
                  onChange={(e) => setNewQueue({ ...newQueue, priority: parseInt(e.target.value) })}
                  min="1"
                  max="10"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="cronExpression">CRON Expression (Optional)</Label>
                <Input
                  id="cronExpression"
                  value={newQueue.cronExpression}
                  onChange={(e) => setNewQueue({ ...newQueue, cronExpression: e.target.value })}
                  placeholder="e.g., 0 */6 * * * (every 6 hours)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowCreateQueue(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createQueueMutation.mutate(newQueue)}
                disabled={!newQueue.name || createQueueMutation.isPending}
              >
                Create Queue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Queue List */}
        <div className="col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Queues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {queuesLoading ? (
                <div className="text-center py-4">Loading queues...</div>
              ) : queues.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No queues created yet
                </div>
              ) : (
                queues.map((queue) => (
                  <div
                    key={queue.id}
                    className={`p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedQueue === queue.id ? 'border-primary bg-muted/50' : ''
                    }`}
                    onClick={() => setSelectedQueue(queue.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{queue.name}</h3>
                          <Badge variant="outline" className={getStatusColor(queue.status)}>
                            {queue.status}
                          </Badge>
                        </div>
                        {queue.description && (
                          <p className="text-sm text-muted-foreground mt-1">{queue.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span>Pending: {queue.pendingTasks}</span>
                          <span>Processing: {queue.processingTasks}</span>
                          <span>Completed: {queue.completedTasks}</span>
                        </div>
                        {queue.cronExpression && (
                          <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>{queue.cronExpression}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Switch
                          checked={queue.isActive}
                          onCheckedChange={(checked) => 
                            toggleQueueMutation.mutate({ queueId: queue.id, activate: checked })
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            executeQueueMutation.mutate(queue.id);
                          }}
                          disabled={!queue.isActive || queue.pendingTasks === 0}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete queue "${queue.name}"?`)) {
                              deleteQueueMutation.mutate(queue.id);
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Queue Tasks */}
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedQueue ? `Tasks in Queue` : 'Select a Queue'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedQueue ? (
                <div className="text-center py-8 text-muted-foreground">
                  Select a queue to view its tasks
                </div>
              ) : tasksLoading ? (
                <div className="text-center py-8">Loading tasks...</div>
              ) : queueTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No tasks in this queue
                </div>
              ) : (
                <Tabs defaultValue="all">
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="processing">Processing</TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                    <TabsTrigger value="failed">Failed</TabsTrigger>
                  </TabsList>
                  
                  {['all', 'pending', 'processing', 'completed', 'failed'].map((status) => (
                    <TabsContent key={status} value={status} className="space-y-2">
                      {queueTasks
                        .filter(task => status === 'all' || task.status === status)
                        .map((task) => (
                          <div key={task.id} className="p-3 border rounded-lg">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(task.status)}
                                  <h4 className="font-medium">{task.title}</h4>
                                  <Badge variant="outline" className={getStatusColor(task.status)}>
                                    {task.status}
                                  </Badge>
                                  {task.priority > 1 && (
                                    <Badge variant="secondary">Priority: {task.priority}</Badge>
                                  )}
                                </div>
                                {task.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                  {task.scheduledFor && (
                                    <span>Scheduled: {new Date(task.scheduledFor).toLocaleString()}</span>
                                  )}
                                  {task.startedAt && (
                                    <span>Started: {new Date(task.startedAt).toLocaleString()}</span>
                                  )}
                                  {task.completedAt && (
                                    <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>
                                  )}
                                  {task.retryCount > 0 && (
                                    <span>Retries: {task.retryCount}</span>
                                  )}
                                </div>
                                {task.error && (
                                  <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-950 rounded">
                                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                                    <p className="text-sm text-red-700 dark:text-red-300">{task.error}</p>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1">
                                {task.status === 'failed' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => retryTaskMutation.mutate({ 
                                      queueId: selectedQueue!, 
                                      taskId: task.id 
                                    })}
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </Button>
                                )}
                                {(task.status === 'pending' || task.status === 'processing') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => cancelTaskMutation.mutate({ 
                                      queueId: selectedQueue!, 
                                      taskId: task.id 
                                    })}
                                  >
                                    <XCircle className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}