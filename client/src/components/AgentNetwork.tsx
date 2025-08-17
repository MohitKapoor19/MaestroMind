import { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { useTasks, useTaskStatus, useExecuteTask } from '@/hooks/useTasks';
import { useAgents } from '@/hooks/useAgents';
import { useWebSocket } from '@/hooks/useWebSocket';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  Users, 
  Clock, 
  DollarSign,
  StepForward,
  CheckCircle,
  XCircle,
  Edit,
  Bot,
  Cpu,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RealtimeUpdate } from '@/lib/types';

interface AgentNetworkProps {
  selectedTaskId: string | null;
  onAgentSelect: (agentId: string) => void;
  onTaskSelect: (taskId: string) => void;
}

// Custom node component for agents
const AgentNode = ({ data, selected }: NodeProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
      case 'executing':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-950';
      case 'completed':
        return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'error':
      case 'failed':
        return 'border-red-500 bg-red-50 dark:bg-red-950';
      case 'idle':
      case 'pending':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950';
      case 'paused':
        return 'border-orange-500 bg-orange-50 dark:bg-orange-950';
      default:
        return 'border-gray-500 bg-gray-50 dark:bg-gray-950';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
      case 'executing':
        return <Activity className="h-4 w-4 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'error':
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'paused':
        return <Pause className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <ContextMenuTrigger>
      <div className={cn(
        "px-4 py-3 rounded-lg border-2 shadow-lg transition-all min-w-[200px]",
        getStatusColor(data.status),
        selected && "ring-2 ring-primary ring-offset-2"
      )}>
        <Handle type="target" position={Position.Top} className="!bg-primary" />
        
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-5 w-5" />
          <div className="font-semibold text-sm">{data.name}</div>
          {getStatusIcon(data.status)}
        </div>
        
        <div className="text-xs text-muted-foreground mb-2">{data.role}</div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {data.status}
          </Badge>
          {data.confidence && (
            <Badge variant="outline" className="text-xs">
              {(data.confidence * 100).toFixed(0)}% conf
            </Badge>
          )}
        </div>

        {data.metrics && (
          <div className="mt-2 pt-2 border-t flex gap-3 text-xs text-muted-foreground">
            {data.metrics.tokens && (
              <div className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {data.metrics.tokens}
              </div>
            )}
            {data.metrics.cost && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                ${data.metrics.cost.toFixed(4)}
              </div>
            )}
            {data.metrics.duration && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {data.metrics.duration}ms
              </div>
            )}
          </div>
        )}
        
        <Handle type="source" position={Position.Bottom} className="!bg-primary" />
      </div>
      
      <ContextMenuContent>
        <ContextMenuItem onClick={() => data.onPause?.(data.id)}>
          <Pause className="mr-2 h-4 w-4" />
          Pause Agent
        </ContextMenuItem>
        <ContextMenuItem onClick={() => data.onResume?.(data.id)}>
          <Play className="mr-2 h-4 w-4" />
          Resume Agent
        </ContextMenuItem>
        <ContextMenuItem onClick={() => data.onStep?.(data.id)}>
          <StepForward className="mr-2 h-4 w-4" />
          Step Execution
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => data.onApprove?.(data.id)}>
          <CheckCircle className="mr-2 h-4 w-4" />
          Approve Action
        </ContextMenuItem>
        <ContextMenuItem onClick={() => data.onReject?.(data.id)}>
          <XCircle className="mr-2 h-4 w-4" />
          Reject Action
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => data.onModify?.(data.id)}>
          <Edit className="mr-2 h-4 w-4" />
          Modify Agent
        </ContextMenuItem>
        <ContextMenuItem onClick={() => data.onInspect?.(data.id)}>
          <Eye className="mr-2 h-4 w-4" />
          Inspect Details
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuTrigger>
  );
};

const nodeTypes = {
  agent: AgentNode,
};

