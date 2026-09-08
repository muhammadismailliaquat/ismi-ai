'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, Trash2, Edit2, Clapperboard } from 'lucide-react';
import { ChatConversation } from '@/types/chat';
import { useState } from 'react';

interface SidebarProps {
  conversations: ChatConversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onShowVideos?: () => void;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onShowVideos,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const finishEdit = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="w-80 max-w-[85vw] md:max-w-none h-full border-r border-blue-200/15 bg-blue-500/5 flex flex-col">
      {/* Header */}
      <div className="p-3 md:p-4 max-[360px]:p-2 border-b border-blue-200/20">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 md:px-4 md:py-3 max-[360px]:gap-1 max-[360px]:px-2 max-[360px]:py-2 rounded-xl bg-[#7c3aed]/55 backdrop-blur-[2px] border border-[#a78bfa]/40 hover:bg-[#7c3aed]/70 text-white font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all"
        >
          <Plus className="w-5 h-5 max-[360px]:w-4 max-[360px]:h-4" />
          New Chat
        </motion.button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 md:p-3">
        <AnimatePresence>
          {conversations.map((conversation) => (
            <motion.div
              key={conversation.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`group relative mb-2 max-[360px]:mb-1 rounded-xl p-2 md:p-3 cursor-pointer transition-all border ${
                currentConversationId === conversation.id
                  ? 'bg-blue-400/15 border-blue-200/25 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
                  : 'border-transparent hover:bg-blue-500/10 hover:border-blue-200/15'
              }`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 mt-0.5 flex-shrink-0 max-[360px]:w-4 max-[360px]:h-4 text-[#a78bfa]" />
                <div className="flex-1 min-w-0">
                  {editingId === conversation.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => finishEdit(conversation.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishEdit(conversation.id);
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditTitle('');
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-white/10 rounded px-2 py-1 text-sm outline-none text-gray-100"
                      autoFocus
                    />
                  ) : (
                    <h3 className={`font-medium text-sm truncate ${currentConversationId === conversation.id ? 'text-white' : 'text-[#e2e8f0]'}`}>
                      {conversation.title}
                    </h3>
                  )}
                  <p className="text-xs text-[#94a3b8] mt-1">
                    {conversation.messages.length} messages
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(conversation.id, conversation.title);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/20"
                  aria-label="Rename"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#94a3b8]" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conversation.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-900/40 text-red-400"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {conversations.length === 0 && (
          <div className="text-center text-[#94a3b8] text-sm mt-8">
            No conversations yet.<br />Start a new chat!
          </div>
        )}
      </div>

      {/* Videos button pinned to the bottom of the sidebar */}
      <div className="p-3 border-t border-blue-200/20">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onShowVideos}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#7c3aed]/55 backdrop-blur-[2px] border border-[#a78bfa]/40 hover:bg-[#7c3aed]/70 text-white font-semibold transition-all"
        >
          <Clapperboard className="w-5 h-5" />
          Have Fun with Edits
        </motion.button>
      </div>
    </div>
  );
}
