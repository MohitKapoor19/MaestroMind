# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build

# Run production server
npm start

# TypeScript type checking
npm run check

# Database schema push to PostgreSQL
npm run db:push
```

## Architecture Overview

MaestroMind is a **multi-agent orchestration platform** implementing the AutoAgents framework with A = {P, D, T, S} (Prompt, Description, Toolset, Suggestions). The system dynamically generates specialized AI agents to collaboratively complete user-submitted tasks.

### Core Architecture Components

#### 1. Multi-Provider LLM System
- **LLM Router** (`server/services/llmRouter.ts`): Intelligent fallback system across Groq → Gemini → Ollama
- **Provider Services**: Individual service classes for each LLM provider with unified interfaces
- **Metrics Tracking**: Token usage, costs, latency, and success rates per provider

#### 2. AutoAgents Framework Implementation
- **Iterative Drafting Loop**: Agent generation with Observer critique and convergence criteria
- **Observer Pattern**: AgentObserver and PlanObserver provide feedback for plan refinement
- **Agent Collaboration**: Inter-agent communication with refinement, critique, and handoff patterns
- **Tool Registry** (`server/services/toolRegistry.ts`): Extensible tool system with capability-based permissions

#### 3. Human-in-the-Loop (HITL) Controls
- **Execution Control**: Pause/Resume tasks, Step-by-step agent execution
- **Agent Management**: Approve/Reject/Modify agent parameters dynamically
- **Real-time Oversight**: WebSocket-based live monitoring and intervention

#### 4. Database Schema (PostgreSQL + Drizzle)
**Core Tables:**
- `tasks`: User-submitted tasks with metadata and status tracking
- `agents`: Dynamically generated agents with A={P,D,T,S} structure
- `agent_executions`: Execution logs with token/cost tracking
- `agent_collaborations`: Inter-agent communication records
- `execution_plans`: Versioned planning with observer feedback
- `system_logs`: Comprehensive activity logging

**Key Relationships:**
- Tasks → Agents (1:many)
- Agents → Executions (1:many)
- Agents → Collaborations (many:many)
- Tasks → Plans (1:many with versioning)

#### 5. Real-time System
- **WebSocket Server**: Live updates for task/agent state changes
- **Event Broadcasting**: Real-time metrics, execution progress, and HITL actions
- **Client Synchronization**: React components receive live state updates

### Technology Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: React + TypeScript + TanStack Query + React Flow
- **UI**: Tailwind CSS + Radix UI components
- **Real-time**: WebSocket (ws library)
- **LLM Providers**: Groq, Google Gemini, Ollama (local)

### Key Service Classes

- **AgentService**: Core orchestration, team generation, execution coordination
- **TaskService**: Task lifecycle management and metrics aggregation
- **LLMRouter**: Provider abstraction with fallback and metrics
- **ToolRegistry**: Extensible tool system with permissions and execution tracking
- **Storage**: Database abstraction layer with type-safe operations

### Frontend Component Structure

- **MainLayout**: Tab-based interface with real-time metrics header
- **TaskCreator**: Task submission with file upload support
- **AgentNetwork**: React Flow DAG visualization of agent collaboration
- **ActivityLogs**: Filterable, real-time system logs
- **AgentInspector**: Detailed agent status and execution history
- **OutputCanvas**: Task results with export functionality (MD/JSON)

### Environment Variables Required

```bash
DATABASE_URL=postgresql://...    # Neon/PostgreSQL connection
GROQ_API_KEY=gsk_...            # Groq LLM API key
GEMINI_API_KEY=...              # Google Gemini API key (optional)
OLLAMA_BASE_URL=http://localhost:11434  # Ollama local server (optional)
NODE_ENV=development|production
```

### Development Patterns

#### Adding New LLM Providers
1. Create service class implementing standard interface (see `geminiService.ts`)
2. Register with LLMRouter in constructor
3. Handle provider-specific authentication and rate limiting
4. Implement standard methods: `generateCompletion`, `generateAgentTeam`, `executeAgentAction`, `observeAndCritique`

#### Adding New Tools to Tool Registry
1. Implement Tool interface with `execute`, `validate`, and metadata
2. Register in ToolRegistry constructor or via `registerTool()`
3. Define required permissions and security constraints
4. Update agent toolset assignments as needed

#### Database Schema Changes
1. Modify `shared/schema.ts` with Drizzle schema definitions
2. Run `npm run db:push` to apply changes
3. Update TypeScript types and storage layer methods
4. Consider migration strategy for existing data

#### Adding Real-time Features
1. Define new RealtimeUpdate type in `shared/schema.ts`
2. Emit updates via `broadcastUpdate()` in routes
3. Handle updates in frontend `useWebSocket` hook
4. Update relevant React components with live data

### Export and Integration Features

- **Task Export**: Markdown and JSON export with comprehensive reports
- **API Integration**: RESTful endpoints for all major operations
- **WebSocket API**: Real-time event streaming for external integrations
- **File Upload**: Multer-based file handling with task association

The system is designed for production deployment with comprehensive logging, error handling, and monitoring capabilities. The modular architecture supports easy extension of LLM providers, tools, and collaboration patterns.