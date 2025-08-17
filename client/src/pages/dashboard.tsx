import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import TaskCreator from '@/components/TaskCreator';
import AgentNetwork from '@/components/AgentNetwork';
import OutputCanvas from '@/components/OutputCanvas';
import ActivityLogs from '@/components/ActivityLogs';
import AgentInspector from '@/components/AgentInspector';
import N8nWorkflowBuilder from '@/components/N8nWorkflowBuilder';
import TaskQueueManager from '@/components/TaskQueueManager';
import BudgetDashboard from '@/components/BudgetDashboard';
import TemplateLibrary from '@/components/TemplateLibrary';
import TimelineViewer from '@/components/TimelineViewer';
import type { TabType } from '@/lib/types';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const handleTaskCreated = (taskId: string) => {
    setSelectedTaskId(taskId);
    setActiveTab('network');
  };

  const handleAgentSelected = (agentId: string) => {
    setSelectedAgentId(agentId);
    setActiveTab('inspector');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'create':
        return <TaskCreator onTaskCreated={handleTaskCreated} />;
      case 'network':
        return (
          <AgentNetwork 
            selectedTaskId={selectedTaskId}
            onAgentSelect={handleAgentSelected}
            onTaskSelect={setSelectedTaskId}
          />
        );
      case 'workflow':
        return (
          <N8nWorkflowBuilder 
            taskId={selectedTaskId}
            onSave={(workflow) => console.log('Saving workflow:', workflow)}
            onExecute={(workflow) => console.log('Executing workflow:', workflow)}
          />
        );
      case 'output':
        return <OutputCanvas taskId={selectedTaskId} />;
      case 'logs':
        return <ActivityLogs taskId={selectedTaskId} agentId={selectedAgentId} />;
      case 'inspector':
        return <AgentInspector agentId={selectedAgentId} />;
      case 'queue':
        return <TaskQueueManager />;
      case 'budget':
        return <BudgetDashboard />;
      case 'timeline':
        return <TimelineViewer />;
      case 'templates':
        return <TemplateLibrary />;
      default:
        return <TaskCreator onTaskCreated={handleTaskCreated} />;
    }
  };

  return (
    <MainLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderTabContent()}
    </MainLayout>
  );
}
