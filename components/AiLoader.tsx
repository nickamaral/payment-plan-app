"use client";

import * as React from "react";

interface AiLoaderProps {
  size?: number;
  text?: string;
}

export const AiLoader: React.FC<AiLoaderProps> = ({
  size = 180,
  text = "Processando",
}) => {
  const letters = text.split("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e0e14]/80 backdrop-blur-sm">
      <div
        className="relative flex items-center justify-center select-none"
        style={{ width: size, height: size }}
      >
        {letters.map((letter, index) => (
          <span
            key={index}
            className="inline-block text-white opacity-40 animate-loaderLetter"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {letter}
          </span>
        ))}
        <div className="absolute inset-0 rounded-full animate-loaderCircle" />
      </div>
    </div>
  );
};
