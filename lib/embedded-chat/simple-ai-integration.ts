/**
 * Simple AI integration for embedded chat
 * This provides a fallback when MCP proxy is not available
 * It can use OpenAI, Anthropic, or other AI services directly
 */

interface SimpleAIConfig {
  provider: 'openai' | 'anthropic' | 'groq' | 'local';
  apiKey?: string;
  model?: string;
  customInstructions?: string;
  temperature?: number;
}

interface SimpleAIResponse {
  content: string;
  error?: string;
}

export async function generateSimpleAIResponse(
  message: string,
  config: SimpleAIConfig,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<SimpleAIResponse> {
  // For now, return a more intelligent placeholder response
  // This can be replaced with actual AI service calls
  
  try {
    // Build context
    let context = '';
    if (config.customInstructions) {
      context += config.customInstructions + '\n\n';
    }
    
    // Simulate different response styles based on the message
    const lowerMessage = message.toLowerCase();
    
    // Greeting responses
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
      return {
        content: "Hello! I'm here to help you. What can I assist you with today?"
      };
    }
    
    // Help responses
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      return {
        content: "I'm an AI assistant integrated into this platform. I can help answer questions, provide information, and assist with various tasks. Feel free to ask me anything!"
      };
    }
    
    // Question responses
    if (lowerMessage.includes('?')) {
      return {
        content: "That's a great question! While I'm currently running in demo mode, in a full implementation I would be able to provide detailed answers by connecting to various knowledge sources and MCP servers configured for this project."
      };
    }
    
    // Technical queries
    if (lowerMessage.includes('mcp') || lowerMessage.includes('server') || lowerMessage.includes('api')) {
      return {
        content: "I can help with technical topics related to MCP (Model Context Protocol) servers, APIs, and integrations. The platform supports various MCP server types including STDIO, SSE, and Streamable HTTP connections."
      };
    }
    
    // Default response
    return {
      content: `I understand you're asking about "${message}". While I'm currently in demo mode, a fully configured system would connect to your MCP servers to provide comprehensive assistance. Please ensure your project has API keys configured and MCP servers set up for full functionality.`
    };
    
  } catch (error) {
    console.error('Simple AI error:', error);
    return {
      content: "I apologize, but I encountered an error processing your request. Please try again.",
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * OpenAI integration (requires API key)
 */
export async function generateOpenAIResponse(
  message: string,
  apiKey: string,
  config: {
    model?: string;
    customInstructions?: string;
    temperature?: number;
  },
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<SimpleAIResponse> {
  try {
    const messages: any[] = [];
    
    // Add system message if custom instructions provided
    if (config.customInstructions) {
      messages.push({
        role: 'system',
        content: config.customInstructions
      });
    }
    
    // Add conversation history
    if (conversationHistory) {
      messages.push(...conversationHistory);
    }
    
    // Add current message
    messages.push({
      role: 'user',
      content: message
    });
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'gpt-3.5-turbo',
        messages,
        temperature: config.temperature || 0.7,
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content || 'No response generated'
    };
  } catch (error) {
    console.error('OpenAI error:', error);
    return {
      content: 'Unable to connect to OpenAI. Please check your API key and try again.',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}