import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface N8nWorkflow {
  id?: string;
  taskId?: string;
  name: string;
  description: string;
  nodes: any[];
  connections: any[];
  settings: Record<string, any>;
  status: 'draft' | 'active' | 'paused' | 'error';
  workflowData: any;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function useWorkflows(taskId?: string) {
  return useQuery({
    queryKey: taskId ? ['/api/workflows', taskId] : ['/api/workflows'],
    queryFn: () => apiRequest(`/api/workflows${taskId ? `?taskId=${taskId}` : ''}`),
  });
}

export function useWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ['/api/workflows', workflowId],
    queryFn: () => apiRequest(`/api/workflows/${workflowId}`),
    enabled: !!workflowId,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workflow: Omit<N8nWorkflow, 'id' | 'createdAt' | 'updatedAt'>) =>
      apiRequest('/api/workflows', {
        method: 'POST',
        body: JSON.stringify(workflow),
      }),
    onSuccess: (data, variables) => {
      // Invalidate and refetch workflows
      queryClient.invalidateQueries({ queryKey: ['/api/workflows'] });
      if (variables.taskId) {
        queryClient.invalidateQueries({ queryKey: ['/api/workflows', variables.taskId] });
      }
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<N8nWorkflow> }) =>
      apiRequest(`/api/workflows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: (data, variables) => {
      // Update the specific workflow
      queryClient.setQueryData(['/api/workflows', variables.id], data);
      // Invalidate workflows list
      queryClient.invalidateQueries({ queryKey: ['/api/workflows'] });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/workflows/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (data, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: ['/api/workflows', id] });
      // Invalidate workflows list
      queryClient.invalidateQueries({ queryKey: ['/api/workflows'] });
    },
  });
}

export function useExecuteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/workflows/${id}/execute`, {
        method: 'POST',
      }),
    onSuccess: (data, id) => {
      // Invalidate workflow to get updated status
      queryClient.invalidateQueries({ queryKey: ['/api/workflows', id] });
    },
  });
}

export function useValidateWorkflow() {
  return useMutation({
    mutationFn: (workflow: Partial<N8nWorkflow>) =>
      apiRequest('/api/workflows/validate', {
        method: 'POST',
        body: JSON.stringify(workflow),
      }),
  });
}