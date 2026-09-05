'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChatWindow } from '@/components/ChatWindow';
import { Sidebar } from '@/components/Sidebar';
import { InputBar } from '@/components/InputBar';
import {
  ParticleBackground,
  setParticleStreaming,
} from '@/components/ParticleBackground';
import { storage } from '@/lib/storage';
import { ChatConversation, ChatMessage } from '@/types/chat';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';
import Link from 'next/link';

export default function ChatPage() {
  const { data: session, update } = useSession();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<ChatConversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const handleSendMessageRef = useRef<
    ((text: string) => Promise<void>) | null
  >(null);

  // Sync username from sessionStorage into NextAuth session
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

  }, [session, update]);

  // Create a new chat
  const createNewChat = useCallback(() => {
    const newConvo = storage.createConversation();

    storage.setCurrentChatId(newConvo.id);

    setCurrentConversation(newConvo);
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const convos = await storage.getConversations();

    const nonEmptyConvos = convos.filter(
      (conversation) => conversation.messages.length > 0
    );

    setConversations(nonEmptyConvos);

    const currentId = storage.getCurrentChatId();

    if (currentId) {
      const current = convos.find(
        (conversation) => conversation.id === currentId
      );

      if (current) {
        setCurrentConversation(current);
      } else {
        createNewChat();
      }
    } else {
      createNewChat();
    }
  }, [createNewChat]);

  // Load saved conversations after authentication
  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadConversations();
    }
  }, [session, loadConversations]);

  // Tell particle system when streaming starts/stops
  useEffect(() => {
    setParticleStreaming(isLoading);
  }, [isLoading]);

  // Suggested prompt handler
  useEffect(() => {
    const handler = (event: CustomEvent<{ text: string }>) => {
      const text = event?.detail?.text;

      if (typeof text === 'string' && text.trim()) {
        handleSendMessageRef.current?.(text);
      }
    };

    window.addEventListener(
      'ismi_send_message',
      handler as EventListener
    );

    return () => {
      window.removeEventListener(
        'ismi_send_message',
        handler as EventListener
      );
    };
  }, [currentConversation]);

  // Select conversation
  const handleSelectConversation = async (id: string) => {
    const convo = await storage.getConversation(id);

    if (convo) {
      setCurrentConversation(convo);
      storage.setCurrentChatId(id);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (id: string) => {
    await storage.deleteConversation(id);

    setConversations((prev) =>
      prev.filter((conversation) => conversation.id !== id)
    );

    if (currentConversation?.id === id) {
      const remaining = conversations.filter(
        (conversation) => conversation.id !== id
      );

      if (remaining.length > 0) {
        const next = remaining[0];

        setCurrentConversation(next);
        storage.setCurrentChatId(next.id);
      } else {
        createNewChat();
      }
    }
  };

  // Rename conversation
  const handleRenameConversation = useCallback(
    async (id: string, newTitle: string) => {
      await storage.renameConversation(id, newTitle);

      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id
            ? { ...conversation, title: newTitle }
            : conversation
        )
      );

      if (currentConversation?.id === id) {
        setCurrentConversation((prev) =>
          prev ? { ...prev, title: newTitle } : null
        );
      }
    },
    [currentConversation]
  );

  // Send message
  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!currentConversation) return;

      const trimmedText = text.trim();

      if (!trimmedText) return;

      setError(null);

      const thisConvoId = currentConversation.id;

      // Create user message
      const userMessage: ChatMessage = {
        id: storage.generateId(),
        role: 'user',
        content: trimmedText,
        timestamp: new Date().toISOString(),
      };

      // Add user message immediately
      const updatedConvo: ChatConversation = {
        ...currentConversation,
        messages: [
          ...currentConversation.messages,
          userMessage,
        ],
      };

      setCurrentConversation(updatedConvo);

      // Save immediately
      await storage.saveConversation(updatedConvo);

      // Add to sidebar if first message
      if (currentConversation.messages.length === 0) {
        setConversations((prev) => {
          const existing = prev.find(
            (conversation) => conversation.id === thisConvoId
          );

          if (existing) {
            return prev.map((conversation) =>
              conversation.id === thisConvoId
                ? updatedConvo
                : conversation
            );
          }

          return [updatedConvo, ...prev];
        });
      } else {
        // Update existing conversation
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === thisConvoId
              ? updatedConvo
              : conversation
          )
        );
      }

      // Auto-title first message
      if (currentConversation.messages.length === 0) {
        const title =
          trimmedText.slice(0, 50) +
          (trimmedText.length > 50 ? '...' : '');

        await handleRenameConversation(thisConvoId, title);
      }

      setIsLoading(true);

      try {
        /*
         * IMPORTANT FIX:
         *
         * Backend accepts:
         * user | assistant | system
         *
         * Previously we were converting assistant -> model.
         * That caused:
         *
         * "Invalid option expected one of user, assistant, system"
         *
         * Now we send the role exactly as the backend expects.
         */
        const apiMessages = [
          ...currentConversation.messages,
          userMessage,
        ].map((message) => {
          // Stored chat history may contain legacy/invalid roles.
          // Backend accepts only: "user" | "assistant" | "system".
          const rawRole = (message as { role?: unknown }).role;

          const role: "user" | "assistant" | "system" =
            rawRole === "user" ||
            rawRole === "assistant" ||
            rawRole === "system"
              ? rawRole
              : "assistant";

          return {
            role,
            content: message.content,
          };
        });

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: apiMessages,
          }),
        });

        // Authentication failure
        if (!response.ok) {
          if (response.status === 401) {
            router.push('/login');
            return;
          }

          let errorMessage = `API error: ${response.status}`;

          try {
            const errorData = await response.json();

            if (errorData?.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // Ignore JSON parsing error
          }

          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('Failed to read AI response');
        }

        const decoder = new TextDecoder();

        let assistantContent = '';

        // Temporary assistant message
        const assistantMessage: ChatMessage = {
          id: storage.generateId(),
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
        };

        // SSE parser (chunk-safe): never assume a single reader.read() maps
        // to a complete SSE event. We buffer text and process events only
        // when we reach the SSE event boundary (blank line).
        let sseBuffer = '';
        let eventData = '';

        const applyAssistantText = (delta: string) => {
          assistantContent += delta;
          assistantMessage.content = assistantContent;

          // Update UI while streaming
          setCurrentConversation((prev) => {
            if (!prev) return prev;

            // Don't update if user switched conversation
            if (prev.id !== thisConvoId) {
              return prev;
            }

            const messages = [...prev.messages];

            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              messages[messages.length - 1] = assistantMessage;
            } else {
              messages.push(assistantMessage);
            }

            return {
              ...prev,
              messages,
            };
          });
        };

        const flushEvent = () => {
          const data = eventData.trim();
          eventData = '';

          if (!data) return;
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            if (parsed?.error) {
              throw new Error(parsed.error);
            }
            if (typeof parsed?.text === 'string' && parsed.text) {
              applyAssistantText(parsed.text);
            }
          } catch (parseError) {
            console.error('[Chat] Parse error:', parseError);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          // Process complete lines; keep any trailing partial line in buffer.
          const lines = sseBuffer.split(/\r?\n/);
          sseBuffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine ?? '';

            // Blank line => end of one SSE event.
            if (line.trim() === '') {
              flushEvent();
              continue;
            }

            // We only care about data: lines.
            if (line.startsWith('data: ')) {
              const chunk = line.slice(6);
              // Multiple data: lines in one event should be concatenated.
              eventData += (eventData ? '\n' : '') + chunk;
            }
          }
        }

        // Stream ended; if we have complete event content already buffered,
        // flush it (but only if it forms a valid JSON payload).
        if (eventData.trim()) {
          flushEvent();
        }

        // Ensure loading stops.
        // Save final assistant response

        // Save final assistant response
        if (assistantContent) {
          const finalConvo =
            await storage.getConversation(thisConvoId);

          if (finalConvo) {
            finalConvo.messages.push(assistantMessage);

            await storage.saveConversation(finalConvo);

            setCurrentConversation((prev) => {
              if (prev?.id !== thisConvoId) {
                return prev;
              }

              return finalConvo;
            });

            // Update sidebar
            setConversations((prev) =>
              prev.map((conversation) =>
                conversation.id === thisConvoId
                  ? finalConvo
                  : conversation
              )
            );
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error('[Chat] Request failed:', error);

        setError(
          error instanceof Error
            ? error.message
            : 'Failed to get AI response'
        );

        setIsLoading(false);
      }
    },
    [
      currentConversation,
      handleRenameConversation,
      router,
    ]
  );

  // Keep ref updated
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  return (
    <div className="relative h-screen flex flex-col overflow-hidden bg-[#0f172a]">
      {/* Background */}
      <ParticleBackground variant="dna" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-blue-200/15 bg-blue-500/5">
        <Link
          href="/"
          className="text-xl font-bold text-white drop-shadow"
        >
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
          currentConversationId={
            currentConversation?.id || null
          }
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

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{
                  opacity: 0,
                  y: 20,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 20,
                }}
                className="px-4 py-2 mx-4 mb-2 bg-red-500/15 border border-red-400/30 rounded-xl text-[#fecaca] text-sm backdrop-blur-[2px]"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
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