import React from 'react';
import { ChatMessage as ChatMessageType } from '../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in-up`}>
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm text-sm md:text-base leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-none'
            : 'bg-white border border-slate-100 text-slate-700 rounded-bl-none'
        }`}
      >
        <div className="font-semibold text-xs opacity-70 mb-1 mb-1 block">
            {isUser ? 'You' : 'Tutor'}
        </div>
        {message.text}
      </div>
    </div>
  );
};

export default ChatMessage;
