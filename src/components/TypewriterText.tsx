import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  text: string;
  className?: string;
  delay?: number;
  speed?: number;
  onComplete?: () => void;
  showCursor?: boolean;
}

export function TypewriterText({
  text,
  className,
  delay = 0,
  speed = 50,
  onComplete,
  showCursor = true,
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showCursorState, setShowCursorState] = useState(true);

  const startTyping = useCallback(() => {
    setIsTyping(true);
    let currentIndex = 0;

    const typeNextChar = () => {
      if (currentIndex < text.length) {
        setDisplayText(text.slice(0, currentIndex + 1));
        currentIndex++;
        setTimeout(typeNextChar, speed + Math.random() * 30);
      } else {
        setIsTyping(false);
        onComplete?.();
      }
    };

    typeNextChar();
  }, [text, speed, onComplete]);

  useEffect(() => {
    const timer = setTimeout(startTyping, delay);
    return () => clearTimeout(timer);
  }, [startTyping, delay]);

  // Cursor blink effect
  useEffect(() => {
    if (!showCursor) return;

    const interval = setInterval(() => {
      setShowCursorState((prev) => !prev);
    }, 530);

    return () => clearInterval(interval);
  }, [showCursor]);

  return (
    <span className={cn('inline', className)}>
      {displayText}
      {showCursor && (
        <span
          className={cn(
            'inline-block w-0.5 h-5 ml-0.5 bg-primary transition-opacity duration-100',
            showCursorState ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}

// Hook for multiple typewriter texts
export function useTypewriterSequence(texts: string[], speed = 50) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const handleComplete = () => {
    if (currentIndex < texts.length - 1) {
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
      }, 1000);
    } else {
      setIsComplete(true);
    }
  };

  return {
    currentText: texts[currentIndex],
    currentIndex,
    isComplete,
    handleComplete,
  };
}
