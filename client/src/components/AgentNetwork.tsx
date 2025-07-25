import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTasks, useTaskStatus, useExecuteTask } from '@/hooks/useTasks';
import { useAgents } from '@/hooks/useAgents';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut, Eye, Users, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RealtimeUpdate } from '@/lib/types';

interface AgentNetworkProps {
  selectedTaskId: string | null;
  onAgentSelect: (agentId: string) => void;
  onTaskSelect: (taskId: string) => void;
}

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: string;
  confidence?: number;
  x: number;
  y: number;
}

export default function AgentNetwork({ selectedTaskId, onAgentSelect, onTaskSelect }: AgentNetworkProps) {
  const [zoom, setZoom] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentNodes, setAgentNodes] = useState<AgentNode[]>([]);

  const { data: tasks } = useTasks();
  const { data: taskStatus } = useTaskStatus(selectedTaskId || '');
  const { data: agents } = useAgents(selectedTaskId || '');
  const executeTaskMutation = useExecuteTask();

  // WebSocket for real-time updates
  useWebSocket({
    onMessage: (update: RealtimeUpdate) => {
      if (update.type === 'agent_update' || update.type === 'task_update') {
        // Handle real-time agent status updates
        console.log('Real-time update:', update);
      }
    },
  });

  // Generate agent positions for visualization
  useEffect(() => {
    if (agents?.length) {
      const nodes: AgentNode[] = agents.map((agent: any, index: number) => {
        const angle = (index / agents.length) * 2 * Math.PI;
        const radius = 120;
        const centerX = 200;
        const centerY = 150;
        
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          status: agent.status,
          confidence: parseFloat(agent.confidence || '0'),
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        };
      });
      setAgentNodes(nodes);
    }
  }, [agents]);

  const handleExecuteTask = async () => {
    if (!selectedTaskId) return;
    try {
      await executeTaskMutation.mutateAsync({ taskId: selectedTaskId });
    } catch (error) {
      console.error('Failed to execute task:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
      case 'executing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
      case 'failed':
        return 'bg-red-500';
      case 'idle':
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
      case 'executing':
        return '🔄';
      case 'completed':
        return '✅';
      case 'error':
      case 'failed':
        return '❌';
      case 'idle':
      case 'pending':
        return '⏸️';
      default:
        return '❓';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-white">Agent Network</h2>
          <div className="flex items-center space-x-2">
            <Select value={selectedTaskId || ''} onValueChange={onTaskSelect}>
              <SelectTrigger className="w-64 bg-slate-700 border-slate-600 text-white">
                <SelectValue placeholder="Select a task to visualize" />
              </SelectTrigger>
              <SelectContent>
                {tasks?.map((task: any) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            className="border-slate-600 text-slate-300"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            className="border-slate-600 text-slate-300"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          {selectedTaskId && taskStatus && (
            <Button
              onClick={handleExecuteTask}
              disabled={executeTaskMutation.isPending || taskStatus.task?.status === 'executing'}
              className="bg-gradient-to-r from-primary to-secondary"
            >
              <Play className="w-4 h-4 mr-2" />
              {taskStatus.task?.status === 'executing' ? 'Running...' : 'Execute Task'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Network Visualization */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Agent Collaboration Network
                {taskStatus && (
                  <Badge variant="secondary" className="ml-2">
                    {taskStatus.task?.status}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedTaskId && agentNodes.length > 0 ? (
                <div className="relative h-96 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                  <svg 
                    width="100%" 
                    height="100%" 
                    viewBox="0 0 400 300"
                    style={{ transform: `scale(${zoom})` }}
                    className="absolute inset-0"
                  >
                    {/* Connection lines */}
                    {agentNodes.map((agent, i) => 
                      agentNodes.slice(i + 1).map((otherAgent, j) => (
                        <line
                          key={`${agent.id}-${otherAgent.id}`}
                          x1={agent.x}
                          y1={agent.y}
                          x2={otherAgent.x}
                          y2={otherAgent.y}
                          stroke="rgba(148, 163, 184, 0.3)"
                          strokeWidth="1"
                          strokeDasharray="4,4"
                        />
                      ))
                    )}
                    
                    {/* Agent nodes */}
                    {agentNodes.map((agent) => (
                      <g key={agent.id}>
                        <circle
                          cx={agent.x}
                          cy={agent.y}
                          r="20"
                          fill={`url(#gradient-${agent.status})`}
                          stroke={selectedAgent === agent.id ? '#6366F1' : 'rgba(148, 163, 184, 0.5)'}
                          strokeWidth={selectedAgent === agent.id ? '3' : '1'}
                          className="cursor-pointer transition-all duration-200 hover:stroke-primary"
                          onClick={() => {
                            setSelectedAgent(agent.id);
                            onAgentSelect(agent.id);
                          }}
                        />
                        <text
                          x={agent.x}
                          y={agent.y + 35}
                          textAnchor="middle"
                          fill="white"
                          fontSize="10"
                          className="pointer-events-none"
                        >
                          {agent.name}
                        </text>
                      </g>
                    ))}

                    {/* Gradients */}
                    <defs>
                      <linearGradient id="gradient-working" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="100%" stopColor="#1D4ED8" />
                      </linearGradient>
                      <linearGradient id="gradient-completed" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="gradient-pending" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#D97706" />
                      </linearGradient>
                      <linearGradient id="gradient-error" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#EF4444" />
                        <stop offset="100%" stopColor="#DC2626" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              ) : (
                <div className="h-96 bg-slate-900 rounded-lg border border-slate-700 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    {selectedTaskId ? (
                      <>
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No agents generated yet</p>
                        <p className="text-sm">Create and execute a task to see the agent network</p>
                      </>
                    ) : (
                      <>
                        <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Select a task to visualize its agent network</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Agent Details & Metrics */}
        <div className="space-y-6">
          {/* Task Metrics */}
          {taskStatus && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Task Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Progress</p>
                    <p className="text-white font-medium">{taskStatus.task?.progress || 0}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Agents</p>
                    <p className="text-white font-medium">{taskStatus.task?.agents?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Executions</p>
                    <p className="text-white font-medium">{taskStatus.metrics?.totalExecutions || 0}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Success Rate</p>
                    <p className="text-white font-medium">
                      {Math.round((taskStatus.metrics?.successRate || 0) * 100)}%
                    </p>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-slate-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 flex items-center">
                      <DollarSign className="w-4 h-4 mr-1" />
                      Total Cost
                    </span>
                    <span className="text-white font-medium">
                      ${(taskStatus.metrics?.totalCost || 0).toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-slate-400 flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      Avg Time
                    </span>
                    <span className="text-white font-medium">
                      {(taskStatus.metrics?.avgExecutionTime || 0).toFixed(1)}ms
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agent List */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Active Agents</CardTitle>
            </CardHeader>
            <CardContent>
              {agentNodes.length > 0 ? (
                <div className="space-y-3">
                  {agentNodes.map((agent) => (
                    <Tooltip key={agent.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                            selectedAgent === agent.id
                              ? "bg-slate-700 border-primary"
                              : "bg-slate-700/50 border-slate-600 hover:border-slate-500"
                          )}
                          onClick={() => {
                            setSelectedAgent(agent.id);
                            onAgentSelect(agent.id);
                          }}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={cn(
                              "w-3 h-3 rounded-full animate-pulse",
                              getStatusColor(agent.status)
                            )} />
                            <div>
                              <p className="text-white text-sm font-medium">{agent.name}</p>
                              <p className="text-slate-400 text-xs">{agent.role}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-lg">{getStatusIcon(agent.status)}</span>
                            {agent.confidence > 0 && (
                              <p className="text-xs text-slate-400">
                                {agent.confidence.toFixed(1)}% confidence
                              </p>
                            )}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Click to inspect {agent.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active agents</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
