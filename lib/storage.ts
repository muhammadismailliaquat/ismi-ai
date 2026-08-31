import { ChatMessage, ChatConversation, StorageInterface } from '@/types/chat';

/**
 * Storage utility for chat history
 * Currently uses localStorage but structured for easy migration to a real database
 * (Supabase, Firebase, etc.) without rewriting the application code
 */

class LocalStorageService implements StorageInterface {
  private readonly CONVERSATIONS_KEY = 'ismi_conversations';
  private readonly CURRENT_CHAT_KEY = 'ismi_current_chat';

  // Get all conversations
  async getConversations(): Promise<ChatConversation[]> {
    try {
      const data = localStorage.getItem(this.CONVERSATIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Get a single conversation by ID
  async getConversation(id: string): Promise<ChatConversation | null> {
    const conversations = await this.getConversations();
    return conversations.find(c => c.id === id) || null;
  }

  // Save a conversation
  async saveConversation(conversation: ChatConversation): Promise<void> {
    const conversations = await this.getConversations();
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);

    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.unshift(conversation);
    }

    localStorage.setItem(this.CONVERSATIONS_KEY, JSON.stringify(conversations));
  }

  // Delete a conversation
  async deleteConversation(id: string): Promise<void> {
    const conversations = await this.getConversations();
    const filtered = conversations.filter(c => c.id !== id);
    localStorage.setItem(this.CONVERSATIONS_KEY, JSON.stringify(filtered));
  }

  // Rename a conversation
  async renameConversation(id: string, title: string): Promise<void> {
    const conversations = await this.getConversations();
    const conversation = conversations.find(c => c.id === id);
    if (conversation) {
      conversation.title = title;
      localStorage.setItem(this.CONVERSATIONS_KEY, JSON.stringify(conversations));
    }
  }

  // Add a message to a conversation
  async addMessage(conversationId: string, message: ChatMessage): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      conversation.messages.push(message);
      conversation.updatedAt = new Date().toISOString();
      await this.saveConversation(conversation);
    }
  }

  // Get current active chat ID
  getCurrentChatId(): string | null {
    return localStorage.getItem(this.CURRENT_CHAT_KEY);
  }

  // Set current active chat ID
  setCurrentChatId(id: string): void {
    localStorage.setItem(this.CURRENT_CHAT_KEY, id);
  }

  // Clear current chat
  clearCurrentChat(): void {
    localStorage.removeItem(this.CURRENT_CHAT_KEY);
  }

  // Generate unique ID
  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Create a new conversation
  createConversation(title: string = 'New Chat'): ChatConversation {
    return {
      id: this.generateId(),
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const storage = new LocalStorageService();

// Export type for database migration
export type { StorageInterface };
