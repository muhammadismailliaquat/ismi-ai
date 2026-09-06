'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { ChatMessage } from '@/types/chat';
import { motion } from 'framer-motion';

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

export function ChatWindow({ messages, isLoading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {messages.length === 0 && !isLoading && (
        <div className="h-full flex items-center justify-center">
          <div className="text-center max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <div className="text-6xl mb-4 animate-float"></div>
              <h2 className="text-3xl font-bold text-white drop-shadow mb-3">
                Welcome to Ismi.ai
              </h2>
              <p className="text-[#cbd5e1]">
                Your AI assistant is ready to help. Ask me anything!
              </p>
            </motion.div>

            <div className="grid grid-cols-1 gap-3 mt-8">
              {[
                '💡 Explain quantum computing',
                '📝 Write a creative story',
                '🔍 Research recent AI trends',
              ].map((suggestion, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Same behavior as typing into the input and pressing send
                    const text = suggestion.replace(/^\p{Emoji}\s*/u, '');
                    // Simulate input by dispatching a custom event the Chat page listens for.
                    window.dispatchEvent(
                      new CustomEvent('ismi_send_message', { detail: { text } })
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const text = suggestion.replace(/^\p{Emoji}\s*/u, '');
                      window.dispatchEvent(
                        new CustomEvent('ismi_send_message', { detail: { text } })
                      );
                    }
                  }}
                  className="rounded-xl p-3 text-sm text-left text-[#e2e8f0] border border-blue-200/15 bg-blue-500/5 cursor-pointer hover:bg-blue-500/10 transition-all"
                >
                  {suggestion}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {messages.map((message, index) => {
        const isStreaming = isLoading && message.role === 'assistant' && index === messages.length - 1;
        return (
          <MessageBubble
            key={message.id}
            role={message.role}
            content={message.content}
            isStreaming={isStreaming}
          />
        );
      })}

      {isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start mb-4">
          <div className="rounded-2xl px-5 py-4 bg-blue-500/5 border border-blue-200/15">
            <div className="flex items-center gap-2.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${['#a78bfa', '#60a5fa', '#7c3aed'][i]}, ${['#7c3aed', '#a78bfa', '#60a5fa'][i]})`,
                    boxShadow: '0 0 8px rgba(124,58,237,0.6)',
                  }}
                  animate={{ y: [0, -7, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
