import * as THREE from 'three';
import { GAME_CONFIG } from '@/config/gameConfig';
import { CREATURE_TEXT, SPECIAL_TEXT } from '@/content/he/creatures';
import { THEME_TEXT } from '@/content/he/environments';
import { fill, g } from '@/content/he/gender';
import { UI } from '@/content/he/ui';
import { flushPendingSubmissions, leaderboard, queueSubmission, type RunSubmission } from '@/services/leaderboard';
import { KEYS, playerId, recentQuestions, rememberQuestions, storage, uuid } from '@/services/storage';
import { CLOCK_PHASES, IN_RUN_PHASES, MOVEMENT_PHASES } from '@/state/machine';
import { getState, machine, useStore, type CoachKey } from '@/state/store';
import { THEME_IDS, type AgeGroup, type PresentedQuestion, type QualityLevel, type ThemeId } from '@/types';
import { dampAngle } from '@/utils/math';
import { Rng, randomSeed } from '@/utils/rng';
import { audio, type MusicIntensity, type Surface } from '../audio/AudioEngine';
import type { EncounterRuntime, SpecialRuntime } from '../creatures/CreatureManager';
import { CreatureManager } from '../creatures/CreatureManager';
import { CREATURE_VOICES } from '../creatures/voices';
import { RouteHint } from '../creatures/RouteHint';
import { Treasures } from '../effects/Treasures';
import { BIOME_NEIGHBOURS, biomeWeights } from '../environments/biomes';
import { THEMES, type ThemeDef } from '../environments/themes';
import { EventDirector } from '../events/EventDirector';
import { input } from '../input/InputState';
import { generateMaze } from '../maze/generator';
import { cellXY, dirToYaw, isOpen, neighbor, visibleCells, worldToCell } from '../maze/grid';
import { DIRS, DX, DY, opposite, type Maze } from '../maze/types';
import { PlayerController } from '../player/PlayerController';
import { QuestionSelector } from '../questions/selector';
import type { MazeWorld } from '../render/MazeWorld';
import { uploadTextures } from '../render/assets';
import { createEnvProbe } from '../render/envProbe';
import { MazeWorld as MazeWorldClass } from '../render/MazeWorld';
import { calculateScore, triviaPoints } from '../scoring/score';
import { RunSession, type RunSnapshot } from '../session/RunSession';
import { AttractScene } from './AttractScene';
import { Engine } from './Engine';
import { isTouchDevice, resolveQuality } from './quality';

const C = GAME_CONFIG.world.cellSize;

/** Development only: `?seed=123` reproduces a specific labyrinth. */
function devSeed(): number | null {
  if (!import.meta.env.DEV) return null;
  const s = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isInteger(s) && s > 0 ? s : null;
}

/** Development only: `?theme=castle` (and `?theme2=forest`) force biomes for visual review. */
function devTheme(param = 'theme'): ThemeId | null {
  if (!import.meta.env.DEV) return null;
  const t = new URLSearchParams(location.search).get(param) as ThemeId | null;
  return t && THEME_IDS.includes(t) ? t : null;
}

const BIOME_TMP = new THREE.Color();

/** Conversation phases framed with a gentle cinematic focus. */
const FOCUS_PHASES = new Set(['CREATURE_ENCOUNTER', 'QUESTION_ACTIVE', 'QUESTION_RESULT', 'SPECIAL_ENCOUNTER']);

/** Biomes a run can start in; the others appear as the second biome a run crosses into. */
const PRIMARY_THEMES: readonly ThemeId[] = ['ruins', 'forest', 'crystal', 'volcanic', 'temple'];

/** The biome a run crosses into (derived from the seed, so saved runs rebuild identically). */
function secondBiome(seed: number, first: ThemeId): ThemeId {
  return devTheme('theme2') ?? new Rng(seed ^ 0xb10e).pick(BIOME_NEIGHBOURS[first]);
}

interface HintState {
  hint: RouteHint;
  enc: EncounterRuntime;
  targetCell: number;
  passedAt: number | null;
}

interface RunContext {
  ageGroup: AgeGroup;
  nickname: string;
  seed: number;
  runId: string;
  startedAt: number;
  maze: Maze;
  theme: ThemeDef;
  /** The biome the run crosses into past the halfway point. */
  themeB: ThemeDef;
  world: MazeWorld;
  envProbe: THREE.WebGLRenderTarget;
  /** Player's current blend toward the second biome (smoothed). */
  biome: number;
  biomeAudio: number;
  scene: THREE.Scene;
  session: RunSession;
  player: PlayerController;
  creatures: CreatureManager;
  treasures: Treasures;
  events: EventDirector;
  selector: QuestionSelector;
  hintLight: THREE.PointLight;
  lantern: THREE.PointLight;
  hint: HintState | null;
  encounter: EncounterRuntime | null;
  question: PresentedQuestion | null;
  special: SpecialRuntime | null;
  rng: Rng;
  surface: Surface;
  timers: { at: number; fn: () => void }[];
  cinematic: { kind: 'intro' | 'victory'; t: number; from: THREE.Vector3; to: THREE.Vector3; yaw: number; pitch: number } | null;
  lifeShake: number;
  lastSave: number;
  lastHud: number;
  coach: { queue: CoachKey[]; current: CoachKey; until: number; moved: number; looked: number; done: boolean };
  exitDiscovered: boolean;
  firstNotice: boolean;
  firstResult: boolean;
  urgency: 0 | 1 | 2;
}

/**
 * Orchestrates everything: engine, title scene, runs, rules and transitions.
 * React UI talks to the game only through this object's public methods and the store.
 */
export class GameController {
  engine: Engine | null = null;
  run: RunContext | null = null;
  private attract: AttractScene | null = null;
  private attractLoading = false;
  private expectUnlock = false;
  private mounted = false;
  private time = 0;
  /** The oracle's revelation is shown on the map once the conversation ends. */
  private openMapAfterSpecial = false;

  // ── Lifecycle ────────────────────────────────────────────────────────────────────────

