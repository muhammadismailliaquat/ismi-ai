'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { ChatWindow } from '@/components/ChatWindow';
import { Sidebar } from '@/components/Sidebar';
import { InputBar } from '@/components/InputBar';
import { ParticleBackground, setParticleStreaming } from '@/components/ParticleBackground';
import { storage } from '@/lib/storage';
import { ChatConversation, ChatMessage } from '@/types/chat';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';
import Link from 'next/link';

export default function ChatPage() {
  const { data: session, update } = useSession();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ChatConversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const handleSendMessageRef = useRef<((text: string) => Promise<void>) | null>(null);

  // Sync username from sessionStorage into NextAuth session + set userKey
  useEffect(() => {
    if (!session) return;
    const savedName = sessionStorage.getItem('ismi_username');
    if (savedName) {
      sessionStorage.removeItem('ismi_username');
      update({ name: savedName });
    }
    const userId = (session.user as { id?: string })?.id;
    if (userId) {
      storage.setUserKey(userId);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [session, update]);

  const createNewChat = useCallback(() => {
    const newConvo = storage.createConversation();
    storage.setCurrentChatId(newConvo.id);
    setCurrentConversation(newConvo);
    // Don't add to conversations list until it has messages
  }, []);

  const loadConversations = useCallback(async () => {
    const convos = await storage.getConversations();
    // Filter out empty conversations (no messages) — they'll be shown in chat area only
    const nonEmptyConvos = convos.filter(c => c.messages.length > 0);
    setConversations(nonEmptyConvos);

    // Load current conversation if exists
    const currentId = storage.getCurrentChatId();
    if (currentId) {
      const current = convos.find(c => c.id === currentId);
      if (current) {
        setCurrentConversation(current);
      } else {
        createNewChat();
      }
    } else {
      createNewChat();
    }
  }, [createNewChat]);

  // Load saved conversations once session is available
  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadConversations();
    }
  }, [session, loadConversations]);

  // Tell particle system when streaming starts/stops so it can throttle
  useEffect(() => {
    setParticleStreaming(isLoading);
  }, [isLoading]);

  // Handle "suggested prompt" clicks to behave like typing + send
  useEffect(() => {
    const handler = (e: CustomEvent<{ text: string }>) => {
      const text = e?.detail?.text;
      if (typeof text === 'string' && text.trim()) {
        handleSendMessageRef.current?.(text);
      }
    };

    window.addEventListener('ismi_send_message', handler as EventListener);
    return () => window.removeEventListener('ismi_send_message', handler as EventListener);
  }, [currentConversation]);

  const handleSelectConversation = async (id: string) => {
    const convo = await storage.getConversation(id);
    if (convo) {
      setCurrentConversation(convo);
      storage.setCurrentChatId(id);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await storage.deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));

    // If we deleted the current conversation, switch to another one instead of creating a new one
    if (currentConversation?.id === id) {
      const remaining = conversations.filter(c => c.id !== id);
      if (remaining.length > 0) {
        const next = remaining[0];
        setCurrentConversation(next);
        storage.setCurrentChatId(next.id);
      } else {
        // No conversations left — create exactly one new one
        createNewChat();
      }
    }
  };

  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    await storage.renameConversation(id, newTitle);
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, title: newTitle } : c)));
    if (currentConversation?.id === id) {
      setCurrentConversation(prev => (prev ? { ...prev, title: newTitle } : null));
    }
  }, [currentConversation]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentConversation) return;

    setError(null);
    const thisConvoId = currentConversation.id;

    const userMessage: ChatMessage = {
      id: storage.generateId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    // Add user message IMMEDIATELY
    const updatedConvo = {
      ...currentConversation,
      messages: [...currentConversation.messages, userMessage],
    };
    setCurrentConversation(updatedConvo);

    // Save to storage immediately
    await storage.saveConversation(updatedConvo);

    // Add to sidebar only if it's the first message (converting from empty to non-empty)
    if (currentConversation.messages.length === 0) {
      setConversations(prev => {
        const existing = prev.find(c => c.id === thisConvoId);
        if (existing) {
          return prev.map(c => (c.id === thisConvoId ? updatedConvo : c));
        }
        return [updatedConvo, ...prev];
      });
    } else {
      // Update existing conversation in sidebar
      setConversations(prev => prev.map(c => (c.id === thisConvoId ? updatedConvo : c)));
    }

    // Auto-title first message
    if (currentConversation.messages.length === 0) {
      const title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
      await handleRenameConversation(thisConvoId, title);
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...currentConversation.messages, userMessage].map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        // Gate: redirect to Google login on auth failure
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      const assistantMessage: ChatMessage = {
        id: storage.generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

          for (const line of lines) {
            const data = line.replace('data: ', '');
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                assistantContent += parsed.text;
                assistantMessage.content = assistantContent;

                // Only update UI if we're still on the same conversation
                setCurrentConversation(prev => {
                  if (!prev) return prev;
                  // If user switched conversations, don't update this one
                  if (prev.id !== thisConvoId) return prev;
                  const messages = [...prev.messages];
                  const lastMsg = messages[messages.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    messages[messages.length - 1] = assistantMessage;
                  } else {
                    messages.push(assistantMessage);
                  }
                  return { ...prev, messages };
                });
              }
            } catch (e) {
              console.error('[Chat] Parse error:', e);
            }
          }
        }
      }

      // Save final message
      if (assistantContent) {
        const finalConvo = await storage.getConversation(thisConvoId);
        if (finalConvo) {
          finalConvo.messages.push(assistantMessage);
          await storage.saveConversation(finalConvo);
          // Only update UI state if we're still on the same conversation
          setCurrentConversation(prev => {
            if (prev?.id !== thisConvoId) return prev;
            return finalConvo;
          });
        }
      }

      setIsLoading(false);
    } catch (error) {
      setError((error as Error)?.message || 'Failed to get AI response');
      setIsLoading(false);
    }
  }, [currentConversation, handleRenameConversation, router]);

  // Keep handleSendMessageRef in sync with the latest handleSendMessage
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  return (
    <div className="relative h-screen flex flex-col overflow-hidden bg-[#0f172a]">
      {/* Animated macro DNA helix background behind the chat */}
      <ParticleBackground variant="dna" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-blue-200/15 bg-blue-500/5">
        <Link href="/" className="text-xl font-bold text-white drop-shadow">
          ismi.ai
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/settings">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-xl border border-blue-200/25 bg-blue-500/10 backdrop-blur-[2px]"
            >
              <Settings className="w-5 h-5 text-[#a78bfa]" />
            </motion.button>
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversation?.id || null}
          onSelectConversation={handleSelectConversation}
          onNewChat={createNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
        />

        <div className="flex-1 flex flex-col">
          <ChatWindow
            messages={currentConversation?.messages || []}
            isLoading={isLoading}
          />

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="px-4 py-2 mx-4 mb-2 bg-red-500/15 border border-red-400/30 rounded-xl text-[#fecaca] text-sm backdrop-blur-[2px]"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4 border-t border-blue-200/15 bg-blue-500/5">
            <InputBar
              onSendMessage={handleSendMessage}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
