import { useQuery } from '@tanstack/react-query';
import type { LogFilter } from '@/lib/types';

export function useLogs(filters: LogFilter) {
  const queryParams = new URLSearchParams();
  
  if (filters.level) queryParams.append('level', filters.level);
  if (filters.category) queryParams.append('category', filters.category);
  if (filters.taskId) queryParams.append('taskId', filters.taskId);
  if (filters.agentId) queryParams.append('agentId', filters.agentId);
  if (filters.limit) queryParams.append('limit', filters.limit.toString());

  const queryString = queryParams.toString();
  const url = `/api/logs${queryString ? `?${queryString}` : ''}`;

  return useQuery({
    queryKey: ['/api/logs', filters],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}
