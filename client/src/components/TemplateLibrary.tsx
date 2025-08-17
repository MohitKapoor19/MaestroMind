import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Textarea } from '@components/ui/textarea';
import { Badge } from '@components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@components/ui/dialog';
import { 
  Star, Download, Eye, Share, Search, Filter, Plus, 
  BookOpen, Code, BarChart3, Users, Zap, Sparkles,
  ThumbsUp, MessageSquare, Clock, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  rating: number;
  downloads: number;
  isBuiltIn: boolean;
  isPublic: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  agents: Array<{
    name: string;
    role: string;
    prompt: string;
    description: string;
    toolset: string[];
    suggestions: string;
  }>;
  executionPlan: {
    steps: string[];
    workflow: string;
    estimatedDuration: string;
  };
  metadata: {
    usageCount: number;
    successRate: number;
    avgRating: number;
    reviewCount: number;
  };
}

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType;
  color: string;
  count: number;
}

export function TemplateLibrary() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);

  // Template categories
  const categories: TemplateCategory[] = [
    {
      id: 'all',
      name: 'All Templates',
      description: 'Browse all available templates',
      icon: BookOpen,
      color: 'bg-blue-500',
      count: 0
    },
    {
      id: 'research',
      name: 'Research & Analysis',
      description: 'Templates for research and data analysis tasks',
      icon: BarChart3,
      color: 'bg-green-500',
      count: 0
    },
    {
      id: 'development',
      name: 'Development',
      description: 'Software development and coding templates',
      icon: Code,
      color: 'bg-purple-500',
      count: 0
    },
    {
      id: 'content',
      name: 'Content Creation',
      description: 'Writing, editing, and content generation',
      icon: Sparkles,
      color: 'bg-pink-500',
      count: 0
    },
    {
      id: 'automation',
      name: 'Automation',
      description: 'Process automation and workflow templates',
      icon: Zap,
      color: 'bg-yellow-500',
      count: 0
    },
    {
      id: 'collaboration',
      name: 'Team Collaboration',
      description: 'Multi-agent collaboration patterns',
      icon: Users,
      color: 'bg-indigo-500',
      count: 0
    }
  ];

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<AgentTemplate[]>({
    queryKey: ['templates', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await fetch(`/api/templates?${params}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    }
  });

  // Fetch template categories with counts
  const { data: categoryCounts = {} } = useQuery({
    queryKey: ['templateCategories'],
    queryFn: async () => {
      const response = await fetch('/api/templates/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    }
  });

  // Use template mutation
  const useTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(`/api/templates/${templateId}/use`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to use template');
      return response.json();
    },
    onSuccess: (task) => {
      toast.success('Template applied successfully');
      // Redirect to task creation with pre-filled agents
      window.location.href = `/create?template=${task.id}`;
    },
    onError: (error) => {
      toast.error(`Failed to use template: ${error.message}`);
    }
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (template: Partial<AgentTemplate>) => {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });
      if (!response.ok) throw new Error('Failed to save template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template saved successfully');
      setShowCreateTemplate(false);
    },
    onError: (error) => {
      toast.error(`Failed to save template: ${error.message}`);
    }
  });

  // Rate template mutation
  const rateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, rating }: { templateId: string; rating: number }) => {
      const response = await fetch(`/api/templates/${templateId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });
      if (!response.ok) throw new Error('Failed to rate template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Rating submitted');
    },
    onError: (error) => {
      toast.error(`Failed to rate template: ${error.message}`);
    }
  });

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = !searchQuery || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return BookOpen;
    return category.icon;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Template Library</h2>
        <Button onClick={() => setShowCreateTemplate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search templates, tags, or descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Categories */}
      <div className="grid grid-cols-6 gap-2">
        {categories.map((category) => {
          const Icon = category.icon;
          const count = categoryCounts[category.id] || 0;
          const isSelected = selectedCategory === category.id;
          
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isSelected 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded ${category.color} text-white`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{category.name}</p>
                  <p className="text-xs text-muted-foreground">{count} templates</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-3 gap-4">
        {templatesLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredTemplates.length === 0 ? (
          <div className="col-span-3 text-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No templates found</h3>
            <p className="text-muted-foreground">
              {searchQuery || selectedCategory !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Be the first to create a template!'
              }
            </p>
          </div>
        ) : (
          filteredTemplates.map((template) => {
            const CategoryIcon = getCategoryIcon(template.category);
            
            return (
              <Card key={template.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {template.description}
                        </CardDescription>
                      </div>
                    </div>
                    {template.isBuiltIn && (
                      <Badge variant="secondary" className="text-xs">
                        Built-in
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {template.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {template.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{template.tags.length - 3}
                      </Badge>
                    )}
                  </div>

                  {/* Rating and Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1">
                      {getRatingStars(Math.round(template.rating))}
                      <span className="text-muted-foreground ml-1">
                        ({template.metadata.reviewCount})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        <span>{template.downloads}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        <span>{template.metadata.successRate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Agents Preview */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {template.agents.length} Agents
                      </span>
                    </div>
                    <div className="space-y-1">
                      {template.agents.slice(0, 2).map((agent, index) => (
                        <div key={index} className="text-xs text-muted-foreground">
                          <span className="font-medium">{agent.name}:</span> {agent.role}
                        </div>
                      ))}
                      {template.agents.length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{template.agents.length - 2} more agents
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={() => useTemplateMutation.mutate(template.id)}
                      disabled={useTemplateMutation.isPending}
                    >
                      Use Template
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{template.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6">
                          <div>
                            <h4 className="font-medium mb-2">Description</h4>
                            <p className="text-muted-foreground">{template.description}</p>
                          </div>
                          
                          <div>
                            <h4 className="font-medium mb-2">Agents</h4>
                            <div className="space-y-3">
                              {template.agents.map((agent, index) => (
                                <div key={index} className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-medium">{agent.name}</h5>
                                    <Badge variant="outline">{agent.role}</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-2">
                                    {agent.description}
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {agent.toolset.map((tool) => (
                                      <Badge key={tool} variant="secondary" className="text-xs">
                                        {tool}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h4 className="font-medium mb-2">Execution Plan</h4>
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-sm mb-3">{template.executionPlan.workflow}</p>
                              <div className="space-y-1">
                                {template.executionPlan.steps.map((step, index) => (
                                  <div key={index} className="flex items-center gap-2 text-sm">
                                    <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-medium">
                                      {index + 1}
                                    </span>
                                    <span>{step}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>Estimated duration: {template.executionPlan.estimatedDuration}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button 
                              onClick={() => useTemplateMutation.mutate(template.id)}
                              disabled={useTemplateMutation.isPending}
                            >
                              Use This Template
                            </Button>
                            <Button variant="outline">
                              <Share className="w-4 h-4 mr-2" />
                              Share
                            </Button>
                            <div className="flex items-center gap-1 ml-auto">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => rateTemplateMutation.mutate({
                                    templateId: template.id,
                                    rating: star
                                  })}
                                  className="text-gray-300 hover:text-yellow-400 transition-colors"
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      star <= Math.round(template.rating) 
                                        ? 'fill-yellow-400 text-yellow-400' 
                                        : ''
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}