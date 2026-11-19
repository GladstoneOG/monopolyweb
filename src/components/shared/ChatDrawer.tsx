// src/components/shared/ChatDrawer.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../net/protocol';
import { BUNDLED_STICKERS } from '../../utils/stickers';

interface ChatDrawerProps {
  isOpen: boolean;
  messages: ChatMessage[];
  myPlayerId: string;
  onClose: () => void;
  onSendText: (text: string) => void;
  onSendSticker: (url: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  messages,
  myPlayerId,
  onClose,
  onSendText,
  onSendSticker,
}) => {
  const [input, setInput] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen]);

  if (!isOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setInput('');
  };

  return (
    <div className="chat-drawer-panel">
      <div className="chat-drawer-header">
        <span>💬 Table Chat &amp; Log</span>
        <button type="button" className="icon-close-btn small" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="chat-messages-list">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat-msg-item ${
              m.system ? 'system' : m.senderId === myPlayerId ? 'mine' : 'other'
            }`}
          >
            {!m.system && (
              <div className="chat-msg-meta">
                <strong>{m.senderName}</strong>
                <span>{m.timestamp}</span>
              </div>
            )}
            {m.type === 'sticker' && m.stickerUrl ? (
              <img src={m.stickerUrl} alt="Sticker" className="chat-sticker-img" loading="lazy" />
            ) : (
              <div className="chat-msg-text">{m.text}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showStickers && (
        <div className="chat-sticker-tray">
          {BUNDLED_STICKERS.map((st) => (
            <button
              key={st.id}
              type="button"
              className="chat-sticker-btn"
              title={st.label}
              onClick={() => {
                onSendSticker(st.url);
                setShowStickers(false);
              }}
            >
              <img src={st.url} alt={st.label} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <form className="chat-input-bar" onSubmit={submit}>
        <button
          type="button"
          className={`chat-sticker-toggle ${showStickers ? 'active' : ''}`}
          title="Stickers"
          onClick={() => setShowStickers((s) => !s)}
        >
          🎭
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something..."
          maxLength={300}
        />
        <button type="submit" className="btn-primary chat-send-btn">
          Send
        </button>
      </form>
    </div>
  );
};
