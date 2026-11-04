"use client";

import { COLOR_TAGS, EMOJIS } from "@/lib/colors";

export function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {Object.entries(COLOR_TAGS).map(([tag, hex]) => (
        <button
          key={tag}
          type="button"
          role="radio"
          aria-checked={value === tag}
          aria-label={tag}
          onClick={() => onChange(tag)}
          style={{ backgroundColor: hex }}
          className={`h-7 w-7 rounded-full transition-all ${value === tag ? "ring-2 ring-white ring-offset-2 ring-offset-secondary scale-110" : "opacity-70 hover:opacity-100"}`}
        />
      ))}
    </div>
  );
}

export function EmojiPicker({ value, onChange, options = EMOJIS }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
      {options.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="radio"
          aria-checked={value === emoji}
          onClick={() => onChange(emoji)}
          className={`h-9 w-9 rounded-md text-lg flex items-center justify-center transition-all ${value === emoji ? "bg-primary/20 ring-1 ring-primary" : "bg-white/5 hover:bg-white/10"}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
