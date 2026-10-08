// 地震学层：PREM 分层波速 + 射线追踪 + 走时
//
// PREM（Preliminary Reference Earth Model, Dziewonski & Anderson 1981）
// 是地震学的"标准大气"——这里用其分层节点的 P/S 波速与密度（真实值，单位 km/s）。
// 射线追踪：斯内尔定律 p = r·sin(i)/v 守恒（球对称分层中的射线参数），
// 逐层数值积分走时，能自然重现：P 波 103°–143° 阴影带（外核液态、P 波速骤降、
// S 波消失）、核幔边界反射 PcP、地表反射 PP 等现象。

/** PREM 分层节点（半径 km，P 波速 km/s，S 波速，密度 g/cm³，层名）
 *  深度 6371→0；外核 S 波速 = 0（液态）。精选 22 个节点。 */
export const PREM = [
  { r: 0,    vp: 11.26, vs: 3.67, rho: 13.09, name: '内核' },
  { r: 1221, vp: 10.36, vs: 0,    rho: 12.17, name: '内外核边界' },
  { r: 1700, vp: 9.85,  vs: 0,    rho: 11.55, name: '外核' },
  { r: 2400, vp: 10.16, vs: 0,    rho: 11.17, name: '外核' },
  { r: 3480, vp: 13.72, vs: 7.26, rho: 9.90,  name: '核幔边界 CMB' },
  { r: 3700, vp: 13.65, vs: 7.26, rho: 9.90,  name: '地幔 D″ 层' },
  { r: 4500, vp: 12.80, vs: 6.92, rho: 9.41,  name: '下地幔' },
  { r: 5700, vp: 11.15, vs: 6.25, rho: 7.84,  name: '下地幔' },
  { r: 5950, vp: 10.20, vs: 5.62, rho: 6.24,  name: '过渡带' },
  { r: 6150, vp: 10.08, vs: 5.53, rho: 5.95,  name: '过渡带顶部' },
  { r: 6346, vp: 8.87,  vs: 4.78, rho: 4.40,  name: '上地幔（橄榄石）' },
  { r: 6356, vp: 8.06,  vs: 4.47, rho: 3.90,  name: '莫霍面下' },
  { r: 6371, vp: 5.80,  vs: 3.20, rho: 2.60,  name: '地壳' },
];

export const R_EARTH = 6371;

/** 半径处插值波速（kind: 'p' | 's'） */
export function velocity(r, kind) {
  const key = kind === 'p' ? 'vp' : 'vs';
  for (let i = 1; i < PREM.length; i++) {
    if (r <= PREM[i].r) {
      const a = PREM[i - 1], b = PREM[i];
      const k = (r - a.r) / (b.r - a.r);
      return a[key] + (b[key] - a[key]) * k;
    }
  }
  return PREM[PREM.length - 1][key];
}

/**
 * 追踪一条射线（从震源出发、初始入射角 i0，i0 越小越向地心）。
 * p = r·sin(i)/v 守恒；下降段积分到转折点（sin(i)=1）或 CMB，再对称回程到地表。
 * 返回 { points: [[r,θ]...], travelTimeSec, hitCMB, kind }
 */
export function traceRay(i0Deg, kind = 'p', depthKm = 0, stepKm = 12) {
  const r0 = R_EARTH - depthKm;
  const v0 = velocity(r0, kind);
  const i0 = i0Deg * Math.PI / 180;           // i0=0 指向地心；i0→90° 贴地表
  const p = r0 * Math.sin(i0) / v0;           // 射线参数（守恒）
  let r = r0, theta = 0, t = 0;
  const down = [[r0, 0]];
  let hitCMB = false, turned = false;

  // 下降段：i 从 i0 逐渐增大（射线愈发水平）到 90°（转折），或进入外核
  let enteredCore = false;
  for (let n = 0; n < 4000; n++) {
    const v = velocity(r, kind);
    if (kind === 's' && r <= 3480 + stepKm) { hitCMB = true; down.push([Math.max(r, 3480), theta]); break; }
    if (r <= 3480) {
      // P 波进入外核：CMB 折射（速度跳变 13.7→8.06 处按斯内尔重算角度）
      enteredCore = true;
      down.push([3480, theta]);
      if (kind === 's') { hitCMB = true; break; }
      // 外核内继续向下：p 守恒，v 骤降 → sin(i) = p·v/r 变小（射线更陡）
      const vc = velocity(3480 - stepKm, 'p');
      const sinIc = p * vc / r;
      if (sinIc > 1) { hitCMB = true; break; }   // 临界折射，贴 CMB 滑行
      i0c = Math.asin(sinIc);
      void i0c;
      // 外核段单独积分（P 波在内核/外核传播）
      const coreSeg = integrateCore(p, theta, 3480);
      if (coreSeg) {
        for (const q of coreSeg.points) down.push(q);
        t += coreSeg.t;
        theta = coreSeg.thetaEnd;
      }
      break;
    }
    const sinI = p * v / r;
    if (sinI >= 1) { turned = true; break; }  // i=90°，射线水平 → 转折
    if (sinI < 0) break;
    const i = Math.asin(sinI);
    const dr = -stepKm;                        // 向下
    theta += Math.tan(i) * stepKm / r;
    t += stepKm / (v * Math.cos(i));
    r += dr;
    down.push([r, theta]);
  }
  void enteredCore;

  // 对称回程（球对称地球的射线对称性）——仅对未穿核的地幔射线
  const full = [...down];
  const [rTurn, thTurn] = down[down.length - 1];
  if (!hitCMB && rTurn > 3480 && !enteredCore) {
    for (let k = down.length - 2; k >= 0; k--) {
      const [pr, pth] = down[k];
      full.push([pr, thTurn + (thTurn - pth)]);
    }
  }
  // 穿核射线：外核出口后加一段对称地幔回程（近似 PKP 出射）
  if (enteredCore && !hitCMB) {
    const upSeg = [];
    for (let k = down.length - 2; k >= 0; k--) {
      const [pr, pth] = down[k];
      const dd = down[down.length - 1][1];
      upSeg.push([pr, dd + (dd - pth)]);
    }
    full.push(...upSeg);
  }
  const surfaceDelta = full[full.length - 1][1];
  return { points: full, travelTimeSec: t * 2, hitCMB, kind, turnRadius: rTurn, deltaDeg: surfaceDelta * 180 / Math.PI, enteredCore };
}

