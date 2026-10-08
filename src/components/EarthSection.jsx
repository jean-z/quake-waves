import { useEffect, useImperativeHandle, useRef } from 'react'
import { PREM, R_EARTH } from '../seismo/prem.js'

/**
 * 地球剖面渲染器（2D Canvas）：
 * 左半剖面团（分层着色）+ 射线族（P 红 / S 蓝）+ 波前动画（扩散圆弧）
 * 坐标：震源在正下方（θ=0 底部），射线向两侧对称展开。
 */
export default function EarthSection({ ref }) {
  const canvasRef = useRef(null);
  const st = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    st.current = { ctx, c, rays: [], wavefront: 0, playing: false, speed: 1 };
    const ro = new ResizeObserver(() => resize());
    ro.observe(c.parentElement);
    resize();

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = c.parentElement.clientWidth, h = c.parentElement.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.current.w = w; st.current.h = h;
      draw();
    }

    st.current.resize = resize;
    return () => ro.disconnect();
  }, []);

  /* 地理坐标（r, θ）→ 画布（震中在底部中央，向上扩散） */
  function toXY(r, theta) {
    const s = st.current;
    const R = Math.min(s.w, s.h) * 0.46;
    const cx = s.w / 2, cy = s.h / 2 + R * 0.04;
    const a = theta + Math.PI / 2;   // θ=0 → 底部（震中）
    return [cx + (R_EARTH - r) * 0 + r / R_EARTH * R * Math.cos(a), cy + r / R_EARTH * R * Math.sin(a)];
  }

  function draw() {
    const s = st.current;
    if (!s || !s.w) return;
    const { ctx, w, h } = s;
    const R = Math.min(w, h) * 0.46;
    const cx = w / 2, cy = h / 2 + R * 0.04;

    ctx.clearRect(0, 0, w, h);

    // 分层圆（由内到外）
    for (let i = PREM.length - 1; i >= 0; i--) {
      const L = PREM[i];
      const rr = L.r / R_EARTH * R;
      ctx.beginPath();
      ctx.arc(cx, cy, rr || 2, 0, Math.PI * 2);
      ctx.fillStyle = layerColor(L.name);
      ctx.fill();
    }
    // 内核高亮边
    ctx.beginPath(); ctx.arc(cx, cy, PREM[1].r / R_EARTH * R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,210,122,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    // 核幔边界加粗
    ctx.beginPath(); ctx.arc(cx, cy, 3480 / R_EARTH * R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,235,255,.45)'; ctx.lineWidth = 1.6; ctx.stroke();

    // 射线族（θ 坐标系：射线从底部震源出发）
    for (const ray of s.rays) {
      const col = ray.kind === 'p' ? '255,120,90' : '120,180,255';
      ctx.strokeStyle = `rgba(${col},.75)`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let pen = false;
      const maxT = Math.max(...ray.points.map((_, i) => i)) || 1;
      const progress = Math.min(1, s.wavefront / (ray.travelTimeSec || 1));
      const upto = Math.floor(progress * ray.points.length);
      for (let i = 0; i <= upto && i < ray.points.length; i++) {
        const [pr, pth] = ray.points[i];
        // 左右对称各画一条
        for (const side of [1, -1]) {
          const a = Math.PI / 2 + pth * side;   // 底部出发
          const x = cx + pr / R_EARTH * R * Math.cos(a);
          const y = cy + pr / R_EARTH * R * Math.sin(a);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          pen = true;
        }
        if (!pen) break;
      }
      ctx.stroke();
      void maxT;
    }

    // 震中标记（底部）
    const [ex, ey] = [cx, cy + R * (1 - (s.quakeDepth ?? 20) / R_EARTH)];
    ctx.beginPath(); ctx.arc(cx, ey, 3.5, 0, 7);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, ey, 8, 0, 7);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
  }

  useImperativeHandle(ref, () => ({
    setRays(rays, quakeDepth) {
      st.current.rays = rays;
      st.current.quakeDepth = quakeDepth;
      st.current.wavefront = 0;
      draw();
    },
    setProgress(sec) {
      st.current.wavefront = sec;
      draw();
    },
  }));

  return <div id="section-wrap"><canvas ref={canvasRef} /></div>;
}

const LAYER_COLORS = {
  '内核': '#8a5a3a', '内外核边界': '#8a5a3a', '外核': '#6a3a2a',
  '核幔边界 CMB': '#4a3048', '地幔 D″ 层': '#4a3048', '下地幔': '#3a2c48',
  '过渡带': '#33415c', '过渡带顶部': '#33415c', '上地幔（橄榄石）': '#2a3a55',
  '莫霍面下': '#24344e', '地壳': '#2c4a3c',
};
function layerColor(name) { return LAYER_COLORS[name] ?? '#223'; }
