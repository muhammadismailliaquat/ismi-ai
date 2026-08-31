export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface StorageInterface {
  getConversations(): Promise<ChatConversation[]>;
  getConversation(id: string): Promise<ChatConversation | null>;
  saveConversation(conversation: ChatConversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  addMessage(conversationId: string, message: ChatMessage): Promise<void>;
}

export interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  transcript: string;
}

export interface Settings {
  theme: 'light' | 'system';
  voiceEnabled: boolean;
  voiceRate: number;
  voicePitch: number;
  language: string;
}
