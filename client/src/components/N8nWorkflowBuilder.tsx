import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  useWorkflows, 
  useCreateWorkflow, 
  useUpdateWorkflow, 
  useExecuteWorkflow,
  useValidateWorkflow,
  type N8nWorkflow 
} from '@/hooks/useWorkflows';
import { 
  Plus, 
  Play, 
  Save, 
  Download, 
  Upload, 
  Settings, 
  Trash2, 
  Copy,
  ArrowRight,
  Workflow,
  Database,
  Globe,
  MessageSquare,
  Zap,
  Calendar,
  FileText,
  Code
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface N8nNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  parameters: Record<string, any>;
  credentials?: Record<string, any>;
}

interface N8nConnection {
  source: string;
  target: string;
  sourceOutput: string;
  targetInput: string;
}

interface N8nWorkflowBuilderProps {
  taskId?: string;
  onSave?: (workflow: N8nWorkflow) => void;
  onExecute?: (workflow: N8nWorkflow) => void;
}

const NODE_TYPES = [
  { id: 'http-request', name: 'HTTP Request', icon: Globe, category: 'Core' },
  { id: 'webhook', name: 'Webhook', icon: Zap, category: 'Trigger' },
  { id: 'schedule', name: 'Schedule Trigger', icon: Calendar, category: 'Trigger' },
  { id: 'database', name: 'Database', icon: Database, category: 'Data' },
  { id: 'email', name: 'Email', icon: MessageSquare, category: 'Communication' },
  { id: 'file', name: 'File Operation', icon: FileText, category: 'File' },
  { id: 'code', name: 'Code Execute', icon: Code, category: 'Function' },
  { id: 'ai-agent', name: 'AI Agent', icon: Workflow, category: 'AI' },
];

