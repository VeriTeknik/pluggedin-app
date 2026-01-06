/**
 * OpenCode Configuration Generator
 *
 * Generates opencode.json configuration for OpenCode agents.
 * Fetches available models from Model Router and configures
 * Plugged.in as the sole provider.
 */

// Model Router API response type
interface ModelRouterModel {
  id: string;
  name: string;
  provider: string;
  context_length?: number;
  max_output_tokens?: number;
  supports_vision?: boolean;
  supports_streaming?: boolean;
}

interface OpenCodeProviderModel {
  name: string;
  api_model: string;
  context_length?: number;
  max_output_tokens?: number;
}

interface OpenCodeConfig {
  $schema: string;
  model: string;
  provider: {
    [key: string]: {
      name: string;
      baseURL: string;
      apiKey: string;
      models: Record<string, OpenCodeProviderModel>;
    };
  };
  mcp?: {
    [key: string]: {
      type: string;
      url: string;
      headers?: Record<string, string>;
    };
  };
  workspace: string;
  autoupdate: boolean;
}

/**
 * Fetch available models from Model Router.
 */
export async function fetchModelsFromRouter(
  modelRouterUrl: string,
  modelRouterToken: string
): Promise<ModelRouterModel[]> {
  try {
    const response = await fetch(`${modelRouterUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${modelRouterToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Model Router returned ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Failed to fetch models from Model Router:', error);
    // Return default models if fetch fails
    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google' },
    ];
  }
}

/**
 * Transform Model Router models to OpenCode provider format.
 */
function transformModels(models: ModelRouterModel[]): Record<string, OpenCodeProviderModel> {
  const result: Record<string, OpenCodeProviderModel> = {};

  for (const model of models) {
    // Use the model ID as the key, prefixed with pluggedin/
    const key = model.id;
    result[key] = {
      name: model.name || model.id,
      api_model: model.id,
      context_length: model.context_length,
      max_output_tokens: model.max_output_tokens,
    };
  }

  return result;
}

/**
 * Generate OpenCode configuration for an agent.
 */
export async function generateOpenCodeConfig(options: {
  agentName: string;
  agentUuid: string;
  defaultModel: string;
  modelRouterUrl?: string;
  modelRouterToken?: string;
  mcpProxyUrl?: string;
  pluggedinApiKey?: string;
  workspace?: string;
}): Promise<OpenCodeConfig> {
  const {
    agentName,
    agentUuid,
    defaultModel,
    modelRouterUrl, // Required - region-specific URL
    modelRouterToken,
    mcpProxyUrl = 'https://mcp.plugged.in/mcp',
    pluggedinApiKey,
    workspace = '/workspace',
  } = options;

  // Fetch models from Model Router if token provided
  let models: Record<string, OpenCodeProviderModel> = {};
  if (modelRouterToken) {
    const routerModels = await fetchModelsFromRouter(modelRouterUrl, modelRouterToken);
    models = transformModels(routerModels);
  }

  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    model: `pluggedin/${defaultModel}`,
    provider: {
      pluggedin: {
        name: 'Plugged.in Model Router',
        baseURL: `${modelRouterUrl}/v1`,
        apiKey: '{env:MODEL_ROUTER_TOKEN}',
        models,
      },
    },
    workspace,
    autoupdate: false,
  };

  // Add MCP configuration if API key is available
  if (pluggedinApiKey || mcpProxyUrl) {
    config.mcp = {
      pluggedin: {
        type: 'remote',
        url: `${mcpProxyUrl}/sse`,
        headers: {
          'Authorization': 'Bearer {env:PLUGGEDIN_API_KEY}',
          'X-Agent-ID': agentUuid,
          'X-Agent-Name': agentName,
        },
      },
    };
  }

  return config;
}

/**
 * Generate opencode.json content as string.
 */
export async function generateOpenCodeConfigString(options: {
  agentName: string;
  agentUuid: string;
  defaultModel: string;
  modelRouterUrl?: string;
  modelRouterToken?: string;
  mcpProxyUrl?: string;
  pluggedinApiKey?: string;
  workspace?: string;
}): Promise<string> {
  const config = await generateOpenCodeConfig(options);
  return JSON.stringify(config, null, 2);
}

/**
 * Validate an OpenCode configuration.
 */
export function validateOpenCodeConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be an object'] };
  }

  const cfg = config as Record<string, unknown>;

  // Check required fields
  if (!cfg.model) {
    errors.push('Missing required field: model');
  }

  if (!cfg.provider || typeof cfg.provider !== 'object') {
    errors.push('Missing or invalid provider configuration');
  }

  if (!cfg.workspace) {
    errors.push('Missing required field: workspace');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Default models for OpenCode templates.
 */
export const DEFAULT_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', recommended: true },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google' },
];
