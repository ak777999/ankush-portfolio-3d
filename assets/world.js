// Procedural worlds for the 5 scenes. Everything is generated in code — no model downloads.
import * as THREE from 'three';

export const FOG = { color: { value: new THREE.Color(0x000000) }, density: { value: 0.02 } };
export const TIME = { value: 0 };
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

const FOG_GLSL = `
uniform vec3 uFogColor; uniform float uFogDensity;
vec3 applyFog(vec3 c, float d){ float f = 1.0 - exp(-uFogDensity*uFogDensity*d*d); return mix(c, uFogColor, clamp(f,0.0,1.0)); }`;

/* ------------------------------------------------------------------ */
/* 1. HERO — wireframe grid room + particle/ASCII bust                 */
/* ------------------------------------------------------------------ */
// Signed distance field of a stylised human bust (merged ellipsoids)
function sdEll(p, c, r) { // approx ellipsoid distance
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 === 0 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function headSDF(p) {
  const ax = Math.abs(p[0]); const q = [ax, p[1], p[2]];
  let d = sdEll(q, [0, .38, -.05], [.74, .86, .86]);           // cranium
  d = smin(d, sdEll(q, [0, -.22, .12], [.58, .62, .68]), .25);  // face / jaw
  d = smin(d, sdEll(q, [0, -.66, .36], [.27, .2, .24]), .18);   // chin
  d = smin(d, sdEll(q, [.36, -.38, .3], [.2, .22, .3]), .2);    // jaw corners
  d = smin(d, sdEll(q, [0, .2, .66], [.5, .1, .16]), .12);      // brow
  d = smin(d, sdEll(q, [0, -.05, .86], [.1, .24, .14]), .08);   // nose bridge
  d = smin(d, sdEll(q, [0, -.25, .92], [.13, .08, .1]), .07);   // nose tip
  d = smin(d, sdEll(q, [.12, -.27, .86], [.07, .05, .07]), .05);// nostrils
  d = smin(d, sdEll(q, [0, -.44, .8], [.2, .055, .09]), .05);   // upper lip
  d = smin(d, sdEll(q, [0, -.53, .78], [.17, .05, .08]), .05);  // lower lip
  d = smin(d, sdEll(q, [.32, -.16, .62], [.18, .11, .14]), .14);// cheekbones
  d = smin(d, sdEll(q, [.74, -.02, -.02], [.09, .22, .15]), .08);// ears
  d = smax(d, -sdEll(q, [.26, .06, .8], [.15, .08, .12]), .08); // eye sockets
  d = smin(d, sdEll(q, [.26, .06, .7], [.09, .055, .07]), .03); // eyeballs
  // neck
  const nx = p[0] / .36, nz = (p[2] + .02) / .34; const nd = (Math.hypot(nx, nz) - 1) * .35;
  const neck = Math.max(nd, Math.abs(p[1] + 1.15) - .5);
  d = smin(d, neck, .2);
  d = smin(d, sdEll(q, [0, -1.82, -.06], [1.75, .5, .62]), .45); // shoulders / chest
  d = smin(d, sdEll(q, [.2, -1.55, .3], [.38, .1, .1]), .2);     // collarbones
  d = Math.max(d, -(p[1] + 2.05));                                  // cut bust bottom
  return d;
}
function grad(p) {
  const e = .004;
  const dx = headSDF([p[0] + e, p[1], p[2]]) - headSDF([p[0] - e, p[1], p[2]]);
  const dy = headSDF([p[0], p[1] + e, p[2]]) - headSDF([p[0], p[1] - e, p[2]]);
  const dz = headSDF([p[0], p[1], p[2] + e]) - headSDF([p[0], p[1], p[2] - e]);
  const l = Math.hypot(dx, dy, dz) || 1; return [dx / l, dy / l, dz / l];
}

function glyphAtlas() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#fff';
  g.font = '700 52px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  '01+#*/%:'.split('').forEach((ch, i) => g.fillText(ch, i * 64 + 32, 34));
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
}

