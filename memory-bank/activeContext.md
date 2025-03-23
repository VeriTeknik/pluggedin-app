# Plugged.in Active Context

## Current Focus

The current development focus is on transitioning Plugged.in from a proxy-based architecture to a platform that can natively host MCP servers within workspaces. This includes:

1. **Built-in Chat Interface**: Developing a chat client that directly connects to MCP-enabled AI
2. **Workspace-Isolated MCP Servers**: Implementing the capability to run MCP servers directly within workspaces
3. **Container-Based Hosting**: Setting up secure container infrastructure for MCP servers
4. **Request Routing**: Creating a routing system that works with both proxied and natively hosted servers

## Recent Changes

The current codebase provides:

1. **MCP Server Management**: UI for configuring both standard and custom MCP servers
2. **Workspace Isolation**: Multi-workspace support through projects and profiles
3. **API Access**: Authentication and authorization for MCP clients
4. **Proxy Functionality**: Ability to proxy requests between MCP clients and servers

## Active Decisions

Several key decisions are being considered:

1. **Container Technology**: Determining the most appropriate container technology
   - Options: Docker, Kubernetes, or a custom solution
   - Considerations: Security, resource isolation, scalability

2. **Chat Interface Design**: Designing the chat interface
   - Approach: Implement a workspace-specific chat interface with MCP tool capabilities
   - Integration: Direct integration with workspace-hosted MCP servers

3. **Server Execution Strategy**: Determining how to execute MCP servers
   - For STDIO servers: Process management or container execution
   - For SSE servers: Proxy forwarding or internal service hosting

4. **Migration Path**: Planning the migration from proxy to native hosting
   - Preference: Gradual transition with backward compatibility
   - Timeline: Phased approach with both systems operating in parallel initially

## Next Steps

The immediate development priorities are:

1. **Database Schema Updates**:
   - Add tables for workspace MCP server instances
   - Add tables for container/process management
   - Add schema for chat conversations and messages

2. **Chat Interface Implementation**:
   - Develop a workspace-specific chat UI
   - Implement MCP tool integration in the chat
   - Create backend for chat message processing

3. **Container Management System**:
   - Develop container creation and management capabilities
   - Implement resource allocation and monitoring
   - Set up secure networking between containers

4. **MCP Server Lifecycle Management**:
   - Create processes for starting/stopping MCP servers
   - Implement health monitoring and automatic recovery
   - Develop logging and debugging tools

## Technical Considerations

Current technical challenges that need to be addressed:

1. **Resource Isolation**: Ensuring each workspace's MCP servers are properly isolated
2. **Performance Optimization**: Minimizing latency for tool invocations
3. **Security Boundaries**: Establishing secure boundaries between different workspaces
4. **Scaling Strategy**: Determining how to scale with many concurrent users and servers 