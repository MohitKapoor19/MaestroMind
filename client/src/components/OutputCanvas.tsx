import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTaskStatus } from '@/hooks/useTasks';
import { FileText, Download, Copy, Eye, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OutputCanvasProps {
  taskId: string | null;
}

export default function OutputCanvas({ taskId }: OutputCanvasProps) {
  const [selectedSection, setSelectedSection] = useState('overview');
  const { data: taskStatus } = useTaskStatus(taskId || '');

  if (!taskId) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96 bg-slate-800 rounded-lg border border-slate-700">
          <div className="text-center text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No Task Selected</p>
            <p className="text-sm">Select a task to view its output and results</p>
          </div>
        </div>
      </div>
    );
  }

  if (!taskStatus) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96 bg-slate-800 rounded-lg border border-slate-700">
          <div className="text-center text-slate-400">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p>Loading task output...</p>
          </div>
        </div>
      </div>
    );
  }

  const task = taskStatus.task;
  const isCompleted = task.status === 'completed';
  const isInProgress = ['executing', 'planning', 'drafting', 'refinement'].includes(task.status);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{task.title}</h2>
          <p className="text-slate-400 mt-1">Task Output & Results</p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge 
            variant={isCompleted ? 'default' : isInProgress ? 'secondary' : 'outline'}
            className={cn(
              "capitalize",
              isCompleted && "bg-green-500/20 text-green-400",
              isInProgress && "bg-blue-500/20 text-blue-400"
            )}
          >
            {task.status}
          </Badge>
          {isCompleted && (
            <>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300">
                <Copy className="w-4 h-4 mr-2" />
                Copy Output
              </Button>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-300 text-sm">Task Progress</span>
            <span className="text-white font-medium">{task.progress}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
            <div 
              className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          
          {/* Status Timeline */}
          <div className="flex items-center justify-between text-xs">
            <div className={cn(
              "flex items-center space-x-1",
              task.progress >= 10 ? "text-green-400" : "text-slate-400"
            )}>
              <CheckCircle className="w-3 h-3" />
              <span>Planning</span>
            </div>
            <div className={cn(
              "flex items-center space-x-1",
              task.progress >= 50 ? "text-green-400" : task.progress >= 10 ? "text-blue-400" : "text-slate-400"
            )}>
              <Clock className="w-3 h-3" />
              <span>Executing</span>
            </div>
            <div className={cn(
              "flex items-center space-x-1",
              task.progress >= 90 ? "text-green-400" : task.progress >= 50 ? "text-blue-400" : "text-slate-400"
            )}>
              <AlertCircle className="w-3 h-3" />
              <span>Refinement</span>
            </div>
            <div className={cn(
              "flex items-center space-x-1",
              task.progress === 100 ? "text-green-400" : "text-slate-400"
            )}>
              <CheckCircle className="w-3 h-3" />
              <span>Complete</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Output Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Output Area */}
        <div className="lg:col-span-3">
          <Card className="bg-slate-800 border-slate-700 min-h-96">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Task Output
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-slate-400">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Mode
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isCompleted ? (
                <div className="prose prose-invert max-w-none">
                  <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                    <h3 className="text-white text-lg font-semibold mb-4">Task Completion Summary</h3>
                    <div className="space-y-4 text-slate-300">
                      <div>
                        <h4 className="text-white font-medium mb-2">Objective</h4>
                        <p>{task.description}</p>
                      </div>
                      
                      <div>
                        <h4 className="text-white font-medium mb-2">Agents Involved</h4>
                        <div className="flex flex-wrap gap-2">
                          {task.agents?.map((agent: any) => (
                            <Badge key={agent.id} variant="secondary" className="bg-slate-700 text-slate-300">
                              {agent.name} ({agent.role})
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-white font-medium mb-2">Execution Results</h4>
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
                          <p className="text-slate-300">
                            Task "{task.title}" has been successfully completed through collaborative multi-agent execution. 
                            The agents worked together following the AutoAgents framework to deliver the requested outcome.
                          </p>
                          
                          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-slate-400">Execution Time:</span>
                              <span className="text-white ml-2">{task.actualDuration || 'N/A'} minutes</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Total Cost:</span>
                              <span className="text-white ml-2">${(taskStatus.metrics?.totalCost || 0).toFixed(4)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Collaborations:</span>
                              <span className="text-white ml-2">{taskStatus.metrics?.totalCollaborations || 0}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Success Rate:</span>
                              <span className="text-white ml-2">{Math.round((taskStatus.metrics?.successRate || 0) * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isInProgress ? (
                <div className="flex items-center justify-center h-64 text-slate-400">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-lg">Task in progress...</p>
                    <p className="text-sm">Agents are collaborating to complete this task</p>
                    <div className="mt-4 text-xs">
                      Current status: <span className="text-white capitalize">{task.status}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-slate-400">
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Task not started</p>
                    <p className="text-sm">Execute the task to see output here</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Task Details */}
        <div className="space-y-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Task Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-slate-400 text-sm">Priority</p>
                <Badge variant="outline" className={cn(
                  "capitalize mt-1",
                  task.priority === 'high' && "border-red-500 text-red-400",
                  task.priority === 'medium' && "border-yellow-500 text-yellow-400",
                  task.priority === 'low' && "border-green-500 text-green-400"
                )}>
                  {task.priority}
                </Badge>
              </div>
              
              <div>
                <p className="text-slate-400 text-sm">Created</p>
                <p className="text-white text-sm">{new Date(task.createdAt).toLocaleDateString()}</p>
              </div>
              
              {task.completedAt && (
                <div>
                  <p className="text-slate-400 text-sm">Completed</p>
                  <p className="text-white text-sm">{new Date(task.completedAt).toLocaleDateString()}</p>
                </div>
              )}
              
              <div>
                <p className="text-slate-400 text-sm">Estimated Duration</p>
                <p className="text-white text-sm">{task.estimatedDuration || 'Not specified'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Agent Summary */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-lg">Agent Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {task.agents && task.agents.length > 0 ? (
                <div className="space-y-3">
                  {task.agents.map((agent: any) => (
                    <div key={agent.id} className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                      <div>
                        <p className="text-white text-sm font-medium">{agent.name}</p>
                        <p className="text-slate-400 text-xs">{agent.role}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {agent.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">No agents assigned yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