export default function AgentNetwork({ selectedTaskId, onAgentSelect, onTaskSelect }: AgentNetworkProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const { data: tasks } = useTasks();
  const { data: taskStatus } = useTaskStatus(selectedTaskId || '');
  const { data: agents } = useAgents(selectedTaskId || '');
  const executeTaskMutation = useExecuteTask();

  // WebSocket for real-time updates
  useWebSocket({
    onMessage: (update: RealtimeUpdate) => {
      if (update.type === 'agent_update' && update.data.agentId) {
        // Update node status in real-time
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === update.data.agentId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  status: update.data.status,
                  metrics: update.data.metrics,
                },
              };
            }
            return node;
          })
        );
      }
    },
  });

  // Generate nodes and edges from agents data
  useEffect(() => {
    if (agents?.length) {
      // Create nodes with automatic layout
      const newNodes: Node[] = agents.map((agent: any, index: number) => {
        const columns = Math.ceil(Math.sqrt(agents.length));
        const row = Math.floor(index / columns);
        const col = index % columns;
        
        return {
          id: agent.id,
          type: 'agent',
          position: { 
            x: col * 300 + 50, 
            y: row * 200 + 50 
          },
          data: {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            status: agent.status || 'idle',
            confidence: parseFloat(agent.confidence || '0'),
            metrics: agent.metrics,
            // HITL action handlers
            onPause: handlePauseAgent,
            onResume: handleResumeAgent,
            onStep: handleStepAgent,
            onApprove: handleApproveAgent,
            onReject: handleRejectAgent,
            onModify: handleModifyAgent,
            onInspect: (id: string) => onAgentSelect(id),
          },
        };
      });

      // Create edges based on agent collaborations
      const newEdges: Edge[] = [];
      agents.forEach((agent: any, index: number) => {
        if (agent.collaborations?.length) {
          agent.collaborations.forEach((collab: any) => {
            const targetAgent = agents.find((a: any) => a.id === collab.targetAgentId);
            if (targetAgent) {
              newEdges.push({
                id: `${agent.id}-${collab.targetAgentId}`,
                source: agent.id,
                target: collab.targetAgentId,
                type: 'smoothstep',
                animated: agent.status === 'executing',
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                },
                style: {
                  strokeWidth: 2,
                  stroke: collab.type === 'handoff' ? '#10b981' : '#6366f1',
                },
                label: collab.type,
                labelStyle: {
                  fontSize: 12,
                },
              });
            }
          });
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [agents, onAgentSelect]);

  // HITL Control Handlers
  const handlePauseAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/pause`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to pause agent');
    } catch (error) {
      console.error('Error pausing agent:', error);
    }
  };

  const handleResumeAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/resume`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to resume agent');
    } catch (error) {
      console.error('Error resuming agent:', error);
    }
  };

  const handleStepAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/step`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to step agent');
    } catch (error) {
      console.error('Error stepping agent:', error);
    }
  };

  const handleApproveAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/approve`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to approve agent');
    } catch (error) {
      console.error('Error approving agent:', error);
    }
  };

  const handleRejectAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/reject`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to reject agent');
    } catch (error) {
      console.error('Error rejecting agent:', error);
    }
  };

  const handleModifyAgent = async (agentId: string) => {
    // This would open a modal to modify agent P/D/T/S
    console.log('Modify agent:', agentId);
    // TODO: Implement modification modal
  };

  const handleExecuteTask = async () => {
    if (!selectedTaskId) return;
    try {
      await executeTaskMutation.mutateAsync({ taskId: selectedTaskId });
    } catch (error) {
      console.error('Failed to execute task:', error);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedAgent(node.id);
      onAgentSelect(node.id);
    },
    [onAgentSelect]
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Agent Network
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Task Selector */}
            <Select value={selectedTaskId || ''} onValueChange={onTaskSelect}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select a task" />
              </SelectTrigger>
              <SelectContent>
                {tasks?.map((task: any) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Execution Controls */}
            {selectedTaskId && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={taskStatus === 'executing' ? 'destructive' : 'default'}
                      onClick={handleExecuteTask}
                      disabled={executeTaskMutation.isPending}
                    >
                      {taskStatus === 'executing' ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {taskStatus === 'executing' ? 'Pause Execution' : 'Start Execution'}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset Task</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* Metrics Bar */}
        {selectedTaskId && agents?.length > 0 && (
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {agents.length} Agents
            </div>
            <div className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              {agents.filter((a: any) => a.status === 'executing').length} Active
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              {agents.filter((a: any) => a.status === 'completed').length} Completed
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <div className="h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={12} 
              size={1} 
              className="bg-background"
            />
            <Controls 
              className="bg-background border-border"
              showInteractive={false}
            />
            <MiniMap 
              className="bg-background border-border"
              nodeColor={(node) => {
                switch (node.data?.status) {
                  case 'executing': return '#3b82f6';
                  case 'completed': return '#10b981';
                  case 'failed': return '#ef4444';
                  case 'paused': return '#f97316';
                  default: return '#6b7280';
                }
              }}
              maskColor="rgb(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  );
}