import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audio-utils';
import { ChatMessage, ConnectionState } from '../types';

const API_KEY = process.env.API_KEY || '';

export const useLiveAPI = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inProgressUserMessage, setInProgressUserMessage] = useState<string>('');
  const [currentVolume, setCurrentVolume] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Audio Contexts and Nodes
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // State for playback scheduling
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Transcription state
  const currentInputTransRef = useRef<string>('');
  const currentOutputTransRef = useRef<string>('');

  // Session management
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const disconnect = useCallback(async () => {
    // Stop all audio sources
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    sourcesRef.current.clear();

    // Close microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close AudioContexts
    if (inputAudioContextRef.current) {
      try { await inputAudioContextRef.current.close(); } catch(e) {}
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      try { await outputAudioContextRef.current.close(); } catch(e) {}
      outputAudioContextRef.current = null;
    }

    // Disconnect processors
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    
    // Close session if possible
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
             try { session.close(); } catch(e) { console.warn("Failed to close session", e); }
        }).catch(() => {}); // Ignore if session didn't connect
        sessionPromiseRef.current = null;
    }

    setConnectionState(ConnectionState.DISCONNECTED);
    setInProgressUserMessage('');
    setCurrentVolume(0);
  }, []);

  const connect = useCallback(async () => {
    if (!API_KEY) {
      setError("API Key not found.");
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      // 1. Setup Audio Input
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await inputAudioContext.resume(); // Ensure context is running
      inputAudioContextRef.current = inputAudioContext;

      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await outputAudioContext.resume(); // Ensure context is running
      outputAudioContextRef.current = outputAudioContext;
      
      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);
      outputNodeRef.current = outputNode;

      // 2. Initialize GenAI Client
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      // 3. Connect to Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{
              text: "You are a friendly and professional English language tutor. Your goal is to help the user practice English conversation. Engage them in interesting topics. If the user makes a grammatical mistake, gently correct them and explain why, then continue the conversation. Adjust your vocabulary to be suitable for an intermediate learner. Be encouraging and patient."
            }]
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          }
        },
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            
            // Setup Audio Processing for Mic
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              
              // Calculate volume for visualizer
              let sum = 0;
              for(let i=0; i<inputData.length; i++) {
                  sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setCurrentVolume(Math.min(1, rms * 5)); // Boost slightly for visibility

              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                try {
                  session.sendRealtimeInput({ media: pcmBlob });
                } catch(e) {
                   console.error("Error sending audio chunk", e);
                }
              }).catch(err => {
                   // Session might not be ready or failed
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
            
            inputSourceRef.current = source;
            processorRef.current = scriptProcessor;
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Audio Response
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const ctx = outputAudioContextRef.current;
              if (ctx) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                try {
                    const audioBuffer = await decodeAudioData(
                      decode(base64Audio),
                      ctx,
                      24000,
                      1
                    );
                    
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputNodeRef.current!);
                    
                    source.addEventListener('ended', () => {
                        sourcesRef.current.delete(source);
                    });
                    
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(source);
                } catch(err) {
                    console.error("Error decoding audio", err);
                }
              }
            }

            // 2. Handle Interruption
            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(source => {
                    try { source.stop(); } catch(e) {}
                });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }

            // 3. Handle Transcription
            // Accumulate text
            if (message.serverContent?.outputTranscription) {
               currentOutputTransRef.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.inputTranscription) {
               currentInputTransRef.current += message.serverContent.inputTranscription.text;
               setInProgressUserMessage(currentInputTransRef.current);
            }

            // Commit to message history on turn complete
            if (message.serverContent?.turnComplete) {
                const userText = currentInputTransRef.current.trim();
                const modelText = currentOutputTransRef.current.trim();

                if (userText) {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString() + '-user',
                        role: 'user',
                        text: userText,
                        timestamp: new Date()
                    }]);
                    currentInputTransRef.current = '';
                    setInProgressUserMessage('');
                }
                
                if (modelText) {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString() + '-model',
                        role: 'model',
                        text: modelText,
                        timestamp: new Date()
                    }]);
                    currentOutputTransRef.current = '';
                }
            }
          },
          onerror: (e) => {
            console.error("Session error:", e);
            // Only disconnect on fatal errors or detailed error check if available
            // For now, we assume errors are fatal for the session connectivity.
            setError(`Session error: ${e.message || "Connection lost"}`);
            disconnect();
          },
          onclose: (e) => {
            console.log("Session closed", e);
            // Check if it was a clean close or unexpected
            if (!e.wasClean) {
                setError("Connection closed unexpectedly.");
            }
            disconnect();
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect");
      setConnectionState(ConnectionState.ERROR);
    }
  }, [disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't call disconnect here immediately to avoid double-firing in StrictMode during mount
      // But we need to cleanup when truly unmounting.
      // For this simple app, it's fine.
      disconnect();
    };
  }, []);

  return {
    connect,
    disconnect,
    connectionState,
    messages,
    inProgressUserMessage,
    currentVolume,
    error
  };
};