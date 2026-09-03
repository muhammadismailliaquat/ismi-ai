'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, Mic } from 'lucide-react';

interface InputBarProps {
  onSendMessage: (message: string) => void;
  onVoiceClick?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({
  onSendMessage,
  onVoiceClick,
  disabled = false,
  placeholder = 'Type a message...',
}: InputBarProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: start small, grow up to ~5 lines then scroll
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  };

  // Keep the box focused whenever it becomes editable (e.g. after loading).
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
      // Refocus + reset height after sending so typing can continue immediately.
      requestAnimationFrame(() => {
        autoResize();
        textareaRef.current?.focus();
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceClick = () => {
    if (onVoiceClick) {
      onVoiceClick();
    } else {
      router.push('/call');
    }
  };

  return (
    <div className="rounded-2xl p-4 bg-blue-500/5 border border-blue-200/15 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none text-base text-[#e2e8f0] placeholder:text-[#94a3b8] max-h-[130px] overflow-y-auto"
          style={{ minHeight: '40px' }}
        />
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleVoiceClick}
            className="p-3 rounded-xl border border-blue-200/25 bg-blue-500/10 backdrop-blur-[2px]"
            aria-label="Voice call"
            title="Voice call"
          >
            <Mic className="w-5 h-5 text-[#a78bfa]" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSend}
            disabled={disabled || !input.trim()}
            className={`p-3 rounded-xl transition-all ${
              disabled || !input.trim()
                ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                : 'bg-[#7c3aed]/55 hover:bg-[#7c3aed]/70 text-white border border-[#a78bfa]/40'
            }`}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
