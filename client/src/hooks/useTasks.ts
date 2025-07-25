import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { CreateTaskRequest, TaskStatus } from '@/lib/types';

export function useTasks() {
  return useQuery({
    queryKey: ['/api/tasks'],
  });
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['/api/tasks', taskId],
    enabled: !!taskId,
  });
}

export function useTaskStatus(taskId: string) {
  return useQuery({
    queryKey: ['/api/tasks', taskId, 'status'],
    enabled: !!taskId,
    refetchInterval: 3000, // Refresh every 3 seconds for real-time status
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['/api/dashboard/metrics'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateTaskRequest) => {
      const formData = new FormData();
      
      // Add task data
      formData.append('title', params.title);
      formData.append('description', params.description);
      formData.append('priority', params.priority);
      if (params.estimatedDuration) {
        formData.append('estimatedDuration', params.estimatedDuration);
      }

      // Add files if any
      if (params.files) {
        params.files.forEach((file) => {
          formData.append('files', file);
        });
      }

      const response = await fetch('/api/tasks', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch tasks
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
    },
  });
}

export function useExecuteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, autoStart = true }: { taskId: string; autoStart?: boolean }) => {
      const response = await apiRequest('POST', `/api/tasks/${taskId}/execute`, { autoStart });
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: ['/api/tasks', variables.taskId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/tasks', variables.taskId, 'status'] 
      });
    },
  });
}

export function useTaskFiles(taskId: string) {
  return useQuery({
    queryKey: ['/api/tasks', taskId, 'files'],
    enabled: !!taskId,
  });
}
