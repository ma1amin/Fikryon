import { useEffect, useRef } from "react";
import type { Theme } from "@/hooks/use-preferences";

type Node = { x: number; y: number; vx: number; vy: number; r: number; gold: boolean; p: number };

/** Slow connected-node constellation. Never code rain. */
export function NetworkBackground({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let nodes: Node[] = [];
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, Math.max(34, (w * h) / 17000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.5 + 0.6, gold: Math.random() < 0.42, p: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      const dark = themeRef.current === "dark";
      ctx.clearRect(0, 0, w, h);
      const gold = dark ? "201,162,39" : "176,140,30";
      const green = dark ? "62,170,150" : "7,94,84";
      const lineA = dark ? 0.16 : 0.085;
      const dotA = dark ? 0.75 : 0.32;
      const maxD = Math.min(150, w / 7);

      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx; n.y += n.vy;
          const dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
          if (d < 140 && d > 0) { n.x += (dx / d) * 0.35; n.y += (dy / d) * 0.35; }
          if (n.x < -20) n.x = w + 20; if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20; if (n.y > h + 20) n.y = -20;
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < maxD) {
            const c = a.gold && b.gold ? gold : green;
            ctx.strokeStyle = `rgba(${c},${(1 - d / maxD) * lineA})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const pulse = reduce ? 1 : 0.65 + 0.35 * Math.sin(t / 1400 + n.p);
        const c = n.gold ? gold : green;
        if (dark && n.gold) {
          ctx.fillStyle = `rgba(${c},${0.08 * pulse})`;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = `rgba(${c},${dotA * pulse})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Redraw once on theme change when motion is reduced
  useEffect(() => { window.dispatchEvent(new Event("resize")); }, [theme]);

  return <canvas ref={ref} aria-hidden="true" className="fk-canvas" />;
}
