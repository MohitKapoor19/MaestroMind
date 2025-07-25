# Maestro Multi-Agent Platform

## Overview

Maestro is a production-ready, full-stack multi-agent platform that implements sophisticated agent collaboration concepts for automated task execution. The system dynamically generates agent teams based on task requirements, enables real-time collaboration between agents, and provides comprehensive monitoring and visualization capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query (React Query) for server state with optimistic updates
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Updates**: WebSocket integration for live system monitoring

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Database Provider**: Neon serverless PostgreSQL
- **AI Integration**: Groq API for LLM-powered agent generation and execution
- **File Handling**: Multer for multipart form uploads
- **Real-time Communication**: WebSocket server for broadcasting updates

## Key Components

### Task Management System
- Task creation with priority levels and file attachments
- Dynamic estimation and progress tracking
- Status management (pending, planning, executing, completed)
- Metadata storage for flexible task properties

### Agent Generation Framework
- AutoAgents-inspired architecture with four core components (P.D.T.S):
  - **Prompt (P)**: Agent's core instruction set
  - **Description (D)**: Role and capability definition
  - **Toolset (T)**: Available tools and functions
  - **Suggestions (S)**: Operational guidance
- Dynamic agent team generation based on task analysis
- Role-based agent specialization (planner, executor, reviewer, etc.)

### Collaboration Engine
- Inter-agent communication system
- Refinement and critique workflows
- Task handoff mechanisms
- Execution plan coordination

### Real-time Monitoring
- WebSocket-based live updates
- Activity logging with categorization
- Performance metrics tracking
- System health monitoring

### n8n Workflow Integration
- Visual workflow builder with drag-and-drop interface
- Node-based automation system supporting multiple node types:
  - HTTP Request, Webhook, Schedule Trigger
  - Database operations, Email, File handling
  - Code execution, AI Agent integration
- Workflow validation and execution engine
- Task-specific workflow association
- Real-time workflow status monitoring

### File Management
- Upload handling with size and type validation
- File association with tasks and agents
- Secure file storage and retrieval

## Data Flow

1. **Task Creation**: User submits task with description, priority, and optional files
2. **Agent Generation**: System analyzes task and generates specialized agent team
3. **Execution Planning**: Agents collaborate to create execution strategy
4. **Task Execution**: Agents work collaboratively with real-time updates
5. **Result Compilation**: Final outputs are aggregated and presented
6. **Workflow Automation**: n8n-style visual workflows for task automation
7. **Monitoring**: All activities logged and broadcasted via WebSocket

## External Dependencies

### Core Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting
- **Groq API**: Large language model services for agent intelligence
- **WebSocket**: Real-time bidirectional communication

### Development Tools
- **Drizzle Kit**: Database migration and schema management
- **Vite**: Fast development server and build tool
- **PostCSS**: CSS processing with Tailwind

### UI Components
- **Radix UI**: Accessible component primitives
- **Lucide React**: Icon library
- **React Hook Form**: Form state management with Zod validation

## Deployment Strategy

### Development Mode
- Vite dev server with HMR for frontend
- tsx for TypeScript execution in development
- File watching and automatic restart capabilities

### Production Build
- Vite builds optimized frontend bundle
- esbuild compiles backend to ESM format
- Static files served from Express
- Environment-based configuration

### Database Management
- Drizzle migrations for schema versioning
- Connection pooling for performance
- Environment variable configuration

The system is designed for scalability with separation of concerns between frontend, backend, and database layers. Real-time capabilities ensure responsive user experience while the modular architecture allows for easy extension and maintenance.