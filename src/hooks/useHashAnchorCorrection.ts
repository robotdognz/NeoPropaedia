import { useEffect } from 'preact/hooks';

export function useHashAnchorCorrection(anchorId: string): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== `#${anchorId}`) return;

    const target = document.getElementById(anchorId);
    if (!target) return;

    const scrollToTarget = () => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    };

    let frame1 = 0;
    let frame2 = 0;
    const timeout1 = window.setTimeout(scrollToTarget, 120);
    const timeout2 = window.setTimeout(scrollToTarget, 320);

    frame1 = window.requestAnimationFrame(() => {
      scrollToTarget();
      frame2 = window.requestAnimationFrame(scrollToTarget);
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
      window.clearTimeout(timeout1);
      window.clearTimeout(timeout2);
    };
  }, [anchorId]);
}
