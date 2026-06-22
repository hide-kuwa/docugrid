"use client";

import React, { useRef, useEffect } from 'react';
import { AxisItem, AxisDirection } from '@/types/matrix';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface DrumRollProps {
  items: AxisItem[];
  direction: AxisDirection;
  selectedId: string;
  onSelect: (id: string) => void;
}

export const DrumRoll: React.FC<DrumRollProps> = ({ 
  items, 
  direction, 
  selectedId, 
  onSelect 
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isVertical = direction === 'vertical';

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let timeoutId: NodeJS.Timeout;

    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const center = isVertical
          ? scroller.scrollTop + scroller.clientHeight / 2
          : scroller.scrollLeft + scroller.clientWidth / 2;

        let closestId: string | null = null;
        let minDiff = Infinity;
        const itemElements = Array.from(scroller.children) as HTMLElement[];
        
        itemElements.forEach((el) => {
          if (el.dataset.type === 'spacer') return;
          const itemCenter = isVertical
            ? el.offsetTop + el.clientHeight / 2
            : el.offsetLeft + el.clientWidth / 2;
          const diff = Math.abs(center - itemCenter);
          
          if (diff < minDiff) {
            minDiff = diff;
            const itemId = el.dataset.id;
            if (itemId) closestId = itemId;
          }
        });

        if (closestId && closestId !== selectedId) {
          onSelect(closestId);
        }
      }, 50);
    };

    scroller.addEventListener('scroll', handleScroll);
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [items, isVertical, selectedId, onSelect]);

  const scrollToItem = (index: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const itemNodes = Array.from(scroller.children).filter(el => (el as HTMLElement).dataset.type !== 'spacer');
    const targetEl = itemNodes[index] as HTMLElement;

    if (targetEl) {
      const top = isVertical ? targetEl.offsetTop - (scroller.clientHeight / 2) + (targetEl.clientHeight / 2) : 0;
      const left = !isVertical ? targetEl.offsetLeft - (scroller.clientWidth / 2) + (targetEl.clientWidth / 2) : 0;
      scroller.scrollTo({ top, left, behavior: 'smooth' });
    }
  };

  return (
    <div 
      ref={scrollerRef}
      className={cn(
        "relative scroll-smooth hide-scrollbar flex z-10",
        isVertical 
          ? "flex-col h-full w-full overflow-y-auto snap-y snap-mandatory py-[40vh]" 
          : "flex-row w-full h-full overflow-x-auto snap-x snap-mandatory px-[50vw] items-center"
      )}
    >
      {items.map((item, index) => {
        const isActive = item.id === selectedId;
        return (
          <div
            key={item.id}
            data-id={item.id}
            onClick={() => scrollToItem(index)}
            className={cn(
              "flex-shrink-0 cursor-pointer transition-all duration-300 snap-center flex flex-col items-center justify-center select-none",
              isVertical ? "w-full py-6" : "h-full w-48",
              isActive 
                ? "opacity-100 scale-110 text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]" 
                : "opacity-40 scale-90 text-slate-400 hover:opacity-60"
            )}
          >
            <div className={cn("font-black tracking-tighter leading-none", isVertical ? "text-3xl" : "text-sm")}>
              {item.label}
            </div>
            {item.subLabel && <div className="text-[10px] font-bold opacity-70 mt-1 tracking-widest uppercase">{item.subLabel}</div>}
          </div>
        );
      })}
    </div>
  );
};