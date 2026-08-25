import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('scene');
  const heroStars = document.querySelector('.bg-stars');
  if (!canvas) return;

  const CONFIG = {
    bgColor: '#08080A',
    flameColor: '#aee9ff',
    flameColor2: '#c79bff',
    flameAmt: 0,
    colorA: '#aef6cf',
    colorB: '#5fe6a0',
    colorC: '#eafff2',
    opacity: 1.05,
    pointSize: 50,
    brightness: 0.95,
    drift: 0.52,
    twinkle: 0.85,
    spin: 0.006,
    repelRadius: 5,
    repelStrength: 0.35,
    scrollPush: 8,
    scrollDrift: 1.15,
    scrollSpin: 0.016,
    parallax: 0.6
  };

  const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 };

  function hexToVec3(hex) {
    const n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function pageVis() {
    const h = window.innerHeight;
    const y = window.scrollY;
    return Math.max(0, Math.min(1, (y - h * 0.65) / (h * 0.4)));
  }

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 0, 15);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 80);
  camera.position.set(0, 0, 5);
  camera.layers.enable(LAYERS.TORUS_SCENE);
  camera.layers.enable(LAYERS.BLOOM_SCENE);
  camera.layers.enable(LAYERS.ENTIRE_SCENE);
  scene.add(camera);

  const count = 4200;
  const depth = 30;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  const palette = new Float32Array(count);
  const bright = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 24;
    positions[i3 + 1] = (Math.random() - 0.5) * 16;
    positions[i3 + 2] = (Math.random() - 0.5) * 30;
    palette[i] = Math.floor(Math.random() * 3);
    bright[i] = 0.7 + Math.random() * 0.6;
    scales[i] = 0.5 + Math.pow(Math.random(), 1.4) * 2.5;
    phases[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.Float32BufferAttribute(scales, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aPalette', new THREE.Float32BufferAttribute(palette, 1));
  geometry.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: CONFIG.pointSize },
    uOpacity: { value: 0 },
    uDrift: { value: 0 },
    uDepth: { value: depth },
    uTwinkle: { value: CONFIG.twinkle },
    uCursor: { value: new THREE.Vector3() },
    uRepelRadius: { value: CONFIG.repelRadius },
    uRepelStrength: { value: CONFIG.repelStrength },
    uActivity: { value: 0 },
    uColorA: { value: hexToVec3(CONFIG.colorA) },
    uColorB: { value: hexToVec3(CONFIG.colorB) },
    uColorC: { value: hexToVec3(CONFIG.colorC) },
    uBrightness: { value: CONFIG.brightness }
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: uniforms,
    vertexShader: `
uniform float uTime; uniform float uSize; uniform float uDrift; uniform float uDepth; uniform float uTwinkle;
uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;
uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
attribute float aScale; attribute float aPhase; attribute float aPalette; attribute float aBright;
varying vec3 vColor; varying float vTwinkle;
void main() {
  vec3 pos = position;
  pos.z = mod(pos.z + uDrift + (uDepth * 0.5), uDepth) - (uDepth * 0.5);

  float tw = sin(uTime * 0.35 + aPhase * 6.2831);
  vTwinkle = (1.0 - uTwinkle) + uTwinkle * (0.55 + 0.45 * tw);

  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);

  vec3 toParticle = modelPosition.xyz - uCursor;
  float dist = length(toParticle);
  float falloff = smoothstep(uRepelRadius, 0.0, dist);
  modelPosition.xyz += normalize(toParticle + vec3(0.0001)) * falloff * uRepelStrength * uActivity;

  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSize * aScale;
  gl_PointSize *= (1.0 / -viewPosition.z);

  vec3 base = aPalette < 0.5 ? uColorA : (aPalette < 1.5 ? uColorB : uColorC);
  vColor = base * aBright;
}
`,
    fragmentShader: `
uniform float uOpacity; uniform float uBrightness;
varying vec3 vColor; varying float vTwinkle;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float strength = pow(1.0 - d * 2.0, 4.0);
  vec3 color = mix(vec3(0.0), vColor, strength);
  gl_FragColor = vec4(color * uBrightness, strength * uOpacity * vTwinkle);
}
`
  });

  const points = new THREE.Points(geometry, material);
  points.layers.enable(LAYERS.ENTIRE_SCENE);
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  const torusComposer = new EffectComposer(renderer);
  torusComposer.renderToScreen = false;
  torusComposer.addPass(new RenderPass(scene, camera));
  torusComposer.addPass(new ShaderPass(GammaCorrectionShader));
  torusComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.1, 0.18, 0));
  torusComposer.addPass(new ShaderPass(CopyShader));

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.35, 0));
  bloomComposer.addPass(new ShaderPass(GammaCorrectionShader));

  const haloData = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  haloData.needsUpdate = true;

  const FinalPassShader = {
    uniforms: {
      iTime: { value: 0 },
      tDiffuse: { value: null },
      torusTexture: { value: null },
      bloomTexture: { value: null },
      haloTexture: { value: haloData },
      uBg: { value: hexToVec3(CONFIG.bgColor) },
      uFlameA: { value: hexToVec3(CONFIG.flameColor) },
      uFlameB: { value: hexToVec3(CONFIG.flameColor2) },
      uFlameAmt: { value: CONFIG.flameAmt }
    },
    vertexShader: `
varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`,
    fragmentShader: `
uniform float iTime; uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture;
uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
varying vec2 vUv;
vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
  pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
  pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
  pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
  return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
void main(){
  vec2 uv = 2.*vUv - 1.;
  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*0.7), vec3(1.5));
  vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
  flame *= smoothstep(0.25, 1., abs(uv.y));
  float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
  vec3 bg = uBg;
  vec3 halo = texture2D(haloTexture, vUv).xyz;
  gl_FragColor = vec4(bg + flame*uFlameAmt + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
}
`
  };

  const finalPass = new ShaderPass(FinalPassShader);
  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));
  finalComposer.addPass(finalPass);

  finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture;
  finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture;

  const POINTER = {
    ndc: new THREE.Vector2(),
    world: new THREE.Vector3(),
    activity: 0,
    active: false,
    lastMove: 0
  };
  const mouseSmooth = { x: 0, y: 0 };
  let scrollTarget = 0;
  let scrollSmooth = 0;
  let scrollCurrent = 0;
  let t0 = performance.now() / 1000;
  let appearStart = 0;
  let appeared = false;

  const rayOrigin = new THREE.Vector3();
  const unprojected = new THREE.Vector3();
  const pointerTarget = new THREE.Vector3();

  function readScroll() {
    const h = window.innerHeight;
    const heroH = h;
    const max = Math.max(1, document.documentElement.scrollHeight - h);
    const past = Math.max(0, window.scrollY - heroH * 0.85);
    const range = Math.max(1, max - heroH * 0.85);
    scrollTarget = Math.max(0, Math.min(1, past / range));
  }

  window.addEventListener('mousemove', function (e) {
    POINTER.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    POINTER.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    POINTER.active = true;
    POINTER.lastMove = performance.now();
  });
  window.addEventListener('mouseout', function () {
    POINTER.active = false;
  });
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  function updatePointer() {
    if (POINTER.active) {
      unprojected.set(POINTER.ndc.x, POINTER.ndc.y, 0.5).unproject(camera);
      const dir = unprojected.sub(camera.position);
      if (Math.abs(dir.z) > 1e-4) {
        const t = -camera.position.z / dir.z;
        if (t > 0 && isFinite(t)) {
          pointerTarget.set(
            camera.position.x + dir.x * t,
            camera.position.y + dir.y * t,
            0
          );
        } else {
          pointerTarget.set(0, 0, 0);
        }
      } else {
        pointerTarget.set(0, 0, 0);
      }
    } else {
      pointerTarget.set(0, 0, 0);
    }
    POINTER.world.lerp(pointerTarget, 0.12);
    const idle = (performance.now() - POINTER.lastMove) / 1000;
    const want = POINTER.active && idle < 3 ? 1 : 0;
    POINTER.activity += (want - POINTER.activity) * 0.06;
    uniforms.uCursor.value.copy(POINTER.world);
    uniforms.uActivity.value = POINTER.activity;
  }

  function updateScene(t, dt, vis) {
    const scroll = scrollCurrent;
    const m = mouseSmooth;
    uniforms.uTime.value = t;
    uniforms.uDrift.value += dt * (CONFIG.drift + scroll * CONFIG.scrollDrift);
    camera.position.set(m.x * CONFIG.parallax, m.y * CONFIG.parallax, 5 - scroll * CONFIG.scrollPush);
    camera.lookAt(m.x * CONFIG.parallax, m.y * CONFIG.parallax, -10);

    if (vis > 0.2 && !appeared) {
      appeared = true;
      appearStart = performance.now();
    }
    if (vis < 0.05) appeared = false;

    const elapsed = appeared ? performance.now() - appearStart : 0;
    const fade = Math.max(0, Math.min(1, (elapsed - 300) / 1400));
    uniforms.uOpacity.value = fade * CONFIG.opacity * vis;

    group.rotation.z += dt * (CONFIG.spin + scroll * CONFIG.scrollSpin);
  }

  function setComposerSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = window.devicePixelRatio;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    torusComposer.setPixelRatio(pr);
    torusComposer.setSize(w, h);
    bloomComposer.setPixelRatio(pr);
    bloomComposer.setSize(w, h);
    finalComposer.setPixelRatio(pr);
    finalComposer.setSize(w, h);
    readScroll();
  }
  window.addEventListener('resize', setComposerSize);

  function tick() {
    const vis = pageVis();
    canvas.style.opacity = String(vis);
    if (heroStars) heroStars.style.opacity = String(1 - vis);

    const now = performance.now();
    const t = now / 1000;
    const dt = Math.min(0.05, t - t0);
    t0 = t;

    scrollSmooth += (scrollTarget - scrollSmooth) * 0.10;
    scrollCurrent += (scrollSmooth - scrollCurrent) * 0.06;
    mouseSmooth.x += (POINTER.ndc.x - mouseSmooth.x) * 0.06;
    mouseSmooth.y += (POINTER.ndc.y - mouseSmooth.y) * 0.06;

    if (vis > 0.01) {
      finalPass.uniforms.iTime.value = t;
      updatePointer();
      updateScene(t, dt, vis);
      camera.layers.set(LAYERS.TORUS_SCENE);
      torusComposer.render();
      camera.layers.set(LAYERS.BLOOM_SCENE);
      bloomComposer.render();
      camera.layers.set(LAYERS.ENTIRE_SCENE);
      finalComposer.render();
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
