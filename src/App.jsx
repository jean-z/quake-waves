import { useEffect, useRef, useState } from 'react'
import EarthSection from './components/EarthSection.jsx'
import { rayFan, FAMOUS_QUAKES, fetchRecentQuakes, PREM } from './seismo/prem.js'

export default function App() {
  const sectionRef = useRef(null);
  const [quake, setQuake] = useState(FAMOUS_QUAKES[0]);
  const [recent, setRecent] = useState([]);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0);
  const [rayKind, setRayKind] = useState('p');   // p | s | both

  /* USGS 最近地震 */
  useEffect(() => { fetchRecentQuakes().then(setRecent) }, []);

  /* 选震即重算射线族并回零 */
  useEffect(() => {
    const kinds = rayKind === 'both' ? ['p', 's'] : [rayKind];
    const rays = kinds.flatMap((k) => rayFan(k, quake.depth, [8, 18, 28, 38, 48, 58, 68, 78]));
    sectionRef.current?.setRays(rays, quake.depth);
    setT(0);
  }, [quake, rayKind]);

  /* 播放循环：走时最长约 20 分钟，动画压到 24 秒 */
  useEffect(() => {
    if (!playing) return;
    const MAX_T = 1200;   // 秒（真实走时）
    const id = setInterval(() => {
      setT((v) => (v + 8 > MAX_T ? 0 : v + 8));
    }, 140);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => { sectionRef.current?.setProgress(t) }, [t]);

  return (
    <div id="app">
      <header>
        <h1>🌋 震波之旅</h1>
        <p className="sub">PREM 真实分层模型 · P/S 波射线追踪 · 阴影带</p>
      </header>

      <div id="layout">
        <div id="canvas-area">
          <EarthSection ref={sectionRef} />
          <div id="legend">
            <span style={{ color: 'rgb(255,140,110)' }}>━ P 波（纵波，先到）</span>
            <span style={{ color: 'rgb(130,190,255)' }}>╌ S 波（横波，外核消失）</span>
            <span style={{ color: '#ffd27a' }}>◎ 内核</span>
          </div>
          <div id="controls">
            <button className="ctl" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
            <span className="t-readout">{(t / 60).toFixed(1)} 分钟（真实走时）</span>
            <div className="sep" />
            {['p', 's', 'both'].map((k) => (
              <button key={k} className={`ctl ${rayKind === k ? 'on' : ''}`} onClick={() => setRayKind(k)}>
                {{ p: 'P 波', s: 'S 波', both: '双波' }[k]}
              </button>
            ))}
          </div>
        </div>

        <aside id="panel">
          <h2>选择地震</h2>
          <div className="quake-group">
            <div className="k">历史大地震</div>
            {FAMOUS_QUAKES.map((q) => (
              <button key={q.id} className={`quake-row ${quake.id === q.id ? 'focus' : ''}`} onClick={() => setQuake(q)}>
                <span className="q-name">{q.zh}</span>
                <span className="q-note">{q.note}</span>
              </button>
            ))}
          </div>
          {recent.length > 0 && (
            <div className="quake-group">
              <div className="k">最近显著地震（USGS 实时）</div>
              {recent.map((q) => (
                <button key={q.id} className={`quake-row ${quake.id === q.id ? 'focus' : ''}`} onClick={() => setQuake(q)}>
                  <span className="q-name">{q.zh}</span>
                  <span className="q-note">深 {q.depth} km · {q.note}</span>
                </button>
              ))}
            </div>
          )}
          <div id="prem-table">
            <div className="k">地球分层（PREM）</div>
            {[...new Set(PREM.map((L) => L.name))].map((n) => (
              <div className="layer-row" key={n}>
                <span className="dot" style={{ background: layerColorSafe(n) }} />
                {n}
              </div>
            ))}
          </div>
          <p className="footnote">
            看：S 波在外核（液态）完全消失；P 波在 103°–143° 阴影带无法直达地表——
            这是 1906 年旧金山大地震后科学家推断地核为液体的关键证据。
          </p>
        </aside>
      </div>
    </div>
  );
}

function layerColorSafe(n) {
  const M = { '内核': '#8a5a3a', '外核': '#6a3a2a', '下地幔': '#3a2c48', '过渡带': '#33415c', '上地幔（橄榄石）': '#2a3a55', '地壳': '#2c4a3c' };
  return M[n] ?? '#4a3050';
}
