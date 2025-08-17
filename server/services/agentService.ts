import { storage } from "../storage";
import { llmRouter, type LLMProvider } from "./llmRouter";
import { timelineService } from "./timelineService";
import type { Agent, InsertAgent, AgentExecution, Task } from "@shared/schema";

export interface AgentGenerationRequest {
  taskId: string;
  taskDescription: string;
  priority: string;
}

export interface AgentExecutionRequest {
  agentId: string;
  action: string;
  input: any;
  context?: string;
}

export interface CollaborationRequest {
  fromAgentId: string;
  toAgentId: string;
  collaborationType: 'refinement' | 'critique' | 'handoff';
  content: any;
}

export class AgentService {
  // Generate a team of agents for a specific task using AutoAgents framework
  // Now includes iterative drafting loop with Observer agents
  async generateAgentTeam(request: AgentGenerationRequest): Promise<{
    agents: Agent[];
    executionPlan: any;
  }> {
    try {
      await storage.createLog({
        level: 'info',
        category: 'agent',
        message: 'Starting iterative agent team generation',
        data: { taskId: request.taskId, priority: request.priority },
        taskId: request.taskId,
      });

      // Iterative drafting loop with convergence criteria
      const MAX_ITERATIONS = 3;
      const CONFIDENCE_THRESHOLD = 80;
      let iteration = 0;
      let bestTeamGeneration: any = null;
      let bestConfidence = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        
        await storage.createLog({
          level: 'info',
          category: 'agent',
          message: `Drafting iteration ${iteration}`,
          taskId: request.taskId,
        });

        // Use LLM Router to generate agent team with fallback support
        const teamGeneration = await llmRouter.generateAgentTeam(
          request.taskDescription,
          { taskId: request.taskId }
        );

        // AgentObserver critique - evaluate agent suitability
        const agentCritique = await llmRouter.observeAndCritique(
          teamGeneration.agents,
          `Task: ${request.taskDescription}\nPriority: ${request.priority}`,
          'plan',
          { taskId: request.taskId }
        );

        // PlanObserver critique - evaluate plan rationality
        const planCritique = await llmRouter.observeAndCritique(
          teamGeneration.executionPlan,
          `Task: ${request.taskDescription}\nAgents: ${teamGeneration.agents.map((a: any) => a.role).join(', ')}`,
          'plan',
          { taskId: request.taskId }
        );

        const avgConfidence = (agentCritique.confidence + planCritique.confidence) / 2;

        await storage.createLog({
          level: 'info',
          category: 'agent',
          message: `Iteration ${iteration} critique results`,
          data: {
            agentConfidence: agentCritique.confidence,
            planConfidence: planCritique.confidence,
            avgConfidence,
            needsRefinement: agentCritique.needsRefinement || planCritique.needsRefinement,
          },
          taskId: request.taskId,
        });

        // Keep best generation so far
        if (avgConfidence > bestConfidence) {
          bestTeamGeneration = teamGeneration;
          bestConfidence = avgConfidence;
        }

        // Check convergence criteria
        if (avgConfidence >= CONFIDENCE_THRESHOLD && 
            !agentCritique.needsRefinement && 
            !planCritique.needsRefinement) {
          await storage.createLog({
            level: 'info',
            category: 'agent',
            message: `Converged at iteration ${iteration} with confidence ${avgConfidence}`,
            taskId: request.taskId,
          });
          break;
        }

        // If refinement needed and not last iteration, incorporate feedback
        if (iteration < MAX_ITERATIONS && 
            (agentCritique.needsRefinement || planCritique.needsRefinement)) {
          const refinementSuggestions = [
            ...agentCritique.suggestions,
            ...planCritique.suggestions
          ].join('\n');
          
          // Modify task description with refinement suggestions for next iteration
          request.taskDescription = `${request.taskDescription}\n\nRefinement suggestions from observers:\n${refinementSuggestions}`;
        }
      }

      // Use best generation found
      const teamGeneration = bestTeamGeneration;

      // Create execution plan
      const executionPlan = await storage.createExecutionPlan({
        taskId: request.taskId,
        plannerOutput: teamGeneration,
        agentRoles: teamGeneration.agents,
        executionSteps: teamGeneration.executionPlan.steps,
        status: 'draft',
      });

      // Create agents in database and track timeline events
      const createdAgents: Agent[] = [];
      for (const agentData of teamGeneration.agents) {
        const agent = await storage.createAgent({
          taskId: request.taskId,
          name: agentData.name,
          role: agentData.role,
          prompt: agentData.prompt,
          description: agentData.description,
          toolset: agentData.toolset,
          suggestions: agentData.suggestions,
          status: 'pending',
        });
        createdAgents.push(agent);

        // Record agent creation event in timeline
        await timelineService.recordAgentEvent(
          request.taskId,
          agent.id,
          'agent_created',
          agent,
          {
            iterationCount: iteration,
            confidence: bestConfidence,
            role: agent.role,
            teamSize: teamGeneration.agents.length,
          }
        );
      }

      await storage.createLog({
        level: 'info',
        category: 'agent',
        message: `Generated ${createdAgents.length} agents for task`,
        data: { 
          taskId: request.taskId, 
          agentCount: createdAgents.length,
          agentRoles: createdAgents.map(a => a.role)
        },
        taskId: request.taskId,
      });

      return {
        agents: createdAgents,
        executionPlan: executionPlan,
      };
    } catch (error) {
      await storage.createLog({
        level: 'error',
        category: 'agent',
        message: `Failed to generate agent team: ${error}`,
        taskId: request.taskId,
      });
      throw error;
    }
  }

  // Execute an action with a specific agent
  async executeAgentAction(request: AgentExecutionRequest): Promise<AgentExecution> {
    const startTime = Date.now();
    
    try {
      const agent = await storage.getAgent(request.agentId);
      if (!agent) {
        throw new Error(`Agent ${request.agentId} not found`);
      }

      // Update agent status to working and record start event
      await storage.updateAgent(request.agentId, { 
        status: 'working',
        updatedAt: new Date(),
      });

      // Record agent execution start event
      await timelineService.recordAgentEvent(
        agent.taskId || '',
        request.agentId,
        'agent_started',
        agent,
        {
          action: request.action,
          context: request.context || '',
          startTime: new Date().toISOString(),
        }
      );

      await storage.createLog({
        level: 'info',
        category: 'agent',
        message: `Agent ${agent.name} starting execution`,
        data: { action: request.action, agentRole: agent.role },
        taskId: agent.taskId || undefined,
        agentId: request.agentId,
      });

      // Use LLM Router to execute the action with fallback support
      const execution = await llmRouter.executeAgentAction(
        agent.prompt,
        request.context || agent.memoryContext || "",
        `Action: ${request.action}\nInput: ${JSON.stringify(request.input)}`,
        { 
          agentId: request.agentId,
          taskId: agent.taskId || undefined
        }
      );

      const duration = Date.now() - startTime;

      // Create execution record
      const agentExecution = await storage.createAgentExecution({
        agentId: request.agentId,
        taskId: agent.taskId || undefined,
        action: request.action,
        input: request.input,
        output: { response: execution.response },
        status: 'completed',
        tokensUsed: execution.tokensUsed,
        cost: execution.cost.toString(),
        duration,
      });

      // Update agent with new confidence and memory context
      const updatedAgent = await storage.updateAgent(request.agentId, {
        status: 'idle',
        confidence: execution.confidence.toString(),
        memoryContext: {
          lastAction: request.action,
          lastResponse: execution.response,
          executionHistory: agent.memoryContext?.executionHistory || [],
        },
        updatedAt: new Date(),
      });

      // Record successful execution event
      await timelineService.recordExecutionEvent(
        agent.taskId || '',
        request.agentId,
        agentExecution.id,
        'execution_completed',
        agentExecution,
        {
          action: request.action,
          duration,
          tokensUsed: execution.tokensUsed,
          cost: execution.cost,
          confidence: execution.confidence,
          provider: execution.provider,
        }
      );

      await storage.createLog({
        level: 'info',
        category: 'agent',
        message: `Agent ${agent.name} completed execution`,
        data: { 
          duration,
          tokensUsed: execution.tokensUsed,
          confidence: execution.confidence,
          cost: execution.cost,
        },
        taskId: agent.taskId || undefined,
        agentId: request.agentId,
      });

      return agentExecution;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Create failed execution record
      const agentExecution = await storage.createAgentExecution({
        agentId: request.agentId,
        taskId: undefined, // Will be set if agent exists
        action: request.action,
        input: request.input,
        output: {},
        status: 'failed',
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      // Update agent status to error
      await storage.updateAgent(request.agentId, { 
        status: 'error',
        updatedAt: new Date(),
      });

      // Record failed execution event (get agent for taskId)
      try {
        const failedAgent = await storage.getAgent(request.agentId);
        if (failedAgent) {
          await timelineService.recordExecutionEvent(
            failedAgent.taskId || '',
            request.agentId,
            agentExecution.id,
            'execution_failed',
            agentExecution,
            {
              action: request.action,
              duration,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            }
          );
        }
      } catch (timelineError) {
        console.error('Failed to record timeline event for failed execution:', timelineError);
      }

      await storage.createLog({
        level: 'error',
        category: 'agent',
        message: `Agent execution failed: ${error}`,
        data: { action: request.action, duration },
        agentId: request.agentId,
      });

      throw error;
    }
  }

  // Facilitate collaboration between agents
  async facilitateCollaboration(request: CollaborationRequest): Promise<any> {
    try {
      const fromAgent = await storage.getAgent(request.fromAgentId);
      const toAgent = await storage.getAgent(request.toAgentId);

      if (!fromAgent || !toAgent) {
        throw new Error('One or both agents not found');
      }

      // Create collaboration record
      const collaboration = await storage.createCollaboration({
        taskId: fromAgent.taskId || toAgent.taskId || '',
        fromAgentId: request.fromAgentId,
        toAgentId: request.toAgentId,
        collaborationType: request.collaborationType,
        content: request.content,
        status: 'pending',
      });

      // Record collaboration initiation event
      await timelineService.recordCollaborationEvent(
        fromAgent.taskId || toAgent.taskId || '',
        collaboration,
        'collaboration_initiated',
        {
          fromAgentName: fromAgent.name,
          toAgentName: toAgent.name,
          collaborationType: request.collaborationType,
          contentPreview: typeof request.content === 'string' ? request.content.substring(0, 200) : JSON.stringify(request.content).substring(0, 200),
        }
      );

      await storage.createLog({
        level: 'info',
        category: 'agent',
        message: `Collaboration initiated: ${fromAgent.name} -> ${toAgent.name}`,
        data: { 
          collaborationType: request.collaborationType,
          collaborationId: collaboration.id,
        },
        taskId: fromAgent.taskId || undefined,
      });

      // Generate response based on collaboration type
      let response;
      switch (request.collaborationType) {
        case 'refinement':
          response = await this.handleRefinementCollaboration(fromAgent, toAgent, request.content);
          break;
        case 'critique':
          response = await this.handleCritiqueCollaboration(fromAgent, toAgent, request.content);
          break;
        case 'handoff':
          response = await this.handleHandoffCollaboration(fromAgent, toAgent, request.content);
          break;
        default:
          throw new Error(`Unknown collaboration type: ${request.collaborationType}`);
      }

      // Update collaboration with response
      const updatedCollaboration = await storage.updateCollaboration(collaboration.id, {
        response,
        status: 'completed',
      });

      // Record successful collaboration event
      await timelineService.recordCollaborationEvent(
        fromAgent.taskId || toAgent.taskId || '',
        updatedCollaboration,
        'collaboration_completed',
        {
          fromAgentName: fromAgent.name,
          toAgentName: toAgent.name,
          collaborationType: request.collaborationType,
          responsePreview: typeof response === 'string' ? response.substring(0, 200) : JSON.stringify(response).substring(0, 200),
        }
      );

      return { collaboration: updatedCollaboration, response };
    } catch (error) {
      await storage.createLog({
        level: 'error',
        category: 'agent',
        message: `Collaboration failed: ${error}`,
        data: { 
          fromAgentId: request.fromAgentId,
          toAgentId: request.toAgentId,
          collaborationType: request.collaborationType,
        },
      });
      throw error;
    }
  }

  // Observer pattern implementation for plan and execution monitoring
  async observeAndRefine(taskId: string, type: 'plan' | 'execution'): Promise<any> {
    try {
      const task = await storage.getTaskWithAgents(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      let observationTarget;
      if (type === 'plan') {
        const plans = await storage.getExecutionPlansByTask(taskId);
        observationTarget = plans[0]; // Get latest plan
      } else {
        const executions = await storage.getExecutionsByTask(taskId);
        observationTarget = executions;
      }

      const context = `Task: ${task.title}\nDescription: ${task.description}\nAgents: ${task.agents.map(a => a.role).join(', ')}`;

      const observation = await llmRouter.observeAndCritique(
        observationTarget,
        context,
        type,
        { taskId }
      );

      await storage.createLog({
        level: 'info',
        category: 'agent',
        message: `Observer completed ${type} evaluation`,
        data: {
          needsRefinement: observation.needsRefinement,
          confidence: observation.confidence,
          suggestionCount: observation.suggestions.length,
        },
        taskId,
      });

      return observation;
    } catch (error) {
      await storage.createLog({
        level: 'error',
        category: 'agent',
        message: `Observer evaluation failed: ${error}`,
        taskId,
      });
      throw error;
    }
  }

  // Get comprehensive agent status for monitoring
  async getAgentStatus(agentId: string): Promise<any> {
    const agent = await storage.getAgentWithExecutions(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const recentExecutions = agent.executions.slice(0, 10);
    const avgExecutionTime = recentExecutions.length > 0
      ? recentExecutions.reduce((sum, exec) => sum + (exec.duration || 0), 0) / recentExecutions.length
      : 0;

    const totalCost = recentExecutions.reduce((sum, exec) => 
      sum + (parseFloat(exec.cost || '0')), 0
    );

    return {
      agent,
      metrics: {
        totalExecutions: agent.executions.length,
        avgExecutionTime,
        totalCost,
        successRate: recentExecutions.filter(e => e.status === 'completed').length / Math.max(recentExecutions.length, 1),
      },
      recentActivity: recentExecutions,
      collaborations: {
        outgoing: agent.collaborationsFrom.length,
        incoming: agent.collaborationsTo.length,
      },
    };
  }

  private async handleRefinementCollaboration(fromAgent: Agent, toAgent: Agent, content: any): Promise<any> {
    const refinementPrompt = `${toAgent.prompt}\n\nYou are collaborating with ${fromAgent.name} (${fromAgent.role}) on a refinement task. 
    
    Their contribution: ${JSON.stringify(content)}
    
    Please review, refine, and enhance their work based on your expertise. Provide constructive feedback and improvements.`;

    return await llmRouter.executeAgentAction(
      refinementPrompt,
      toAgent.memoryContext || "",
      JSON.stringify(content),
      {
        agentId: toAgent.id,
        taskId: toAgent.taskId || undefined
      }
    );
  }

  private async handleCritiqueCollaboration(fromAgent: Agent, toAgent: Agent, content: any): Promise<any> {
    const critiquePrompt = `${toAgent.prompt}\n\nYou are providing a critique of work done by ${fromAgent.name} (${fromAgent.role}).
    
    Their work: ${JSON.stringify(content)}
    
    Provide a detailed, constructive critique focusing on strengths, weaknesses, and specific suggestions for improvement.`;

    return await llmRouter.executeAgentAction(
      critiquePrompt,
      toAgent.memoryContext || "",
      JSON.stringify(content),
      {
        agentId: toAgent.id,
        taskId: toAgent.taskId || undefined
      }
    );
  }

  private async handleHandoffCollaboration(fromAgent: Agent, toAgent: Agent, content: any): Promise<any> {
    const handoffPrompt = `${toAgent.prompt}\n\n${fromAgent.name} (${fromAgent.role}) is handing off this work to you:
    
    Handoff details: ${JSON.stringify(content)}
    
    Please take ownership of this work and continue from where they left off. Acknowledge the handoff and outline your next steps.`;

    return await llmRouter.executeAgentAction(
      handoffPrompt,
      toAgent.memoryContext || "",
      JSON.stringify(content),
      {
        agentId: toAgent.id,
        taskId: toAgent.taskId || undefined
      }
    );
  }
}

export const agentService = new AgentService();
