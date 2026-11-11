import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FOG, TIME, buildHero, buildWork, buildAbout, buildCity, buildContact } from './world.js';

const C = window.CONTENT;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('reduced');
const pr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75);

/* ---------------- text from content.js ---------------- */
$('logo').textContent = C.name;
$('heroLine').innerHTML = C.heroLine; $('heroNote').textContent = C.heroNote; $('scrollHint').textContent = C.scrollHint;
$('workTitle').textContent = C.workTitle; $('workHint').textContent = C.workHint;
$('learnMore').textContent = C.learnMore;
$('cityKicker').textContent = C.cityKicker; $('cityLine').textContent = C.cityLine;
$('contactTitle').innerHTML = C.contactTitle; $('contactBtn').querySelector('span').textContent = C.contactButton;
$('contactBtn').href = 'mailto:' + C.email; $('contactMail').textContent = C.email; $('footer').innerHTML = C.footer;

/* ---------------- loader ---------------- */
let shown = 0, real = 0;
const setReal = v => { real = Math.max(real, v); };
const ldTick = () => { if (!$('ldPct')) return; shown += (real - shown) * .12 + (real > shown ? .4 : 0); shown = Math.min(shown, real); const v = Math.round(shown); $('ldPct').textContent = v; document.querySelector('.ld-bar i').style.width = v + '%'; if (shown < 100) requestAnimationFrame(ldTick); };
requestAnimationFrame(ldTick);
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

/* ---------------- modal / ui ---------------- */
function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
$('modalX').onclick = () => $('modal').hidden = true;
$('modal').onclick = e => { if (e.target.id === 'modal') $('modal').hidden = true; };
addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').hidden = true; });
$('learnMore').onclick = e => { e.preventDefault(); openModal(`<h3>${C.name}</h3><p>${C.aboutMore}</p><ul>${C.skills.map(s => `<li>${s}</li>`).join('')}</ul>`); };
$('privacyBtn').onclick = e => { e.preventDefault(); openModal(`<h3>PRIVACY POLICY</h3><p>${C.privacyText}</p>`); };

/* cursor */
const cur = $('cursor'); const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; mouse.tx = e.clientX / innerWidth * 2 - 1; mouse.ty = -(e.clientY / innerHeight * 2 - 1); }
});
document.querySelectorAll('[data-hover]').forEach(el => { el.addEventListener('pointerenter', () => cur.classList.add('big')); el.addEventListener('pointerleave', () => cur.classList.remove('big')); });

/* ---------------- sound (generated synth ambience) ---------------- */
const Sound = {
  ctx: null, on: false,
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = this.master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    const filt = this.filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 520; filt.Q.value = 5;
    const delay = ctx.createDelay(1.5); delay.delayTime.value = .48; const fb = ctx.createGain(); fb.gain.value = .38;
    delay.connect(fb); fb.connect(delay); filt.connect(master); filt.connect(delay); delay.connect(master);
    this.oscs = [];
    [[55, 'sawtooth', .22], [55.35, 'sawtooth', .22], [110.2, 'triangle', .1], [27.5, 'sine', .45]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(filt); o.start(); this.oscs.push([o, f]);
    });
    // slow pad notes
    [220, 329.63, 392].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; const lfo = ctx.createOscillator(); lfo.frequency.value = .05 + i * .03; const lg = ctx.createGain(); lg.gain.value = .035; lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(delay); g.connect(master); o.start(); lfo.start(); this.oscs.push([o, f]); });
    const lfo = ctx.createOscillator(); lfo.frequency.value = .06; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
  },
  toggle() {
    if (!this.ctx) this.init();
    this.on = !this.on; const t = this.ctx.currentTime;
    if (this.on) this.ctx.resume();
    this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(this.on ? .11 : 0, t, .4);
    $('soundBtn').innerHTML = 'SOUND <b>' + (this.on ? 'ON' : 'OFF') + '</b>'; $('soundBtn').setAttribute('aria-pressed', this.on);
  },
  section(i, vel) {
    if (!this.on) return; const t = this.ctx.currentTime; const mult = [1, .89, .75, .84, 1.12][i];
    this.oscs.slice(0, 4).forEach(([o, f]) => o.frequency.setTargetAtTime(f * mult, t, .8));
    this.filt.frequency.setTargetAtTime(480 + Math.min(1, Math.abs(vel) * 60) * 1400, t, .15);
  }
};
$('soundBtn').onclick = () => Sound.toggle();

