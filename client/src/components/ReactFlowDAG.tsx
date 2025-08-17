import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  ConnectionMode,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, CardContent } from '@components/ui/card';
import { Badge } from '@components/ui/badge';
import { Button } from '@components/ui/button';
import { 
  User, Bot, CheckCircle, XCircle, Clock, 
  AlertCircle, Play, Pause, MoreHorizontal 
} from 'lucide-react';

interface AgentNodeData {
  id: string;
  name: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  confidence?: number;
  tokensUsed?: number;
  cost?: number;
  executionTime?: number;
  description?: string;
  toolset?: string[];
}

interface TaskNodeData {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  description?: string;
}

// Custom Node Components
const AgentNode = ({ data, selected }: { data: AgentNodeData; selected: boolean }) => {
  const getStatusIcon = () => {
    switch (data.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (data.status) {
      case 'completed':
        return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'failed':
        return 'border-red-500 bg-red-50 dark:bg-red-950';
      case 'running':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-950';
      case 'paused':
        return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950';
      default:
        return 'border-gray-300 bg-white dark:bg-gray-800';
    }
  };

  return (
    <Card className={`min-w-[200px] ${getStatusColor()} ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm">{data.name}</h3>
          </div>
          <div className="flex items-center gap-1">
            {getStatusIcon()}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          <Badge variant="outline" className="text-xs">
            {data.role}
          </Badge>
          
          {data.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {data.description}
            </p>
          )}
          
          {data.confidence !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span>Confidence:</span>
              <span className="font-medium">{data.confidence}%</span>
            </div>
          )}
          
          {data.cost !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span>Cost:</span>
              <span className="font-medium">${data.cost.toFixed(4)}</span>
            </div>
          )}
          
          {data.tokensUsed !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span>Tokens:</span>
              <span className="font-medium">{data.tokensUsed.toLocaleString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const TaskNode = ({ data, selected }: { data: TaskNodeData; selected: boolean }) => {
  const getStatusIcon = () => {
    switch (data.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Play className="w-5 h-5 text-blue-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (data.status) {
      case 'completed':
        return 'border-green-500 bg-green-100 dark:bg-green-900';
      case 'failed':
        return 'border-red-500 bg-red-100 dark:bg-red-900';
      case 'running':
        return 'border-blue-500 bg-blue-100 dark:bg-blue-900';
      default:
        return 'border-gray-300 bg-gray-100 dark:bg-gray-800';
    }
  };

  return (
    <Card className={`min-w-[250px] ${getStatusColor()} ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold">{data.title}</h3>
          </div>
          {getStatusIcon()}
        </div>
        
        {data.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {data.description}
          </p>
        )}
        
        {data.progress !== undefined && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{data.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${data.progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const nodeTypes = {
  agent: AgentNode,
  task: TaskNode,
};

interface ReactFlowDAGProps {
  taskId?: string | null;
  onNodeClick?: (nodeId: string, nodeType: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

export function ReactFlowDAG({ taskId, onNodeClick, onEdgeClick }: ReactFlowDAGProps) {
  // Sample data - in real implementation, this would come from API
  const initialNodes: Node[] = useMemo(() => [
    {
      id: 'task-1',
      type: 'task',
      position: { x: 100, y: 50 },
      data: {
        id: 'task-1',
        title: 'Research Market Analysis',
        status: 'running',
        progress: 65,
        description: 'Analyze current market trends and competitor landscape'
      }
    },
    {
      id: 'agent-1',
      type: 'agent',
      position: { x: 50, y: 200 },
      data: {
        id: 'agent-1',
        name: 'Research Analyst',
        role: 'Data Researcher',
        status: 'completed',
        confidence: 92,
        tokensUsed: 1250,
        cost: 0.0045,
        description: 'Specialized in market research and data analysis'
      }
    },
    {
      id: 'agent-2',
      type: 'agent',
      position: { x: 300, y: 200 },
      data: {
        id: 'agent-2',
        name: 'Content Writer',
        role: 'Report Generator',
        status: 'running',
        confidence: 88,
        tokensUsed: 890,
        cost: 0.0032,
        description: 'Creates comprehensive reports and summaries'
      }
    },
    {
      id: 'agent-3',
      type: 'agent',
      position: { x: 175, y: 350 },
      data: {
        id: 'agent-3',
        name: 'Quality Reviewer',
        role: 'QA Specialist',
        status: 'pending',
        confidence: 0,
        tokensUsed: 0,
        cost: 0,
        description: 'Reviews and validates output quality'
      }
    }
  ], []);

  const initialEdges: Edge[] = useMemo(() => [
    {
      id: 'task-agent1',
      source: 'task-1',
      target: 'agent-1',
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#10b981' }
    },
    {
      id: 'task-agent2',
      source: 'task-1',
      target: 'agent-2',
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#3b82f6' }
    },
    {
      id: 'agent1-agent3',
      source: 'agent-1',
      target: 'agent-3',
      type: 'smoothstep',
      style: { stroke: '#6b7280' }
    },
    {
      id: 'agent2-agent3',
      source: 'agent-2',
      target: 'agent-3',
      type: 'smoothstep',
      style: { stroke: '#6b7280' }
    }
  ], []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClickHandler = useCallback((event: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node.id, node.type || 'unknown');
    }
  }, [onNodeClick]);

  const onEdgeClickHandler = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (onEdgeClick) {
      onEdgeClick(edge.id);
    }
  }, [onEdgeClick]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClickHandler}
        onEdgeClick={onEdgeClickHandler}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        className="bg-background"
      >
        <Controls className="bg-background border border-border" />
        <MiniMap 
          className="bg-background border border-border"
          nodeColor={(node) => {
            switch (node.type) {
              case 'agent':
                return '#3b82f6';
              case 'task':
                return '#8b5cf6';
              default:
                return '#6b7280';
            }
          }}
        />
        <Background gap={12} size={1} />
        <Panel position="top-left" className="bg-background border border-border rounded-lg p-3">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Agent Network</h3>
            <div className="flex gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Running</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span>Pending</span>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}