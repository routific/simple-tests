"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  className?: string;
  handleClassName?: string;
}

export function ResizablePanel({
  children,
  defaultWidth = 256,
  minWidth = 180,
  maxWidth = 480,
  storageKey,
  className,
  handleClassName,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load saved width from localStorage
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const savedWidth = parseInt(saved, 10);
        if (!isNaN(savedWidth) && savedWidth >= minWidth && savedWidth <= maxWidth) {
          setWidth(savedWidth);
        }
      }
    }
  }, [storageKey, minWidth, maxWidth]);

  // Save width to localStorage
  const saveWidth = useCallback(
    (newWidth: number) => {
      if (storageKey) {
        localStorage.setItem(storageKey, String(newWidth));
      }
    },
    [storageKey]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // Save the final width
        if (panelRef.current) {
          const finalWidth = panelRef.current.offsetWidth;
          saveWidth(finalWidth);
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, minWidth, maxWidth, saveWidth]
  );

  return (
    <div
      ref={panelRef}
      className={cn("relative flex-shrink-0", className)}
      style={{ width }}
    >
      {children}

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute top-0 right-0 w-1 h-full cursor-col-resize group",
          "hover:bg-brand-500/20 active:bg-brand-500/30",
          "transition-colors duration-150",
          isResizing && "bg-brand-500/30",
          handleClassName
        )}
      >
        {/* Visual indicator on hover */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-0 w-1 h-8 rounded-full",
            "bg-transparent group-hover:bg-brand-500/50 transition-colors",
            isResizing && "bg-brand-500/50"
          )}
        />
      </div>

      {/* Overlay to prevent iframe/selection issues while dragging */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}