export default function N8nWorkflowBuilder({ taskId, onSave, onExecute }: N8nWorkflowBuilderProps) {
  const { toast } = useToast();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows(taskId);
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const executeWorkflow = useExecuteWorkflow();
  const validateWorkflow = useValidateWorkflow();

  const [workflow, setWorkflow] = useState<N8nWorkflow>({
    name: `Task Workflow ${taskId ? `- ${taskId.slice(0, 8)}` : ''}`,
    description: 'Automated workflow for task execution',
    nodes: [],
    connections: [],
    settings: { timezone: 'UTC', errorHandling: 'continue' },
    status: 'draft',
    workflowData: {},
  });

  const [selectedNode, setSelectedNode] = useState<N8nNode | null>(null);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });

  const addNode = useCallback((nodeType: typeof NODE_TYPES[0], position: { x: number; y: number }) => {
    const newNode: N8nNode = {
      id: `node_${Date.now()}`,
      type: nodeType.id,
      name: nodeType.name,
      position,
      parameters: getDefaultParameters(nodeType.id),
    };

    setWorkflow(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setIsAddingNode(false);
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<N8nNode>) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === nodeId ? { ...node, ...updates } : node
      ),
    }));
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setWorkflow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => node.id !== nodeId),
      connections: prev.connections.filter(
        conn => conn.source !== nodeId && conn.target !== nodeId
      ),
    }));
    setSelectedNode(null);
  }, []);

  const addConnection = useCallback((source: string, target: string) => {
    const newConnection: N8nConnection = {
      source,
      target,
      sourceOutput: 'main',
      targetInput: 'main',
    };

    setWorkflow(prev => ({
      ...prev,
      connections: [...prev.connections, newConnection],
    }));
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (isAddingNode) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectedNode(null);
    }
  }, [isAddingNode]);

  const handleNodeClick = useCallback((node: N8nNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode(node);
  }, []);

  const generateWorkflowCode = useCallback(() => {
    return JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings,
      active: workflow.status === 'active',
    }, null, 2);
  }, [workflow]);

  const handleExecuteWorkflow = useCallback(async () => {
    if (!workflow.id) {
      toast({
        title: "Workflow not saved",
        description: "Please save the workflow before executing it.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await executeWorkflow.mutateAsync(workflow.id);
      
      toast({
        title: "Workflow executed",
        description: `Execution ${result.status === 'success' ? 'completed successfully' : 'failed'}`,
        variant: result.status === 'success' ? 'default' : 'destructive',
      });

      if (onExecute) {
        onExecute(workflow);
      }
    } catch (error) {
      toast({
        title: "Execution failed",
        description: "Failed to execute workflow. Please try again.",
        variant: "destructive",
      });
    }
  }, [workflow, executeWorkflow, toast, onExecute]);

  const handleSaveWorkflow = useCallback(async () => {
    try {
      // Validate first
      const validation = await validateWorkflow.mutateAsync(workflow);
      
      if (!validation.isValid) {
        toast({
          title: "Validation failed",
          description: validation.errors.join(", "),
          variant: "destructive",
        });
        return;
      }

      const workflowData = {
        ...workflow,
        taskId,
        workflowData: {
          name: workflow.name,
          nodes: workflow.nodes,
          connections: workflow.connections,
          settings: workflow.settings,
        },
      };

      if (workflow.id) {
        await updateWorkflow.mutateAsync({ id: workflow.id, updates: workflowData });
        toast({
          title: "Workflow updated",
          description: "Your workflow has been saved successfully.",
        });
      } else {
        const savedWorkflow = await createWorkflow.mutateAsync(workflowData);
        setWorkflow(prev => ({ ...prev, id: savedWorkflow.id }));
        toast({
          title: "Workflow created",
          description: "Your workflow has been saved successfully.",
        });
      }

      if (onSave) {
        onSave(workflow);
      }
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Failed to save workflow. Please try again.",
        variant: "destructive",
      });
    }
  }, [workflow, taskId, validateWorkflow, createWorkflow, updateWorkflow, toast, onSave]);

  function getDefaultParameters(nodeType: string): Record<string, any> {
    switch (nodeType) {
      case 'http-request':
        return { method: 'GET', url: 'https://api.example.com', headers: {} };
      case 'webhook':
        return { httpMethod: 'POST', path: 'webhook', responseMode: 'onReceived' };
      case 'schedule':
        return { triggerInterval: '15 minutes', timezone: 'UTC' };
      case 'database':
        return { operation: 'select', table: '', query: '' };
      case 'email':
        return { to: '', subject: '', text: '' };
      case 'file':
        return { operation: 'read', path: '' };
      case 'code':
        return { language: 'javascript', code: '// Your code here\nreturn items;' };
      case 'ai-agent':
        return { model: 'groq', prompt: 'Process the input data', maxTokens: 1000 };
      default:
        return {};
    }
  }

  function getNodeIcon(nodeType: string) {
    const nodeTypeData = NODE_TYPES.find(nt => nt.id === nodeType);
    return nodeTypeData ? nodeTypeData.icon : Workflow;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Workflow className="w-7 h-7 mr-3 text-blue-400" />
            n8n Workflow Builder
          </h2>
          <p className="text-slate-400 mt-1">Create and manage automated workflows</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge 
            variant={workflow.status === 'active' ? 'default' : 'secondary'}
            className={cn(
              "capitalize",
              workflow.status === 'active' && "bg-green-500/20 text-green-400",
              workflow.status === 'draft' && "bg-slate-500/20 text-slate-400",
              workflow.status === 'error' && "bg-red-500/20 text-red-400"
            )}
          >
            {workflow.status}
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSaveWorkflow} 
            disabled={createWorkflow.isPending || updateWorkflow.isPending}
            className="border-slate-600 text-slate-300"
          >
            <Save className="w-4 h-4 mr-2" />
            {createWorkflow.isPending || updateWorkflow.isPending ? 'Saving...' : 'Save'}
          </Button>
          <Button 
            size="sm" 
            onClick={handleExecuteWorkflow} 
            disabled={executeWorkflow.isPending || !workflow.id}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Play className="w-4 h-4 mr-2" />
            {executeWorkflow.isPending ? 'Executing...' : 'Execute'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Node Library */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-sm">Node Library</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <div className="space-y-3">
                {Object.entries(
                  NODE_TYPES.reduce((acc, node) => {
                    if (!acc[node.category]) acc[node.category] = [];
                    acc[node.category].push(node);
                    return acc;
                  }, {} as Record<string, typeof NODE_TYPES>)
                ).map(([category, nodes]) => (
                  <div key={category}>
                    <h4 className="text-xs font-medium text-slate-400 mb-2">{category}</h4>
                    <div className="space-y-1">
                      {nodes.map((nodeType) => {
                        const Icon = nodeType.icon;
                        return (
                          <button
                            key={nodeType.id}
                            onClick={() => {
                              setIsAddingNode(true);
                              // Add to center of canvas
                              const centerX = 200;
                              const centerY = 150;
                              addNode(nodeType, { x: centerX, y: centerY });
                            }}
                            className="w-full p-2 text-left text-sm bg-slate-700 hover:bg-slate-600 rounded flex items-center space-x-2 text-slate-200"
                          >
                            <Icon className="w-4 h-4" />
                            <span>{nodeType.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Workflow Canvas */}
        <Card className="lg:col-span-2 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center justify-between">
              <span>Workflow Canvas</span>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">{workflow.nodes.length} nodes</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={canvasRef}
              className="relative w-full h-96 bg-slate-900 rounded border border-slate-600 overflow-hidden"
              onClick={handleCanvasClick}
            >
              {/* Grid background */}
              <div className="absolute inset-0 opacity-20">
                <svg width="100%" height="100%">
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#475569" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>

              {/* Connections */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {workflow.connections.map((connection, index) => {
                  const sourceNode = workflow.nodes.find(n => n.id === connection.source);
                  const targetNode = workflow.nodes.find(n => n.id === connection.target);
                  
                  if (!sourceNode || !targetNode) return null;

                  const startX = sourceNode.position.x + 60;
                  const startY = sourceNode.position.y + 20;
                  const endX = targetNode.position.x;
                  const endY = targetNode.position.y + 20;

                  const midX = (startX + endX) / 2;

                  return (
                    <g key={index}>
                      <path
                        d={`M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        fill="none"
                      />
                      <circle cx={endX} cy={endY} r="4" fill="#3b82f6" />
                    </g>
                  );
                })}
              </svg>

              {/* Nodes */}
              {workflow.nodes.map((node) => {
                const Icon = getNodeIcon(node.type);
                return (
                  <div
                    key={node.id}
                    onClick={(e) => handleNodeClick(node, e)}
                    className={cn(
                      "absolute cursor-pointer select-none",
                      "w-24 h-12 bg-slate-700 border-2 rounded-lg",
                      "flex items-center justify-center space-x-1",
                      "hover:bg-slate-600 transition-colors",
                      selectedNode?.id === node.id ? "border-blue-400" : "border-slate-500"
                    )}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                    }}
                  >
                    <Icon className="w-4 h-4 text-slate-300" />
                    <span className="text-xs text-slate-300 truncate">
                      {node.name.split(' ')[0]}
                    </span>
                  </div>
                );
              })}

              {/* Empty state */}
              {workflow.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <Workflow className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Add nodes from the library to start building</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Properties Panel */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-sm">
              {selectedNode ? 'Node Properties' : 'Workflow Settings'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              {selectedNode ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400">Name</label>
                    <Input
                      value={selectedNode.name}
                      onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
                      className="mt-1 bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-slate-400">Parameters</label>
                    <Textarea
                      value={JSON.stringify(selectedNode.parameters, null, 2)}
                      onChange={(e) => {
                        try {
                          const params = JSON.parse(e.target.value);
                          updateNode(selectedNode.id, { parameters: params });
                        } catch (error) {
                          // Invalid JSON, ignore
                        }
                      }}
                      className="mt-1 bg-slate-700 border-slate-600 text-white text-xs font-mono"
                      rows={8}
                    />
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteNode(selectedNode.id)}
                    className="w-full"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Node
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400">Workflow Name</label>
                    <Input
                      value={workflow.name}
                      onChange={(e) => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1 bg-slate-700 border-slate-600 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400">Description</label>
                    <Textarea
                      value={workflow.description}
                      onChange={(e) => setWorkflow(prev => ({ ...prev, description: e.target.value }))}
                      className="mt-1 bg-slate-700 border-slate-600 text-white"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400">Status</label>
                    <Select 
                      value={workflow.status} 
                      onValueChange={(value: any) => setWorkflow(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-4 space-y-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full border-slate-600 text-slate-300">
                          <Code className="w-4 h-4 mr-2" />
                          View Code
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl bg-slate-800 border-slate-700">
                        <DialogHeader>
                          <DialogTitle className="text-white">Workflow JSON</DialogTitle>
                        </DialogHeader>
                        <pre className="bg-slate-900 p-4 rounded text-xs text-slate-300 overflow-auto max-h-96">
                          {generateWorkflowCode()}
                        </pre>
                      </DialogContent>
                    </Dialog>

                    <Button variant="outline" size="sm" className="w-full border-slate-600 text-slate-300">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}