/* ---------------- renderer ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no gl');
} catch (err) {
  document.body.classList.add('nowebgl'); $('loader').remove(); throw err;
}
renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, .03); scene.background = new THREE.Color(0);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .05, 600);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / (mobile ? 2 : 1.5), innerHeight / (mobile ? 2 : 1.5)), .8, .5, .5);
composer.addPass(bloom);
const fx = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uAmt: { value: 0 }, uTime: { value: 0 }, uFlash: { value: new THREE.Color(1, 1, 1) }, uFlashAmt: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt, uTime, uFlashAmt; uniform vec3 uFlash; uniform vec2 uRes; varying vec2 vUv;
    float h(float n){ return fract(sin(n)*43758.5453); }
    void main(){
      vec2 uv = vUv;
      float band = floor(uv.y*24.0 + floor(uTime*24.0)*3.0);
      if (h(band) < uAmt*0.55) uv.x += (h(band+1.7)-0.5)*0.09*uAmt;
      vec2 dir = (uv-0.5); float off = 0.0012 + uAmt*0.014;
      vec3 c = vec3(texture2D(tDiffuse, uv + dir*off*2.0).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir*off*2.0).b);
      c = mix(c, uFlash, uFlashAmt);
      float vig = smoothstep(1.15, 0.35, length(dir*vec2(1.0, 0.9)));
      c *= mix(0.55, 1.0, vig);
      c += (h(dot(uv*uRes, vec2(12.9898,78.233)) + uTime) - 0.5) * 0.035;
      gl_FragColor = vec4(c, 1.0);
    }`
});
composer.addPass(fx);
composer.addPass(new OutputPass());

/* ---------------- build worlds ---------------- */
const opts = { mobile, pr };
const RANGES = [[0, .2], [.2, .44], [.44, .64], [.64, .84], [.84, 1]];
const NAMES = ['HERO', 'SELECTED WORK', 'ABOUT', 'THE CITY', "LET'S TALK"];
let worlds = [];
const OFFS = [[0, 0, 0], [600, 0, 0], [1200, 0, 0], [1800, 0, 0], [2400, 0, 0]];

async function build() {
  setReal(5);
  try { await Promise.all(['700 40px "Oswald"', '600 40px "Oswald"', '500 40px "Oswald"', '700 20px "JetBrains Mono"', '700 40px "Noto Sans Devanagari"', '700 40px "Noto Sans Gurmukhi"'].map(f => document.fonts.load(f, f.includes('Deva') ? 'चाय' : f.includes('Gurm') ? 'ਲੁਧਿਆਣਾ' : 'A'))); } catch (e) {}
  setReal(18); await frame();
  const builders = [buildHero, buildWork, buildAbout, buildCity, buildContact];
  for (let i = 0; i < builders.length; i++) {
    const w = builders[i](opts); w.group.position.set(...OFFS[i]); w.group.visible = false; scene.add(w.group); worlds.push(w);
    setReal(18 + (i + 1) * 12); await frame();
  }
  // precompile each world with its own light setup to avoid hitches at the cuts
  const tmp = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, roll: 0 };
  for (let i = 0; i < worlds.length; i++) {
    worlds.forEach((w, j) => w.group.visible = j === i);
    worlds[i].camera(0, { x: 0, y: 0 }, tmp); placeCamera(i, tmp);
    renderer.compile(scene, camera); composer.render();
    setReal(80 + (i + 1) * 4); await frame();
  }
  setReal(100);
}

function placeCamera(i, c) {
  const o = OFFS[i];
  camera.position.set(c.pos.x + o[0], c.pos.y + o[1], c.pos.z + o[2]);
  if (c.up) camera.up.set(...c.up); else camera.up.set(0, 1, 0);
  camera.lookAt(c.look.x + o[0], c.look.y + o[1], c.look.z + o[2]);
  if (c.roll) camera.rotateZ(c.roll);
  if (Math.abs(camera.fov - c.fov) > .01) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
}

/* ---------------- virtual scroll ---------------- */
let target = 0, prog = 0, vel = 0;
const clamp = v => Math.min(1, Math.max(0, v));
const startP = params.get('p'); if (startP !== null) { target = prog = clamp(parseFloat(startP)); }
addEventListener('wheel', e => { if (!$('modal').hidden) return; e.preventDefault(); const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; target = clamp(target + d * .00022); }, { passive: false });
let ty = null;
addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => { if (ty === null || !$('modal').hidden) return; const y = e.touches[0].clientY; target = clamp(target + (ty - y) * .0011); ty = y; }, { passive: true });
addEventListener('touchend', () => ty = null);
addEventListener('keydown', e => {
  const step = { ArrowDown: .02, ArrowUp: -.02, PageDown: .08, PageUp: -.08, ' ': .06 }[e.key];
  if (step) { target = clamp(target + step); e.preventDefault(); }
  if (e.key === 'Home') target = 0; if (e.key === 'End') target = 1;
});
function jumpTo(p) { if (reduced) { target = prog = p; return; } gsap.to({ v: target }, { v: p, duration: 2.4, ease: 'power2.inOut', onUpdate() { target = this.targets()[0].v; } }); }
$('talkBtn').onclick = e => { e.preventDefault(); jumpTo(1); };
$('logo').onclick = e => { e.preventDefault(); jumpTo(0); };
window.__setProgress = p => { target = prog = clamp(p); };

