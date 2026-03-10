'use client'

import React, { useEffect, useRef } from 'react';
import { createNoise2D } from 'simplex-noise';

export interface WavesProps {
  className?: string;
  strokeColor?: string;
  backgroundColor?: string;
  pointerSize?: number;
}

interface Point {
  x: number;
  y: number;
  wave: { x: number; y: number };
  cursor: { x: number; y: number; vx: number; vy: number };
}

interface MouseState {
  x: number;
  y: number;
  lx: number;
  ly: number;
  sx: number;
  sy: number;
  v: number;
  vs: number;
  a: number;
  set: boolean;
}

export default function WaveBackground({
  className = '',
  strokeColor = '#a78b71',
  backgroundColor = 'transparent',
  pointerSize = 0.5,
}: WavesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const mouseRef = useRef<MouseState>({
    x: 0, y: 0,
    lx: 0, ly: 0,
    sx: 0, sy: 0,
    v: 0, vs: 0,
    a: 0, set: false
  });

  const linesRef = useRef<Point[][]>([]);
  const pathsRef = useRef<SVGPathElement[]>([]);
  const noise2DRef = useRef(createNoise2D());

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    let width = 0;
    let height = 0;
    let bounding: DOMRect;

    const xGap = 14;
    const yGap = 14;

    const setSize = () => {
      bounding = container.getBoundingClientRect();
      width = bounding.width;
      height = bounding.height;
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
    };

    const setLines = () => {
      linesRef.current = [];
      pathsRef.current.forEach(path => {
        if (svg.contains(path)) svg.removeChild(path);
      });
      pathsRef.current = [];

      const oWidth = width + 200;
      const oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / xGap);
      const totalPoints = Math.ceil(oHeight / yGap);
      const xStart = (width - xGap * totalLines) / 2;
      const yStart = (height - yGap * totalPoints) / 2;

      for (let i = 0; i <= totalLines; i++) {
        const points: Point[] = [];
        for (let j = 0; j <= totalPoints; j++) {
          points.push({
            x: xStart + i * xGap,
            y: yStart + j * yGap,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 }
          });
        }
        linesRef.current.push(points);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '1');
        svg.appendChild(path);
        pathsRef.current.push(path);
      }
    };

    const movePoints = (time: number) => {
      const mouse = mouseRef.current;
      const noise2D = noise2DRef.current;

      for (let i = 0; i < linesRef.current.length; i++) {
        const points = linesRef.current[i];
        for (let j = 0; j < points.length; j++) {
          const p = points[j];
          
          const move = noise2D((p.x + time * 0.008) * 0.003, (p.y + time * 0.003) * 0.002) * 8;
          p.wave.x = Math.cos(move) * 12;
          p.wave.y = Math.sin(move) * 6;

          const l = Math.max(175, mouse.vs);
          const dx = p.x - mouse.sx;
          
          if (Math.abs(dx) <= l) {
            const dy = p.y - mouse.sy;
            if (Math.abs(dy) <= l) {
              const d = Math.hypot(dx, dy);

              if (d < l) {
                const s = 1 - d / l;
                const f = Math.cos(d * 0.001) * s;
                p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00035;
                p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00035;
              }
            }
          }

          p.cursor.vx += (0 - p.cursor.x) * 0.01;
          p.cursor.vy += (0 - p.cursor.y) * 0.01;

          p.cursor.vx *= 0.95;
          p.cursor.vy *= 0.95;

          p.cursor.x += p.cursor.vx;
          p.cursor.y += p.cursor.vy;

          p.cursor.x = Math.min(50, Math.max(-50, p.cursor.x));
          p.cursor.y = Math.min(50, Math.max(-50, p.cursor.y));
        }
      }
    };

    const moved = (p: Point, isLineTo = true) => {
      const x = p.x + p.wave.x + p.cursor.x;
      const y = p.y + p.wave.y + p.cursor.y;
      return isLineTo ? `L ${x} ${y}` : `M ${x} ${y}`;
    };

    const drawLines = () => {
      for (let i = 0; i < linesRef.current.length; i++) {
        const points = linesRef.current[i];
        let d = '';
        for (let j = 0; j < points.length; j++) {
          d += moved(points[j], j !== 0) + ' ';
        }
        if (pathsRef.current[i]) {
          pathsRef.current[i].setAttribute('d', d);
        }
      }
    };

    let animationFrameId: number;
    const tick = (time: number) => {
      const mouse = mouseRef.current;

      mouse.sx += (mouse.x - mouse.sx) * 0.18;
      mouse.sy += (mouse.y - mouse.sy) * 0.18;

      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      const d = Math.sqrt(dx * dx + dy * dy);

      mouse.v = Math.min(100, Math.max(0, d));
      mouse.vs += (mouse.v - mouse.vs) * 0.1;

      mouse.a = Math.atan2(dy, dx);

      mouse.lx = mouse.x;
      mouse.ly = mouse.y;

      container.style.setProperty('--x', `${mouse.sx}px`);
      container.style.setProperty('--y', `${mouse.sy}px`);

      movePoints(time);
      drawLines();

      animationFrameId = requestAnimationFrame(tick);
    };

    const onResize = () => {
      setSize();
      setLines();
    };

    const onMouseMove = (e: MouseEvent) => {
      const mouse = mouseRef.current;
      mouse.x = e.pageX - (bounding.left + window.scrollX);
      mouse.y = e.pageY - (bounding.top + window.scrollY);
      if (!mouse.set) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.set = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const mouse = mouseRef.current;
      mouse.x = e.touches[0].pageX - (bounding.left + window.scrollX);
      mouse.y = e.touches[0].pageY - (bounding.top + window.scrollY);
      if (!mouse.set) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.set = true;
      }
    };

    setSize();
    setLines();
    animationFrameId = requestAnimationFrame(tick);

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);
    container.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('touchmove', onTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [strokeColor]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden w-full h-full ${className}`}
      style={{ backgroundColor }}
    >
      <svg
        ref={svgRef}
        style={{ display: 'block', opacity: 0.4, willChange: 'transform' }}
      />
      <div
        className="pointer-events-none absolute left-0 top-0 rounded-full"
        style={{
          width: `${pointerSize}rem`,
          height: `${pointerSize}rem`,
          backgroundColor: strokeColor,
          transform: 'translate(calc(var(--x) - 50%), calc(var(--y) - 50%))',
        }}
      />
    </div>
  );
}
