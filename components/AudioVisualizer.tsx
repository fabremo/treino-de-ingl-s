import React from 'react';

interface AudioVisualizerProps {
  volume: number; // Valor de 0 a 1 vindo do processamento de áudio
  active: boolean; // Se a conexão está ativa
}

/**
 * Componente visual que exibe barras animadas reagindo ao volume da voz.
 */
const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, active }) => {
  // Criamos 5 barras verticais
  const bars = [1, 2, 3, 4, 5];
  
  return (
    <div className="flex items-center justify-center gap-1.5 h-16">
      {bars.map((i) => {
        /**
         * Lógica de altura orgânica:
         * Combina o volume real com uma função seno baseada no índice da barra 
         * para criar um movimento mais fluido e menos mecânico.
         */
        const heightMultiplier = active ? Math.max(0.2, volume * (1 + Math.sin(i))) : 0.1; 
        const height = Math.min(100, Math.max(10, heightMultiplier * 100)); 
        
        return (
          <div
            key={i}
            className={`w-3 rounded-full transition-all duration-75 ease-in-out ${
              active ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-300'
            }`}
            style={{
              height: `${height}%`,
            }}
          />
        );
      })}
    </div>
  );
};

export default AudioVisualizer;