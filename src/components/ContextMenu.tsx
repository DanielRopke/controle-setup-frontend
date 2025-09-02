import React, { useEffect, useRef } from 'react';

type MenuItem = { id: string; label: string; onClick: () => void };

interface ContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ open, position, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (!ref.current) return;
      if (ev.target && !ref.current.contains(ev.target as Node)) {
        onClose();
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 9999,
    minWidth: 180,
  };

  return (
    <div ref={ref} style={style} className="rounded-lg shadow-lg bg-white border border-gray-200 overflow-hidden">
      <div className="flex flex-col py-1">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => {
              try {
                it.onClick();
              } catch (e) {
                console.error('ContextMenu item error', e);
              }
            }}
            className="text-left px-4 py-2 text-sm hover:bg-gray-100 focus:outline-none"
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
