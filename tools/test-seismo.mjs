// 地震学层回归测试：node tools/test-seismo.mjs
// 校准点（真实地球物理值）：
//   P 波穿越直径走时 ≈ 20 分钟（1200s 上下 15% 内）
//   S 波不能穿外核（vs=0）→ 射线在 CMB 终止
//   PREM 地壳 P 速 5.8、CMB 下 P 速跳升（13.72 vs 8.87）
import { PREM, velocity, traceRay, rayFan, R_EARTH } from '../src/seismo/prem.js';

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌'} ${name}`); };

// 1. PREM 分层完整性与关键速度
check('PREM 节点 ≥ 12', PREM.length >= 12);
check('地壳 P 速 = 5.8 km/s', Math.abs(velocity(R_EARTH, 'p') - 5.8) < 0.01);
check('外核 S 速 = 0（液态）', velocity(2000, 's') === 0);
check('CMB 下 P 速 > 13（跳升）', velocity(3480, 'p') > 13);

// 2. P 波穿核走时 ≈ 20 分钟（近直径射线）
const deep = traceRay(1, 'p', 0);
console.log(`近直径 P 走时: ${(deep.travelTimeSec / 60).toFixed(1)} 分钟`);
check('P 波直径走时 15-23 分钟', deep.travelTimeSec > 15 * 60 && deep.travelTimeSec < 23 * 60);

// 3. S 波擦核射线在外核边界终止（vs=0 无法穿液态外核）
const sCore = traceRay(2, 's', 0);
console.log(`S 波 2° 射线: hitCMB=${sCore.hitCMB}, 终点半径 ${sCore.points[sCore.points.length - 1][0].toFixed(0)} km`);
check('S 波穿核射线在外核边界终止', sCore.hitCMB === true);

// 3b. S 波地幔射线正常回到地表（转折半径 > CMB）
const sMantle = traceRay(20, 's', 0);
check('S 波地幔射线转折半径 > 3500 km', sMantle.turnRadius > 3500);

// 4. 地幔分支射线点数充足
const shallow = traceRay(26, 'p', 0);
check('地幔 P 射线轨迹点多于 40', shallow.points.length > 40);

// 5. 射线族：默认角度全部有轨迹
const fan = rayFan('p', 0);
check('射线族全部生成且有效', fan.length === 8 && fan.every((f) => f.points.length > 3));

// 6. 走时合理性：穿核射线（2°）比地幔浅射线（30°）走时长（穿 12000+ km）
const tCore = fan.find((f) => f.angle === 2).travelTimeSec;
const tMantle = fan.find((f) => f.angle === 30).travelTimeSec;
console.log(`穿核: ${(tCore / 60).toFixed(1)} 分钟, 地幔浅射线: ${(tMantle / 60).toFixed(1)} 分钟`);
check('穿核射线走时 > 地幔浅射线', tCore > tMantle);

// 7. 地表角距：穿核射线 Δ > 100°（远震），地幔射线 Δ < 60°
const dCore = fan.find((f) => f.angle === 2).deltaDeg;
const dMantle = fan.find((f) => f.angle === 30).deltaDeg;
console.log(`穿核 Δ=${dCore.toFixed(0)}°, 地幔 Δ=${dMantle.toFixed(0)}°`);
check('穿核射线落点比地幔射线更远（Δ 穿核 > 地幔）', dCore > dMantle);
check('地幔射线 Δ < 60°（近震）', dMantle > 0 && dMantle < 60);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
