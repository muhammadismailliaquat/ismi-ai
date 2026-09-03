'use client';

import { useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Volume2, VolumeX } from 'lucide-react';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const codeContainerRef = useState<HTMLDivElement | null>(null);

  // Track code block visibility with IntersectionObserver
  useState(() => {
    const codeId = `code-${content.slice(0, 20).replace(/[^a-z0-9]/gi, '')}`;
    const codeEl = document.getElementById(codeId);
    if (!codeEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => setCodeVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(codeEl);
    return () => observer.disconnect();
  });

  const handleCopyMessage = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleCodeCopy = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, []);

  const handleSpeak = useCallback(() => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const textOnly = content
      .replace(/```[\s\S]*?```/g, '[code block]')
      .replace(/`[^`]+`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/[*_~]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    if (!textOnly) return;

    const utterance = new SpeechSynthesisUtterance(textOnly);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [speaking, content]);

  const codeId = `code-${content.slice(0, 20).replace(/[^a-z0-9]/gi, '')}`;

  const copyCodeFromContent = useCallback(() => {
    const codeMatch = content.match(/```[\s\S]*?```/);
    if (codeMatch) {
      const code = codeMatch[0].replace(/```\w*\n?/, '').replace(/```$/, '').trim();
      handleCodeCopy(code);
    }
  }, [content, handleCodeCopy]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`relative max-w-[80%] rounded-2xl px-4 pt-3 pb-2 backdrop-blur-[2px] text-[#e2e8f0] group ${
          isUser
            ? 'bg-blue-400/15 border border-blue-200/30'
            : 'bg-blue-500/10 border border-blue-200/20'
        }`}
      >
        <div className="prose prose-sm max-w-none prose-invert">
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const code = String(children).replace(/\n$/, '');

                if (!inline && match) {
                  return (
                    <div id={codeId} className="relative group/code">
                      <button
                        onClick={() => handleCodeCopy(code)}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-[#7c3aed]/80 backdrop-blur-sm border border-[#a78bfa]/40 text-white hover:bg-[#7c3aed] transition-all opacity-0 group-hover/code:opacity-100 z-10 shadow-lg"
                        aria-label="Copy code"
                        title="Copy code"
                      >
                        {codeCopied ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-lg text-sm overflow-x-auto"
                        {...props}
                      >
                        {code}
                      </SyntaxHighlighter>
                    </div>
                  );
                }

                return (
                  <code className={`${className} bg-white/10 rounded px-1 py-0.5`} {...props}>
                    {children}
                  </code>
                );
              },
              p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }: any) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
              ol: ({ children }: any) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
              li: ({ children }: any) => <li className="mb-1">{children}</li>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {/* Bottom action row: copy + speak buttons */}
        {!isStreaming && (
          <div className="flex items-center justify-end gap-1 mt-2 pt-1 border-t border-white/5">
            {/* Speak button — AI messages only */}
            {!isUser && (
              <button
                onClick={handleSpeak}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
                aria-label={speaking ? 'Stop speaking' : 'Read aloud'}
                title={speaking ? 'Stop' : 'Read aloud'}
              >
                {speaking ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Copy button */}
            <button
              onClick={handleCopyMessage}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Copy message"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        )}

        {isStreaming && (
          <motion.span
            className="inline-block w-2 h-4 ml-1 bg-current"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </div>
    </motion.div>
  );
});
