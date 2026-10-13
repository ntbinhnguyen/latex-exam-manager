"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  widthClass?: string;
}

export const Modal: React.FC<ModalProps> = ({ title, onClose, children, footer, headerExtra, widthClass = "max-w-3xl" }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-lg bg-white shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between gap-3 bg-[#4A0E17] px-4 py-2.5 text-white">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold">{title}</div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-2.5">{footer}</div>}
      </div>
    </div>
  );
};