export function buildHero(opts) {
  const group = new THREE.Group();
  // grid room
  const pts = [], cols = [], cMajor = new THREE.Color(0x00ddff), cMinor = new THREE.Color(0x16323a);
  const line = (a, b, major) => { pts.push(...a, ...b); const c = major ? cMajor : cMinor; cols.push(c.r, c.g, c.b, c.r, c.g, c.b); };
  const Y0 = -2.3, Y1 = 9, X = 11, Z0 = 14, Z1 = -14;
  for (let x = -X; x <= X; x++) { line([x, Y0, Z0], [x, Y0, Z1], x % 4 === 0); line([x, Y0, Z1], [x, Y1, Z1], x % 4 === 0); line([x, Y1, Z0], [x, Y1, Z1], false); }
  for (let z = Z1; z <= Z0; z++) { line([-X, Y0, z], [X, Y0, z], z % 4 === 0); line([-X, Y0, z], [-X, Y1, z], z % 4 === 0); line([X, Y0, z], [X, Y1, z], z % 4 === 0); }
  for (let y = Y0; y <= Y1; y++) { line([-X, y, Z1], [X, y, Z1], false); line([-X, y, Z0], [-X, y, Z1], false); line([X, y, Z0], [X, y, Z1], false); }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .9, fog: true }));
  group.add(grid);

  // particle bust
  const N = opts.mobile ? 9000 : 20000;
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), rnd4 = new Float32Array(N * 4), gly = new Float32Array(N);
  let n = 0, guard = 0;
  while (n < N && guard++ < N * 400) {
    const p = [rnd(-1.8, 1.8), rnd(-2.05, 1.3), rnd(-1, 1.15)];
    let d = headSDF(p); if (Math.abs(d) > .25) continue;
    for (let k = 0; k < 3; k++) { const g = grad(p); d = headSDF(p); p[0] -= g[0] * d; p[1] -= g[1] * d; p[2] -= g[2] * d; }
    if (Math.abs(headSDF(p)) > .01 || p[1] < -2.04) continue;
    // fewer points on back & shoulders, more on face
    const g = grad(p);
    const keep = p[1] < -1.3 ? .45 : (g[2] < -.2 ? .35 : 1);
    if (Math.random() > keep) continue;
    pos.set(p, n * 3); nor.set(g, n * 3);
    rnd4.set([Math.random(), Math.random(), Math.random(), Math.random()], n * 4);
    gly[n] = Math.floor(Math.random() * 8); n++;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
  pg.setAttribute('aNormal', new THREE.BufferAttribute(nor.subarray(0, n * 3), 3));
  pg.setAttribute('aRand', new THREE.BufferAttribute(rnd4.subarray(0, n * 4), 4));
  pg.setAttribute('aGlyph', new THREE.BufferAttribute(gly.subarray(0, n), 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uExplode: { value: 0 }, uSize: { value: opts.mobile ? 34 : 30 }, uPR: { value: opts.pr },
      uAtlas: { value: glyphAtlas() }, uColA: { value: new THREE.Color(0x00ddff) }, uColB: { value: new THREE.Color(0xd8fbff) } },
    vertexShader: `
      attribute vec3 aNormal; attribute vec4 aRand; attribute float aGlyph;
      uniform float uTime, uExplode, uSize, uPR;
      varying float vShade, vGlyph, vRand, vE;
      void main(){
        vec3 p = position;
        float e = uExplode;
        p += aNormal * sin(uTime*2.0 + aRand.x*40.0) * 0.006;
        float ee = smoothstep(0.0, 1.0, e);
        // swirl around the view axis + expand
        float sw = ee * (2.5 + aRand.z*5.0) + ee*uTime*0.4*(aRand.y-0.3);
        float c = cos(sw), s = sin(sw);
        vec3 q = p; q.xy = mat2(c,-s,s,c) * q.xy;
        float rad = 1.6 + aRand.x*6.0;
        q.xy *= 1.0 + ee * rad * 0.55;
        float ang = aRand.y*6.2831 + uTime*(0.25 + aRand.z*0.5) + ee*3.0;
        vec3 v = vec3(cos(ang)*rad, sin(ang)*rad*0.8, p.z*2.0 + 3.0 - aRand.w*34.0);
        vec3 fp = mix(q, v, smoothstep(0.25, 1.0, e));
        vec4 mv = modelViewMatrix * vec4(fp, 1.0);
        gl_PointSize = clamp(uSize * uPR * (0.75 + aRand.w*0.6) / -mv.z, 1.0, 40.0);
        gl_Position = projectionMatrix * mv;
        vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
        float diff = max(dot(aNormal, L), 0.0);
        float rim = pow(1.0 - clamp(aNormal.z,0.0,1.0), 3.0) * step(0.0, aNormal.z + 0.3);
        vShade = mix(0.08 + 1.15*pow(diff,1.3) + 0.55*rim, 0.9, ee*0.7);
        vGlyph = aGlyph; vRand = aRand.x; vE = ee;
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas; uniform vec3 uColA, uColB;
      varying float vShade, vGlyph, vRand, vE;
      void main(){
        vec2 uv = vec2((gl_PointCoord.x + vGlyph) / 8.0, 1.0 - gl_PointCoord.y);
        float a = texture2D(uAtlas, uv).r;
        if (a < 0.25) discard;
        vec3 c = mix(uColA, uColB, smoothstep(0.55, 1.0, vRand + vShade*0.25)) * vShade;
        c = mix(c, vec3(0.0,1.0,0.27)*1.2, step(0.93, vRand) * (0.4 + vE*0.6));
        c = mix(c, vec3(1.0,0.0,0.2)*1.4, step(0.985, vRand) * vE);
        gl_FragColor = vec4(c * 1.15, 1.0);
      }`,
    depthWrite: true, transparent: false
  });
  const bust = new THREE.Points(pg, pm); bust.frustumCulled = false;
  const bustG = new THREE.Group(); bustG.add(bust); bustG.position.set(0, -.05, 0); group.add(bustG);

  // floating dust
  const dN = opts.mobile ? 300 : 700, dp = new Float32Array(dN * 3);
  for (let i = 0; i < dN; i++) dp.set([rnd(-10, 10), rnd(-2, 8), rnd(-13, 12)], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x66e8ff, size: .035, transparent: true, opacity: .6 }));
  group.add(dust);

  return {
    group, name: 'HERO', fog: [0x000307, 0.045], bloom: [0.85, 0.55, 0.2], flash: 0xffffff,
    update(t, time, mouse) {
      const e = smooth(.12, .95, t);
      pm.uniforms.uExplode.value = e;
      bustG.rotation.y = lerp(bustG.rotation.y, mouse.x * .35 + Math.sin(time * .3) * .08, .05);
      bustG.rotation.x = lerp(bustG.rotation.x, -mouse.y * .12, .05);
      dust.rotation.y = time * .01;
      grid.material.opacity = .9 - e * .5;
    },
    camera(t, mouse, out) {
      const k = easeIO(t);
      out.pos.set(lerp(opts.mobile ? 0 : .55, 0, k) + mouse.x * .25, lerp(opts.mobile ? .05 : .15, 0, k) + mouse.y * .12, lerp(opts.mobile ? 8.6 : 6.4, -5, k));
      out.look.set(lerp(opts.mobile ? 0 : .55, 0, k), lerp(opts.mobile ? -.35 : -.25, 0, k), out.pos.z - 8);
      out.fov = opts.mobile ? 62 : 46; out.roll = k * k * .6;
    }
  };
}

