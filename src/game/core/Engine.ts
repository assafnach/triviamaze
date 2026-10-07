import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { QUALITY_PROFILES, type QualityProfile } from '@/config/gameConfig';
import type { QualityLevel } from '@/types';

/** Owns the WebGL renderer, camera, post-processing and the frame loop. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  scene: THREE.Scene = new THREE.Scene();
  quality: QualityLevel;
  profile: QualityProfile;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private gtao: GTAOPass | null = null;
  private baseFov = 72;
  private focusLevel = 0;

  /**
   * Cinematic focus during conversations: the field of view eases in slightly so the creature
   * fills more of the frame. Never moves or turns the camera.
   */
  setFocus(target: number, dt: number): void {
    const next = this.focusLevel + (target - this.focusLevel) * Math.min(1, dt * 1.8);
    if (Math.abs(next - this.focusLevel) < 1e-4) return;
    this.focusLevel = next;
    this.camera.fov = this.baseFov * (1 - 0.09 * next);
    this.camera.updateProjectionMatrix();
  }
  private bloom: UnrealBloomPass | null = null;
  private raf = 0;
  private last = 0;
  private running = false;
  private resolutionScale = 1;
  private fpsWindow: number[] = [];
  autoQuality = true;
  fps = 60;
  onFrame: ((dt: number, time: number) => void) | null = null;
  private readonly started = performance.now();

  constructor(
    private readonly container: HTMLElement,
    quality: QualityLevel,
  ) {
    this.quality = quality;
    this.profile = QUALITY_PROFILES[quality];
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160);
    this.applyQuality();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get viewportHeight(): number {
    return this.renderer.domElement.height;
  }

  get time(): number {
    return (performance.now() - this.started) / 1000;
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality) return;
    this.quality = level;
    this.profile = QUALITY_PROFILES[level];
    this.resolutionScale = 1;
    this.applyQuality();
    this.resize();
  }

  private applyQuality(): void {
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.setupComposer();
  }

  setScene(scene: THREE.Scene, exposure = 1.05): void {
    this.scene = scene;
    // Loading stalls are not a sign of a slow GPU: start measuring afresh.
    this.fpsWindow = [];
    this.renderer.toneMappingExposure = exposure;
    this.setupComposer();
  }

  private setupComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (!this.profile.bloom) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    // The canvas's own antialiasing does not apply to post-processing buffers, so the scene
    // buffer gets its own multisampling (WebGL2 MSAA). Without it every edge is jagged.
    const pr = this.pixelRatio();
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), {
      type: THREE.HalfFloatType,
      samples: this.profile.msaaSamples,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    // ULTRA: ground-truth ambient occlusion grounds props and creatures with soft contact shadows.
    this.gtao = null;
    if (this.profile.ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.4, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // Post-process antialiasing: far cheaper than multisampling an HDR buffer on integrated GPUs.
    if (this.profile.smaa) this.composer.addPass(new SMAAPass());
    this.composer.setPixelRatio(this.pixelRatio());
    this.composer.setSize(size.x, size.y);
  }

  /**
   * Compiles every shader a scene needs, without blocking the page. Programs are compiled for
   * the buffer the scene is actually drawn into (the HDR post-processing target when bloom is on,
   * which uses different shader variants from drawing straight to the screen).
   */
  async precompile(scene: THREE.Scene): Promise<void> {
    const prev = this.renderer.getRenderTarget();
    if (this.composer) this.renderer.setRenderTarget(this.composer.readBuffer);
    let job: Promise<unknown>;
    try {
      job = this.renderer.compileAsync(scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(prev);
    }
    this.compiling.add(job);
    try {
      await job;
    } finally {
      this.compiling.delete(job);
    }
  }

  private readonly compiling = new Set<Promise<unknown>>();

  /**
   * Resolves once no shader compilation is in flight. Scenes are disposed only after this:
   * three's asynchronous compile keeps polling its programs and would never finish (and would
   * spam the console) if they were deleted underneath it.
   */
  async compileIdle(): Promise<void> {
    while (this.compiling.size > 0) await Promise.allSettled([...this.compiling]);
  }

  private pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioCap) * this.resolutionScale;
  }

  readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // Keep a comfortable horizontal field of view in portrait.
    this.baseFov = this.camera.aspect < 1 ? 82 : 72;
    this.camera.fov = this.baseFov * (1 - 0.09 * this.focusLevel);
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio());
      this.composer.setSize(w, h);
    }
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const raw = (now - this.last) / 1000;
      const dt = Math.min(0.1, raw);
      this.last = now;
      this.trackFps(raw);
      this.onFrame?.(dt, this.time);
      const t0 = performance.now();
      this.render();
      const ms = performance.now() - t0;
      // Development aid: frames that stall (usually a shader compiled on first use).
      if (import.meta.env.DEV && ms > 300) console.warn(`[engine] slow frame ${Math.round(ms)}ms`);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  render(): void {
    if (this.composer && this.renderPass) {
      this.renderPass.scene = this.scene;
      if (this.gtao) this.gtao.scene = this.scene;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Adaptive resolution: if the frame rate sags, render fewer pixels before touching anything else. */
  private trackFps(dt: number): void {
    // Ignore one-off stalls (asset generation, tab switches); only sustained slowness counts.
    if (dt <= 0 || dt > 0.25) return;
    this.fpsWindow.push(dt);
    if (this.fpsWindow.length < 120) return;
    const avg = this.fpsWindow.reduce((s, x) => s + x, 0) / this.fpsWindow.length;
    this.fpsWindow = [];
    this.fps = Math.round(1 / avg);
    if (!this.autoQuality) return;
    if (this.fps < 38 && this.resolutionScale > 0.75) {
      this.resolutionScale = Math.max(0.75, this.resolutionScale - 0.1);
      this.resize();
    } else if (this.fps > 57 && this.resolutionScale < 1) {
      this.resolutionScale = Math.min(1, this.resolutionScale + 0.1);
      this.resize();
    }
  }

  info(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
