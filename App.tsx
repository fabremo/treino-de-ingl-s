import React, { useRef, useEffect } from 'react';
import { useLiveAPI } from './hooks/use-live-api';
import AudioVisualizer from './components/AudioVisualizer';
import ChatMessage from './components/ChatMessage';
import { ConnectionState } from './types';

function App() {
  const { connect, disconnect, connectionState, messages, inProgressUserMessage, currentVolume, error } = useLiveAPI();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, inProgressUserMessage]);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  const handleToggleConnection = () => {
    if (isConnected || isConnecting) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-4xl mx-auto shadow-2xl overflow-hidden relative">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">FluentAI</h1>
            <p className="text-xs text-slate-500 font-medium">English Conversation Tutor</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span className="text-sm font-medium text-slate-600">
                {isConnected ? 'Live' : connectionState === ConnectionState.CONNECTING ? 'Connecting...' : 'Offline'}
            </span>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {messages.length === 0 && !isConnected ? (
           <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
             <div className="bg-slate-100 p-6 rounded-full mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
             </div>
             <h2 className="text-2xl font-bold text-slate-700 mb-2">Ready to practice?</h2>
             <p className="max-w-md mx-auto mb-8">
               Start a conversation to practice your English skills. I'll listen, respond, and gently help you improve.
             </p>
           </div>
        ) : (
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide scroll-smooth"
            >
              {/* Introduction Message (Fake) if connected and no messages */}
              {isConnected && messages.length === 0 && (
                  <div className="text-center text-sm text-slate-400 my-4 italic animate-pulse">
                      Listening... Speak now to start the conversation.
                  </div>
              )}
              
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              
              {/* Real-time User Transcription */}
              {inProgressUserMessage && (
                <ChatMessage 
                  message={{
                    id: 'pending-user',
                    role: 'user',
                    text: inProgressUserMessage,
                    timestamp: new Date(),
                    isFinal: false
                  }} 
                />
              )}
              
              {/* Spacer for bottom controls */}
              <div className="h-24"></div>
            </div>
        )}
        
        {/* Error Notification */}
        {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm shadow-md animate-bounce">
                {error}
            </div>
        )}
      </main>

      {/* Bottom Controls */}
      <div className="bg-white/90 backdrop-blur-md border-t border-slate-200 p-6 absolute bottom-0 left-0 right-0 z-20">
        <div className="flex flex-col items-center justify-center gap-4">
          
          {/* Visualizer */}
          <div className="h-16 w-full flex items-center justify-center">
             {isConnected ? (
                 <AudioVisualizer volume={currentVolume} active={isConnected} />
             ) : (
                 <div className="h-1 bg-slate-200 w-32 rounded-full"></div>
             )}
          </div>

          {/* Main Action Button */}
          <button
            onClick={handleToggleConnection}
            disabled={isConnecting}
            className={`
              relative group flex items-center justify-center gap-3 px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5
              ${isConnected 
                ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }
              ${isConnecting ? 'opacity-70 cursor-wait' : ''}
            `}
          >
            {isConnected ? (
              <>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>End Session</span>
              </>
            ) : (
              <>
                 {isConnecting ? (
                     <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                 ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                 )}
                <span>{isConnecting ? 'Connecting...' : 'Start Conversation'}</span>
              </>
            )}
          </button>
          
          <p className="text-xs text-slate-400">
             Powered by Gemini 2.5 Live API
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;