/* ------------------------------------------------------------------ */
/* 2. SELECTED WORK — cavern gallery with angled billboard screens     */
/* ------------------------------------------------------------------ */
function projectTexture(p, i, total) {
  const W = 1024, H = 576; const [c, g] = canvas(W, H);
  const [bg, ac] = p.colors;
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, bg); grd.addColorStop(1, '#000'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.save(); g.strokeStyle = ac; g.fillStyle = ac; g.globalAlpha = .9;
  const cx = W * .68, cy = H * .5;
  if (p.motif === 'rings') { for (let r = 30; r < 330; r += 26) { g.globalAlpha = 1 - r / 360; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); } g.globalAlpha = 1; g.beginPath(); g.arc(cx, cy, 60, 0, 7); g.fill(); }
  if (p.motif === 'stars') { for (let k = 0; k < 40; k++) { const x = 420 + (k % 8) * 74, y = 50 + Math.floor(k / 8) * 100; g.save(); g.translate(x, y); g.rotate(.785); g.globalAlpha = .35 + ((k * 7) % 10) / 15; g.fillRect(-22, -22, 44, 44); g.restore(); } }
  if (p.motif === 'phone') { g.lineWidth = 8; g.strokeRect(cx - 95, 60, 190, 400); g.globalAlpha = .7; for (let k = 0; k < 5; k++) g.fillRect(cx - 70, 100 + k * 64, 140 - (k % 2) * 50, 34); g.globalAlpha = 1; g.beginPath(); g.arc(cx + 130, 380, 46, 0, 7); g.fill(); }
  if (p.motif === 'wave') { g.lineWidth = 5; for (let k = 0; k < 64; k++) { const h = (Math.sin(k * .45) * .5 + .5) * (Math.sin(k * .13 + 1) * .5 + .5) * 380 + 20; g.globalAlpha = .5 + (k % 3) / 5; g.fillRect(400 + k * 9.5, cy - h / 2, 5, h); } }
  if (p.motif === 'kites') { for (let k = 0; k < 7; k++) { const x = 470 + (k * 97) % 480, y = 90 + (k * 131) % 380, s = 34 + (k % 3) * 22; g.globalAlpha = .55 + (k % 3) * .2; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * .8, y); g.lineTo(x, y + s * 1.2); g.lineTo(x - s * .8, y); g.closePath(); g.fill(); g.globalAlpha = .4; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + s * 1.2); g.bezierCurveTo(x - 30, y + 120, x + 40, y + 160, x - 10, y + 230); g.stroke(); } }
  g.restore();
  // scanlines
  g.globalAlpha = .12; g.fillStyle = '#000'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2); g.globalAlpha = 1;
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = '600 26px "JetBrains Mono", monospace'; g.fillStyle = ac; g.fillText(String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'), 56, 80);
  g.fillStyle = '#fff'; g.font = '700 104px "Oswald", sans-serif'; g.fillText(p.title, 52, 400);
  g.font = '500 30px "Oswald", sans-serif'; g.fillText(p.type + '  ·  ' + p.year, 56, 450);
  g.font = '500 18px "JetBrains Mono", monospace'; g.globalAlpha = .7; g.fillText('[ ' + (window.CONTENT.projectNote || 'PLACEHOLDER') + ' ]', 56, 510); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.strokeRect(14, 14, W - 28, H - 28);
  return tex(c);
}
export function buildWork(opts) {
  const group = new THREE.Group();
  const projects = window.CONTENT.projects; const SP = 17;
  const boards = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: .5, metalness: .7 });
  projects.forEach((p, i) => {
    const side = i % 2 ? 1 : -1; const z = -i * SP - 6;
    const b = new THREE.Group(); b.position.set(side * (opts.mobile ? 3.3 : 5.4), opts.mobile ? 1.2 : .9, z); b.rotation.y = -side * (opts.mobile ? .85 : .62); if (opts.mobile) b.scale.setScalar(.62);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.05), new THREE.MeshBasicMaterial({ map: projectTexture(p, i, projects.length), toneMapped: false }));
    screen.material.color.setScalar(.95);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.45, .25), frameMat); frame.position.z = -.14;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(7.62, .05, .27), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.colors[1]).multiplyScalar(2.5) })); edge.position.set(0, -2.24, -.14);
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(.18, 3.2, .18), frameMat); leg1.position.set(-2.6, -3.6, -.2);
    const leg2 = leg1.clone(); leg2.position.x = 2.6;
    b.add(screen, frame, edge, leg1, leg2);
    const light = new THREE.PointLight(new THREE.Color(p.colors[1]), 26, 22, 1.6); light.position.set(-side * 1.5, 0, 3); b.add(light);
    // light spill on floor
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.colors[1]), transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, map: radialTex() }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(0, -5.15, 2.5); b.add(spill);
    group.add(b); boards.push({ g: b, z, side });
  });
  // cave rocks
  const L = projects.length * SP + 40;
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = rockGeo.attributes.position; for (let i = 0; i < rp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(rp, i); v.multiplyScalar(1 + (Math.sin(v.x * 7) * Math.cos(v.y * 5 + v.z * 3)) * .18); rp.setXYZ(i, v.x, v.y, v.z); }
  rockGeo.computeVertexNormals();
  const RN = opts.mobile ? 260 : 520;
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x34343e, roughness: .95, metalness: .05, flatShading: true }), RN);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), eu = new THREE.Euler();
  for (let i = 0; i < RN; i++) {
    const zone = Math.random(); let x, y;
    if (zone < .38) { x = -rnd(11, 17); y = rnd(-6, 11); } else if (zone < .76) { x = rnd(11, 17); y = rnd(-6, 11); } else { x = rnd(-14, 14); y = rnd(10, 15); }
    v.set(x, y, rnd(12, -L)); eu.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); q.setFromEuler(eu); const sc = rnd(2.2, 5.5); s.set(sc, sc * rnd(.6, 1.4), sc);
    m.compose(v, q, s); rocks.setMatrixAt(i, m);
  }
  group.add(rocks);
  // stalactites
  const stal = new THREE.InstancedMesh(new THREE.ConeGeometry(.6, 1, 5), rocks.material, opts.mobile ? 60 : 140);
  for (let i = 0; i < stal.count; i++) { v.set(rnd(-11, 11), rnd(7.5, 10), rnd(10, -L)); q.setFromEuler(eu.set(Math.PI, rnd(0, 6), 0)); const h = rnd(1.5, 5); s.set(rnd(.6, 1.6), h, rnd(.6, 1.6)); m.compose(v, q, s); stal.setMatrixAt(i, m); }
  group.add(stal);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, L + 40), new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: .55, metalness: .4 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -5.2, -L / 2 + 10); group.add(floor);
  group.add(new THREE.HemisphereLight(0x8899bb, 0x0a0a0a, 1.1));
  const fl = new THREE.PointLight(0xffffff, 30, 30, 1.5); group.add(fl);
  // light beams (fake volumetrics)

  const total = projects.length;
  return {
    group, name: 'SELECTED WORK', fog: [0x050608, 0.03], bloom: [0.6, 0.5, 0.7], flash: 0xffffff, boards,
    update(t, time) { fl.position.set(0, 3, lerp(4, -(total - 1) * SP - 6, t)); },
    camera(t, mouse, out) {
      const zEnd = -(total - 1) * SP - 2;
      const z = lerp(12, zEnd, t);
      out.pos.set(Math.sin(t * 6) * (opts.mobile ? .2 : .6) + mouse.x * .4, .4 + mouse.y * .2, z);
      // look toward the nearest board ahead
      let best = boards[0], bd = 1e9; const ah = opts.mobile ? 12 : 9; for (const b of boards) { const d = Math.abs(b.z - (z - ah)); if (d < bd) { bd = d; best = b; } }
      if (opts.mobile) { const bp = best.g.position, kk = .8 * (1 - Math.min(1, bd / 34)); out.look.set(lerp(0, bp.x, kk), lerp(.8, bp.y, kk), lerp(z - 12, bp.z, kk * .6)); }
      else out.look.set(best.side * 2.2 * (1 - Math.min(1, bd / 16)), .6, z - 12);
      out.fov = opts.mobile ? 70 : 55; out.roll = 0;
      this.current = boards.indexOf(best);
    }
  };
}
let _rt; function radialTex() { if (_rt) return _rt; const [c, g] = canvas(128, 128); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); _rt = new THREE.CanvasTexture(c); return _rt; }

