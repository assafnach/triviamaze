import { useEffect, useRef } from 'react';
import { UI } from '@/content/he/ui';
import { game } from '@/game/core/GameController';
import { isOpen } from '@/game/maze/grid';
import { useStore } from '@/state/store';

interface View {
  cx: number;
  cy: number;
  scale: number;
  w: number;
  h: number;
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, full: boolean, time: number): void {
  const data = game.mapData();
  ctx.clearRect(0, 0, w, h);
  if (!data) return;
  const { maze, revealed, visited, player } = data;
  // Fit: whole maze when open, a window around the player otherwise.
  const view: View = full
    ? { cx: maze.width / 2, cy: maze.height / 2, scale: Math.min(w / (maze.width + 1.5), h / (maze.height + 1.5)), w, h }
    : { cx: player.x, cy: player.z, scale: w / 9, w, h };
  const toX = (x: number): number => (x - view.cx) * view.scale + w / 2;
  const toY = (y: number): number => (y - view.cy) * view.scale + h / 2;
  const s = view.scale;

  // Parchment glow background.
  const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  bg.addColorStop(0, 'rgba(46, 36, 22, 0.92)');
  bg.addColorStop(1, 'rgba(14, 11, 8, 0.92)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Revealed floor.
  for (const c of revealed) {
    const x = c % maze.width;
    const y = Math.floor(c / maze.width);
    const px = toX(x);
    const py = toY(y);
    if (px > w + s || py > h + s || px < -2 * s || py < -2 * s) continue;
    ctx.fillStyle = visited.has(c) ? 'rgba(232, 204, 140, 0.32)' : 'rgba(232, 204, 140, 0.16)';
    ctx.fillRect(px, py, s + 0.5, s + 0.5);
  }
  // Walls of revealed cells.
  ctx.strokeStyle = 'rgba(236, 200, 120, 0.9)';
  ctx.lineWidth = Math.max(1.5, s * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const c of revealed) {
    const x = c % maze.width;
    const y = Math.floor(c / maze.width);
    const px = toX(x);
    const py = toY(y);
    if (px > w + s || py > h + s || px < -2 * s || py < -2 * s) continue;
    if (!isOpen(maze, c, 0)) {
      ctx.moveTo(px, py);
      ctx.lineTo(px + s, py);
    }
    if (!isOpen(maze, c, 2)) {
      ctx.moveTo(px, py + s);
      ctx.lineTo(px + s, py + s);
    }
    if (!isOpen(maze, c, 3)) {
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + s);
    }
    if (!isOpen(maze, c, 1)) {
      ctx.moveTo(px + s, py);
      ctx.lineTo(px + s, py + s);
    }
  }
  ctx.stroke();

  const center = (c: number): [number, number] => [toX((c % maze.width) + 0.5), toY(Math.floor(c / maze.width) + 0.5)];
  const r = Math.max(4, s * 0.28);

  // Checkpoint.
  {
    const [x, y] = center(data.checkpoint);
    ctx.fillStyle = 'rgba(140, 220, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
  }
  // Creatures (only once seen).
  ctx.font = `bold ${Math.round(r * 1.5)}px Heebo, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of data.encounters) {
    if (!revealed.has(e.cell)) continue;
    const [x, y] = center(e.cell);
    ctx.fillStyle = e.correct === true ? 'rgba(110, 211, 154, 0.95)' : e.correct === false ? 'rgba(224, 97, 79, 0.95)' : 'rgba(255, 210, 122, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1208';
    ctx.fillText(e.correct === true ? '✓' : e.correct === false ? '✗' : '?', x, y + 1);
  }
  for (const sp of data.specials) {
    if (!revealed.has(sp.cell) || sp.used) continue;
    const [x, y] = center(sp.cell);
    ctx.fillStyle = 'rgba(200, 150, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Exit.
  if (data.exitKnown) {
    const [x, y] = center(maze.exit);
    const pulse = 1 + Math.sin(time * 4) * 0.15;
    ctx.fillStyle = 'rgba(255, 230, 160, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe6a0';
    ctx.fillRect(x - r * 0.7, y - r, r * 1.4, r * 2);
    ctx.fillStyle = '#5a3a10';
    ctx.fillRect(x - r * 0.25, y - r * 0.2, r * 0.5, r * 1.2);
  }
  // Player arrow.
  {
    const px = toX(player.x);
    const py = toY(player.z);
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const ang = Math.atan2(fz, fx);
    const a = Math.max(6, s * 0.38);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.shadowColor = 'rgba(255, 240, 200, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath();
    ctx.moveTo(a, 0);
    ctx.lineTo(-a * 0.7, a * 0.6);
    ctx.lineTo(-a * 0.35, 0);
    ctx.lineTo(-a * 0.7, -a * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function Minimap(): React.JSX.Element | null {
  const open = useStore((s) => s.mapOpen);
  const show = useStore((s) => s.settings.showMinimap);
  const isTouch = useStore((s) => s.isTouch);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const c = ref.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext('2d');
      if (ctx) draw(ctx, w, h, open, now / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  if (!open && !show) return null;
  return (
    <div className={open ? 'map-full' : `map-mini ${isTouch ? 'map-mini-touch' : ''}`} onClick={open ? () => game.toggleMap() : undefined}>
      <canvas ref={ref} className="map-canvas" role="img" aria-label={UI.hud.map} />
      {open ? (
        <div className="map-legend" aria-hidden="true">
          <span>{UI.hud.map}</span>
          <span className="legend-hint">M</span>
        </div>
      ) : null}
    </div>
  );
}
