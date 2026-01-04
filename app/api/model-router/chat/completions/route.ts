/**
 * Admin Model Testing API - Chat Completions
 *
 * Simplified chat completions endpoint for admin model testing.
 * Uses session authentication (admin only) instead of API key auth.
 *
 * @route POST /api/model-router/chat/completions
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticate } from '@/app/api/auth';
import {
  type ChatCompletionRequest,
  getProviderForModel,
  resolveModelAlias,
  routeChatCompletion,
} from '@/lib/model-router';

// Request validation schema (simplified for testing)
const testRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().int().min(1).max(4096).optional().default(500),
});

/**
 * POST /api/model-router/chat/completions
 *
 * Test a model with a simple chat completion request.
 * Admin-only endpoint using session authentication.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate user via session (requires admin privileges)
    const auth = await authenticate(request);
    if ('error' in auth) {
      return auth.error;
    }

    // Parse and validate request
    const body = await request.json();
    const validatedRequest = testRequestSchema.parse(body);

    // Resolve model alias
    const resolvedModel = resolveModelAlias(validatedRequest.model);

    // Get provider
    const provider = getProviderForModel(resolvedModel);

    // Log test request
    console.log(`[ModelRouter/Test] Admin test: model=${resolvedModel}, provider=${provider}`);

    // Build chat completion request
    const chatRequest: ChatCompletionRequest = {
      model: resolvedModel,
      messages: validatedRequest.messages,
      temperature: validatedRequest.temperature,
      max_tokens: validatedRequest.max_tokens,
      stream: false,
    };

    // Execute chat completion
    const response = await routeChatCompletion(chatRequest);

    // Calculate latency
    const latencyMs = Date.now() - startTime;

    // Log completion
    console.log(
      `[ModelRouter/Test] Completed: model=${resolvedModel}, ` +
        `tokens=${response.usage?.total_tokens || 0}, ` +
        `latency=${latencyMs}ms`
    );

    return NextResponse.json(response, {
      headers: {
        'X-Model-Provider': provider,
        'X-Model-Id': resolvedModel,
        'X-Request-Latency-Ms': latencyMs.toString(),
      },
    });
  } catch (error) {
    console.error('[ModelRouter/Test] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
            details: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Handle provider-specific errors
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
          message: errorMessage || 'An error occurred while testing the model',
          type: 'api_error',
          code: 'internal_error',
        },
      },
      { status: 500 }
    );
  }
}