  mount(container: HTMLElement): void {
    if (this.mounted) return;
    this.mounted = true;
    const settings = getState().settings;
    const quality = resolveQuality(settings.quality);
    try {
      this.engine = new Engine(container, quality);
    } catch {
      useStore.setState({ webglError: true });
      return;
    }
    this.engine.autoQuality = settings.quality === 'auto';
    this.engine.onFrame = (dt, t) => this.frame(dt, t);
    this.engine.start();
    this.bindInput(this.engine.canvas);
    audio.setVolumes({ master: settings.masterVolume, music: settings.musicVolume, sfx: settings.sfxVolume, muted: settings.muted });
    useStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) this.applySettings(s.settings, prev.settings);
    });
    this.boot();
    void flushPendingSubmissions();
    if (import.meta.env.DEV) void import('./devApi').then((m) => m.installDevApi(this));
  }

  private boot(): void {
    const snap = storage.get<RunSnapshot | null>(KEYS.run, null);
    if (snap && snap.version === 1 && snap.lives > 0 && THEME_IDS.includes(snap.theme)) {
      useStore.setState({ resume: { theme: snap.theme, ageGroup: snap.ageGroup, timeLeft: snap.timeLeft, lives: snap.lives } });
      machine.transition('RESUME_PROMPT');
    } else {
      storage.remove(KEYS.run);
      machine.transition('MENU');
    }
    void this.startAttract();
  }

  private applySettings(s: ReturnType<typeof getState>['settings'], prev: ReturnType<typeof getState>['settings']): void {
    audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, muted: s.muted });
    if (s.quality !== prev.quality && this.engine) {
      this.engine.autoQuality = s.quality === 'auto';
      this.engine.setQuality(resolveQuality(s.quality));
    }
  }

  get quality(): QualityLevel {
    return this.engine?.quality ?? 'medium';
  }

  private async startAttract(): Promise<void> {
    if (!this.engine || this.attract || this.attractLoading) return;
    this.attractLoading = true;
    const seed = randomSeed();
    const themeId = devTheme() ?? new Rng(seed).pick(PRIMARY_THEMES);
    const engine = this.engine;
    const scene = await AttractScene.create(THEMES[themeId], engine.profile, seed, audio, engine.quality, (s) => engine.precompile(s));
    scene.envProbe = createEnvProbe(this.engine.renderer, scene.theme);
    scene.scene.environment = scene.envProbe.texture;
    try {
      await this.engine.precompile(scene.scene);
    } catch {
      /* shaders compile on first use instead */
    }
    this.attractLoading = false;
    if (this.run) {
      scene.dispose();
      return;
    }
    this.attract = scene;
    this.engine.setScene(scene.scene, scene.theme.exposure);
    if (audio.ready) this.startTitleAudio();
  }

  private startTitleAudio(): void {
    if (!this.attract) return;
    const theme = this.attract.theme;
    audio.startAmbience(theme.ambience);
    audio.startMusic(theme.musicMode, theme.musicRoot);
    audio.setMusicIntensity(0);
    audio.setReverb(theme.reverb);
  }

  private disposeAttract(): void {
    const scene = this.attract;
    this.attract = null;
    if (!scene) return;
    if (this.engine?.scene === scene.scene) this.engine.setScene(new THREE.Scene(), 1);
    void (this.engine?.compileIdle() ?? Promise.resolve()).then(() => scene.dispose());
  }

  /** Called on the first user gesture: browsers only allow audio after one. */
  unlockAudio(): void {
    const wasReady = audio.ready;
    audio.unlock();
    if (!wasReady && this.attract && !this.run) {
      // The context may still be resuming; start shortly.
      window.setTimeout(() => this.startTitleAudio(), 50);
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────────────────

  private bindInput(canvas: HTMLCanvasElement): void {
    const isTyping = (e: Event): boolean => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      this.unlockAudio();
      if (isTyping(e)) return;
      const phase = machine.phase;
      if (e.code === 'Escape') {
        if (phase === 'PAUSED') this.resume();
        else if (useStore.getState().mapOpen) useStore.setState({ mapOpen: false });
        else this.pause();
        return;
      }
      if (e.code === 'KeyM' && this.run && IN_RUN_PHASES.has(phase)) {
        useStore.setState({ mapOpen: !useStore.getState().mapOpen });
        return;
      }
      if (phase === 'QUESTION_ACTIVE') {
        const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(e.code);
        if (n >= 0) {
          this.answer(n % 4);
          return;
        }
      }
      if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
        if (phase === 'CREATURE_ENCOUNTER') this.showQuestion();
        else if (phase === 'QUESTION_RESULT') this.continueAfterResult();
      }
      if (import.meta.env.DEV && e.code === 'Backquote') {
        useStore.setState({ debug: useStore.getState().debug ? null : this.debugInfo() });
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      input.keyDown(e.code);
    });
    window.addEventListener('keyup', (e) => input.keyUp(e.code));
    window.addEventListener('blur', () => input.clear());
    window.addEventListener('pointerdown', () => this.unlockAudio(), { capture: true });
    document.addEventListener('mousemove', (e) => {
      if (input.pointerLocked) {
        input.lastDevice = 'keyboard';
        input.addLook(e.movementX, e.movementY);
      }
    });
    canvas.addEventListener('click', () => {
      if (MOVEMENT_PHASES.has(machine.phase)) this.requestPointer();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      input.pointerLocked = locked;
      if (!locked) {
        input.clear();
        if (!this.expectUnlock && (MOVEMENT_PHASES.has(machine.phase) || machine.phase === 'INTRO_CINEMATIC')) this.pause();
      }
      this.expectUnlock = false;
      this.updatePointerHint();
    });
    document.addEventListener('visibilitychange', () => {
      audio.setHidden(document.hidden);
      if (document.hidden) {
        this.saveSnapshot();
        if (this.run && CLOCK_PHASES.has(machine.phase)) this.pause();
      }
    });
    window.addEventListener('pagehide', () => this.saveSnapshot());
    window.addEventListener('online', () => void flushPendingSubmissions());
  }

  private get isTouch(): boolean {
    return getState().isTouch || isTouchDevice();
  }

  requestPointer(): void {
    if (this.isTouch || !this.engine) return;
    const canvas = this.engine.canvas;
    if (document.pointerLockElement === canvas) return;
    try {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => this.updatePointerHint());
    } catch {
      /* the browser may refuse (e.g. right after Esc); the click-to-play hint covers it */
    }
  }

  private releasePointer(): void {
    if (document.pointerLockElement) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }

  private updatePointerHint(): void {
    const show = !this.isTouch && !!this.run && MOVEMENT_PHASES.has(machine.phase) && !input.pointerLocked;
    if (getState().pointerHint !== show) useStore.setState({ pointerHint: show });
  }

  // ── Runs ─────────────────────────────────────────────────────────────────────────────

  async startNewRun(seed?: number): Promise<void> {
    this.unlockAudio();
    const { ageGroup, nickname } = getState();
    storage.remove(KEYS.run);
    if (!machine.transition('LOADING')) return;
    await this.buildRun({ ageGroup, nickname, seed: seed ?? devSeed() ?? randomSeed() }, null);
    this.startIntro();
  }

  async resumeSaved(): Promise<void> {
    this.unlockAudio();
    const snap = storage.get<RunSnapshot | null>(KEYS.run, null);
    if (!snap) {
      machine.transition('MENU');
      return;
    }
    getState().setSetup(snap.ageGroup, snap.nickname);
    if (!machine.transition('LOADING')) return;
    await this.buildRun({ ageGroup: snap.ageGroup, nickname: snap.nickname, seed: snap.seed }, snap);
    const r = this.run as RunContext;
    r.player.teleport(snap.position.x, snap.position.z, snap.position.yaw);
    machine.transition('PLAYING');
    useStore.setState({ resume: null });
    this.toast(UI.toast.checkpoint, 'checkpoint');
    this.updatePointerHint();
  }

  discardSaved(): void {
    storage.remove(KEYS.run);
    useStore.setState({ resume: null });
    machine.transition('MENU');
  }

  private async buildRun(setup: { ageGroup: AgeGroup; nickname: string; seed: number }, snap: RunSnapshot | null): Promise<void> {
    const engine = this.engine as Engine;
    this.disposeRun();
    this.disposeAttract();
    audio.stopMusic(1);
    audio.stopAmbience();
    const maze = generateMaze(setup.seed, setup.ageGroup);
    const rng = new Rng(setup.seed ^ 0x7a3c19);
    const randomTheme = rng.pick(PRIMARY_THEMES);
    const themeId: ThemeId = snap?.theme ?? devTheme() ?? randomTheme;
    const theme = THEMES[themeId];
    const themeB = THEMES[secondBiome(setup.seed, themeId)];
    const text = THEME_TEXT[themeId];
    useStore.setState({ loading: { progress: 0.05, themeName: text.name, lore: text.lore }, encounter: null, special: null, summary: null, mapOpen: false, exitDiscovered: false, coach: null });
    const progress = (p: number): void => {
      const l = getState().loading;
      if (l) useStore.setState({ loading: { ...l, progress: p } });
    };
    // Start sculpting the cast on worker threads right away; it overlaps everything below.
    const weights = biomeWeights(maze.distFromStart, maze.exit);
    const cast = CreatureManager.begin(maze, (c) => ((weights[c] as number) > 0.5 ? themeB : theme), rng.fork('creatures'), {
      quality: engine.quality,
      // Only the nearest creatures hold up the start; the rest are sculpted while the player explores.
      eager: 2,
    });
    const world = await MazeWorldClass.build(maze, theme, engine.profile, (p) => progress(p * 0.7), themeB);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.fogColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    const envProbe = createEnvProbe(engine.renderer, theme);
    scene.environment = envProbe.texture;
    scene.add(world.group);
    const creaturesReady = CreatureManager.place(cast, world.collision, world, (p) => progress(0.7 + p * 0.2), async () => {
      await engine.precompile(scene);
    });
    // The GPU compiles the world's shaders while the creatures finish.
    await uploadTextures(engine.renderer, scene);
    try {
      await engine.precompile(scene);
    } catch {
      /* shaders then compile on first use */
    }
    const creatures = await creaturesReady;
    scene.add(creatures.group);
    const treasures = new Treasures(maze.treasures, (c) => world.cellCenter(c), setup.seed);
    scene.add(treasures.group);
    const events = new EventDirector(
      maze,
      theme,
      rng.fork('events'),
      audio,
      (text) => this.toast(text, 'caption', 4200),
      (amount) => {
        world.group.traverse((o) => {
          if (o instanceof THREE.HemisphereLight) o.intensity = theme.hemiIntensity * (1 - amount);
        });
      },
    );
    scene.add(events.group);
    const hintLight = new THREE.PointLight(theme.runeColor, 0, 10, 2);
    scene.add(hintLight);
    const camera = engine.camera;
    scene.add(camera);
    const lantern = new THREE.PointLight(theme.lanternColor, theme.lanternIntensity, 13, 2);
    // Held low and a little back: a point light right at the eye would blow out anything up close.
    lantern.position.set(0.25, -0.35, 0.35);
    camera.add(lantern);

    // Face down the first corridor (never into a wall).
    const firstStep = maze.solution[1];
    const startDir = DIRS.find((d) => isOpen(maze, maze.start, d) && neighbor(maze, maze.start, d) === firstStep) ?? opposite(maze.startDir);
    const startYaw = dirToYaw(startDir);
    const session = snap ? RunSession.restore(snap) : new RunSession(maze.start, startYaw);
    const player = new PlayerController(camera, world.collision);
    const surface: Surface = theme.floor.pattern === 'moss' ? 'grass' : theme.floor.pattern === 'ice' ? 'snow' : theme.floor.pattern === 'cobble' ? 'gravel' : 'stone';
    player.onStep = () => audio.footstep(surface);
    const start = world.cellCenter(maze.start);
    const back = new THREE.Vector3(DX[maze.startDir], 0, DY[maze.startDir]);
    player.teleport(start.x + back.x * 0.5, start.z + back.z * 0.5, startYaw);
    const selector = new QuestionSelector(setup.ageGroup, rng.fork('questions'), recentQuestions());
    if (snap) selector.markUsed(snap.usedQuestionIds);

    const settings = getState().settings;
    this.run = {
      ageGroup: setup.ageGroup,
      nickname: setup.nickname,
      seed: setup.seed,
      runId: snap?.runId ?? uuid(),
      startedAt: snap?.startedAt ?? Date.now(),
      maze,
      theme,
      themeB,
      world,
      envProbe,
      biome: 0,
      biomeAudio: 0,
      scene,
      session,
      player,
      creatures,
      treasures,
      events,
      selector,
      hintLight,
      lantern,
      hint: null,
      encounter: null,
      question: null,
      special: null,
      rng,
      surface,
      timers: [],
      cinematic: null,
      lifeShake: 0,
      lastSave: 0,
      lastHud: 0,
      coach: { queue: [], current: null, until: 0, moved: 0, looked: 0, done: settings.tutorialSeen || !!snap },
      exitDiscovered: false,
      firstNotice: false,
      firstResult: false,
      urgency: 0,
    };

    if (snap) {
      for (const e of creatures.encounters) {
        const answered = session.answered.get(e.site.cell);
        if (answered !== undefined) {
          e.state = 'done';
          e.correct = answered;
          if (!answered) e.creature.setMood('aloof');
        }
      }
      for (const s of creatures.specials) if (session.specialsUsed.has(s.site.cell)) s.used = true;
      treasures.sync((c) => session.isTreasureCollected(c));
      this.run.exitDiscovered = session.mapRevealed.has(maze.exit);
      useStore.setState({ exitDiscovered: this.run.exitDiscovered });
    }
    this.revealAround(session.currentCell);

    // Compile every shader before the first frame, in parallel and without freezing the page
    // (Direct3D-backed browsers compile slowly; a blocking first render could stall for seconds).
    progress(0.94);
    await uploadTextures(engine.renderer, scene);
    try {
      await engine.precompile(scene);
    } catch {
      /* not fatal: shaders then compile on first use */
    }

    engine.setScene(scene, theme.exposure);
    audio.setReverb(theme.reverb);
    audio.startAmbienceMix(theme.ambience, themeB.ambience);
    audio.startMusic(theme.musicMode, theme.musicRoot);
    audio.setMusicIntensity(0);
    useStore.setState({ loading: null });
    this.pushHud(true);
  }

  private disposeRun(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    r.creatures.stop();
    r.lantern.removeFromParent();
    // Stop drawing the old run straight away (its resources are released below).
    if (this.engine?.scene === r.scene) this.engine.setScene(new THREE.Scene(), 1);
    // GPU resources go once no shader compile still references them.
    void (this.engine?.compileIdle() ?? Promise.resolve()).then(() => {
      r.hint?.hint.dispose();
      r.events.dispose();
      r.creatures.dispose();
      r.treasures.dispose();
      r.world.dispose();
      r.envProbe.dispose();
      r.scene.clear();
    });
  }

  private startIntro(): void {
    const r = this.run as RunContext;
    const reduced = getState().settings.reducedMotion;
    machine.transition('INTRO_CINEMATIC');
    const text = THEME_TEXT[r.theme.id];
    useStore.setState({ introCard: { name: text.name, lore: text.lore } });
    const from = new THREE.Vector3(r.player.x, GAME_CONFIG.player.eyeHeight, r.player.z);
    const fwd = r.player.forward();
    const to = from.clone().addScaledVector(fwd, reduced ? 0 : 1.4);
    r.cinematic = { kind: 'intro', t: 0, from, to, yaw: r.player.yaw, pitch: 0.05 };
    r.world.gate.setClosed(0);
    this.after(reduced ? 0.8 : 2.4, () => {
      audio.play('gate');
      if (!reduced) r.lifeShake = 0.25;
    });
  }

  private finishIntro(): void {
    const r = this.run as RunContext;
    const c = r.cinematic;
    if (c) r.player.teleport(c.to.x, c.to.z, c.yaw);
    r.cinematic = null;
    r.world.gate.setClosed(1);
    useStore.setState({ introCard: null });
    if (machine.phase === 'PAUSED') return;
    machine.transition('PLAYING');
    this.requestPointer();
    this.updatePointerHint();
    if (!r.coach.done) this.coachQueue(['move']);
  }

  // ── Frame ────────────────────────────────────────────────────────────────────────────

  private frame(dt: number, t: number): void {
    this.time = t;
    const engine = this.engine as Engine;
    const settings = getState().settings;
    if (!this.run) {
      if (this.attract) this.attract.update(dt, t, engine.camera, engine.viewportHeight, settings.reducedMotion);
      return;
    }
    const r = this.run;
    const phase = machine.phase;
    const reduced = settings.reducedMotion;

    // Deferred actions.
    for (const timer of [...r.timers]) {
      if (t >= timer.at) {
        r.timers.splice(r.timers.indexOf(timer), 1);
        timer.fn();
      }
    }

    // Cinematics (brief, optional, and the only time the camera moves on its own).
    if (r.cinematic && phase !== 'PAUSED') {
      this.updateCinematic(dt, reduced);
    } else if (phase !== 'PAUSED' && phase !== 'LIFE_LOST' && phase !== 'VICTORY') {
      const canMove = MOVEMENT_PHASES.has(phase);
      const canLook = canMove || (this.isTouch && (phase === 'QUESTION_RESULT' || phase === 'CREATURE_ENCOUNTER'));
      r.player.shake.set(0, 0, 0);
      const shakeAmt = reduced ? 0 : Math.max(r.lifeShake, r.events.shake) * 0.06;
      if (shakeAmt > 0) r.player.shake.set((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
      const beforeYaw = r.player.yaw;
      const beforePitch = r.player.pitch;
      r.player.update(dt, t, input, canMove, canLook, settings);
      if (!r.coach.done) {
        r.coach.looked += Math.abs(r.player.yaw - beforeYaw) + Math.abs(r.player.pitch - beforePitch);
      }
    }
    r.lifeShake = Math.max(0, r.lifeShake - dt);

    // Clock.
    const clockRuns = CLOCK_PHASES.has(phase) && !(GAME_CONFIG.pauseTimerDuringQuestions && phase === 'QUESTION_ACTIVE');
    for (const ev of r.session.tick(dt, clockRuns)) this.onSessionEvent(ev);

    // World interactions (only while the player is walking).
    if (MOVEMENT_PHASES.has(machine.phase)) this.updateExploration(t);

    // Route hint lifecycle.
    this.updateHint(dt, t);

    // Living world.
    const cam = engine.camera;
    r.world.update(dt, t, cam, engine.viewportHeight);
    this.updateBiome(dt);
    engine.setFocus(!reduced && FOCUS_PHASES.has(machine.phase) ? 1 : 0, dt);
    r.creatures.update(dt, t, cam.position, reduced);
    r.treasures.update(dt, t);
    const camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    r.events.update(dt, t, cam.position, camDir, !MOVEMENT_PHASES.has(machine.phase), reduced);
    r.lantern.intensity = r.theme.lanternIntensity * (0.94 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 13.1) * 0.03);

    this.updateMusic();
    this.updateCoach(t);
    if (t - r.lastHud > 0.2) {
      r.lastHud = t;
      this.pushHud();
    }
    if (t - r.lastSave > 4 && IN_RUN_PHASES.has(machine.phase) && machine.phase !== 'VICTORY') {
      r.lastSave = t;
      this.saveSnapshot();
    }
    if (getState().debug && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) useStore.setState({ debug: this.debugInfo() });
  }

  /** Fog, sky light, exposure, lantern and soundscape follow the biome the player is in. */
  private updateBiome(dt: number): void {
    const r = this.run as RunContext;
    if (r.themeB === r.theme) return;
    const cell = worldToCell(r.maze, r.player.x, r.player.z);
    const target = r.world.biomeW[cell] ?? 0;
    const prev = r.biome;
    r.biome += (target - r.biome) * Math.min(1, dt * 0.5);
    if (Math.abs(r.biome - prev) < 1e-4 && r.biome !== 0) return;
    const k = r.biome;
    const a = r.theme;
    const b = r.themeB;
    const fog = r.scene.fog as THREE.FogExp2;
    fog.color.setHex(a.fogColor).lerp(BIOME_TMP.setHex(b.fogColor), k);
    fog.density = a.fogDensity + (b.fogDensity - a.fogDensity) * k;
    (r.scene.background as THREE.Color).copy(fog.color);
    r.world.setBiomeBlend(k);
    r.lantern.color.setHex(a.lanternColor).lerp(BIOME_TMP.setHex(b.lanternColor), k);
    r.lantern.intensity = a.lanternIntensity + (b.lanternIntensity - a.lanternIntensity) * k;
    (this.engine as Engine).renderer.toneMappingExposure = a.exposure + (b.exposure - a.exposure) * k;
    if (Math.abs(k - r.biomeAudio) > 0.04) {
      r.biomeAudio = k;
      audio.setAmbienceMix(k);
      audio.setReverb(a.reverb + (b.reverb - a.reverb) * k);
    }
  }

  private updateCinematic(dt: number, reduced: boolean): void {
    const r = this.run as RunContext;
    const c = r.cinematic as NonNullable<RunContext['cinematic']>;
    const duration = c.kind === 'intro' ? (reduced ? 1.4 : 3.6) : reduced ? 2.0 : 3.4;
    c.t = Math.min(1, c.t + dt / duration);
    const e = c.t * c.t * (3 - 2 * c.t);
    const pos = c.from.clone().lerp(c.to, e);
    if (!reduced && c.kind === 'intro') pos.y += Math.sin(c.t * Math.PI) * 0.05;
    const pitch = c.kind === 'intro' ? c.pitch * (1 - e) : c.pitch * e;
    r.player.applyCamera(pos, c.yaw, pitch);
    if (c.kind === 'intro') {
      r.world.gate.setClosed(Math.max(0, Math.min(1, (c.t - 0.62) / 0.2)));
      if (c.t >= 1) this.finishIntro();
    } else if (c.t >= 1) {
      r.cinematic = null;
      this.finishVictory();
    }
  }

  private updateExploration(t: number): void {
    const r = this.run as RunContext;
    const { player, session, maze } = r;
    const cell = worldToCell(maze, player.x, player.z);
    if (cell !== session.currentCell) {
      session.enterCell(cell);
      this.revealAround(cell);
      if (maze.checkpointCells.includes(cell) && session.checkpoint.cell !== cell) {
        session.reachCheckpoint(cell, player.yaw);
        audio.play('checkpoint');
        this.toast(UI.toast.checkpoint, 'checkpoint');
      }
    }
    if (!r.coach.done) r.coach.moved = player.distance;

    // Treasures.
    const tcell = r.treasures.nearby(player.x, player.z, GAME_CONFIG.treasures.pickupDistance);
    if (tcell !== null && session.collectTreasure(tcell)) {
      r.treasures.collect(tcell);
      audio.play('treasure');
      this.toast(fill(UI.toast.treasure, { name: r.treasures.nameOf(tcell) }), 'treasure');
    }

    // Creatures notice the player…
    for (const e of r.creatures.updateNotice(player.x, player.z, cell)) {
      audio.play('notice', { pitch: CREATURE_VOICES[e.creatureId].pitch / 300 });
      if (!r.firstNotice) {
        r.firstNotice = true;
        if (!r.coach.done) this.coachQueue(['creatureAhead'], true);
      }
    }
    // …and speak when the player reaches their junction.
    const fwd = player.forward();
    const trigger = r.creatures.findTrigger(player.x, player.z, cell, fwd.x, fwd.z);
    if (trigger?.kind === 'start') {
      this.beginEncounter(trigger.e);
      return;
    }
    if (trigger?.kind === 'call') {
      audio.play('notice', { pitch: CREATURE_VOICES[trigger.e.creatureId].pitch / 300 });
      this.toast(`${CREATURE_TEXT[trigger.e.creatureId].name}: ${UI.encounter.callOut}`, 'speech', 3000);
    }
    const special = r.creatures.nearestSpecial(player.x, player.z, 2.5);
    if (special) {
      this.beginSpecial(special);
      return;
    }
    // Answered creatures greet returning players briefly (non-blocking).
    for (const e of r.creatures.encounters) {
      if (e.state !== 'done' || t - e.lastRevisit < 25 || r.hint?.enc === e) continue;
      if (Math.hypot(e.creature.home.x - player.x, e.creature.home.z - player.z) < 3.2) {
        e.lastRevisit = t;
        this.toast(`${CREATURE_TEXT[e.creatureId].name}: ${r.creatures.line(e, 'revisit', getState().settings.address)}`, 'speech', 3500);
      }
    }
    // Victory: step into the light of the opened exit.
    const exit = r.world.exit;
    if (Math.hypot(exit.position.x - player.x, exit.position.z - player.z) < 1.9 && exit.open > 0.55) this.startVictory();
  }

  private revealAround(cell: number): void {
    const r = this.run as RunContext;
    for (const c of visibleCells(r.maze, cell)) r.session.mapRevealed.add(c);
    if (!r.exitDiscovered && r.session.mapRevealed.has(r.maze.exit)) {
      r.exitDiscovered = true;
      useStore.setState({ exitDiscovered: true });
      this.toast(UI.toast.exitSeen, 'info');
    }
  }

  private onSessionEvent(ev: 'tension' | 'urgent' | 'lifeLost' | 'gameOver'): void {
    const r = this.run as RunContext;
    if (ev === 'tension') {
      r.urgency = 1;
      this.toast(UI.toast.tension, 'warning');
    } else if (ev === 'urgent') {
      r.urgency = 2;
      this.toast(UI.toast.urgent, 'warning');
    } else if (ev === 'lifeLost') {
      this.onLifeLost(false);
    } else {
      this.onLifeLost(true);
    }
  }

  // ── Encounters ───────────────────────────────────────────────────────────────────────

  private beginEncounter(e: EncounterRuntime): void {
    const r = this.run as RunContext;
    if (!machine.transition('CREATURE_ENCOUNTER')) return;
    r.hint?.hint.dismiss();
    r.encounter = e;
    e.state = 'engaged';
    this.releasePointer();
    input.clear();
    e.creature.setMood('talk');
    e.creature.speaking = true;
    const address = getState().settings.address;
    const line = r.creatures.line(e, 'greet', address);
    const text = CREATURE_TEXT[e.creatureId];
    useStore.setState({
      encounter: {
        creatureId: e.creatureId,
        name: text.name,
        title: text.title,
        line,
        question: null,
        selected: null,
        result: null,
        points: 0,
        routePhrase: null,
        progress: e.index / Math.max(1, r.maze.encounters.length),
      },
    });
    const seconds = Math.min(3.2, Math.max(1.4, line.length * 0.045));
    audio.speak(CREATURE_VOICES[e.creatureId], seconds);
    this.after(seconds + 0.5, () => this.showQuestion());
  }

  showQuestion(): void {
    const r = this.run;
    if (!r?.encounter || machine.phase !== 'CREATURE_ENCOUNTER') return;
    const e = r.encounter;
    const total = Math.max(1, r.maze.encounters.length - 1);
    const q = r.selector.next(e.site.order / total);
    r.question = q;
    e.creature.speaking = false;
    machine.transition('QUESTION_ACTIVE');
    const ask = r.creatures.line(e, 'ask', getState().settings.address);
    const cur = getState().encounter;
    if (cur) useStore.setState({ encounter: { ...cur, line: ask, question: q } });
  }

  answer(index: number): void {
    const r = this.run;
    if (!r?.encounter || !r.question || machine.phase !== 'QUESTION_ACTIVE') return;
    const e = r.encounter;
    const q = r.question;
    const correct = index === q.correctIndex;
    const address = getState().settings.address;
    r.session.recordAnswer(e.site.cell, q.question.id, q.question.difficulty, correct);
    rememberQuestions([q.question.id]);
    e.state = 'done';
    e.correct = correct;
    machine.transition('QUESTION_RESULT');
    let line: string;
    let routePhrase: string | null = null;
    let points: number;
    if (correct) {
      points = triviaPoints(q.question.difficulty);
      audio.play('correct');
      e.creature.setMood('happy');
      routePhrase = this.routePhrase(e);
      line = `${r.creatures.line(e, 'correct', address)} ${r.creatures.line(e, 'hint', address, { dir: routePhrase })}`;
      // The creature reveals the way — physically and magically. The player still walks there.
      this.after(0.9, () => this.startHint(e));
    } else {
      points = -GAME_CONFIG.scoring.wrongAnswerPenalty;
      audio.play('wrong');
      e.creature.setMood('sad');
      line = r.creatures.line(e, 'wrong', address);
      this.after(2.6, () => {
        if (e.creature.mood === 'sad') e.creature.setMood('aloof');
      });
    }
    e.creature.speaking = true;
    audio.speak(CREATURE_VOICES[e.creatureId], Math.min(2.5, line.length * 0.035));
    this.after(2.2, () => {
      e.creature.speaking = false;
    });
    // Major encounters are checkpoints.
    if (r.session.reachCheckpoint(e.site.cell, r.player.yaw)) {
      this.after(0.6, () => {
        audio.play('checkpoint');
        this.toast(UI.toast.checkpoint, 'checkpoint');
      });
    }
    const cur = getState().encounter;
    if (cur) useStore.setState({ encounter: { ...cur, selected: index, result: correct ? 'correct' : 'wrong', points, line, routePhrase } });
    this.pushHud(true);
  }

  /** Verbal direction relative to where the player is currently looking. */
  private routePhrase(e: EncounterRuntime): string {
    const r = this.run as RunContext;
    const dw = r.world.doorways.get(`${e.site.cell}:${e.site.correctDir}`);
    const target = dw ? dw.center : r.world.cellCenter(neighbor(r.maze, e.site.cell, e.site.correctDir));
    const vx = target.x - r.player.x;
    const vz = target.z - r.player.z;
    const fx = -Math.sin(r.player.yaw);
    const fz = -Math.cos(r.player.yaw);
    const rx = Math.cos(r.player.yaw);
    const rz = -Math.sin(r.player.yaw);
    const f = vx * fx + vz * fz;
    const s = vx * rx + vz * rz;
    if (f > Math.abs(s)) return UI.route.ahead;
    if (-f > Math.abs(s)) return UI.route.behind;
    return s > 0 ? UI.route.right : UI.route.left;
  }

  private startHint(e: EncounterRuntime): void {
    const r = this.run;
    if (!r) return;
    const dw = r.world.doorways.get(`${e.site.cell}:${e.site.correctDir}`);
    if (!dw?.glow) return;
    r.hint?.hint.dispose();
    e.creature.pointTarget = dw.center.clone();
    e.creature.setMood('point');
    const from = e.creature.worldPosition.clone();
    from.y = e.creature.rig.flying ? Math.max(1.4, from.y) : Math.min(1.6, e.creature.rig.height * 0.75);
    const hint = new RouteHint(from, dw, e.creature.rig.magic, r.hintLight, r.world.quality.particleScale);
    r.scene.add(hint.group);
    r.hint = { hint, enc: e, targetCell: neighbor(r.maze, e.site.cell, e.site.correctDir), passedAt: null };
    audio.play('magic');
  }

  private updateHint(dt: number, t: number): void {
    const r = this.run as RunContext;
    const h = r.hint;
    if (!h) return;
    const engine = this.engine as Engine;
    h.hint.update(dt, t, engine.viewportHeight);
    const cell = worldToCell(r.maze, r.player.x, r.player.z);
    if (cell === h.targetCell && h.passedAt === null) h.passedAt = t;
    const a = cellXY(r.maze, cell);
    const b = cellXY(r.maze, h.enc.site.cell);
    const far = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > GAME_CONFIG.encounter.hintClearDistanceCells;
    if ((h.passedAt !== null && t - h.passedAt > 4) || h.hint.seconds > GAME_CONFIG.encounter.hintDurationSec || far) h.hint.dismiss();
    if (h.hint.finished) {
      h.hint.dispose();
      h.enc.creature.returnHome();
      r.hint = null;
      if (machine.phase === 'ROUTE_HINT') machine.transition('PLAYING');
    }
  }

  continueAfterResult(): void {
    const r = this.run;
    if (!r?.encounter || machine.phase !== 'QUESTION_RESULT') return;
    const e = r.encounter;
    r.encounter = null;
    r.question = null;
    useStore.setState({ encounter: null });
    if (e.correct && r.hint) {
      machine.transition('ROUTE_HINT');
    } else {
      machine.transition('PLAYING');
    }
    if (!r.firstResult) {
      r.firstResult = true;
      if (!r.coach.done) {
        this.coachQueue([e.correct ? 'followLight' : 'ownWay'], true);
        this.after(25, () => this.coachQueue(['map']));
      }
    }
    this.requestPointer();
    this.updatePointerHint();
  }

  // ── Special encounters ───────────────────────────────────────────────────────────────

  private beginSpecial(s: SpecialRuntime): void {
    const r = this.run as RunContext;
    if (!machine.transition('SPECIAL_ENCOUNTER')) return;
    r.special = s;
    s.used = true;
    r.session.specialsUsed.add(s.site.cell);
    this.releasePointer();
    input.clear();
    s.creature.setMood('talk');
    const t = SPECIAL_TEXT[s.site.kind];
    const address = getState().settings.address;
    const canAccept = s.site.kind === 'oracle' || r.session.treasureCount >= 2;
    useStore.setState({
      special: { kind: s.site.kind, name: t.name, title: t.title, line: g(t.offer, address), canAccept, resolved: false },
    });
    audio.speak({ pitch: s.site.kind === 'oracle' ? 200 : 260, speed: 9, wave: 'triangle', formant: 1100 }, 2.4);
  }

  resolveSpecial(accept: boolean): void {
    const r = this.run;
    const view = getState().special;
    if (!r?.special || !view || view.resolved) return;
    const s = r.special;
    const t = SPECIAL_TEXT[s.site.kind];
    let line: string = accept ? t.accepted : t.declined;
    if (accept && s.site.kind === 'oracle') {
      r.session.addSpecialPoints(-100);
      this.oracleReveal();
      audio.play('magic');
      this.toast(UI.toast.mapRevealed, 'info');
      this.openMapAfterSpecial = true;
    } else if (accept && s.site.kind === 'merchant') {
      if (r.session.tradeTreasuresForTime(2, 60)) {
        audio.play('chime');
        this.toast(UI.special.merchantDone, 'info');
      } else {
        line = g(UI.special.notEnough, getState().settings.address);
      }
    }
    s.creature.setMood(accept ? 'happy' : 'idle');
    useStore.setState({ special: { ...view, line, resolved: true } });
    this.pushHud(true);
  }

  continueAfterSpecial(): void {
    const r = this.run;
    if (!r || machine.phase !== 'SPECIAL_ENCOUNTER') return;
    r.special?.creature.setMood('idle');
    r.special = null;
    useStore.setState({ special: null, mapOpen: this.openMapAfterSpecial || getState().mapOpen });
    this.openMapAfterSpecial = false;
    machine.transition('PLAYING');
    this.requestPointer();
    this.updatePointerHint();
  }

  /** The oracle reveals most of the shortest route from here, and the exit. */
  private oracleReveal(): void {
    const r = this.run as RunContext;
    const { maze, session } = r;
    let c = worldToCell(maze, r.player.x, r.player.z);
    const steps = Math.ceil((maze.distToExit[c] as number) * 0.75);
    for (let i = 0; i < steps && c !== maze.exit; i++) {
      for (const v of visibleCells(maze, c, 1)) session.mapRevealed.add(v);
      const target = (maze.distToExit[c] as number) - 1;
      const next = [0, 1, 2, 3].map((d) => neighbor(maze, c, d as 0)).find((n, d) => (maze.open[c] as number) & (1 << d) && maze.distToExit[n] === target);
      if (next === undefined) break;
      c = next;
    }
    for (const v of visibleCells(maze, maze.exit, 2)) session.mapRevealed.add(v);
    if (!r.exitDiscovered) {
      r.exitDiscovered = true;
      useStore.setState({ exitDiscovered: true });
    }
  }

  // ── Life loss, game over, victory ────────────────────────────────────────────────────

  private closeInteractions(): void {
    const r = this.run as RunContext;
    if (r.encounter) {
      // An unanswered question can be asked again later.
      if (r.encounter.state === 'engaged') r.creatures.reset(r.encounter);
      r.encounter = null;
      r.question = null;
    }
    if (r.special) {
      r.special.creature.setMood('idle');
      r.special = null;
    }
    r.hint?.hint.dismiss();
    useStore.setState({ encounter: null, special: null });
  }

  private onLifeLost(final: boolean): void {
    const r = this.run as RunContext;
    this.closeInteractions();
    machine.transition('LIFE_LOST');
    audio.play('lifeLost');
    r.urgency = 0;
    if (!getState().settings.reducedMotion) r.lifeShake = 0.8;
    useStore.setState({ lifeLostRemaining: r.session.lives, mapOpen: false });
    this.releasePointer();
    this.pushHud(true);
    if (final) {
      this.after(2.6, () => this.gameOver());
      return;
    }
    this.after(3.4, () => {
      const cp = r.session.checkpoint;
      const spawn = r.world.safeSpawn(cp.cell);
      r.player.teleport(spawn.x, spawn.z, cp.yaw);
      r.treasures.sync((c) => r.session.isTreasureCollected(c));
      machine.transition('CHECKPOINT');
      this.after(1.4, () => {
        if (machine.phase !== 'CHECKPOINT') return;
        machine.transition('PLAYING');
        this.updatePointerHint();
      });
    });
    this.saveSnapshot();
  }

  private gameOver(): void {
    const r = this.run as RunContext;
    machine.transition('GAME_OVER');
    audio.stingerOnly('gameOver');
    audio.stopMusic(2);
    storage.remove(KEYS.run);
    useStore.setState({ summary: this.buildSummary(false) });
    r.session.finished = true;
  }

  /** Public for the development test API; in play it is triggered by reaching the open exit. */
  startVictory(): void {
    const r = this.run as RunContext;
    if (!machine.transition('VICTORY')) return;
    r.session.finished = true;
    this.closeInteractions();
    this.releasePointer();
    audio.play('portal');
    audio.play('victory');
    audio.stopAmbience();
    const exit = r.world.exit;
    const from = r.player.camera.position.clone();
    const to = exit.position.clone().addScaledVector(exit.inward, 0.2).setY(GAME_CONFIG.player.eyeHeight + 0.1);
    const yaw = Math.atan2(-(exit.position.x - from.x), -(exit.position.z - from.z));
    r.cinematic = { kind: 'victory', t: 0, from, to, yaw: dampAngle(r.player.yaw, yaw, 100, 1), pitch: 0.12 };
    storage.remove(KEYS.run);
  }

  private finishVictory(): void {
    const r = this.run as RunContext;
    audio.stopMusic(3);
    // Rest the camera inside the labyrinth, gazing at the open, glowing exit behind the summary.
    const exit = r.world.exit;
    // Stay inside the exit cell (always open floor) so the view can't end up inside a wall.
    const pos = exit.position.clone().addScaledVector(exit.inward, 1.7).setY(1.5);
    const yaw = Math.atan2(-(exit.position.x - pos.x), -(exit.position.z - pos.z));
    r.player.applyCamera(pos, yaw, 0.12);
    const summary = this.buildSummary(true);
    // Personal best per age group.
    const bests = storage.get<Record<string, number>>(KEYS.personalBest, {});
    const prev = bests[r.ageGroup] ?? 0;
    if (summary.breakdown.total > prev) {
      bests[r.ageGroup] = summary.breakdown.total;
      storage.set(KEYS.personalBest, bests);
      summary.personalBest = prev > 0;
    }
    useStore.setState({ summary });
    machine.transition('SCORE_SUMMARY');
  }

  private buildSummary(victory: boolean): NonNullable<ReturnType<typeof getState>['summary']> {
    const r = this.run as RunContext;
    const s = r.session;
    const breakdown = calculateScore({
      answers: s.answers,
      treasures: s.treasureCount,
      livesLost: s.livesLost,
      livesRemaining: s.lives,
      timeLeftSec: s.timeLeft,
      victory,
      optimalPathCells: r.maze.solution.length - 1,
      walkedCells: s.walkedCells,
      specialPoints: s.specialPoints,
    });
    let submission: RunSubmission | null = null;
    if (victory) {
      submission = {
        runId: r.runId,
        playerId: playerId(),
        nickname: r.nickname || UI.setup.anonymous,
        ageGroup: r.ageGroup,
        seed: r.seed,
        theme: r.theme.id,
        startedAt: r.startedAt,
        completedAt: Date.now(),
        completionTimeSec: Math.round(s.elapsed * 10) / 10,
        score: breakdown.total,
        answers: s.answers.map((a) => ({ difficulty: a.difficulty, correct: a.correct })),
        livesLost: s.livesLost,
        livesRemaining: s.lives,
        timeLeftSec: s.timeLeft,
        treasures: s.treasureCount,
        specialPoints: s.specialPoints,
        optimalPathCells: r.maze.solution.length - 1,
        walkedCells: s.walkedCells,
        encounterCount: r.maze.encounters.length,
        treasureCount: r.maze.treasures.length,
      };
    }
    return {
      victory,
      breakdown,
      questions: s.answers.length,
      timeSec: s.elapsed,
      livesLost: s.livesLost,
      treasures: s.treasureCount,
      submission,
      submitState: 'idle',
      rank: null,
      personalBest: false,
      ageGroup: r.ageGroup,
    };
  }

  async submitScore(): Promise<void> {
    const summary = getState().summary;
    if (!summary?.submission || summary.submitState === 'submitting' || summary.submitState === 'done') return;
    useStore.setState({ summary: { ...summary, submitState: 'submitting' } });
    const res = await leaderboard.submit(summary.submission);
    const cur = getState().summary;
    if (!cur) return;
    if (res.status === 'ok') useStore.setState({ summary: { ...cur, submitState: 'done', rank: res.rank ?? null } });
    else if (res.status === 'rejected') useStore.setState({ summary: { ...cur, submitState: 'rejected' } });
    else {
      queueSubmission(summary.submission);
      useStore.setState({ summary: { ...cur, submitState: 'failed' } });
    }
  }

  // ── Pause & menus ────────────────────────────────────────────────────────────────────

  pause(): void {
    if (!this.run) return;
    const phase = machine.phase;
    if (!(CLOCK_PHASES.has(phase) || phase === 'INTRO_CINEMATIC')) return;
    if (machine.transition('PAUSED', { push: true })) {
      input.clear();
      this.saveSnapshot();
      this.releasePointer();
      this.updatePointerHint();
    }
  }

  resume(): void {
    if (machine.phase !== 'PAUSED') return;
    machine.back('PLAYING');
    if (MOVEMENT_PHASES.has(machine.phase)) this.requestPointer();
    this.updatePointerHint();
  }

  openOverlay(phase: 'SETTINGS' | 'HOW_TO_PLAY' | 'LEADERBOARD'): void {
    machine.transition(phase, { push: true });
  }

  closeOverlay(): void {
    machine.back(this.run && machine.phase !== 'LEADERBOARD' ? 'PAUSED' : 'MENU');
  }

  quitToMenu(): void {
    storage.remove(KEYS.run);
    this.disposeRun();
    audio.stopMusic(1);
    audio.stopAmbience();
    useStore.setState({ encounter: null, special: null, summary: null, introCard: null, mapOpen: false, coach: null, pointerHint: false, loading: null });
    machine.reset('MENU');
    void this.startAttract();
  }

  playAgain(): void {
    if (machine.phase === 'SCORE_SUMMARY' || machine.phase === 'GAME_OVER') void this.startNewRun();
  }

  toggleMap(): void {
    useStore.setState({ mapOpen: !getState().mapOpen });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────────────

  after(seconds: number, fn: () => void): void {
    this.run?.timers.push({ at: this.time + seconds, fn });
  }

  private toast(text: string, kind: Parameters<ReturnType<typeof getState>['pushToast']>[1] = 'info', ttl?: number): void {
    getState().pushToast(text, kind, ttl);
  }

  private pushHud(force = false): void {
    const r = this.run;
    if (!r) return;
    const s = r.session;
    const live = calculateScore({
      answers: s.answers,
      treasures: s.treasureCount,
      livesLost: s.livesLost,
      livesRemaining: s.lives,
      timeLeftSec: 0,
      victory: false,
      optimalPathCells: 1,
      walkedCells: 1,
      specialPoints: s.specialPoints,
    }).total;
    const urgency: 0 | 1 | 2 = s.timeLeft <= GAME_CONFIG.urgentThresholdSec ? 2 : s.timeLeft <= GAME_CONFIG.tensionThresholdSec ? 1 : 0;
    const hud = { timeLeft: s.timeLeft, lives: s.lives, treasures: s.treasureCount, score: live, urgency };
    const prev = getState().hud;
    if (force || prev.timeLeft !== hud.timeLeft || prev.lives !== hud.lives || prev.treasures !== hud.treasures || prev.score !== hud.score) {
      useStore.setState({ hud });
    }
    // Soft ticking in the final seconds.
    if (urgency === 2 && CLOCK_PHASES.has(machine.phase) && Math.ceil(s.timeLeft) !== Math.ceil(s.timeLeft + 0.2)) audio.play('tick');
  }

  private updateMusic(): void {
    const r = this.run as RunContext;
    const phase = machine.phase;
    let level: MusicIntensity = 0;
    if (phase === 'CREATURE_ENCOUNTER' || phase === 'QUESTION_ACTIVE' || phase === 'QUESTION_RESULT' || phase === 'SPECIAL_ENCOUNTER') level = 1;
    if (r.session.timeLeft <= GAME_CONFIG.tensionThresholdSec) level = 2;
    if (r.session.timeLeft <= GAME_CONFIG.urgentThresholdSec) level = 3;
    audio.setMusicIntensity(level);
  }

  private coachQueue(keys: CoachKey[], urgent = false): void {
    const r = this.run;
    if (!r || r.coach.done) return;
    r.coach.queue = urgent ? [...keys, ...r.coach.queue] : [...r.coach.queue, ...keys];
    if (urgent) r.coach.until = 0;
  }

  private updateCoach(t: number): void {
    const r = this.run as RunContext;
    const c = r.coach;
    if (c.done) return;
    const phase = machine.phase;
    if (!MOVEMENT_PHASES.has(phase)) {
      if (getState().coach !== null) useStore.setState({ coach: null });
      return;
    }
    // Completion conditions for interactive steps.
    if (c.current === 'move' && c.moved > 2.5) {
      c.current = null;
      this.coachQueue(['look', 'sprint', 'explore'], true);
    } else if (c.current === 'look' && c.looked > 0.8) {
      c.current = null;
    } else if (c.current && c.current !== 'move' && c.current !== 'look' && t > c.until) {
      if (c.current === 'map') {
        c.done = true;
        getState().updateSettings({ tutorialSeen: true });
      }
      c.current = null;
    }
    if (!c.current && c.queue.length > 0) {
      let next = c.queue.shift() ?? null;
      if (next === 'sprint' && this.isTouch) next = c.queue.shift() ?? null;
      if (next === 'look' && c.looked > 0.8) next = c.queue.shift() ?? null;
      c.current = next;
      c.until = t + (next === 'explore' ? 7 : 6);
    }
    if (getState().coach !== c.current) useStore.setState({ coach: c.current });
  }

  saveSnapshot(): void {
    const r = this.run;
    if (!r || r.session.finished || !IN_RUN_PHASES.has(machine.phase) || machine.phase === 'INTRO_CINEMATIC') return;
    const snap = r.session.snapshot({
      seed: r.seed,
      ageGroup: r.ageGroup,
      theme: r.theme.id,
      nickname: r.nickname,
      runId: r.runId,
      startedAt: r.startedAt,
      usedQuestionIds: r.selector.usedIds,
      position: { x: r.player.x, z: r.player.z, yaw: r.player.yaw },
    });
    storage.set(KEYS.run, snap);
  }

  /** Data for the magical map (read every frame by the minimap canvas). */
  mapData(): { maze: Maze; revealed: Set<number>; visited: Set<number>; player: { x: number; z: number; yaw: number }; encounters: { cell: number; state: string; correct: boolean | null }[]; checkpoint: number; exitKnown: boolean; specials: { cell: number; used: boolean }[] } | null {
    const r = this.run;
    if (!r) return null;
    return {
      maze: r.maze,
      revealed: r.session.mapRevealed,
      visited: r.session.visited,
      player: { x: r.player.x / C, z: r.player.z / C, yaw: r.player.yaw },
      encounters: r.creatures.encounters.map((e) => ({ cell: e.site.cell, state: e.state, correct: e.correct })),
      checkpoint: r.session.checkpoint.cell,
      exitKnown: r.exitDiscovered,
      specials: r.creatures.specials.map((s) => ({ cell: s.site.cell, used: s.used })),
    };
  }

  debugInfo(): NonNullable<ReturnType<typeof getState>['debug']> {
    const r = this.run;
    const info = this.engine?.info() ?? { calls: 0, triangles: 0 };
    return {
      fps: this.engine?.fps ?? 0,
      seed: r?.seed ?? 0,
      x: r ? Math.round(r.player.x * 10) / 10 : 0,
      z: r ? Math.round(r.player.z * 10) / 10 : 0,
      cell: r ? worldToCell(r.maze, r.player.x, r.player.z) : -1,
      questionId: r?.question?.question.id ?? '',
      drawCalls: info.calls,
      triangles: info.triangles,
    };
  }

}

export const game = new GameController();
