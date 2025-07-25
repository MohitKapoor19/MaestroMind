import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAgentStatus, useExecuteAgent } from '@/hooks/useAgents';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  User, 
  Brain, 
  Activity, 
  MessageSquare, 
  Settings, 
  Play, 
  Clock, 
  DollarSign, 
  Target,
  Code,
  FileText,
  Search as SearchIcon,
  Send,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RealtimeUpdate } from '@/lib/types';

interface AgentInspectorProps {
  agentId: string | null;
}

export default function AgentInspector({ agentId }: AgentInspectorProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [executionInput, setExecutionInput] = useState('');
  const [executionAction, setExecutionAction] = useState('');
  const [executionContext, setExecutionContext] = useState('');

  const { data: agentStatus, refetch } = useAgentStatus(agentId || '');
  const executeAgentMutation = useExecuteAgent();

  // Real-time updates
  useWebSocket({
    onMessage: (update: RealtimeUpdate) => {
      if (update.type === 'agent_update' && update.data.agentId === agentId) {
        refetch();
      }
    },
  });

  const handleExecuteAction = async () => {
    if (!agentId || !executionAction || !executionInput) return;

    try {
      await executeAgentMutation.mutateAsync({
        agentId,
        action: executionAction,
        input: executionInput,
        context: executionContext,
      });
      
      // Clear form
      setExecutionAction('');
      setExecutionInput('');
      setExecutionContext('');
    } catch (error) {
      console.error('Failed to execute agent action:', error);
    }
  };

  if (!agentId) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96 bg-slate-800 rounded-lg border border-slate-700">
          <div className="text-center text-slate-400">
            <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No Agent Selected</p>
            <p className="text-sm">Select an agent from the network to inspect its details</p>
          </div>
        </div>
      </div>
    );
  }

  if (!agentStatus) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96 bg-slate-800 rounded-lg border border-slate-700">
          <div className="text-center text-slate-400">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p>Loading agent details...</p>
          </div>
        </div>
      </div>
    );
  }

  const agent = agentStatus.agent;
  const metrics = agentStatus.metrics;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
      case 'executing':
        return 'bg-blue-500/20 text-blue-400';
      case 'completed':
      case 'idle':
        return 'bg-green-500/20 text-green-400';
      case 'error':
      case 'failed':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{agent.name}</h2>
          <p className="text-slate-400 mt-1">{agent.role} • Deep Agent Analysis</p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge className={getStatusColor(agent.status)}>
            {agent.status}
          </Badge>
          {agent.confidence && (
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              {parseFloat(agent.confidence).toFixed(1)}% confidence
            </Badge>
          )}
        </div>
      </div>

      {/* Agent Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <Activity className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{metrics.totalExecutions}</p>
            <p className="text-slate-400 text-sm">Total Executions</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <Clock className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{metrics.avgExecutionTime.toFixed(0)}ms</p>
            <p className="text-slate-400 text-sm">Avg Response Time</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">${metrics.totalCost.toFixed(4)}</p>
            <p className="text-slate-400 text-sm">Total Cost</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <Target className="w-8 h-8 text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{Math.round(metrics.successRate * 100)}%</p>
            <p className="text-slate-400 text-sm">Success Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Inspector */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Agent Inspector</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5 bg-slate-700">
              <TabsTrigger value="overview" className="data-[state=active]:bg-slate-600">
                Overview
              </TabsTrigger>
              <TabsTrigger value="prompt" className="data-[state=active]:bg-slate-600">
                Prompt & Config
              </TabsTrigger>
              <TabsTrigger value="executions" className="data-[state=active]:bg-slate-600">
                Executions
              </TabsTrigger>
              <TabsTrigger value="collaborations" className="data-[state=active]:bg-slate-600">
                Collaborations
              </TabsTrigger>
              <TabsTrigger value="interact" className="data-[state=active]:bg-slate-600">
                Interact
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Agent Profile */}
                <div className="space-y-4">
                  <h4 className="text-white font-medium flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    Agent Profile
                  </h4>
                  <div className="bg-slate-900 rounded-lg p-4 space-y-3">
                    <div>
                      <span className="text-slate-400 text-sm">Description:</span>
                      <p className="text-white text-sm mt-1">{agent.description}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-sm">Suggestions:</span>
                      <p className="text-white text-sm mt-1">{agent.suggestions || 'None provided'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-sm">Created:</span>
                      <p className="text-white text-sm mt-1">
                        {new Date(agent.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Toolset */}
                <div className="space-y-4">
                  <h4 className="text-white font-medium flex items-center">
                    <Settings className="w-4 h-4 mr-2" />
                    Available Tools
                  </h4>
                  <div className="bg-slate-900 rounded-lg p-4">
                    {agent.toolset && agent.toolset.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {agent.toolset.map((tool: string, index: number) => (
                          <Badge key={index} variant="outline" className="border-slate-600 text-slate-300">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm">No tools configured</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Memory Context */}
              {agent.memoryContext && (
                <div className="space-y-4">
                  <h4 className="text-white font-medium flex items-center">
                    <Brain className="w-4 h-4 mr-2" />
                    Memory Context
                  </h4>
                  <div className="bg-slate-900 rounded-lg p-4">
                    <pre className="text-slate-300 text-sm overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(agent.memoryContext, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="prompt" className="space-y-6 mt-6">
              <div className="space-y-4">
                <h4 className="text-white font-medium flex items-center">
                  <Code className="w-4 h-4 mr-2" />
                  System Prompt
                </h4>
                <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <pre className="text-slate-300 text-sm whitespace-pre-wrap overflow-x-auto">
                    {agent.prompt}
                  </pre>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="executions" className="space-y-6 mt-6">
              <div className="space-y-4">
                <h4 className="text-white font-medium flex items-center">
                  <Activity className="w-4 h-4 mr-2" />
                  Execution History
                </h4>
                <ScrollArea className="h-64">
                  {agentStatus.recentActivity && agentStatus.recentActivity.length > 0 ? (
                    <div className="space-y-3">
                      {agentStatus.recentActivity.map((execution: any) => (
                        <div key={execution.id} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white font-medium">{execution.action}</span>
                            <div className="flex items-center space-x-2">
                              <Badge variant={execution.status === 'completed' ? 'default' : 'destructive'}>
                                {execution.status}
                              </Badge>
                              <span className="text-slate-400 text-xs">
                                {execution.duration}ms
                              </span>
                            </div>
                          </div>
                          {execution.output && (
                            <details className="mt-2">
                              <summary className="text-slate-400 text-sm cursor-pointer">
                                View output
                              </summary>
                              <pre className="text-slate-300 text-xs mt-2 p-2 bg-slate-800 rounded overflow-x-auto">
                                {JSON.stringify(execution.output, null, 2)}
                              </pre>
                            </details>
                          )}
                          {execution.error && (
                            <p className="text-red-400 text-sm mt-2">{execution.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8">
                      <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No executions yet</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="collaborations" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Outgoing Collaborations</h4>
                  <div className="bg-slate-900 rounded-lg p-4">
                    <p className="text-center text-slate-400">
                      {agentStatus.collaborations?.outgoing || 0} collaborations sent
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Incoming Collaborations</h4>
                  <div className="bg-slate-900 rounded-lg p-4">
                    <p className="text-center text-slate-400">
                      {agentStatus.collaborations?.incoming || 0} collaborations received
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="interact" className="space-y-6 mt-6">
              <div className="space-y-4">
                <h4 className="text-white font-medium flex items-center">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Execute Agent Action
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-slate-300 text-sm block mb-2">Action Type</label>
                      <Input
                        value={executionAction}
                        onChange={(e) => setExecutionAction(e.target.value)}
                        placeholder="e.g., analyze_code, generate_content, review_document"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 text-sm block mb-2">Input Data</label>
                      <Textarea
                        value={executionInput}
                        onChange={(e) => setExecutionInput(e.target.value)}
                        placeholder="Provide the input data for the action..."
                        rows={4}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 text-sm block mb-2">Context (Optional)</label>
                      <Textarea
                        value={executionContext}
                        onChange={(e) => setExecutionContext(e.target.value)}
                        placeholder="Additional context for the agent..."
                        rows={2}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <Button
                      onClick={handleExecuteAction}
                      disabled={executeAgentMutation.isPending || !executionAction || !executionInput}
                      className="w-full bg-gradient-to-r from-primary to-secondary"
                    >
                      {executeAgentMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Execute Action
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-4">
                    <h5 className="text-white font-medium mb-2">Agent Capabilities</h5>
                    <div className="space-y-2 text-sm text-slate-300">
                      <p>• This agent specializes in: {agent.role}</p>
                      <p>• Available tools: {agent.toolset?.length || 0} tools</p>
                      <p>• Current confidence: {agent.confidence ? `${parseFloat(agent.confidence).toFixed(1)}%` : 'Not set'}</p>
                      <p>• Status: {agent.status}</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
