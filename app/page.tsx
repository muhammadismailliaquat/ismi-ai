'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { MessageSquare, Zap, Phone, Globe } from 'lucide-react';
import { ParticleBackground } from '@/components/ParticleBackground';

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* Animated particle swarm galaxy behind the homepage */}
      <ParticleBackground />
      {/* Subtle scrim so the text stays readable over the bright particles */}
      <div className="fixed inset-0 z-[1] pointer-events-none bg-black/25" aria-hidden="true" />

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center max-w-4xl"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8 inline-flex items-center gap-3"
        >
          <h1 className="text-6xl max-[360px]:text-4xl max-[300px]:text-3xl font-bold text-white drop-shadow">ismi.ai</h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-2xl max-[360px]:text-xl max-[300px]:text-lg text-[#e2e8f0] mb-12 max-w-2xl mx-auto max-[360px]:mb-8"
        >
          Your intelligent AI assistant for conversations, research, and creative thinking
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 items-center justify-center mb-16"
        >
          <Link href="/chat">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-lg px-8 py-4 rounded-xl bg-[#7c3aed]/55 backdrop-blur-[2px] border border-[#a78bfa]/40 text-white font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:bg-[#7c3aed]/70 transition-all max-[360px]:text-base max-[360px]:px-5 max-[360px]:py-3 max-[300px]:px-4 max-[300px]:py-2.5"
            >
              <MessageSquare className="w-5 h-5" />
              Start Chatting
            </motion.button>
          </Link>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-[360px]:gap-4 max-w-4xl mx-auto"
        >
          {[
            {
              icon: <Zap className="w-8 h-8 text-[#a78bfa]" />,
              title: 'Lightning Fast',
              description: 'Get instant responses powered by Ismi.ai',
            },
            {
              icon: <Phone className="w-8 h-8 text-[#a78bfa]" />,
              title: 'Voice Mode',
              description: 'Natural voice conversations with real-time interaction',
            },
            {
              icon: <Globe className="w-8 h-8 text-[#5eead4]" />,
              title: 'Smart & Knowledgeable',
              description: 'Research, creative writing, and problem-solving made easy',
            },
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + i * 0.1 }}
              className="rounded-2xl p-6 text-left border border-blue-200/20 bg-blue-500/10 backdrop-blur-[2px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:bg-blue-500/15 transition-all"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
              <p className="text-[#cbd5e1] text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="mt-16 text-center text-[#6b7280] dark:text-[#94a3b8] text-sm"
      >
      </motion.footer>
      </main>
    </>
  );
}