/* ------------------------------------------------------------------ */
/* 3. ABOUT — endless server-room tunnel                               */
/* ------------------------------------------------------------------ */
function rackTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#111419'; g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 20) {
    g.fillStyle = '#1c2129'; g.fillRect(6, y, 116, 16);
    g.fillStyle = '#0a0c0f'; for (let x = 10; x < 90; x += 6) g.fillRect(x, y + 4, 3, 8);
    g.fillStyle = '#2a313b'; g.fillRect(96, y + 3, 22, 10);
  }
  g.strokeStyle = '#3a4250'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 252);
  return tex(c);
}
export function buildAbout(opts) {
  const group = new THREE.Group();
  const LEN = 200, STEP = 1.05, cnt = Math.floor(LEN / STEP);
  const rackGeo = new THREE.BoxGeometry(.9, 2.7, 1);
  const rackMat = new THREE.MeshBasicMaterial({ map: rackTexture(), color: 0x8a96a8 });
  const racks = new THREE.InstancedMesh(rackGeo, rackMat, cnt * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < cnt; i++) for (const side of [-1, 1]) { v.set(side * 2.25, 1.35, 20 - i * STEP); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * -Math.PI / 2); m.compose(v, q, s); racks.setMatrixAt(k++, m); }
  group.add(racks);
  // LEDs
  const per = opts.mobile ? 10 : 18, LN = cnt * 2 * per;
  const ledGeo = new THREE.PlaneGeometry(.06, .035);
  const ledColor = new Float32Array(LN * 3), ledPhase = new Float32Array(LN), ledSpeed = new Float32Array(LN);
  const leds = new THREE.InstancedMesh(ledGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uFogColor: FOG.color, uFogDensity: FOG.density },
    vertexShader: `attribute vec3 aColor; attribute float aPhase, aSpeed; varying vec3 vC; varying float vP, vS, vD;
      void main(){ vC=aColor; vP=aPhase; vS=aSpeed; vec4 mv = viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; varying vec3 vC; varying float vP, vS, vD; ${FOG_GLSL}
      void main(){ float b = step(0.3, fract(uTime*vS + vP)); vec3 c = vC*(0.25 + 3.2*b); gl_FragColor=vec4(applyFog(c, vD),1.0); }`
  }), LN);
  const green = new THREE.Color(0x00ff44), orange = new THREE.Color(0xff8a00), blue = new THREE.Color(0x00ddff);
  k = 0;
  for (let i = 0; i < cnt; i++) for (const side of [-1, 1]) for (let j = 0; j < per; j++) {
    const row = j % (per / 2), col = Math.floor(j / (per / 2));
    v.set(side * (2.25 - .505), .32 + row * (2.2 / (per / 2)) + rnd(-.02, .02), 20 - i * STEP + (col ? .3 : .1) * -side * 1 + rnd(-.05, .05));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * -Math.PI / 2); m.compose(v, q, s); leds.setMatrixAt(k, m);
    const r = Math.random(); const c = r < .6 ? green : r < .9 ? orange : blue; ledColor.set([c.r, c.g, c.b], k * 3);
    ledPhase[k] = Math.random(); ledSpeed[k] = Math.random() < .3 ? 0 : rnd(.3, 4); k++;
  }
  ledGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(ledColor, 3));
  ledGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ledPhase, 1));
  ledGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(ledSpeed, 1));
  group.add(leds);
  // ceiling + floor
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(5, LEN + 20), new THREE.MeshBasicMaterial({ color: 0x0b0e12 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3.3, 20 - LEN / 2); group.add(ceil);
  const [fc, fg] = canvas(256, 256); fg.fillStyle = '#0d1014'; fg.fillRect(0, 0, 256, 256); fg.strokeStyle = '#1f252e'; fg.lineWidth = 4; fg.strokeRect(0, 0, 256, 256); fg.fillStyle = '#161a20'; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) if ((i + j) % 2) fg.fillRect(i * 16 + 4, j * 16 + 4, 4, 4);
  const ft = tex(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(4, (LEN + 20) / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.5, LEN + 20), new THREE.MeshBasicMaterial({ map: ft, color: 0x9aa4b0 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 20 - LEN / 2); group.add(floor);
  // light strips (ceiling and floor reflection)
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(.35, LEN + 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfefff).multiplyScalar(1.6) })); strip.rotation.x = Math.PI / 2; strip.position.set(0, 3.28, 20 - LEN / 2); group.add(strip);
  const refl = new THREE.Mesh(new THREE.PlaneGeometry(.9, LEN + 20), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false })); refl.rotation.x = -Math.PI / 2; refl.position.set(0, .01, 20 - LEN / 2); group.add(refl);
  // cable trays
  const cableCols = [0xff8a00, 0x00ff44, 0x00ddff, 0xff0033, 0xffffff];
  cableCols.forEach((c, i) => { const cb = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, LEN + 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(.7) })); cb.position.set(-1.3 + i * .12, 3.05, 20 - LEN / 2); group.add(cb); const cb2 = cb.clone(); cb2.position.x = 1.3 - i * .12; group.add(cb2); });
  // end-of-tunnel glow
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshBasicMaterial({ map: radialTex(), color: new THREE.Color(0xbfe9ff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  group.add(glow);
  return {
    group, name: 'ABOUT', fog: [0x02060a, 0.045], bloom: [0.9, 0.5, 0.5], flash: 0xbfe9ff,
    update(t) { glow.position.set(0, 1.4, lerp(10, -130, t) - 40); glow.material.opacity = .25 + t * .75; },
    camera(t, mouse, out) {
      const z = lerp(14, -130, t);
      out.pos.set(mouse.x * .25, 1.45 + mouse.y * .12 + Math.sin(t * 40) * .015, z);
      out.look.set(0, 1.4, z - 20); out.fov = opts.mobile ? 72 : 58; out.roll = Math.sin(t * 3) * .02;
    }
  };
}

/* ------------------------------------------------------------------ */
/* 4. CITY — vertical chasm of skyscrapers, red portal at the bottom  */
/* ------------------------------------------------------------------ */
function windowMaterial(o) {
  return new THREE.ShaderMaterial({
    uniforms: { uBase: { value: new THREE.Color(o.base) }, uLitA: { value: new THREE.Color(o.a).multiplyScalar(o.gain || 1.4) }, uLitB: { value: new THREE.Color(o.b).multiplyScalar(o.gain || 1.4) },
      uRatio: { value: o.ratio }, uCell: { value: new THREE.Vector2(o.cell[0], o.cell[1]) }, uGlow: { value: new THREE.Color(o.glow || 0) }, uGlowY: { value: new THREE.Vector2(o.glowY ? o.glowY[0] : 0, o.glowY ? o.glowY[1] : 1) },
      uFogColor: FOG.color, uFogDensity: FOG.density, uTime: TIME },
    vertexShader: `attribute float aSeed; varying vec3 vW, vN; varying float vSeed, vD;
      void main(){ vec4 lw = instanceMatrix*vec4(position,1.0); vW=lw.xyz; vec4 w = modelMatrix*lw; vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal); vSeed=aSeed;
        vec4 mv = viewMatrix*w; vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uBase, uLitA, uLitB, uGlow; uniform float uRatio, uTime; uniform vec2 uCell, uGlowY; varying vec3 vW, vN; varying float vSeed, vD; ${FOG_GLSL}
      float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      void main(){
        vec3 n = abs(vN); vec3 col = uBase;
        if (n.y < 0.5){
          float u = n.x > 0.5 ? vW.z : vW.x;
          vec2 c = vec2(u, vW.y) / uCell; vec2 id = floor(c) + vec2(vSeed*91.0, vSeed*17.0); vec2 f = fract(c);
          float win = step(0.2,f.x)*step(f.x,0.8)*step(0.22,f.y)*step(f.y,0.78);
          float floorBand = step(0.5, h(vec2(id.y, vSeed*13.0)));
          float lit = step(1.0-uRatio*(0.6+floorBand*0.8), h(id));
          float flick = 0.85 + 0.15*sin(uTime*3.0 + h(id+5.0)*60.0);
          vec3 wc = mix(uLitA, uLitB, h(id+3.1)) * (0.45 + 0.9*h(id+7.7)) * flick;
          col = mix(col, wc, win*lit);
          col += win*(1.0-lit)*vec3(0.02,0.03,0.05);
        } else { col *= 0.6; }
        col += uGlow * smoothstep(uGlowY.x, uGlowY.y, vW.y) * (0.4 + n.y*0.2);
        gl_FragColor = vec4(applyFog(col, vD), 1.0);
      }`
  });
}
export { windowMaterial };
export function buildCity(opts) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const list = [];
  const R = 70, cell = 9;
  for (let x = -R; x <= R; x += cell) for (let z = -R; z <= R; z += cell) {
    const d = Math.hypot(x, z); if (d < 12 || d > R) continue;
    if (opts.mobile && Math.random() < .25) continue;
    const w = rnd(5, 8), dpt = rnd(5, 8), top = rnd(-10, 45) + (d < 25 ? 15 : 0), bot = -240;
    list.push([x + rnd(-1, 1), z + rnd(-1, 1), w, dpt, top, bot]);
  }
  // inner ring of slim towers lining the chasm
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = rnd(12, 15); list.push([Math.cos(a) * r, Math.sin(a) * r, rnd(3, 4.5), rnd(3, 4.5), rnd(20, 50), -240]); }
  const mat = windowMaterial({ base: 0x020407, a: 0x00b8ff, b: 0xcfefff, ratio: .26, cell: [1.0, 1.5], glow: 0x660010, glowY: [-110, -235], gain: .75 });
  const bld = new THREE.InstancedMesh(geo, mat, list.length);
  const seeds = new Float32Array(list.length);
  const m = new THREE.Matrix4();
  list.forEach((b, i) => { const h = b[4] - b[5]; m.makeScale(b[2], h, b[3]); m.setPosition(b[0], b[5] + h / 2, b[1]); bld.setMatrixAt(i, m); seeds[i] = Math.random(); });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  group.add(bld);
  // antennas / beacon lights on rooftops
  const bN = list.length, bp = new Float32Array(bN * 3); list.forEach((b, i) => bp.set([b[0], b[4] + .6, b[1]], i * 3));
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  group.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: new THREE.Color(0xff0033).multiplyScalar(2), size: .5 })));
  // flying traffic
  const TN = opts.mobile ? 160 : 400, tp = new Float32Array(TN * 3), tr = new Float32Array(TN * 3);
  for (let i = 0; i < TN; i++) tr.set([rnd(8, 11.5), rnd(-220, 40), Math.random() * 6.28], i * 3);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const traffic = new THREE.Points(tg, new THREE.PointsMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2), size: .28 })); traffic.frustumCulled = false; group.add(traffic);
  // portal
  const PY = -205;
  const portal = new THREE.Group(); portal.position.y = PY;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7, .35, 12, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff0033).multiplyScalar(4), fog: false })); ring.rotation.x = Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshBasicMaterial({ map: radialTex(), color: new THREE.Color(0xff1a3c).multiplyScalar(3.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); disc.rotation.x = -Math.PI / 2;
  const core = new THREE.Mesh(new THREE.CircleGeometry(6.6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3355).multiplyScalar(2), fog: false })); core.rotation.x = -Math.PI / 2; core.position.y = -.2;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: radialTex(), color: new THREE.Color(0xff0033).multiplyScalar(1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = -1;
  portal.add(halo, core, disc, ring); group.add(portal);
  return {
    group, name: 'THE CITY', fog: [0x01040a, 0.0115], bloom: [0.75, 0.55, 0.62], flash: 0xff0033,
    update(t, time) {
      const pa = tg.attributes.position.array; for (let i = 0; i < TN; i++) { const a = tr[i * 3 + 2] + time * (.15 + (i % 7) * .03) * (i % 2 ? 1 : -1); pa[i * 3] = Math.cos(a) * tr[i * 3]; pa[i * 3 + 1] = tr[i * 3 + 1]; pa[i * 3 + 2] = Math.sin(a) * tr[i * 3]; }
      tg.attributes.position.needsUpdate = true; ring.scale.setScalar(1 + Math.sin(time * 3) * .03); disc.rotation.z = time * .3;
    },
    camera(t, mouse, out) {
      const k = t; const y = lerp(70, PY + 2, Math.pow(k, 1.35));
      const a = k * 2.2;
      const r = lerp(4.5, .3, k);
      out.pos.set(Math.cos(a) * r + mouse.x * .5, y, Math.sin(a) * r + mouse.y * .5);
      out.look.set(0, y - 40, 0.001); out.fov = opts.mobile ? 78 : 66; out.up = [Math.cos(a + 1.2), 0, Math.sin(a + 1.2)];
    }
  };
}

