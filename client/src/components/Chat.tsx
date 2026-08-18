import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  partnerConnected: boolean;
}

export const Chat: React.FC<ChatProps> = ({
  messages,
  onSendMessage,
  partnerConnected,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="sidebar-chat-panel" aria-label="Room chat">
      <div className="sidebar-chat-header">
        <MessageSquare size={16} className="chat-header-icon" />
        <span className="chat-header-text">Party Chat</span>
      </div>

      <div className="sidebar-chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <MessageSquare size={24} className="empty-chat-icon" />
            <p>No messages yet.</p>
            <span>Say hi to your watch partner!</span>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.sender === 'system') {
              return (
                <div key={msg.id} className="message-system">
                  <span>{msg.text}</span>
                </div>
              );
            }

            const isLocal = msg.sender === 'local';
            return (
              <div
                key={msg.id}
                className={`message-row ${isLocal ? 'message-local' : 'message-remote'}`}
              >
                <div className="message-bubble">
                  <div className="message-header-info">
                    <span className="message-author">{isLocal ? 'You' : 'Partner'}</span>
                    <span className="message-timestamp">{formatTime(msg.timestamp)}</span>
                  </div>
                  <p className="message-body">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="sidebar-chat-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={partnerConnected ? 'Type a message (Enter)...' : 'Waiting for partner...'}
          className="sidebar-chat-input"
          id="chat-message-input"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="sidebar-chat-send-btn"
          title="Send message"
          id="chat-send-btn"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
};