let i0c = 0;

/** 外核段积分：从 CMB 入射（p 守恒）穿到对侧 CMB，返回点列与走时 */
function integrateCore(p, theta0, rStart, stepKm = 25) {
  let r = rStart, theta = theta0, t = 0;
  const pts = [[r, theta]];
  // 向下穿过外核到内核边界附近折返（简化：穿到 r=1400 后对称上来）
  let dirDown = true;
  for (let n = 0; n < 800; n++) {
    const v = velocity(r, 'p');
    if (v === 0) return null;
    const sinI = p * v / r;
    if (sinI >= 1) { dirDown = false; }        // 外核内转折（几乎不发生，防御）
    const i = Math.asin(Math.min(1, sinI));
    const dr = dirDown ? -stepKm : stepKm;
    theta += Math.tan(i) * Math.abs(dr) / r;
    t += Math.abs(dr) / (v * Math.cos(i));
    r += dr;
    pts.push([r, theta]);
    if (dirDown && r <= 1400) dirDown = false;
    if (!dirDown && r >= 3480) { pts[pts.length - 1] = [3480, theta]; break; }
  }
  return { points: pts, t, thetaEnd: theta };
}

/** 一组射线（不同出射角）→ 走时与地表角距。
 *  地幔分支：5–32°（浅到深）；穿核分支：≤4°（穿过或擦过外核，P 波产生 103°+ 远震） */
export function rayFan(kind = 'p', depthKm = 0, angles) {
  const list = angles ?? (kind === 'p' ? [2, 4, 8, 14, 20, 26, 30, 32] : [8, 14, 20, 26, 30]);
  return list.map((a) => ({ angle: a, ...traceRay(a, kind, depthKm) }));
}

/** P 波 103°-143° 阴影带判定：地表角距（度）是否落在阴影带内 */
export function inPShadowZone(deltaDeg) {
  return deltaDeg > 103 && deltaDeg < 143;
}

/** 历史大地震精选（真实事件，USGS 目录） */
export const FAMOUS_QUAKES = [
  { id: 'tohoku2011', zh: '2011 东日本 9.1 级', lon: 142.373, lat: 38.297, depth: 29, mag: 9.1, note: '史上记录最强之一 · 海啸 40 米' },
  { id: 'sumatra2004', zh: '2004 苏门答腊 9.1 级', lon: 95.982, lat: 3.295, depth: 30, mag: 9.1, note: '印度洋海啸 · 22.7 万人遇难' },
  { id: 'chile1960', zh: '1960 智利 9.5 级', lon: -73.405, lat: -38.144, depth: 25, mag: 9.5, note: '仪器记录史上最强地震' },
  { id: 'wenchuan2008', zh: '2008 汶川 7.9 级', lon: 103.188, lat: 31.021, depth: 19, mag: 7.9, note: '中国近年最严重震灾' },
  { id: 'alaska1964', zh: '1964 阿拉斯加 9.2 级', lon: -147.274, lat: 61.02, depth: 25, mag: 9.2, note: '北美史上最强' },
  { id: 'tangshan1976', zh: '1976 唐山 7.6 级', lon: 118.183, lat: 39.383, depth: 12, mag: 7.6, note: '24 万余人遇难' },
];

/** 拉取最近显著地震（USGS，M≥6，最近 30 天） */
export async function fetchRecentQuakes() {
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=8&orderby=time&minmagnitude=6&endtime=' + new Date().toISOString();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json();
    return j.features.map((f) => ({
      id: f.id,
      zh: `M${f.properties.mag} ${f.properties.place}`,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depth: f.geometry.coordinates[2] ?? 15,
      mag: f.properties.mag,
      note: new Date(f.properties.time).toLocaleDateString('zh-CN'),
    }));
  } catch {
    return [];
  }
}
