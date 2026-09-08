'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clapperboard, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

interface VideoGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VideoGallery({ isOpen, onClose }: VideoGalleryProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const handlePrev = useCallback(() => {
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(false);
    setCurrentIndex((prev) => (prev === 0 ? videos.length - 1 : prev - 1));
  }, [videos.length]);

  const handleNext = useCallback(() => {
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(false);
    setCurrentIndex((prev) => (prev === videos.length - 1 ? 0 : prev + 1));
  }, [videos.length]);

  const handleClose = useCallback(() => {
    if (videoRef.current) videoRef.current.pause();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setCurrentIndex(0);
    setIsPlaying(false);
    fetch('/api/videos')
      .then((res) => res.json())
      .then((data) => setVideos(data?.videos || []))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 2500);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    };
  }, [isOpen, handlePrev, handleNext, handleClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 max-[360px]:p-0 max-[300px]:p-0 overflow-y-auto overflow-x-hidden"
      onMouseMove={handleMouseMove}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Floating sparkles background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[#a78bfa]"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
              y: [0, -30],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
          />
        ))}
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-6 max-[360px]:top-4 max-[300px]:top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
        >
          <Clapperboard className="w-7 h-7 text-[#a78bfa]" />
        </motion.div>
        <h2 className="text-2xl max-[360px]:text-xl max-[300px]:text-lg font-bold text-white">
          Video{' '}
          <span className="bg-gradient-to-r from-[#a78bfa] via-[#c084fc] to-[#7c3aed] bg-clip-text text-transparent">
            Edits
          </span>
        </h2>
      </motion.div>

      {/* Close button */}
      <motion.button
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: showControls ? 1 : 0.3, scale: 1 }}
        transition={{ duration: 0.3 }}
        onClick={handleClose}
        className="absolute top-4 right-4 z-20 p-2 max-[360px]:p-1.5 max-[300px]:p-1 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 hover:scale-110 transition-all"
        aria-label="Close"
      >
        <X className="w-5 h-5 max-[360px]:w-4 max-[360px]:h-4 max-[300px]:w-3.5 max-[300px]:h-3.5 text-white" />
      </motion.button>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 border-4 border-[#7c3aed]/30 border-t-[#a78bfa] rounded-full"
          />
          <p className="text-white/60 text-lg">Loading videos...</p>
        </div>
      )}

      {/* No videos */}
      {!loading && videos.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-white/60"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Clapperboard className="w-20 h-20 mx-auto mb-6 text-[#a78bfa]/50" />
          </motion.div>
          <p className="text-xl mb-3 font-semibold text-white/80">No videos yet!</p>
          <p className="text-sm text-white/40 mb-4">
            Drop your video edits into
          </p>
          <code className="px-4 py-2 rounded-lg bg-[#7c3aed]/20 border border-[#a78bfa]/30 text-[#a78bfa] text-sm">
            public/videos/
          </code>
        </motion.div>
      )}

      {/* Slider — desktop arrows + mobile control bar */}
      {!loading && videos.length > 0 && (
        <div className="relative w-full h-full flex items-center justify-center px-0 pt-24 pb-20 md:pt-28 md:pb-24">
          {/* Desktop prev arrow — hidden on mobile */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: showControls ? 1 : 0.2, x: 0 }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={handlePrev}
            className="hidden absolute left-4 z-10 p-4 rounded-full bg-[#7c3aed]/30 backdrop-blur-md border border-[#a78bfa]/40 hover:bg-[#7c3aed]/50 transition-all group"
            aria-label="Previous"
          >
            <motion.div
              whileHover={{ x: -3 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <SkipBack className="w-10 h-10 text-white" />
            </motion.div>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-white/40 opacity-0 group-hover:opacity-100 transition-opacity">
              Prev
            </span>
          </motion.button>

          {/* Video container */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.8, rotateX: 15 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotateX: -15 }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 200, damping: 20 }}
              className="relative w-full max-w-[1090px]"
            >
              <video
                ref={videoRef}
                src={videos[currentIndex]}
                controls={false}
                autoPlay
                className="relative w-full max-h-[60vh] sm:max-h-[75vh] max-[360px]:max-h-[55vh] max-[300px]:max-h-[50vh] rounded-xl object-contain bg-black shadow-2xl"
                onEnded={() => {
                  if (videos.length > 1) {
                    handleNext();
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </motion.div>
          </AnimatePresence>

          {/* Desktop next arrow — hidden on mobile */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: showControls ? 1 : 0.2, x: 0 }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleNext}
            className="hidden absolute right-4 z-10 p-4 rounded-full bg-[#7c3aed]/30 backdrop-blur-md border border-[#a78bfa]/40 hover:bg-[#7c3aed]/50 transition-all group"
            aria-label="Next"
          >
            <motion.div
              whileHover={{ x: 3 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <SkipForward className="w-10 h-10 text-white" />
            </motion.div>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-white/40 opacity-0 group-hover:opacity-100 transition-opacity">
              Next
            </span>
          </motion.button>
        </div>
      )}

      {/* Mobile bottom control bar — visible only below md */}
      {!loading && videos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-6 py-4 px-6"
        >
          <button
            onClick={handlePrev}
            className="p-3 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
            aria-label="Previous"
          >
            <SkipBack className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={togglePlay}
            className="p-4 rounded-full bg-[#7c3aed]/60 border border-[#a78bfa]/50 hover:bg-[#7c3aed]/80 transition-all"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white" />
            ) : (
              <Play className="w-6 h-6 text-white ml-0.5" />
            )}
          </button>

          <button
            onClick={handleNext}
            className="p-3 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
            aria-label="Next"
          >
            <SkipForward className="w-5 h-5 text-white" />
          </button>
        </motion.div>
      )}

      {/* Desktop counter + dots — hidden on mobile */}
      {!loading && videos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden absolute bottom-6 flex-col items-center gap-4"
        >
          <div className="flex gap-2">
            {videos.map((_, i) => (
              <motion.button
                key={i}
                onClick={() => {
                  if (videoRef.current) videoRef.current.pause();
                  setCurrentIndex(i);
                  setIsPlaying(false);
                }}
                className="rounded-full transition-all"
                whileHover={{ scale: 1.3 }}
                whileTap={{ scale: 0.9 }}
              >
                <motion.div
                  className={`rounded-full transition-all ${
                    i === currentIndex
                      ? 'w-8 h-3 bg-gradient-to-r from-[#a78bfa] to-[#7c3aed]'
                      : 'w-3 h-3 bg-white/30 hover:bg-white/50'
                  }`}
                  layoutId={i === currentIndex ? 'activeDot' : undefined}
                />
              </motion.button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <span className="font-mono bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
              {currentIndex + 1}
            </span>
            <span>/</span>
            <span className="font-mono bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
              {videos.length}
            </span>
          </div>
        </motion.div>
      )}

      {/* Keyboard hints — desktop only */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showControls && videos.length > 0 ? 0.6 : 0 }}
        className="hidden md:flex absolute bottom-6 right-6 gap-3 text-white/40 text-xs"
      >
        <span className="px-2 py-1 rounded bg-white/5 border border-white/10">
          ← →
        </span>
        <span className="px-2 py-1 rounded bg-white/5 border border-white/10">
          ESC
        </span>
      </motion.div>
    </motion.div>
  );
}
