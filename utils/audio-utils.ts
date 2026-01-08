import { Blob } from '@google/genai';

/**
 * Converte dados de áudio Float32 (do microfone do navegador) para PCM 16-bit.
 * A API Gemini Live exige o formato PCM Linear de 16 bits para entrada de áudio.
 */
export function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Normaliza os valores para garantir que fiquem entre -1 e 1
    const s = Math.max(-1, Math.min(1, data[i]));
    // Converte para escala de 16 bits (Signed Int16)
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    // Codifica os bytes em Base64, pois a API recebe strings codificadas via WebSocket
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000', // Taxa de amostragem padrão de 16kHz para entrada
  };
}

/**
 * Converte um Uint8Array para uma string Base64.
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converte uma string Base64 de volta para Uint8Array.
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodifica dados PCM brutos em um AudioBuffer do Web Audio API.
 * Essencial para permitir a reprodução do áudio retornado pela IA.
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Converte de volta de Int16 para Float32 para o AudioContext
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}