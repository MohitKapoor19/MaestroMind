import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Badge } from '@components/ui/badge';
import { Progress } from '@components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import { 
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle, XCircle, Plus, Edit2, Trash2, BarChart3,
  PieChart, Activity, Zap, Settings, Info
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface Budget {
  id: string;
  name: string;
  type: 'global' | 'task' | 'agent' | 'user';
  entityId?: string;
  entityName?: string;
  limit: number;
  spent: number;
  remaining: number;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'unlimited';
  thresholds: {
    warning: number;
    critical: number;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  resetAt?: Date;
}

interface BudgetAlert {
  id: string;
  budgetId: string;
  budgetName: string;
  type: 'warning' | 'critical' | 'exceeded';
  threshold: number;
  currentUsage: number;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
}

interface CostBreakdown {
  provider: string;
  model: string;
  operation: string;
  tokens: number;
  cost: number;
  count: number;
}

interface CostTrend {
  date: string;
  cost: number;
  tokens: number;
  tasks: number;
  agents: number;
}

export function BudgetDashboard() {
  const queryClient = useQueryClient();
  const [showCreateBudget, setShowCreateBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [newBudget, setNewBudget] = useState({
    name: '',
    type: 'global' as const,
    entityId: '',
    limit: 100,
    period: 'monthly' as const,
    thresholds: {
      warning: 75,
      critical: 90
    }
  });

  // Fetch budgets
  const { data: budgets = [], isLoading: budgetsLoading } = useQuery<Budget[]>({
    queryKey: ['budgets'],
    queryFn: async () => {
      const response = await fetch('/api/budgets');
      if (!response.ok) throw new Error('Failed to fetch budgets');
      return response.json();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch budget alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery<BudgetAlert[]>({
    queryKey: ['budgetAlerts'],
    queryFn: async () => {
      const response = await fetch('/api/budgets/alerts');
      if (!response.ok) throw new Error('Failed to fetch alerts');
      return response.json();
    },
    refetchInterval: 10000 // Check alerts every 10 seconds
  });

  // Fetch cost breakdown
  const { data: costBreakdown = [], isLoading: breakdownLoading } = useQuery<CostBreakdown[]>({
    queryKey: ['costBreakdown', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/budgets/breakdown?period=${selectedPeriod}`);
      if (!response.ok) throw new Error('Failed to fetch cost breakdown');
      return response.json();
    }
  });

  // Fetch cost trends
  const { data: costTrends = [], isLoading: trendsLoading } = useQuery<CostTrend[]>({
    queryKey: ['costTrends', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/budgets/trends?period=${selectedPeriod}`);
      if (!response.ok) throw new Error('Failed to fetch cost trends');
      return response.json();
    }
  });

  // Fetch cost summary
  const { data: costSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['costSummary'],
    queryFn: async () => {
      const response = await fetch('/api/budgets/summary');
      if (!response.ok) throw new Error('Failed to fetch cost summary');
      return response.json();
    },
    refetchInterval: 15000
  });

  // Create budget mutation
  const createBudgetMutation = useMutation({
    mutationFn: async (budget: typeof newBudget) => {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budget)
      });
      if (!response.ok) throw new Error('Failed to create budget');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget created successfully');
      setShowCreateBudget(false);
      setNewBudget({
        name: '',
        type: 'global',
        entityId: '',
        limit: 100,
        period: 'monthly',
        thresholds: { warning: 75, critical: 90 }
      });
    },
    onError: (error) => {
      toast.error(`Failed to create budget: ${error.message}`);
    }
  });

  // Update budget mutation
  const updateBudgetMutation = useMutation({
    mutationFn: async ({ id, budget }: { id: string; budget: Partial<Budget> }) => {
      const response = await fetch(`/api/budgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budget)
      });
      if (!response.ok) throw new Error('Failed to update budget');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget updated successfully');
      setEditingBudget(null);
    },
    onError: (error) => {
      toast.error(`Failed to update budget: ${error.message}`);
    }
  });

  // Delete budget mutation
  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/budgets/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete budget');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Budget deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete budget: ${error.message}`);
    }
  });

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await fetch(`/api/budgets/alerts/${alertId}/acknowledge`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to acknowledge alert');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetAlerts'] });
      toast.success('Alert acknowledged');
    },
    onError: (error) => {
      toast.error(`Failed to acknowledge alert: ${error.message}`);
    }
  });

  const getBudgetStatus = (budget: Budget) => {
    const percentage = (budget.spent / budget.limit) * 100;
    if (percentage >= budget.thresholds.critical) return 'critical';
    if (percentage >= budget.thresholds.warning) return 'warning';
    return 'healthy';
  };

  const getBudgetColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      case 'healthy': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  // Chart colors
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Budget & Cost Management</h2>
        <div className="flex gap-2">
          <Select value={selectedPeriod} onValueChange={(v: any) => setSelectedPeriod(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateBudget(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Budget
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.filter(a => !a.acknowledged).length > 0 && (
        <div className="space-y-2">
          {alerts.filter(a => !a.acknowledged).map((alert) => (
            <Alert key={alert.id} variant={alert.type === 'exceeded' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center justify-between">
                <span>{alert.budgetName} - {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Alert</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => acknowledgeAlertMutation.mutate(alert.id)}
                >
                  Dismiss
                </Button>
              </AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costSummary?.totalSpent || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {costSummary?.percentageChange > 0 ? '+' : ''}{costSummary?.percentageChange?.toFixed(1)}% from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(costSummary?.totalTokens || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Across {costSummary?.providerCount || 0} providers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Budgets</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budgets.filter(b => b.isActive).length}</div>
            <p className="text-xs text-muted-foreground">
              {budgets.filter(b => getBudgetStatus(b) === 'warning').length} warnings,{' '}
              {budgets.filter(b => getBudgetStatus(b) === 'critical').length} critical
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Task</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(costSummary?.avgCostPerTask || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(costSummary?.avgCostPerAgent || 0)} per agent
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="budgets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
        </TabsList>

        {/* Budgets Tab */}
        <TabsContent value="budgets" className="space-y-4">
          {/* Create/Edit Budget Form */}
          {(showCreateBudget || editingBudget) && (
            <Card>
              <CardHeader>
                <CardTitle>{editingBudget ? 'Edit Budget' : 'Create New Budget'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="budget-name">Budget Name</Label>
                    <Input
                      id="budget-name"
                      value={editingBudget ? editingBudget.name : newBudget.name}
                      onChange={(e) => {
                        if (editingBudget) {
                          setEditingBudget({ ...editingBudget, name: e.target.value });
                        } else {
                          setNewBudget({ ...newBudget, name: e.target.value });
                        }
                      }}
                      placeholder="Enter budget name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="budget-type">Budget Type</Label>
                    <Select
                      value={editingBudget ? editingBudget.type : newBudget.type}
                      onValueChange={(value: any) => {
                        if (editingBudget) {
                          setEditingBudget({ ...editingBudget, type: value });
                        } else {
                          setNewBudget({ ...newBudget, type: value });
                        }
                      }}
                    >
                      <SelectTrigger id="budget-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Global</SelectItem>
                        <SelectItem value="task">Per Task</SelectItem>
                        <SelectItem value="agent">Per Agent</SelectItem>
                        <SelectItem value="user">Per User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="budget-limit">Limit (USD)</Label>
                    <Input
                      id="budget-limit"
                      type="number"
                      value={editingBudget ? editingBudget.limit : newBudget.limit}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (editingBudget) {
                          setEditingBudget({ ...editingBudget, limit: value });
                        } else {
                          setNewBudget({ ...newBudget, limit: value });
                        }
                      }}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="budget-period">Period</Label>
                    <Select
                      value={editingBudget ? editingBudget.period : newBudget.period}
                      onValueChange={(value: any) => {
                        if (editingBudget) {
                          setEditingBudget({ ...editingBudget, period: value });
                        } else {
                          setNewBudget({ ...newBudget, period: value });
                        }
                      }}
                    >
                      <SelectTrigger id="budget-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="unlimited">Unlimited</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="warning-threshold">Warning Threshold (%)</Label>
                    <Input
                      id="warning-threshold"
                      type="number"
                      value={editingBudget ? editingBudget.thresholds.warning : newBudget.thresholds.warning}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (editingBudget) {
                          setEditingBudget({
                            ...editingBudget,
                            thresholds: { ...editingBudget.thresholds, warning: value }
                          });
                        } else {
                          setNewBudget({
                            ...newBudget,
                            thresholds: { ...newBudget.thresholds, warning: value }
                          });
                        }
                      }}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <Label htmlFor="critical-threshold">Critical Threshold (%)</Label>
                    <Input
                      id="critical-threshold"
                      type="number"
                      value={editingBudget ? editingBudget.thresholds.critical : newBudget.thresholds.critical}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (editingBudget) {
                          setEditingBudget({
                            ...editingBudget,
                            thresholds: { ...editingBudget.thresholds, critical: value }
                          });
                        } else {
                          setNewBudget({
                            ...newBudget,
                            thresholds: { ...newBudget.thresholds, critical: value }
                          });
                        }
                      }}
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateBudget(false);
                      setEditingBudget(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (editingBudget) {
                        updateBudgetMutation.mutate({
                          id: editingBudget.id,
                          budget: editingBudget
                        });
                      } else {
                        createBudgetMutation.mutate(newBudget);
                      }
                    }}
                    disabled={
                      editingBudget
                        ? !editingBudget.name || updateBudgetMutation.isPending
                        : !newBudget.name || createBudgetMutation.isPending
                    }
                  >
                    {editingBudget ? 'Update' : 'Create'} Budget
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Budget List */}
          <div className="grid grid-cols-2 gap-4">
            {budgetsLoading ? (
              <Card className="col-span-2">
                <CardContent className="py-8 text-center">Loading budgets...</CardContent>
              </Card>
            ) : budgets.length === 0 ? (
              <Card className="col-span-2">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No budgets created yet
                </CardContent>
              </Card>
            ) : (
              budgets.map((budget) => {
                const status = getBudgetStatus(budget);
                const percentage = (budget.spent / budget.limit) * 100;
                
                return (
                  <Card key={budget.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {budget.name}
                            <Badge variant={status === 'healthy' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}>
                              {budget.type}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {budget.period !== 'unlimited' && `Resets ${budget.period}`}
                            {budget.entityName && ` • ${budget.entityName}`}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingBudget(budget)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete budget "${budget.name}"?`)) {
                                deleteBudgetMutation.mutate(budget.id);
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Spent</span>
                          <span className={getBudgetColor(status)}>
                            {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
                          </span>
                        </div>
                        <Progress value={Math.min(percentage, 100)} className="h-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{percentage.toFixed(1)}% used</span>
                          <span>{formatCurrency(budget.remaining)} remaining</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Warning: {budget.thresholds.warning}%</span>
                          <span>Critical: {budget.thresholds.critical}%</span>
                        </div>
                        {budget.resetAt && (
                          <span className="text-xs text-muted-foreground">
                            Resets in {Math.ceil((new Date(budget.resetAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Cost Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={costTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="cost" stroke="#3b82f6" name="Cost" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Token Usage Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Token Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={costTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatNumber(value)} />
                    <Legend />
                    <Bar dataKey="tokens" fill="#10b981" name="Tokens" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cost Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Provider Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Cost by Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RePieChart>
                    <Pie
                      data={costBreakdown.reduce((acc: any[], item) => {
                        const existing = acc.find(a => a.name === item.provider);
                        if (existing) {
                          existing.value += item.cost;
                        } else {
                          acc.push({ name: item.provider, value: item.cost });
                        }
                        return acc;
                      }, [])}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {costBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </RePieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Operation Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Cost by Operation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {costBreakdown
                    .reduce((acc: any[], item) => {
                      const existing = acc.find(a => a.operation === item.operation);
                      if (existing) {
                        existing.cost += item.cost;
                        existing.count += item.count;
                      } else {
                        acc.push({
                          operation: item.operation,
                          cost: item.cost,
                          count: item.count
                        });
                      }
                      return acc;
                    }, [])
                    .sort((a, b) => b.cost - a.cost)
                    .slice(0, 5)
                    .map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-sm">{item.operation}</span>
                          <Badge variant="outline" className="text-xs">
                            {item.count} calls
                          </Badge>
                        </div>
                        <span className="text-sm font-medium">{formatCurrency(item.cost)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Optimization Tab */}
        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost Optimization Suggestions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {costSummary?.optimizationSuggestions?.map((suggestion: any, index: number) => (
                <Alert key={index}>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{suggestion.title}</AlertTitle>
                  <AlertDescription>
                    {suggestion.description}
                    {suggestion.potentialSaving && (
                      <span className="block mt-2 font-medium text-green-600">
                        Potential saving: {formatCurrency(suggestion.potentialSaving)}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )) || (
                <p className="text-muted-foreground">No optimization suggestions available at this time.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}