import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Get the model
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

/**
 * Send a message to Gemini AI and get a streaming response
 */
export async function* streamChat(
  messages: ChatMessage[],
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  try {
    // Format messages for Gemini
    const formattedHistory = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    // Start chat with history
    const chat = model.startChat({
      history: formattedHistory,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    // Add system prompt if provided
    const prompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${lastMessage.content}`
      : lastMessage.content;

    // Stream the response
    const result = await chat.sendMessageStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

/**
 * Send a message and get complete response (non-streaming)
 */
export async function sendMessage(
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
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
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const prompt = systemPrompt
      ? `${systemPrompt}\n\nUser: ${lastMessage.content}`
      : lastMessage.content;

    const result = await chat.sendMessage(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

/**
 * Check if API key is configured
 */
export function isConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
