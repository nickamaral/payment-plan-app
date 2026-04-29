"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  hint?: string;
};

export function FileDropzone({ label, accept, file, onFile, hint }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "cursor-pointer rounded-xl border-2 border-dashed p-6 text-center backdrop-blur-sm transition",
          dragging
            ? "border-orange-400 bg-orange-500/10"
            : file
            ? "border-emerald-500/50 bg-emerald-500/5 hover:border-orange-400/70"
            : "border-white/15 bg-white/5 hover:border-orange-400/70 hover:bg-white/10",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-neutral-200">
              {file.name}{" "}
              <span className="text-neutral-500">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFile(null);
              }}
              className="text-xs text-red-400 hover:underline"
            >
              remover
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-neutral-400">
              Clique ou arraste o arquivo aqui
            </p>
            {hint && <p className="text-xs text-neutral-600">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
