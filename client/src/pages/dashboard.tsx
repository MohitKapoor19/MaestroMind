import { useState } from 'react';
import MainLayout from '@/components/MainLayout';
import TaskCreator from '@/components/TaskCreator';
import AgentNetwork from '@/components/AgentNetwork';
import OutputCanvas from '@/components/OutputCanvas';
import ActivityLogs from '@/components/ActivityLogs';
import AgentInspector from '@/components/AgentInspector';
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
      case 'output':
        return <OutputCanvas taskId={selectedTaskId} />;
      case 'logs':
        return <ActivityLogs taskId={selectedTaskId} agentId={selectedAgentId} />;
      case 'inspector':
        return <AgentInspector agentId={selectedAgentId} />;
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