/* ------------------------------------------------------------------ */
/* 5. CONTACT — Indian-cyberpunk neon bazaar alley                     */
/* ------------------------------------------------------------------ */
const NEON = ['#ff0033', '#ff8a00', '#00ddff', '#00ff44', '#ff2a9d', '#ffd000'];
function signTexture(text, color, vertical) {
  const W = vertical ? 160 : 512, H = vertical ? 512 : 200; const [c, g] = canvas(W, H);
  g.fillStyle = 'rgba(10,2,4,0.92)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 18; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fam = /[\u0900-\u097F]/.test(text) ? '"Noto Sans Devanagari"' : /[\u0A00-\u0A7F]/.test(text) ? '"Noto Sans Gurmukhi"' : '"Oswald"';
  if (vertical && !/[\u0900-\u0A7F]/.test(text)) {
    const chars = text.replace(/\s/g, '').split('').slice(0, 7); const fs = Math.min(70, (H - 50) / chars.length);
    g.font = `700 ${fs}px ${fam}, sans-serif`;
    chars.forEach((ch, i) => { for (let p = 0; p < 3; p++) { g.shadowBlur = [26, 10, 0][p]; g.globalAlpha = [1, 1, .55][p]; g.fillStyle = p === 2 ? '#fff' : color; g.fillText(ch, W / 2, 30 + fs / 2 + i * fs); } }); g.globalAlpha = 1;
  } else {
    let fs = vertical ? 64 : 120; g.font = `700 ${fs}px ${fam}, sans-serif`;
    const maxW = W - 50; while (g.measureText(text).width > maxW && fs > 20) { fs -= 4; g.font = `700 ${fs}px ${fam}, sans-serif`; }
    if (vertical) { g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 2); g.translate(-W / 2, -H / 2); }
    for (let p = 0; p < 3; p++) { g.shadowBlur = [30, 12, 0][p]; g.globalAlpha = [1, 1, .55][p]; g.fillStyle = p === 2 ? '#fff' : color; g.fillText(text, W / 2, H / 2 + fs * .05); } g.globalAlpha = 1;
    if (vertical) g.restore();
  }
  return tex(c);
}
export function buildContact(opts) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1); const list = [];
  for (const side of [-1, 1]) { let z = 14; while (z > -110) { const d = rnd(4, 8); const h = rnd(9, 22); list.push([side * (5.2 + rnd(0, 1.2) + 3), z - d / 2, 6, d, h]); z -= d + rnd(0, .4); } }
  const mat = windowMaterial({ base: 0x080304, a: 0xff7a00, b: 0xffb060, ratio: .3, cell: [1.4, 1.8], glow: 0x30000a, glowY: [12, 0], gain: .7 });
  const bld = new THREE.InstancedMesh(geo, mat, list.length); const seeds = new Float32Array(list.length); const m = new THREE.Matrix4();
  list.forEach((b, i) => { m.makeScale(b[2], b[4], b[3]); m.setPosition(b[0], b[4] / 2, b[1]); bld.setMatrixAt(i, m); seeds[i] = Math.random(); });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1)); group.add(bld);
  // ground — wet, reflective look
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 150), new THREE.MeshStandardMaterial({ color: 0x140507, roughness: .32, metalness: .8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -45; group.add(floor);
  // signs
  const signs = window.CONTENT.signs; const signMeshes = [];
  for (let i = 0; i < 22; i++) {
    const text = signs[i % signs.length]; const color = NEON[(i * 5 + 1) % NEON.length];
    const blade = i % 3 !== 2; const side = i % 2 ? 1 : -1; const z = 7 - i * 2.9 - rnd(0, 1);
    const vertical = blade && i % 4 === 0;
    const t = signTexture(text, color, vertical);
    const w = vertical ? 1.1 : (blade ? 3 : 4.2), h = vertical ? 3.5 : (blade ? 1.2 : 1.65);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide, fog: false }));
    mesh.material.color.setScalar(.85);
    if (blade) { mesh.position.set(side * (4.6 - w / 2 + .3), rnd(3.2, 6.5), z); }
    else { mesh.position.set(side * 4.15, rnd(2.8, 5.5), z); mesh.rotation.y = -side * Math.PI / 2; }
    group.add(mesh); signMeshes.push({ mesh, phase: Math.random() * 10, base: .85, flick: Math.random() < .25 });
    if (i < 8) { const pl = new THREE.PointLight(new THREE.Color(color), 18, 12, 1.8); pl.position.set(mesh.position.x * .8, mesh.position.y - .6, z + .6); group.add(pl); }
  }
  // glowing shopfronts with striped awnings at street level
  const [sc, sg] = canvas(256, 192);
  const sgr = sg.createLinearGradient(0, 40, 0, 192); sgr.addColorStop(0, '#ffb347'); sgr.addColorStop(1, '#7a1a05'); sg.fillStyle = sgr; sg.fillRect(0, 40, 256, 152);
  for (let k = 0; k < 8; k++) { sg.fillStyle = k % 2 ? '#ff0033' : '#ffe9c0'; sg.fillRect(k * 32, 0, 32, 40); }
  sg.fillStyle = 'rgba(30,5,0,.85)'; for (let r = 0; r < 3; r++) { sg.fillRect(14, 70 + r * 38, 228, 5); for (let k = 0; k < 9; k++) sg.fillRect(20 + k * 25 + (r * 7) % 12, 48 + r * 38, 14, 22); }
  sg.fillStyle = 'rgba(0,0,0,.9)'; sg.fillRect(96, 120, 64, 72);
  const shopTex = tex(sc);
  for (const side of [-1, 1]) for (let z = 10; z > -46; z -= rnd(3.6, 5)) {
    const shop = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.3), new THREE.MeshBasicMaterial({ map: shopTex, toneMapped: false }));
    shop.material.color.setHSL(rnd(0, .08), .6, rnd(.45, .7)); shop.material.color.multiplyScalar(1.05);
    shop.position.set(side * 5.15, 1.25, z); shop.rotation.y = -side * Math.PI / 2; group.add(shop);
  }
  // lantern strings across the alley
  const LN = opts.mobile ? 70 : 140; const lan = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), LN);
  const wirePts = []; let li = 0; const col = new THREE.Color(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const rows = Math.ceil(LN / 10);
  for (let r = 0; r < rows; r++) {
    const z = 8 - r * 6.5, y0 = rnd(6, 7.5); let prev = null;
    for (let j = 0; j <= 20; j++) { const x = -4.4 + j * 8.8 / 20; const y = y0 - Math.sin(j / 20 * Math.PI) * 1.2; const p = [x, y, z]; if (prev) wirePts.push(...prev, ...p); prev = p;
      if (j % 2 === 1 && li < LN) { v.set(x, y - .35, z); s.set(1, 1.35, 1); m.compose(v, q, s); lan.setMatrixAt(li, m); col.set(Math.random() < .7 ? 0xff3a1a : 0xffa020).multiplyScalar(1.5); lan.setColorAt(li, col); li++; } }
  }
  lan.count = li; group.add(lan);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a0a0a })));
  // random overhead cables
  const cab = []; for (let i = 0; i < 40; i++) { const z = rnd(10, -100), z2 = z + rnd(-4, 4), y = rnd(7, 12); cab.push(-4.6, y, z, 4.6, y - rnd(0, 2), z2); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cab, 3));
  group.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x120404 })));
  // end glow (light at the far end of the street)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshBasicMaterial({ map: radialTex(), color: new THREE.Color(0xff2a1a).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.set(0, 5, -95); group.add(glow);
  group.add(new THREE.HemisphereLight(0xff3020, 0x100000, .6));
  const keyL = new THREE.PointLight(0xff2a10, 60, 40, 1.4); keyL.position.set(0, 7, -6); group.add(keyL);
  // embers / dust
  const EN = opts.mobile ? 250 : 600, ep = new Float32Array(EN * 3), es = new Float32Array(EN); for (let i = 0; i < EN; i++) { ep.set([rnd(-4.5, 4.5), rnd(0, 10), rnd(12, -60)], i * 3); es[i] = rnd(.2, .9); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: new THREE.Color(0xff8a3a).multiplyScalar(2), size: .05, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })); embers.frustumCulled = false; group.add(embers);
  return {
    group, name: "LET'S TALK", fog: [0x2a0406, 0.045], bloom: [0.8, 0.6, 0.7], flash: 0xff0033,
    update(t, time) {
      const a = eg.attributes.position.array; for (let i = 0; i < EN; i++) { a[i * 3 + 1] += es[i] * .012; a[i * 3] += Math.sin(time + i) * .002; if (a[i * 3 + 1] > 10) a[i * 3 + 1] = 0; } eg.attributes.position.needsUpdate = true;
      for (const sm of signMeshes) if (sm.flick) { const f = Math.sin(time * 13 + sm.phase) > .93 || Math.sin(time * 2.3 + sm.phase) > .97 ? .25 : 1; sm.mesh.material.color.setScalar(sm.base * f); }
    },
    camera(t, mouse, out) {
      const k = 1 - Math.pow(1 - Math.min(1, t / .7), 3);
      out.pos.set(mouse.x * .4, lerp(4.5, 1.9, k) + mouse.y * .2, lerp(30, 12, k));
      out.look.set(mouse.x * .2, lerp(2.0, 3.2, k), -30); out.fov = opts.mobile ? 74 : 56; out.roll = 0;
    }
  };
}
