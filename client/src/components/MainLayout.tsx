import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Brain, ChartLine, Plus, Users, CheckSquare, BarChart3, FileText, Search, Bell, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardMetrics } from '@/hooks/useTasks';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { TabType } from '@/lib/types';

interface MainLayoutProps {
  children: React.ReactNode;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function MainLayout({ children, activeTab, onTabChange }: MainLayoutProps) {
  const { data: metrics } = useDashboardMetrics();
  const [isConnected, setIsConnected] = useState(false);

  useWebSocket({
    onConnect: () => setIsConnected(true),
    onDisconnect: () => setIsConnected(false),
  });

  const navigationItems = [
    {
      id: 'create' as TabType,
      label: 'Create Task',
      icon: Plus,
      description: 'Start new multi-agent task',
    },
    {
      id: 'network' as TabType,
      label: 'Agent Network',
      icon: Users,
      description: 'Visualize agent collaboration',
    },
    {
      id: 'workflow' as TabType,
      label: 'n8n Workflows',
      icon: Workflow,
      description: 'Automate task execution',
    },
    {
      id: 'output' as TabType,
      label: 'Output Canvas',
      icon: FileText,
      description: 'View execution results',
    },
    {
      id: 'logs' as TabType,
      label: 'Activity Logs',
      icon: BarChart3,
      description: 'Real-time system events',
    },
    {
      id: 'inspector' as TabType,
      label: 'Agent Inspector',
      icon: Search,
      description: 'Deep agent analysis',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <aside className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
        {/* Logo and Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
              <Brain className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Maestro</h1>
              <p className="text-sm text-slate-400">Agent Orchestration</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-left",
                  isActive
                    ? "bg-slate-700 text-white border-l-4 border-primary"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5" />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-slate-400">{item.description}</div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Quick Stats */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-400">System Status</h3>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            )} />
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Active Agents</span>
              <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                {metrics?.overview?.activeAgents || 0}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Running Tasks</span>
              <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                {metrics?.overview?.activeTasks || 0}
              </Badge>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Completed Today</span>
              <Badge variant="secondary" className="bg-slate-600 text-slate-200">
                {metrics?.overview?.completedTasks || 0}
              </Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold text-white">
                {navigationItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
              </h2>
              <div className="flex items-center space-x-2 text-sm text-slate-400">
                <span>Maestro</span>
                <span>•</span>
                <span className="text-slate-200">
                  {navigationItems.find(item => item.id === activeTab)?.label}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Search */}
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search tasks, agents..."
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 w-80 pl-10"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              </div>
              
              {/* Notifications */}
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                <Bell className="w-5 h-5" />
              </Button>
              
              {/* User Avatar */}
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">U</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
