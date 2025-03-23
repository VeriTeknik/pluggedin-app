import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
}
const API_URL = process.env.API_URL || "http://localhost:3000/api";
class MCPClient {
    mcp;
    anthropic;
    transport = null;
    tools = [];
    profileUuid = null;
    serverUuid = null;
    containerUuid = null;
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
        });
        this.mcp = new Client({ name: "pluggedin-client-cli", version: "1.0.0" });
    }
    /**
     * Connect to an MCP server by script path
     */
    async connectToServer(serverScriptPath) {
        try {
            const isJs = serverScriptPath.endsWith(".js");
            const isPy = serverScriptPath.endsWith(".py");
            if (!isJs && !isPy) {
                throw new Error("Server script must be a .js or .py file");
            }
            const command = isPy
                ? process.platform === "win32"
                    ? "python"
                    : "python3"
                : process.execPath;
            this.transport = new StdioClientTransport({
                command,
                args: [serverScriptPath],
            });
            this.mcp.connect(this.transport);
            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                };
            });
            console.log("Connected to server with tools:", this.tools.map(({ name }) => name));
        }
        catch (e) {
            console.log("Failed to connect to MCP server: ", e);
            throw e;
        }
    }
    /**
     * Fetch available MCP servers from the Plugged.in API
     */
    async fetchMcpServers(profileUuid) {
        try {
            const response = await fetch(`${API_URL}/mcp-servers?profileUuid=${profileUuid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch MCP servers: ${response.statusText}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error("Error fetching MCP servers:", error);
            throw error;
        }
    }
    /**
     * Fetch available Docker workspace containers from the Plugged.in API
     */
    async fetchDockerContainer(profileUuid) {
        try {
            const response = await fetch(`${API_URL}/docker-containers/workspace?profileUuid=${profileUuid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch workspace container: ${response.statusText}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error("Error fetching workspace container:", error);
            throw error;
        }
    }
    /**
     * Connect an MCP server to a Docker container
     */
    async connectServerToContainer(profileUuid, serverUuid) {
        try {
            const response = await fetch(`${API_URL}/docker-containers/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    profileUuid,
                    mcpServerUuid: serverUuid,
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to connect MCP server to container: ${response.statusText}`);
            }
            console.log("Successfully connected MCP server to Docker container");
        }
        catch (error) {
            console.error("Error connecting MCP server to container:", error);
            throw error;
        }
    }
    /**
     * Connect to a Docker-based MCP server
     */
    async connectToDockerMcpServer(profileUuid, serverUuid) {
        try {
            this.profileUuid = profileUuid;
            this.serverUuid = serverUuid;
            // Fetch the container info
            const container = await this.fetchDockerContainer(profileUuid);
            this.containerUuid = container.uuid;
            if (container.status !== "RUNNING") {
                console.log("Starting Docker container...");
                await this.startContainer(profileUuid, container.uuid);
            }
            // Connect the server to the container
            await this.connectServerToContainer(profileUuid, serverUuid);
            // Create a custom transport that uses our API to forward requests
            this.transport = {
                close: async () => { },
                send: async (message) => {
                    const response = await fetch(`${API_URL}/mcp/proxy?profileUuid=${profileUuid}&mcpServerUuid=${serverUuid}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(message),
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to send message to MCP server: ${response.statusText}`);
                    }
                    return await response.json();
                }
            };
            this.mcp.connect(this.transport);
            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools.map((tool) => {
                return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                };
            });
            console.log("Connected to Docker-based MCP server with tools:", this.tools.map(({ name }) => name));
        }
        catch (e) {
            console.log("Failed to connect to Docker-based MCP server: ", e);
            throw e;
        }
    }
    /**
     * Start a Docker container
     */
    async startContainer(profileUuid, containerUuid) {
        try {
            const response = await fetch(`${API_URL}/docker-containers/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    profileUuid,
                    containerUuid,
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to start container: ${response.statusText}`);
            }
            console.log("Docker container started successfully");
        }
        catch (error) {
            console.error("Error starting Docker container:", error);
            throw error;
        }
    }
    /**
     * Process a user query
     */
    async processQuery(query) {
        // Build the initial message array
        const messages = [
            {
                role: "user",
                content: query,
            },
        ];
        // Send the query to Claude with available tools
        const response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages,
            tools: this.tools,
        });
        const finalText = [];
        const toolResults = [];
        // Process the response and handle any tool calls
        for (const content of response.content) {
            if (content.type === "text") {
                finalText.push(content.text);
            }
            else if (content.type === "tool_use") {
                const toolName = content.name;
                const toolArgs = content.input;
                // Log tool call information
                console.log(`Calling tool: ${toolName}`);
                console.log(`Tool arguments: ${JSON.stringify(toolArgs, null, 2)}`);
                // Call the tool through the MCP server
                const result = await this.mcp.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });
                toolResults.push(result);
                finalText.push(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);
                // Send the tool result back to Claude
                messages.push({
                    role: "assistant",
                    content: `I'm using the ${toolName} tool.`,
                });
                messages.push({
                    role: "user",
                    content: result.content,
                });
                // Get Claude's response to the tool result
                const response = await this.anthropic.messages.create({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 1000,
                    messages,
                });
                finalText.push(response.content[0].type === "text" ? response.content[0].text : "");
            }
        }
        return finalText.join("\n");
    }
    /**
     * Show a list of available profiles
     */
    async showProfiles() {
        try {
            const response = await fetch(`${API_URL}/profiles`);
            if (!response.ok) {
                throw new Error(`Failed to fetch profiles: ${response.statusText}`);
            }
            const profiles = await response.json();
            if (profiles.length === 0) {
                console.log("No profiles found. Please create a profile first.");
                return null;
            }
            console.log("\nAvailable profiles:");
            profiles.forEach((profile, index) => {
                console.log(`${index + 1}. ${profile.name} (${profile.uuid})`);
            });
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            const answer = await rl.question("\nSelect a profile (number): ");
            rl.close();
            const profileIndex = parseInt(answer) - 1;
            if (isNaN(profileIndex) || profileIndex < 0 || profileIndex >= profiles.length) {
                console.log("Invalid selection. Please try again.");
                return null;
            }
            return profiles[profileIndex].uuid;
        }
        catch (error) {
            console.error("Error fetching profiles:", error);
            return null;
        }
    }
    /**
     * Show a list of available MCP servers for a profile
     */
    async showMcpServers(profileUuid) {
        try {
            const servers = await this.fetchMcpServers(profileUuid);
            if (servers.length === 0) {
                console.log("No MCP servers found for this profile. Please create an MCP server first.");
                return null;
            }
            console.log("\nAvailable MCP servers:");
            servers.forEach((server, index) => {
                console.log(`${index + 1}. ${server.name} (${server.uuid}) - Status: ${server.status}`);
                console.log(`   Description: ${server.description || 'N/A'}`);
                console.log(`   Type: ${server.type}`);
                if (server.command) {
                    console.log(`   Command: ${server.command} ${server.args.join(' ')}`);
                }
                if (server.url) {
                    console.log(`   URL: ${server.url}`);
                }
                console.log('');
            });
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            const answer = await rl.question("\nSelect an MCP server (number): ");
            rl.close();
            const serverIndex = parseInt(answer) - 1;
            if (isNaN(serverIndex) || serverIndex < 0 || serverIndex >= servers.length) {
                console.log("Invalid selection. Please try again.");
                return null;
            }
            return servers[serverIndex].uuid;
        }
        catch (error) {
            console.error("Error fetching MCP servers:", error);
            return null;
        }
    }
    /**
     * Interactive chat loop with the MCP server
     */
    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        try {
            console.log("\nMCP Client Started!");
            console.log("Type your queries or 'quit' to exit.");
            while (true) {
                const message = await rl.question("\nQuery: ");
                if (message.toLowerCase() === "quit") {
                    break;
                }
                console.log("\nProcessing your query...");
                const response = await this.processQuery(message);
                console.log("\n" + response);
            }
        }
        finally {
            rl.close();
        }
    }
    /**
     * Connect directly using MCP server connection details
     */
    async connectDirectly() {
        // Select a profile
        console.log("Selecting a profile...");
        const profileUuid = await this.showProfiles();
        if (!profileUuid) {
            console.log("No profile selected. Exiting.");
            return;
        }
        // Select an MCP server
        console.log("Selecting an MCP server...");
        const serverUuid = await this.showMcpServers(profileUuid);
        if (!serverUuid) {
            console.log("No MCP server selected. Exiting.");
            return;
        }
        // Connect to the Docker-based MCP server
        console.log(`Connecting to MCP server ${serverUuid} via Docker...`);
        await this.connectToDockerMcpServer(profileUuid, serverUuid);
        // Start the chat loop
        await this.chatLoop();
    }
    /**
     * Clean up resources
     */
    async cleanup() {
        await this.mcp.close();
    }
}
async function main() {
    const mcpClient = new MCPClient();
    try {
        if (process.argv.length >= 3) {
            // Connect to server using script path (CLI mode)
            await mcpClient.connectToServer(process.argv[2]);
        }
        else {
            // Interactive mode (Docker-based servers)
            await mcpClient.connectDirectly();
        }
        await mcpClient.chatLoop();
    }
    catch (error) {
        console.error("Error:", error);
    }
    finally {
        await mcpClient.cleanup();
        process.exit(0);
    }
}
main();
