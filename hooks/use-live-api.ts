import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audio-utils';
import { ChatMessage, ConnectionState } from '../types';

const API_KEY = process.env.API_KEY || '';

/**
 * Hook customizado para gerenciar a conexão com a Gemini Live API.
 * Lida com entrada/saída de áudio, transcrições e estado da conexão.
 */
export const useLiveAPI = () => {
  // Estados de interface
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inProgressUserMessage, setInProgressUserMessage] = useState<string>('');
  const [currentVolume, setCurrentVolume] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Referências para processamento de áudio (não disparam re-renderizações)
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // Controle de agendamento de reprodução de áudio (gapless playback)
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Acumuladores de texto para transcrição (mensagens podem chegar em partes)
  const currentInputTransRef = useRef<string>('');
  const currentOutputTransRef = useRef<string>('');

  // Gerenciamento da sessão WebSocket
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Finaliza a sessão e libera todos os recursos de hardware (microfone e áudio).
   */
  const disconnect = useCallback(async () => {
    // Para todos os buffers de áudio em reprodução
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) { /* ignore */ }
    });
    sourcesRef.current.clear();

    // Fecha o acesso ao microfone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Fecha os contextos de áudio do navegador
    if (inputAudioContextRef.current) {
      try { await inputAudioContextRef.current.close(); } catch(e) {}
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      try { await outputAudioContextRef.current.close(); } catch(e) {}
      outputAudioContextRef.current = null;
    }

    // Desconecta os nós de processamento
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    
    // Fecha a conexão com a API Gemini
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
             try { session.close(); } catch(e) { console.warn("Failed to close session", e); }
        }).catch(() => {});
        sessionPromiseRef.current = null;
    }

    setConnectionState(ConnectionState.DISCONNECTED);
    setInProgressUserMessage('');
    setCurrentVolume(0);
  }, []);

  /**
   * Inicia a conexão: abre microfone, cria contextos de áudio e conecta ao WebSocket da Gemini.
   */
  const connect = useCallback(async () => {
    if (!API_KEY) {
      setError("API Key not found.");
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      // 1. Configuração da Entrada de Áudio (Microfone)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await inputAudioContext.resume();
      inputAudioContextRef.current = inputAudioContext;

      // 2. Configuração da Saída de Áudio (Resposta da IA)
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await outputAudioContext.resume();
      outputAudioContextRef.current = outputAudioContext;
      
      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);
      outputNodeRef.current = outputNode;

      // 3. Inicialização do Cliente GenAI
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      // 4. Conexão com a Live API via WebSockets
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: [Modality.AUDIO], // Resposta em áudio
          inputAudioTranscription: {},           // Habilita transcrição da fala do usuário
          outputAudioTranscription: {},          // Habilita transcrição da fala da IA
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
            
            // Loop de Processamento: Captura o áudio do mic e envia para a IA em pedaços (chunks)
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              
              // Cálculo simples de volume para o componente visualizador
              let sum = 0;
              for(let i=0; i<inputData.length; i++) {
                  sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setCurrentVolume(Math.min(1, rms * 5)); 

              // Envia os dados de áudio codificados para a IA
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                try {
                  session.sendRealtimeInput({ media: pcmBlob });
                } catch(e) {
                   console.error("Error sending audio chunk", e);
                }
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
            
            inputSourceRef.current = source;
            processorRef.current = scriptProcessor;
          },
          onmessage: async (message: LiveServerMessage) => {
            // A. Processamento do Áudio de Resposta
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const ctx = outputAudioContextRef.current;
              if (ctx) {
                // Agenda o próximo pedaço de áudio para tocar exatamente após o anterior
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

            // B. Tratamento de Interrupção (Barge-in)
            // Se o usuário começar a falar enquanto a IA fala, para a reprodução atual
            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(source => {
                    try { source.stop(); } catch(e) {}
                });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }

            // C. Processamento das Transcrições de Texto
            if (message.serverContent?.outputTranscription) {
               currentOutputTransRef.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.inputTranscription) {
               currentInputTransRef.current += message.serverContent.inputTranscription.text;
               // Atualiza o feedback visual da transcrição em progresso do usuário
               setInProgressUserMessage(currentInputTransRef.current);
            }

            // Quando a IA ou o usuário termina uma frase, adicionamos ao histórico oficial
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
            setError(`Session error: ${e.message || "Connection lost"}`);
            disconnect();
          },
          onclose: (e) => {
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

  // Limpeza automática se o componente for destruído
  useEffect(() => {
    return () => {
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