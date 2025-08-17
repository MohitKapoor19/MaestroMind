import { storage } from "../storage";
import { agentService } from "./agentService";
import type { 
  AgentTemplate, 
  InsertAgentTemplate, 
  TemplateUsage,
  Agent,
  Task,
  AgentTemplateWithUsage,
  InsertAgent
} from "@shared/schema";

export interface AgentConfigTemplate {
  name: string;
  role: string;
  prompt: string;
  description: string;
  toolset: string[];
  suggestions: string;
}

export interface TemplateCreationOptions {
  makePublic?: boolean;
  createdBy?: string;
  tags?: string[];
  category?: string;
  metadata?: any;
}

export interface TemplateSearchOptions {
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  createdBy?: string;
  minRating?: number;
  sortBy?: 'rating' | 'usage' | 'recent' | 'name';
  limit?: number;
}

export interface TemplateUsageStats {
  totalUsage: number;
  recentUsage: number; // last 30 days
  averageRating: number;
  ratingCount: number;
  popularTags: string[];
  successRate: number;
  categories: Record<string, number>;
}

export class TemplateService {
  // Template Creation & Management
  async createTemplate(
    agentConfig: AgentConfigTemplate,
    templateInfo: {
      name: string;
      description: string;
      category: string;
    },
    options: TemplateCreationOptions = {}
  ): Promise<AgentTemplate> {
    const template = await storage.createAgentTemplate({
      name: templateInfo.name,
      description: templateInfo.description,
      category: templateInfo.category,
      agentConfig,
      tags: options.tags || [],
      isPublic: options.makePublic || false,
      createdBy: options.createdBy || 'system',
      usageCount: 0,
      rating: 0,
      ratingCount: 0,
      version: 1,
      isActive: true,
      metadata: options.metadata,
    });

    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Agent template '${template.name}' created`,
      data: {
        templateId: template.id,
        category: template.category,
        isPublic: template.isPublic,
        createdBy: template.createdBy,
        tags: template.tags,
      },
    });

    return template;
  }

  async createTemplateFromAgent(
    agentId: string,
    templateInfo: {
      name: string;
      description: string;
      category: string;
    },
    options: TemplateCreationOptions = {}
  ): Promise<AgentTemplate> {
    const agent = await storage.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const agentConfig: AgentConfigTemplate = {
      name: agent.name,
      role: agent.role,
      prompt: agent.prompt,
      description: agent.description,
      toolset: agent.toolset as string[],
      suggestions: agent.suggestions || '',
    };

    const template = await this.createTemplate(agentConfig, templateInfo, {
      ...options,
      metadata: {
        ...options.metadata,
        sourceAgentId: agentId,
        extractedAt: new Date().toISOString(),
      },
    });

    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Template '${template.name}' created from agent '${agent.name}'`,
      data: {
        templateId: template.id,
        sourceAgentId: agentId,
        agentName: agent.name,
      },
    });

    return template;
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<InsertAgentTemplate>
  ): Promise<AgentTemplate> {
    const template = await storage.updateAgentTemplate(templateId, {
      ...updates,
      version: updates.version ? updates.version + 1 : undefined,
    });

    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Template '${template.name}' updated to version ${template.version}`,
      data: {
        templateId,
        updates: Object.keys(updates),
        newVersion: template.version,
      },
    });

    return template;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const template = await storage.getAgentTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    await storage.deleteAgentTemplate(templateId);

    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Template '${template.name}' deleted`,
      data: { templateId, templateName: template.name },
    });
  }

  async getTemplate(templateId: string): Promise<AgentTemplate | undefined> {
    return await storage.getAgentTemplate(templateId);
  }

  async getTemplateWithUsage(templateId: string): Promise<AgentTemplateWithUsage | undefined> {
    return await storage.getAgentTemplateWithUsage(templateId);
  }

  // Template Discovery & Search
  async getAllTemplates(): Promise<AgentTemplate[]> {
    return await storage.getAllAgentTemplates();
  }

  async getTemplatesByCategory(category: string): Promise<AgentTemplate[]> {
    return await storage.getAgentTemplatesByCategory(category);
  }

  async searchTemplates(query: string, options: TemplateSearchOptions = {}): Promise<AgentTemplate[]> {
    let templates = await storage.searchAgentTemplates(query);

    // Apply additional filters
    if (options.category) {
      templates = templates.filter(t => t.category === options.category);
    }

    if (options.isPublic !== undefined) {
      templates = templates.filter(t => t.isPublic === options.isPublic);
    }

    if (options.createdBy) {
      templates = templates.filter(t => t.createdBy === options.createdBy);
    }

    if (options.minRating) {
      templates = templates.filter(t => (t.rating || 0) >= options.minRating);
    }

    if (options.tags && options.tags.length > 0) {
      templates = templates.filter(t => {
        const templateTags = (t.tags as string[]) || [];
        return options.tags!.some(tag => templateTags.includes(tag));
      });
    }

    // Apply sorting
    switch (options.sortBy) {
      case 'rating':
        templates.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'usage':
        templates.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case 'recent':
        templates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'name':
        templates.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // Default: rating first, then usage
        templates.sort((a, b) => {
          const ratingDiff = (b.rating || 0) - (a.rating || 0);
          return ratingDiff !== 0 ? ratingDiff : b.usageCount - a.usageCount;
        });
    }

    if (options.limit) {
      templates = templates.slice(0, options.limit);
    }

    return templates;
  }

  async getPopularTemplates(limit = 10): Promise<AgentTemplate[]> {
    const templates = await storage.getAllAgentTemplates();
    return templates
      .filter(t => t.isPublic)
      .sort((a, b) => {
        // Weight both rating and usage count
        const aScore = (a.rating || 0) * 0.7 + (a.usageCount * 0.3);
        const bScore = (b.rating || 0) * 0.7 + (b.usageCount * 0.3);
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  async getRecommendedTemplates(
    basedOnUsage?: string[], // categories or template IDs user has used
    limit = 5
  ): Promise<AgentTemplate[]> {
    // Simplified recommendation engine
    const templates = await storage.getAllAgentTemplates();
    
    if (!basedOnUsage || basedOnUsage.length === 0) {
      return this.getPopularTemplates(limit);
    }

    // Find templates in similar categories or with similar tags
    const recommended = templates.filter(t => {
      if (!t.isPublic) return false;
      
      // Check if template category matches user's usage
      if (basedOnUsage.includes(t.category)) return true;
      
      // Check if template has similar tags
      const templateTags = (t.tags as string[]) || [];
      return templateTags.some(tag => basedOnUsage.includes(tag));
    });

    return recommended
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, limit);
  }

  // Template Usage & Application
  async useTemplate(
    templateId: string,
    taskId: string,
    options: {
      usedBy?: string;
      modifications?: any;
    } = {}
  ): Promise<Agent> {
    const template = await storage.getAgentTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    if (!template.isActive) {
      throw new Error(`Template '${template.name}' is not active`);
    }

    const agentConfig = template.agentConfig as AgentConfigTemplate;

    // Apply any modifications
    const finalConfig = {
      ...agentConfig,
      ...options.modifications,
    };

    // Create agent from template
    const agentData: InsertAgent = {
      taskId,
      name: finalConfig.name,
      role: finalConfig.role,
      prompt: finalConfig.prompt,
      description: finalConfig.description,
      toolset: finalConfig.toolset,
      suggestions: finalConfig.suggestions,
      status: 'pending',
      memoryContext: {
        templateId,
        templateName: template.name,
        templateVersion: template.version,
        appliedAt: new Date().toISOString(),
      },
    };

    const agent = await storage.createAgent(agentData);

    // Track usage
    await this.trackTemplateUsage(templateId, taskId, agent.id, {
      usedBy: options.usedBy,
      modifications: options.modifications,
    });

    // Update template usage count
    await storage.updateAgentTemplate(templateId, {
      usageCount: template.usageCount + 1,
    });

    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Template '${template.name}' applied to create agent '${agent.name}'`,
      data: {
        templateId,
        taskId,
        agentId: agent.id,
        usedBy: options.usedBy,
        modifications: options.modifications ? Object.keys(options.modifications) : [],
      },
    });

    return agent;
  }

  private async trackTemplateUsage(
    templateId: string,
    taskId: string,
    agentId: string,
    options: {
      usedBy?: string;
      modifications?: any;
    }
  ): Promise<TemplateUsage> {
    return await storage.createTemplateUsage({
      templateId,
      taskId,
      agentId,
      usedBy: options.usedBy || 'anonymous',
      modifications: options.modifications,
    });
  }

  async rateTemplate(
    templateId: string,
    rating: number,
    feedback?: string,
    ratedBy?: string
  ): Promise<AgentTemplate> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const template = await storage.getAgentTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Calculate new average rating
    const currentTotal = (template.rating || 0) * template.ratingCount;
    const newTotal = currentTotal + rating;
    const newCount = template.ratingCount + 1;
    const newRating = newTotal / newCount;

    const updatedTemplate = await storage.updateAgentTemplate(templateId, {
      rating: parseFloat(newRating.toFixed(2)),
      ratingCount: newCount,
    });

    // Track the rating (could be expanded to store individual ratings)
    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Template '${template.name}' rated ${rating}/5`,
      data: {
        templateId,
        rating,
        newAverageRating: newRating,
        ratingCount: newCount,
        ratedBy,
        feedback,
      },
    });

    return updatedTemplate;
  }

  // Built-in Templates
  async initializeBuiltInTemplates(): Promise<void> {
    const builtInTemplates = [
      {
        agentConfig: {
          name: "Research Analyst",
          role: "researcher",
          prompt: "You are a thorough research analyst. Your job is to gather, analyze, and synthesize information from various sources to provide comprehensive insights on given topics. Focus on accuracy, credibility of sources, and clear presentation of findings.",
          description: "Conducts thorough research and analysis on given topics",
          toolset: ["web_search", "document_analysis", "data_processing"],
          suggestions: "Use multiple sources, fact-check information, provide citations"
        },
        templateInfo: {
          name: "Research Analyst",
          description: "A comprehensive research agent for gathering and analyzing information",
          category: "research"
        },
        options: {
          makePublic: true,
          createdBy: "system",
          tags: ["research", "analysis", "data", "investigation"],
        }
      },
      {
        agentConfig: {
          name: "Code Developer",
          role: "developer",
          prompt: "You are an expert software developer. You write clean, efficient, and well-documented code. You follow best practices, consider edge cases, and ensure code quality. You can work with multiple programming languages and frameworks.",
          description: "Develops high-quality software solutions",
          toolset: ["code_editor", "file_system", "testing", "debugging"],
          suggestions: "Write tests, use meaningful variable names, add comments for complex logic"
        },
        templateInfo: {
          name: "Code Developer",
          description: "A skilled developer agent for writing and maintaining code",
          category: "coding"
        },
        options: {
          makePublic: true,
          createdBy: "system",
          tags: ["coding", "development", "programming", "software"],
        }
      },
      {
        agentConfig: {
          name: "Content Writer",
          role: "writer",
          prompt: "You are a professional content writer. You create engaging, well-structured, and audience-appropriate content. You adapt your writing style based on the target audience and purpose, whether it's technical documentation, marketing copy, or educational material.",
          description: "Creates high-quality written content for various purposes",
          toolset: ["document_editor", "style_checker", "plagiarism_check"],
          suggestions: "Consider target audience, use clear structure, proofread carefully"
        },
        templateInfo: {
          name: "Content Writer",
          description: "A versatile writer agent for creating various types of content",
          category: "writing"
        },
        options: {
          makePublic: true,
          createdBy: "system",
          tags: ["writing", "content", "documentation", "copywriting"],
        }
      },
      {
        agentConfig: {
          name: "Data Analyst",
          role: "analyst",
          prompt: "You are a data analyst specializing in extracting insights from datasets. You clean, process, and analyze data to identify patterns, trends, and actionable insights. You create visualizations and reports that clearly communicate findings to stakeholders.",
          description: "Analyzes data to extract meaningful insights and patterns",
          toolset: ["data_processing", "statistical_analysis", "visualization", "reporting"],
          suggestions: "Validate data quality, use appropriate statistical methods, create clear visualizations"
        },
        templateInfo: {
          name: "Data Analyst",
          description: "A specialized agent for data analysis and insights generation",
          category: "analysis"
        },
        options: {
          makePublic: true,
          createdBy: "system",
          tags: ["data", "analysis", "statistics", "visualization"],
        }
      },
      {
        agentConfig: {
          name: "Project Coordinator",
          role: "coordinator",
          prompt: "You are a project coordinator who excels at organizing tasks, managing timelines, and facilitating communication between team members. You break down complex projects into manageable tasks, track progress, and ensure deadlines are met.",
          description: "Coordinates project activities and manages task execution",
          toolset: ["task_management", "scheduling", "communication", "progress_tracking"],
          suggestions: "Set clear milestones, maintain regular communication, monitor dependencies"
        },
        templateInfo: {
          name: "Project Coordinator",
          description: "An organizational agent for project management and coordination",
          category: "management"
        },
        options: {
          makePublic: true,
          createdBy: "system",
          tags: ["project", "management", "coordination", "planning"],
        }
      }
    ];

    let createdCount = 0;
    for (const templateData of builtInTemplates) {
      try {
        // Check if template already exists
        const existing = await storage.searchAgentTemplates(templateData.templateInfo.name);
        if (existing.some(t => t.name === templateData.templateInfo.name && t.createdBy === 'system')) {
          continue; // Skip if already exists
        }

        await this.createTemplate(
          templateData.agentConfig,
          templateData.templateInfo,
          templateData.options
        );
        createdCount++;
      } catch (error) {
        await storage.createLog({
          level: 'error',
          category: 'template',
          message: `Failed to create built-in template '${templateData.templateInfo.name}': ${error}`,
          data: { templateName: templateData.templateInfo.name },
        });
      }
    }

    await storage.createLog({
      level: 'info',
      category: 'template',
      message: `Initialized ${createdCount} built-in templates`,
      data: { createdCount, totalBuiltIn: builtInTemplates.length },
    });
  }

  // Template Statistics & Analytics
  async getTemplateUsageStats(): Promise<TemplateUsageStats> {
    const templates = await storage.getAllAgentTemplates();
    const allUsage = [];

    for (const template of templates) {
      const usage = await storage.getTemplateUsageForTemplate(template.id);
      allUsage.push(...usage);
    }

    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    const recentUsage = allUsage.filter(u => 
      new Date(u.usedAt).getTime() > thirtyDaysAgo
    );

    const categories: Record<string, number> = {};
    const allTags: string[] = [];

    for (const template of templates) {
      categories[template.category] = (categories[template.category] || 0) + template.usageCount;
      if (template.tags) {
        allTags.push(...(template.tags as string[]));
      }
    }

    // Count tag frequency
    const tagCounts: Record<string, number> = {};
    for (const tag of allTags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }

    const popularTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    const totalRatedTemplates = templates.filter(t => t.ratingCount > 0);
    const averageRating = totalRatedTemplates.length > 0
      ? totalRatedTemplates.reduce((sum, t) => sum + (t.rating || 0), 0) / totalRatedTemplates.length
      : 0;

    return {
      totalUsage: allUsage.length,
      recentUsage: recentUsage.length,
      averageRating,
      ratingCount: templates.reduce((sum, t) => sum + t.ratingCount, 0),
      popularTags,
      successRate: 0.95, // Would calculate based on actual success metrics
      categories,
    };
  }

  async getTemplatesByUsage(taskId: string): Promise<TemplateUsage[]> {
    return await storage.getTemplateUsageForTask(taskId);
  }
}

export const templateService = new TemplateService();