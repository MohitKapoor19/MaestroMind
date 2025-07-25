import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { AgentStatus, AgentExecutionRequest, CollaborationRequest } from '@/lib/types';

export function useAgents(taskId?: string) {
  return useQuery({
    queryKey: taskId ? ['/api/agents', { taskId }] : ['/api/agents'],
    enabled: !!taskId,
  });
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: ['/api/agents', agentId],
    enabled: !!agentId,
  });
}

export function useAgentStatus(agentId: string) {
  return useQuery({
    queryKey: ['/api/agents', agentId, 'status'],
    enabled: !!agentId,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time status
  });
}

export function useExecuteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, ...params }: AgentExecutionRequest) => {
      const response = await apiRequest(
        'POST',
        `/api/agents/${agentId}/execute`,
        params
      );
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: ['/api/agents', variables.agentId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/agents', variables.agentId, 'status'] 
      });
    },
  });
}

export function useCreateCollaboration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CollaborationRequest) => {
      const response = await apiRequest('POST', '/api/collaborations', params);
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: ['/api/agents', variables.fromAgentId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/agents', variables.toAgentId] 
      });
    },
  });
}
