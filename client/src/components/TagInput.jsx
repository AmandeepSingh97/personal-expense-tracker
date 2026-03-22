/**
 * TagInput — inline tag chip editor.
 *
 * Shows existing tags as colored chips. Click × to remove.
 * Click the + or press Enter in the input to add.
 * Autocompletes from all existing tags.
 *
 * Usage:
 *   <TagInput txId={42} existingTags={[...]} allTags={[...]} onChange={() => reload()} />
 */

import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { addTagToTx, removeTagFromTx } from '../api';
import toast from 'react-hot-toast';

// Pre-suggested tags for quick tagging (shown when input is empty)
const QUICK_SUGGESTIONS = [
  { name: 'Preet',       color: '#e879f9' },
  { name: 'Aman',        color: '#3b82f6' },
  { name: 'Medical',     color: '#ef4444' },
  { name: 'Work',        color: '#6366f1' },
  { name: 'Trip',        color: '#10b981' },
  { name: 'Anniversary', color: '#ec4899' },
];

export default function TagInput({ txId, existingTags = [], allTags = [], onChange }) {
  const [open, setOpen]     = useState(false);
  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const suggestions = input.trim()
    ? allTags.filter(t =>
        t.name.toLowerCase().includes(input.toLowerCase()) &&
        !existingTags.find(e => e.id === t.id)
      )
    : QUICK_SUGGESTIONS.filter(s => !existingTags.find(e => e.name.toLowerCase() === s.name.toLowerCase()));

  const addTag = async (nameOrTag) => {
    const name = typeof nameOrTag === 'string' ? nameOrTag : nameOrTag.name;
    const color = typeof nameOrTag === 'object' ? nameOrTag.color : undefined;
    if (!name.trim()) return;
    if (existingTags.find(t => t.name.toLowerCase() === name.toLowerCase())) return;
    setLoading(true);
    try {
      await addTagToTx(txId, { name: name.trim(), color });
      setInput('');
      onChange?.();
    } catch { toast.error('Failed to add tag'); }
    finally { setLoading(false); }
  };

  const removeTag = async (tag) => {
    try {
      await removeTagFromTx(txId, tag.id);
      onChange?.();
    } catch { toast.error('Failed to remove tag'); }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && input.trim()) { e.preventDefault(); addTag(input.trim()); }
    if (e.key === 'Escape') { setOpen(false); setInput(''); }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Existing tags */}
      {existingTags.map(tag => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}50` }}
        >
          {tag.name}
          <button onClick={() => removeTag(tag)} className="hover:opacity-70 leading-none">
            <X size={10} />
          </button>
        </span>
      ))}

      {/* Add button / input */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          <Plus size={10} /> tag
        </button>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => { if (!input.trim()) setOpen(false); }}
            placeholder="type tag…"
            disabled={loading}
            className="text-xs border border-blue-400 rounded-full px-2 py-0.5 w-24 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none"
          />
          {/* Dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
              {suggestions.slice(0, 6).map(s => (
                <button
                  key={s.name}
                  onMouseDown={e => { e.preventDefault(); addTag(s); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#6366f1' }} />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{s.name}</span>
                </button>
              ))}
              {input.trim() && !allTags.find(t => t.name.toLowerCase() === input.toLowerCase()) && (
                <button
                  onMouseDown={e => { e.preventDefault(); addTag(input.trim()); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-t border-gray-100 dark:border-gray-700"
                >
                  <Plus size={10} className="text-blue-500" />
                  <span className="text-xs text-blue-500">Create "{input.trim()}"</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
