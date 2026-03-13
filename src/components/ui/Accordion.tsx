import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  forceOpenKey?: string | number;
  children: ComponentChildren;
}

let accordionIdCounter = 0;

export default function Accordion({ title, defaultOpen = false, forceOpenKey, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(defaultOpen ? 'none' : '0px');
  const [id] = useState(() => `accordion-${++accordionIdCounter}`);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      setMaxHeight(`${contentRef.current.scrollHeight}px`);
      // After transition completes, switch to 'none' so dynamic content isn't clipped
      const timer = setTimeout(() => setMaxHeight('none'), 300);
      return () => clearTimeout(timer);
    } else {
      // To animate closing, first set an explicit height, then collapse
      if (contentRef.current) {
        setMaxHeight(`${contentRef.current.scrollHeight}px`);
        // Force reflow before setting to 0
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setMaxHeight('0px');
          });
        });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (forceOpenKey !== undefined) {
      setIsOpen(true);
    }
  }, [forceOpenKey]);

  const toggle = () => setIsOpen((prev) => !prev);

  return (
    <div class="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        onClick={toggle}
        class="flex w-full items-center justify-between px-4 py-3 text-left font-serif text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-400"
      >
        <span>{title}</span>
        <svg
          class={`h-4 w-4 text-gray-500 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width={2}
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        ref={contentRef}
        style={{ maxHeight, overflow: 'hidden', transition: 'max-height 0.3s ease' }}
      >
        <div class="px-4 py-3 text-sm text-gray-700 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
