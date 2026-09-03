import { GoogleGenerativeAI } from '@google/generative-ai';

// Import types
import { ChatMessage } from '@/types/chat';

// Helper function to format messages for Gemini
function formatMessagesForGemini(messages: ChatMessage[]): any[] {
  return messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));
}

// Helper function to format messages for OpenAI-compatible APIs
function formatMessagesForOpenAI(messages: ChatMessage[], systemPrompt?: string): any[] {
  const formatted: any[] = [];

  if (systemPrompt) {
    formatted.push({
      role: 'system',
      content: systemPrompt
    });
  }

  for (const msg of messages) {
    formatted.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    });
  }

  return formatted;
}

// Stream processing for OpenAI-compatible APIs
async function* processOpenAIStream(response: Response): AsyncGenerator<string> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to get response reader');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// Provider implementations
async function* tryGemini(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API not configured');
  }

  console.log('[AI] Trying: Gemini');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  try {
    const formattedHistory = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({
      history: formattedHistory,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.3,
        topP: 0.9,
      },
    });

    const prompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${lastMessage.content}`
      : lastMessage.content;

    const result = await chat.sendMessageStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
    console.log('[AI] Responded via: Gemini');
  } catch (error: any) {
    console.log(`[AI] Gemini failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}

async function* tryGroq(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API not configured');
  }

  console.log('[AI] Trying: Groq');

  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const formattedMessages = formatMessagesForOpenAI(messages, systemPrompt);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: formattedMessages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    yield* processOpenAIStream(response);
    console.log('[AI] Responded via: Groq');
  } catch (error: any) {
    console.log(`[AI] Groq failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}

async function* tryMistral(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('Mistral API not configured');
  }

  console.log('[AI] Trying: Mistral');

  const endpoint = 'https://api.mistral.ai/v1/chat/completions';
  const formattedMessages = formatMessagesForOpenAI(messages, systemPrompt);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-tiny-latest',
        messages: formattedMessages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    yield* processOpenAIStream(response);
    console.log('[AI] Responded via: Mistral');
  } catch (error: any) {
    console.log(`[AI] Mistral failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}

async function* trySambaNova(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string> {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) {
    throw new Error('SambaNova API not configured');
  }

  console.log('[AI] Trying: SambaNova');

  const endpoint = 'https://api.sambanova.ai/v1/chat/completions';
  const formattedMessages = formatMessagesForOpenAI(messages, systemPrompt);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Meta-Llama-3.1-8B-Instruct',
        messages: formattedMessages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    yield* processOpenAIStream(response);
    console.log('[AI] Responded via: SambaNova');
  } catch (error: any) {
    console.log(`[AI] SambaNova failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}

async function* tryOpenRouter(messages: ChatMessage[], systemPrompt?: string): AsyncGenerator<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API not configured');
  }

  console.log('[AI] Trying: OpenRouter');

  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const formattedMessages = formatMessagesForOpenAI(messages, systemPrompt);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: formattedMessages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    yield* processOpenAIStream(response);
    console.log('[AI] Responded via: OpenRouter');
  } catch (error: any) {
    console.log(`[AI] OpenRouter failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}

/**
 * Send a message to AI and get a streaming response with fallback chain.
 * `preferredProvider` (optional) moves one provider to the front of the chain
 * so it is tried first — used by the voice call to route straight to the
 * fastest provider (Groq) instead of defaulting to Gemini. Falls back normally
 * if the preferred provider is unconfigured or errors.
 */
export async function* streamChat(
  messages: ChatMessage[],
  systemPrompt?: string,
  preferredProvider?: string
): AsyncGenerator<string, void, unknown> {
  const allProviders = [
    { name: 'Groq', fn: tryGroq },
    { name: 'Gemini', fn: tryGemini },
    { name: 'Mistral', fn: tryMistral },
    { name: 'SambaNova', fn: trySambaNova },
    { name: 'OpenRouter', fn: tryOpenRouter },
  ];

  const providers = preferredProvider
    ? [
        ...allProviders.filter(p => p.name.toLowerCase() === preferredProvider.toLowerCase()),
        ...allProviders.filter(p => p.name.toLowerCase() !== preferredProvider.toLowerCase()),
      ]
    : allProviders;

  let lastError: Error | null = null;

  for (const provider of providers) {
    const apiKeyName = `${provider.name.toUpperCase()}_API_KEY`;
    const apiKey = process.env[apiKeyName as keyof typeof process.env];

    if (!apiKey) {
      console.log(`[AI] Skipping ${provider.name}: API key not configured`);
      continue;
    }

    try {
      yield* provider.fn(messages, systemPrompt);
      return; // Success - exit the function
    } catch (error: any) {
      lastError = error;

      // Check if this is the last configured provider
      const nextProvider = providers[providers.indexOf(provider) + 1];
      const nextApiKey = nextProvider ? process.env[`${nextProvider.name.toUpperCase()}_API_KEY` as keyof typeof process.env] : null;

      if (nextProvider && nextApiKey) {
        console.log(`[AI] Falling back to: ${nextProvider.name}`);
      }
    }
  }

  // If we get here, all configured providers failed
  console.error('[AI] All configured providers failed');
  throw lastError || new Error('No AI provider available');
}

// Non-streaming implementations for each provider
async function sendWithGemini(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  try {
    const formattedHistory = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({
      history: formattedHistory,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.3,
        topP: 0.9,
      },
    });

    const prompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${lastMessage.content}`
      : lastMessage.content;

    const result = await chat.sendMessage(prompt);
    return result.response.text();
  } catch (error: any) {
    console.log(`[AI] Gemini failed: ${error.message || 'Unknown error'}`);
    throw error;
  }
}

async function sendWithProvider(endpoint: string, apiKey: string, modelName: string, messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const formattedMessages = formatMessagesForOpenAI(messages, systemPrompt);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: formattedMessages,
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function sendWithOpenRouter(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API not configured');
  }

  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const formattedMessages = formatMessagesForOpenAI(messages, systemPrompt);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: formattedMessages,
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Send a message and get complete response (non-streaming) with fallback chain
 */
export async function sendMessage(
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const providers = [
    {
      name: 'Groq',
      check: () => !!process.env.GROQ_API_KEY,
      send: () => sendWithProvider(
        'https://api.groq.com/openai/v1/chat/completions',
        process.env.GROQ_API_KEY!,
        'llama-3.3-70b-versatile',
        messages,
        systemPrompt
      )
    },
    {
      name: 'Gemini',
      check: () => !!process.env.GEMINI_API_KEY,
      send: () => sendWithGemini(messages, systemPrompt)
    },
    {
      name: 'Mistral',
      check: () => !!process.env.MISTRAL_API_KEY,
      send: () => sendWithProvider(
        'https://api.mistral.ai/v1/chat/completions',
        process.env.MISTRAL_API_KEY!,
        'mistral-tiny-latest',
        messages,
        systemPrompt
      )
    },
    {
      name: 'SambaNova',
      check: () => !!process.env.SAMBANOVA_API_KEY,
      send: () => sendWithProvider(
        'https://api.sambanova.ai/v1/chat/completions',
        process.env.SAMBANOVA_API_KEY!,
        'Meta-Llama-3.1-8B-Instruct',
        messages,
        systemPrompt
      )
    },
    {
      name: 'OpenRouter',
      check: () => !!process.env.OPENROUTER_API_KEY,
      send: () => sendWithOpenRouter(messages, systemPrompt)
    },
  ];

  let lastError: Error | null = null;

  for (const provider of providers) {
    if (!provider.check()) {
      console.log(`[AI] Skipping ${provider.name}: API key not configured`);
      continue;
    }

    console.log(`[AI] Trying: ${provider.name}`);

    try {
      const result = await provider.send();
      console.log(`[AI] Responded via: ${provider.name}`);
      return result;
    } catch (error: any) {
      lastError = error;
      console.log(`[AI] ${provider.name} failed: ${error.message || 'Unknown error'}`);

      // Check if this is the last configured provider
      const nextProvider = providers[providers.indexOf(provider) + 1];
      const nextHasKey = nextProvider ? nextProvider.check() : false;

      if (nextProvider && nextHasKey) {
        console.log(`[AI] Falling back to: ${nextProvider.name}`);
      }
    }
  }

  // If we get here, all configured providers failed
  console.error('[AI] All configured providers failed');
  throw lastError || new Error('No AI provider available');
}

/**
 * Check if any AI provider is configured
 */
export function isConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY ||
         !!process.env.GROQ_API_KEY ||
         !!process.env.MISTRAL_API_KEY ||
         !!process.env.SAMBANOVA_API_KEY ||
         !!process.env.OPENROUTER_API_KEY;
}
