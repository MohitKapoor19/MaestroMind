import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useLogs } from '@/hooks/useLogs';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Filter, Search, Download, RefreshCw, Terminal, AlertCircle, Info, AlertTriangle, Bug } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RealtimeUpdate, LogFilter } from '@/lib/types';

interface ActivityLogsProps {
  taskId?: string | null;
  agentId?: string | null;
}

export default function ActivityLogs({ taskId, agentId }: ActivityLogsProps) {
  const [filters, setFilters] = useState<LogFilter>({
    level: '',
    category: '',
    taskId: taskId || undefined,
    agentId: agentId || undefined,
    limit: 100,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [newLogsCount, setNewLogsCount] = useState(0);

  const { data: logs, refetch, isLoading } = useLogs(filters);

  // Real-time log updates
  useWebSocket({
    onMessage: (update: RealtimeUpdate) => {
      if (update.type === 'log_update' && autoRefresh) {
        setNewLogsCount(prev => prev + 1);
        refetch();
      }
    },
  });

  // Update filters when props change
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      taskId: taskId || undefined,
      agentId: agentId || undefined,
    }));
  }, [taskId, agentId]);

  const filteredLogs = logs?.filter((log: any) => 
    !searchTerm || 
    log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.category.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-400" />;
      case 'debug':
        return <Bug className="w-4 h-4 text-gray-400" />;
      default:
        return <Terminal className="w-4 h-4 text-slate-400" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'border-l-red-500 bg-red-500/10';
      case 'warn':
        return 'border-l-yellow-500 bg-yellow-500/10';
      case 'info':
        return 'border-l-blue-500 bg-blue-500/10';
      case 'debug':
        return 'border-l-gray-500 bg-gray-500/10';
      default:
        return 'border-l-slate-500 bg-slate-500/10';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'agent':
        return 'bg-purple-500/20 text-purple-400';
      case 'task':
        return 'bg-blue-500/20 text-blue-400';
      case 'api':
        return 'bg-green-500/20 text-green-400';
      case 'system':
        return 'bg-orange-500/20 text-orange-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const handleRefresh = () => {
    setNewLogsCount(0);
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Activity Logs</h2>
          <p className="text-slate-400 mt-1">Real-time system events and agent activities</p>
        </div>
        <div className="flex items-center space-x-2">
          {newLogsCount > 0 && (
            <Badge variant="secondary" className="bg-primary/20 text-primary">
              {newLogsCount} new
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
            className="border-slate-600 text-slate-300"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="border-slate-600 text-slate-300">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white pl-10"
              />
            </div>

            {/* Level Filter */}
            <Select value={filters.level || 'all'} onValueChange={(value) => 
              setFilters(prev => ({ ...prev, level: value === 'all' ? undefined : value }))
            }>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={filters.category || 'all'} onValueChange={(value) => 
              setFilters(prev => ({ ...prev, category: value === 'all' ? undefined : value }))
            }>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            {/* Limit */}
            <Select value={filters.limit?.toString() || '100'} onValueChange={(value) => 
              setFilters(prev => ({ ...prev, limit: parseInt(value) }))
            }>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 entries</SelectItem>
                <SelectItem value="100">100 entries</SelectItem>
                <SelectItem value="200">200 entries</SelectItem>
                <SelectItem value="500">500 entries</SelectItem>
              </SelectContent>
            </Select>

            {/* Auto Refresh Toggle */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="auto-refresh" className="text-slate-300 text-sm">
                Auto refresh
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Display */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center">
              <Terminal className="w-5 h-5 mr-2" />
              System Logs
              <Badge variant="secondary" className="ml-2">
                {filteredLogs.length} entries
              </Badge>
            </CardTitle>
            <div className="text-sm text-slate-400">
              {taskId && <span>Task: {taskId.slice(0, 8)}...</span>}
              {agentId && <span className="ml-2">Agent: {agentId.slice(0, 8)}...</span>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-96">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
                Loading logs...
              </div>
            ) : filteredLogs.length > 0 ? (
              <div className="space-y-1 p-4">
                {filteredLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className={cn(
                      "p-3 border-l-4 rounded-r-lg transition-colors",
                      getLevelColor(log.level)
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          {getLevelIcon(log.level)}
                          <Badge variant="outline" className={getCategoryColor(log.category)}>
                            {log.category}
                          </Badge>
                          <span className="text-slate-400 text-xs font-mono">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-white text-sm">{log.message}</p>
                        {log.data && (
                          <details className="mt-2">
                            <summary className="text-slate-400 text-xs cursor-pointer hover:text-slate-300">
                              View details
                            </summary>
                            <pre className="text-xs text-slate-400 mt-1 p-2 bg-slate-900 rounded overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-slate-400">
                <div className="text-center">
                  <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No logs found</p>
                  <p className="text-sm">Try adjusting your filters</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
