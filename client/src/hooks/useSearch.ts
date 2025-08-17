import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface SearchResult {
  id: string;
  type: 'task' | 'agent' | 'log' | 'template';
  title: string;
  description?: string;
  metadata?: any;
  relevance: number;
}

export interface SearchFilters {
  types?: Array<'task' | 'agent' | 'log' | 'template'>;
  status?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

interface SearchOptions {
  query: string;
  filters?: SearchFilters;
  limit?: number;
}

async function searchAPI(options: SearchOptions): Promise<SearchResult[]> {
  const { query, filters, limit = 20 } = options;
  
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    q: query,
    limit: limit.toString(),
  });

  if (filters?.types?.length) {
    params.append('types', filters.types.join(','));
  }

  if (filters?.status?.length) {
    params.append('status', filters.status.join(','));
  }

  if (filters?.dateRange) {
    params.append('start', filters.dateRange.start.toISOString());
    params.append('end', filters.dateRange.end.toISOString());
  }

  const response = await fetch(`/api/search?${params}`);
  if (!response.ok) {
    throw new Error('Search failed');
  }

  return response.json();
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [isOpen, setIsOpen] = useState(false);

  const {
    data: results = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['search', query, filters],
    queryFn: () => searchAPI({ query, filters }),
    enabled: query.trim().length >= 2,
    staleTime: 30000, // 30 seconds
  });

  // Quick search for common patterns
  const quickSearchSuggestions = useMemo(() => {
    if (!query.trim()) return [];
    
    const suggestions: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // Common search patterns
    if (lowerQuery.includes('failed') || lowerQuery.includes('error')) {
      suggestions.push({
        id: 'quick-failed-tasks',
        type: 'task',
        title: 'Failed Tasks',
        description: 'Show all failed tasks',
        relevance: 0.9,
      });
    }

    if (lowerQuery.includes('active') || lowerQuery.includes('running')) {
      suggestions.push({
        id: 'quick-active-tasks',
        type: 'task',
        title: 'Active Tasks',
        description: 'Show all running tasks',
        relevance: 0.9,
      });
    }

    if (lowerQuery.includes('agent')) {
      suggestions.push({
        id: 'quick-all-agents',
        type: 'agent',
        title: 'All Agents',
        description: 'Show all agents',
        relevance: 0.8,
      });
    }

    if (lowerQuery.includes('cost') || lowerQuery.includes('budget')) {
      suggestions.push({
        id: 'quick-budget',
        type: 'task',
        title: 'Budget Dashboard',
        description: 'Open budget monitoring',
        relevance: 0.8,
      });
    }

    return suggestions;
  }, [query]);

  const allResults = useMemo(() => {
    const combined = [...quickSearchSuggestions, ...results];
    return combined
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);
  }, [quickSearchSuggestions, results]);

  const search = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setIsOpen(newQuery.trim().length >= 2);
  }, []);

  const updateFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setFilters({});
    setIsOpen(false);
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    setIsOpen(false);
    return result;
  }, []);

  return {
    query,
    filters,
    results: allResults,
    isLoading,
    error,
    isOpen,
    search,
    updateFilters,
    clearSearch,
    selectResult,
    setIsOpen,
  };
}