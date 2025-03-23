# Plugged.in (formerly MetaMCP) Project Brief

## Project Overview
Plugged.in is a platform designed to manage and orchestrate Model Context Protocol (MCP) servers. It currently operates as a proxy that connects MCP clients (like Claude Desktop, Cursor) to configured MCP servers. The application provides a GUI to manage configurations with dynamic updates for tools, prompts, and resources.

## Core Requirements

1. **Current Functionality**:
   - Act as a proxy between MCP clients and multiple MCP servers
   - Manage MCP server configurations via a GUI interface
   - Support both STDIO and SSE type MCP servers
   - Provide multi-workspace support to isolate contexts
   - Allow API access for MCP clients to connect

2. **Planned Evolution**:
   - Transition from proxy-based architecture to natively hosting MCP servers within workspaces
   - Add a built-in MCP-enabled chat client interface
   - Implement secure container-based MCP server hosting
   - Offer cloud-based hosting of MCP servers for better security and isolation
   - Enable direct management of MCP servers within the Plugged.in environment

## Technical Goals

1. **Workspace Isolation**: Each workspace should have its own isolated MCP servers
2. **Chat Integration**: Implement an MCP-enabled chat interface for direct interaction
3. **Container Hosting**: Securely host MCP servers in containers for better isolation
4. **Security**: Improve security by hosting MCP servers directly instead of proxying
5. **Scalability**: Support multiple concurrent users with isolated environments

## Success Criteria

1. Users can interact with MCP tools through a built-in chat interface
2. Each workspace maintains isolated MCP server environments
3. The system can securely run MCP servers in containers
4. The transition from proxy to native hosting is seamless for users
5. Performance remains efficient even with multiple active workspaces 