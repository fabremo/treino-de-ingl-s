/**
 * Definição da estrutura de uma mensagem de chat no histórico.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'model'; // 'user' para o estudante, 'model' para o tutor IA
  text: string;
  timestamp: Date;
  isFinal?: boolean; // Indica se a transcrição da fala foi concluída
}

/**
 * Configurações opcionais para a sessão Live.
 */
export interface LiveConfig {
  voiceName?: string;
}

/**
 * Estados possíveis da conexão com a API Gemini.
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED', // Desconectado ou estado inicial
  CONNECTING = 'CONNECTING',     // Tentando estabelecer conexão e abrir microfone
  CONNECTED = 'CONNECTED',       // Conectado e trocando dados em tempo real
  ERROR = 'ERROR',               // Ocorreu uma falha crítica
}