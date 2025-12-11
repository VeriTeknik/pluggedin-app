/**
 * Model Router API - Chat Completions
 *
 * OpenAI-compatible chat completions endpoint that routes requests
 * to multiple AI providers (OpenAI, Anthropic, Google).
 *
 * This endpoint is designed for PAP agents like Compass to use
 * a unified API for querying multiple LLM providers.
 *
 * @route POST /api/v1/chat/completions
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { RATE_LIMITS, rateLimit } from '@/lib/api-rate-limit';
import {
  routeChatCompletion,
  routeChatCompletionStreaming,
  calculateCost,
  getProviderForModel,
  resolveModelAlias,
  type ChatCompletionRequest,
} from '@/lib/model-router';

// Add chat completions rate limit
const chatCompletionsRateLimit = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per API key
  message: 'Too many chat completion requests. Please slow down.',
};

// Request validation schema
const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
      content: z.string().nullable(),
      name: z.string().optional(),
      function_call: z
        .object({
          name: z.string(),
          arguments: z.string(),
        })
        .optional(),
      tool_calls: z
        .array(
          z.object({
            id: z.string(),
            type: z.literal('function'),
            function: z.object({
              name: z.string(),
              arguments: z.string(),
            }),
          })
        )
        .optional(),
    })
  ),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).max(10).optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().min(1).max(128000).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  user: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'google']).optional(),
});

/**
 * @swagger
 * /api/v1/chat/completions:
 *   post:
 *     summary: Create a chat completion
 *     description: |
 *       OpenAI-compatible chat completions endpoint that routes to multiple AI providers.
 *       Supports GPT-4, Claude, and Gemini models with automatic provider detection.
 *     tags:
 *       - Model Router
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *               - messages
 *             properties:
 *               model:
 *                 type: string
 *                 description: Model ID or alias (e.g., 'gpt-4o', 'claude', 'gemini')
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant]
 *                     content:
 *                       type: string
 *               temperature:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 2
 *               max_tokens:
 *                 type: integer
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Chat completion response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatCompletionResponse'
 *           text/event-stream:
 *             description: Server-sent events for streaming responses
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Apply rate limiting
    const rateLimiter = rateLimit(chatCompletionsRateLimit);
    const rateLimitResponse = await rateLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Authenticate request
    const auth = await authenticateApiKey(request);
    if (auth.error) {
      return auth.error;
    }

    const { user, apiKey } = auth;

    // Parse and validate request
    const body = await request.json();
    const validatedRequest = chatCompletionSchema.parse(body) as ChatCompletionRequest;

    // Resolve model alias
    const resolvedModel = resolveModelAlias(validatedRequest.model);
    validatedRequest.model = resolvedModel;

    // Get provider
    const provider = validatedRequest.provider || getProviderForModel(resolvedModel);

    // Log request
    console.log(`[ModelRouter] Request from ${user.id}: model=${resolvedModel}, provider=${provider}, stream=${validatedRequest.stream}`);

    // Handle streaming response
    if (validatedRequest.stream) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          let streamCompleted = false;
          try {
            for await (const chunk of routeChatCompletionStreaming(validatedRequest)) {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            streamCompleted = true;
          } catch (error) {
            console.error('[ModelRouter] Streaming error:', error);
            // SECURITY: Sanitize error message to prevent information disclosure
            const errorMessage =
              error instanceof Error && !error.message.toLowerCase().includes('api key')
                ? error.message
                : 'An error occurred while streaming';
            const errorData = `data: ${JSON.stringify({
              error: {
                message: errorMessage,
                type: 'api_error',
                code: 'internal_error',
              },
            })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          } finally {
            // Always close the stream to prevent resource leaks
            if (!streamCompleted) {
              try {
                controller.close();
              } catch {
                // Controller may already be closed
              }
            } else {
              controller.close();
            }
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Model-Provider': provider,
          'X-Model-Id': resolvedModel,
        },
      });
    }

    // Handle non-streaming response
    const response = await routeChatCompletion(validatedRequest);

    // Calculate cost
    const cost = response.usage
      ? calculateCost(resolvedModel, response.usage.prompt_tokens, response.usage.completion_tokens)
      : 0;

    // Log completion
    const latencyMs = Date.now() - startTime;
    console.log(
      `[ModelRouter] Completed: model=${resolvedModel}, ` +
        `tokens=${response.usage?.total_tokens || 0}, ` +
        `cost=$${cost.toFixed(6)}, ` +
        `latency=${latencyMs}ms`
    );

    // TODO: Log usage to database for billing
    // await logApiUsage({
    //   api_key_uuid: apiKey.uuid,
    //   model: resolvedModel,
    //   provider,
    //   prompt_tokens: response.usage?.prompt_tokens || 0,
    //   completion_tokens: response.usage?.completion_tokens || 0,
    //   cost,
    //   latency_ms: latencyMs,
    // });

    return NextResponse.json(response, {
      headers: {
        'X-Model-Provider': provider,
        'X-Model-Id': resolvedModel,
        'X-Request-Cost': cost.toFixed(6),
        'X-Request-Latency-Ms': latencyMs.toString(),
      },
    });
  } catch (error) {
    console.error('[ModelRouter] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
            code: 'invalid_request',
            details: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Check for provider-specific errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('API key not configured')) {
      return NextResponse.json(
        {
          error: {
            message: errorMessage,
            type: 'configuration_error',
            code: 'missing_api_key',
          },
        },
        { status: 503 }
      );
    }

    if (errorMessage.includes('Unknown model')) {
      return NextResponse.json(
        {
          error: {
            message: errorMessage,
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          message: 'An error occurred while processing your request',
          type: 'api_error',
          code: 'internal_error',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/chat/completions:
 *   get:
 *     summary: Get available models
 *     description: Returns a list of available models and their providers
 *     tags:
 *       - Model Router
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available models
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const auth = await authenticateApiKey(request);
    if (auth.error) {
      return auth.error;
    }

    // Import getAvailableModels
    const { getAvailableModels } = await import('@/lib/model-router');
    const models = getAvailableModels();

    // Check which providers have API keys configured
    const configuredProviders = {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!process.env.GOOGLE_API_KEY,
    };

    return NextResponse.json({
      object: 'list',
      data: models.map((model) => ({
        id: model.id,
        object: 'model',
        provider: model.provider,
        available: configuredProviders[model.provider],
      })),
    });
  } catch (error) {
    console.error('[ModelRouter] Error listing models:', error);
    return NextResponse.json(
      {
        error: {
          message: 'Failed to list models',
          type: 'api_error',
          code: 'internal_error',
        },
      },
      { status: 500 }
    );
  }
}