/* ---------------- overlays ---------------- */
const ovs = [...document.querySelectorAll('.ov')];
const typed = { started: false };
function typeTerminal() {
  if (typed.started) return; typed.started = true;
  const body = $('termBody'); body.innerHTML = '';
  if (reduced || params.has('instant')) { body.innerHTML = C.aboutLines.map(l => `<div>${l}</div>`).join(''); return; }
  let li = 0, ci = 0, div = null; const caret = document.createElement('span'); caret.className = 'caret';
  (function step() {
    if (li >= C.aboutLines.length) { div && div.appendChild(caret); return; }
    if (!div) { div = document.createElement('div'); body.appendChild(div); }
    const line = C.aboutLines[li]; div.textContent = line.slice(0, ++ci); div.appendChild(caret);
    if (ci >= line.length) { li++; ci = 0; div = null; setTimeout(step, 220); } else setTimeout(step, 18 + Math.random() * 30);
  })();
}
function overlayAlpha(i, t) {
  const fin = i === 0 ? 1 : smooth(.02, .1, t), fout = i === 4 ? 1 : 1 - smooth(.88, .97, t);
  if (i === 0) return 1 - smooth(.08, .3, t);
  if (i === 4) return smooth(.2, .45, t);
  return fin * fout;
}
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/* ---------------- loop ---------------- */
const clock = new THREE.Clock(); const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, roll: 0, up: null };
const fogCol = new THREE.Color(); let active = -1, lastWork = -1;
function sectionOf(p) { for (let i = 0; i < RANGES.length; i++) if (p <= RANGES[i][1] || i === RANGES.length - 1) return i; }

function tick() {
  const dt = Math.min(clock.getDelta(), .05); const time = clock.elapsedTime; TIME.value = time; fx.uniforms.uTime.value = time;
  const prev = prog; prog += (target - prog) * (1 - Math.exp(-dt * (reduced ? 12 : 3.2))); if (Math.abs(target - prog) < 1e-5) prog = target;
  vel = (prog - prev) / Math.max(dt, 1e-3);
  mouse.x += (mouse.tx - mouse.x) * .05; mouse.y += (mouse.ty - mouse.y) * .05;
  const m = reduced ? { x: 0, y: 0 } : mouse;

  const i = sectionOf(prog); const [a, b] = RANGES[i]; const t = clamp((prog - a) / (b - a));
  if (i !== active) {
    worlds.forEach((w, j) => w.group.visible = j === i);
    const w = worlds[i]; scene.fog.color.set(w.fog[0]); scene.fog.density = w.fog[1]; scene.background.set(w.fog[0]);
    FOG.color.value.copy(scene.fog.color); FOG.density.value = w.fog[1];
    bloom.strength = w.bloom[0]; bloom.radius = w.bloom[1]; bloom.threshold = w.bloom[2];
    active = i; Sound.section(i, vel);
    document.body.classList.toggle('at-contact', i === 4);
    $('hudIdx').textContent = String(i + 1).padStart(2, '0'); $('hudName').textContent = NAMES[i];
  }
  if (Sound.on) Sound.section(i, vel);
  const w = worlds[i]; camState.up = null; camState.roll = 0;
  w.update(t, time, m); w.camera(t, m, camState); placeCamera(i, camState);

  // transition flash + glitch around section boundaries
  let tr = 0, fcol = 0xffffff;
  for (let k = 1; k < RANGES.length; k++) { const d = Math.abs(prog - RANGES[k][0]); const x = Math.max(0, 1 - d / .022); if (x > tr) { tr = x; fcol = worlds[k].flash; } }
  const fl = Math.pow(tr, 2.2);
  fx.uniforms.uFlash.value.set(fcol); fx.uniforms.uFlashAmt.value = fl * .92;
  fx.uniforms.uAmt.value = reduced ? 0 : Math.min(1, tr * 1.1 + Math.min(.25, Math.abs(vel) * .5));

  // overlays
  ovs.forEach((el, j) => { const al = j === i ? overlayAlpha(j, t) : 0; el.style.opacity = al.toFixed(3); el.classList.toggle('on', al > .01); });
  if (i === 2 && t > .04) typeTerminal();
  if (i === 1 && w.current !== lastWork) { lastWork = w.current; const p = C.projects[w.current]; $('wcNum').textContent = String(w.current + 1).padStart(2, '0') + ' / ' + String(C.projects.length).padStart(2, '0'); $('wcTitle').textContent = p.title; $('wcMeta').textContent = p.type + ' · ' + p.year + ' · ' + C.projectNote; }
  $('hudFill').style.width = (prog * 100).toFixed(1) + '%';

  composer.render();
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); fx.uniforms.uRes.value.set(innerWidth, innerHeight);
});

build().then(() => {
  active = -1; window.__ready = true;
  const hide = () => gsap.to('#loader', { opacity: 0, duration: reduced ? .2 : .8, delay: .25, onComplete: () => $('loader').remove() });
  const wait = () => shown >= 99.5 ? hide() : requestAnimationFrame(wait);
  if (params.has('noloader')) $('loader').remove(); else wait();
  requestAnimationFrame(tick);
}).catch(err => { console.error(err); $('ldPct').textContent = 'ERR'; });
