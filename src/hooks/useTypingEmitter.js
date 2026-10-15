import { useCallback, useEffect, useRef } from 'react';

const IDLE_MS = 2500;

/**
 * Emits typing:start once when the user starts typing and typing:stop after a
 * pause, on send, or when leaving the conversation.
 */
export function useTypingEmitter(conversationId, setTyping) {
  const typingRef = useRef(false);
  const timerRef = useRef(null);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    if (typingRef.current) {
      typingRef.current = false;
      setTyping(conversationId, false);
    }
  }, [conversationId, setTyping]);

  const onInput = useCallback(
    (text) => {
      if (!text.trim()) return stop();
      if (!typingRef.current) {
        typingRef.current = true;
        setTyping(conversationId, true);
      }
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(stop, IDLE_MS);
    },
    [conversationId, setTyping, stop],
  );

  useEffect(() => stop, [stop]);

  return { onInput, stop };
}
