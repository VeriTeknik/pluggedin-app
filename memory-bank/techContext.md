# Plugged.in Technical Context

## Technology Stack

Plugged.in is built on a modern web technology stack:

### Frontend
- **Next.js 15**: React framework with both client and server components
- **React 19**: UI library for component-based development
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Radix UI**: Accessible UI component primitives
- **SWR**: React hooks for data fetching and caching
- **Zustand**: State management library

### Backend
- **Next.js Server Actions**: Server-side functions for database operations
- **Next.js API Routes**: RESTful API endpoints
- **Drizzle ORM**: Type-safe ORM for database interactions
- **PostgreSQL**: Relational database for data persistence
- **TypeScript**: Strongly-typed language for both frontend and backend

### MCP Implementation
- **Model Context Protocol**: Implementation of the MCP specification
- **STDIO and SSE Support**: Supports both command-line and HTTP-based MCP servers
- **Docker**: Used for containerization (planned enhancement)

## Development Setup

The project uses the following development tools:

- **pnpm**: Package manager
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Type checking
- **Docker Compose**: Local development environment

## Technical Constraints

### Current Limitations
1. **Proxy-Only Architecture**: Currently operates only as a proxy, not hosting MCP servers directly
2. **No Built-in Chat Interface**: Relies on external MCP clients for interaction
3. **Limited Windows Compatibility**: Some known issues with Windows-based MCP clients
4. **Manual Server Management**: No automatic scaling or resource allocation

### Planned Enhancements
1. **Container-Based Hosting**: Direct hosting of MCP servers in isolated containers
2. **Built-in Chat Interface**: Native chat interface with MCP capabilities
3. **Improved Security**: Enhanced security through direct hosting and isolation
4. **Resource Management**: Automatic resource allocation and scaling

## Dependencies

### Critical Dependencies
1. **Next.js**: Core framework for the application
2. **PostgreSQL**: Database for storing configuration
3. **Drizzle ORM**: ORM for database interactions
4. **React**: UI framework
5. **MCP Implementation**: Model Context Protocol implementation

### External Services
1. **MCP Servers**: External servers configured by users
2. **MCP Clients**: External clients connecting to the proxy

## Technical Architecture

### Database Schema
The database schema includes tables for:
- Projects: Top-level organization units
- Profiles: Workspaces within projects
- API Keys: Authentication keys for projects
- MCP Servers: Configurations for external MCP servers
- Custom MCP Servers: Python-based custom MCP server configurations
- Codes: Storage for custom MCP server code

### API Structure
1. **Server Actions API**: Used for most database operations
2. **REST API**: Used for MCP client connections

### Containerization Strategy
The planned containerization approach will:
1. Use Docker containers for isolation
2. Manage container lifecycle through a container orchestration layer
3. Handle resource allocation and scaling
4. Provide secure networking between components 