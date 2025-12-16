import React from 'react';

interface AudioVisualizerProps {
  volume: number; // 0 to 1
  active: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ volume, active }) => {
  // We'll create a few bars that react to volume
  const bars = [1, 2, 3, 4, 5];
  
  return (
    <div className="flex items-center justify-center gap-1.5 h-16">
      {bars.map((i) => {
        // Create a varied height based on volume and index to make it look organic
        const heightMultiplier = active ? Math.max(0.2, volume * (1 + Math.sin(i))) : 0.1; 
        const height = Math.min(100, Math.max(10, heightMultiplier * 100)); // Percentage
        
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
