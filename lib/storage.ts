'use client';

import { ChatMessage, ChatConversation, StorageInterface } from '@/types/chat';

/**
 * Storage utility for chat history
 *
 * NOTE:
 * - We store chat history in browser `localStorage` (no server DB yet).
 * - To meet your requirement, we scope history by (userKey + deviceId).
 *   - userKey: set after Google+OTP verification (defaults to 'anon')
 *   - deviceId: stable per browser/device
 *
 * Some environments block localStorage (privacy mode / hardened browsers).
 * We guard every localStorage access so the UI never gets stuck/crashes.
 */

class LocalStorageService implements StorageInterface {
  // Per-device identity (stable across visits on the same browser/device)
  private readonly DEVICE_ID_KEY = 'ismi_device_id';
  // Per-user identity (set after auth). Defaults to 'anon'.
  private readonly USER_KEY_KEY = 'ismi_user_key';

  private canUseStorage(): boolean {
    try {
      return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  private safeGetItem(key: string): string | null {
    try {
      if (!this.canUseStorage()) return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeSetItem(key: string, value: string): void {
    try {
      if (!this.canUseStorage()) return;
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  private safeRemoveItem(key: string): void {
    try {
      if (!this.canUseStorage()) return;
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  private getScopedKeys(): { conversationsKey: string; currentChatKey: string } | null {
    try {
      if (!this.canUseStorage()) return null;

      const deviceId = this.getOrCreateDeviceId();
      const userKey = this.getUserKey();
      if (!deviceId || !userKey) return null;

      return {
        conversationsKey: `ismi_conversations:${userKey}:${deviceId}`,
        currentChatKey: `ismi_current_chat:${userKey}:${deviceId}`,
      };
    } catch {
      return null;
    }
  }

  private getOrCreateDeviceId(): string | null {
    try {
      const existing = this.safeGetItem(this.DEVICE_ID_KEY);
      if (existing && existing.trim()) return existing;

      const created = this.generateId();
      this.safeSetItem(this.DEVICE_ID_KEY, created);
      return created;
    } catch {
      return null;
    }
  }

  private getUserKey(): string | null {
    try {
      const existing = this.safeGetItem(this.USER_KEY_KEY);
      if (existing && existing.trim()) return existing;
      return 'anon';
    } catch {
      return null;
    }
  }

  /**
   * Call this after user completes Google+OTP verification.
   * Example userKey: normalized email or NextAuth user sub.
   */
  setUserKey(userKey: string): void {
    this.safeSetItem(this.USER_KEY_KEY, (userKey || '').trim());
  }

  // Get all conversations
  async getConversations(): Promise<ChatConversation[]> {
    const keys = this.getScopedKeys();
    if (!keys) return [];

    try {
      const data = this.safeGetItem(keys.conversationsKey);
      return data ? (JSON.parse(data) as ChatConversation[]) : [];
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
    const keys = this.getScopedKeys();
    if (!keys) return;

    try {
      const conversations = await this.getConversations();
      const existingIndex = conversations.findIndex(c => c.id === conversation.id);

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.unshift(conversation);
      }

      this.safeSetItem(keys.conversationsKey, JSON.stringify(conversations));
    } catch {
      // ignore
    }
  }

  // Delete a conversation
  async deleteConversation(id: string): Promise<void> {
    const keys = this.getScopedKeys();
    if (!keys) return;

    try {
      const conversations = await this.getConversations();
      const filtered = conversations.filter(c => c.id !== id);
      this.safeSetItem(keys.conversationsKey, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }

  // Rename a conversation
  async renameConversation(id: string, title: string): Promise<void> {
    const keys = this.getScopedKeys();
    if (!keys) return;

    try {
      const conversations = await this.getConversations();
      const conversation = conversations.find(c => c.id === id);
      if (conversation) {
        conversation.title = title;
        this.safeSetItem(keys.conversationsKey, JSON.stringify(conversations));
      }
    } catch {
      // ignore
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
    const keys = this.getScopedKeys();
    if (!keys) return null;
    return this.safeGetItem(keys.currentChatKey);
  }

  // Set current active chat ID
  setCurrentChatId(id: string): void {
    const keys = this.getScopedKeys();
    if (!keys) return;
    this.safeSetItem(keys.currentChatKey, id);
  }

  // Clear current chat
  clearCurrentChat(): void {
    const keys = this.getScopedKeys();
    if (!keys) return;
    this.safeRemoveItem(keys.currentChatKey);
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
