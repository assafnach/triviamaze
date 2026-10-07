import * as THREE from 'three';
import { GAME_CONFIG, MAZE_PROFILES } from '@/config/gameConfig';
import { KEYS, storage } from '@/services/storage';
import { getState, machine } from '@/state/store';
import { dirToYaw, neighbor, worldToCell } from '../maze/grid';
import { opposite } from '../maze/types';
import type { GameController } from './GameController';

/**
 * Development-only test hooks (window.__tm). Loaded via a dynamic import guarded by
 * import.meta.env.DEV, so it is stripped from production builds entirely.
 */
export function installDevApi(gc: GameController): void {
  const api = {
    controller: gc,
    state: () => ({ phase: machine.phase, hud: getState().hud, encounter: getState().encounter }),
    teleportToEncounter: (i = 0) => {
      const r = gc.run;
      const e = r?.creatures.encounters[i];
      if (!r || !e) return false;
      const c = r.world.cellCenter(e.site.cell);
      const back = r.maze.solution.indexOf(e.site.cell) > 0 ? r.maze.solution[r.maze.solution.indexOf(e.site.cell) - 1] : undefined;
      const from = back !== undefined ? r.world.cellCenter(back) : c;
      r.player.teleport(from.x, from.z, Math.atan2(-(c.x - from.x), -(c.z - from.z)));
      return true;
    },
    /** Free camera placement for visual review (x, z in metres; yaw in radians; pitch optional). */
    teleport: (x: number, z: number, yaw: number, pitch = 0) => {
      const r = gc.run;
      if (!r) return false;
      r.player.teleport(x, z, yaw);
      r.player.pitch = pitch;
      return true;
    },
    /** Stand inside a chamber's doorway looking at its centrepiece. */
    teleportToRoom: (i = 0) => {
      const r = gc.run;
      const room = r?.maze.rooms[i];
      if (!r || !room) return false;
      const C = GAME_CONFIG.world.cellSize;
      const cx = (room.x + room.w / 2) * C;
      const cz = (room.y + room.h / 2) * C;
      const x = room.x * C + 1.0;
      const z = (room.y + room.h) * C - 1.0;
      r.player.teleport(x, z, Math.atan2(-(cx - x), -(cz - z)));
      return true;
    },
    rooms: () => gc.run?.maze.rooms,
    /** Resolves when every creature of the run has been sculpted and placed. */
    castReady: async () => {
      await gc.run?.creatures.pending;
      return gc.run?.creatures.encounters.map((e) => ({ id: e.creatureId, ready: e.ready })) ?? [];
    },
    /** Camera framing a creature from the front (for visual review). */
    frameEncounter: (i = 0, dist = 3) => {
      const r = gc.run;
      const e = r?.creatures.encounters[i];
      if (!r || !e) return null;
      const p = e.creature.worldPosition;
      const yaw = e.creature.homeYaw;
      const x = p.x + Math.sin(yaw) * dist;
      const z = p.z + Math.cos(yaw) * dist;
      r.player.teleport(x, z, Math.atan2(x - p.x, z - p.z));
      r.player.pitch = -0.08;
      return e.creatureId;
    },
    biome: () => (gc.run ? { a: gc.run.theme.id, b: gc.run.themeB.id, k: gc.run.biome } : null),
    teleportToSpecial: () => {
      const r = gc.run;
      const s = r?.maze.specials[0];
      if (!r || !s) return false;
      const c = r.world.cellCenter(neighbor(r.maze, s.cell, s.facing));
      r.player.teleport(c.x, c.z, dirToYaw(opposite(s.facing)));
      return true;
    },
    teleportToExit: () => {
      const r = gc.run;
      if (!r) return false;
      const c = r.world.cellCenter(r.maze.exit);
      r.player.teleport(c.x, c.z, dirToYaw(r.maze.exitDir));
      return true;
    },
    teleportToCheckpoint: () => {
      const r = gc.run;
      if (!r) return false;
      const c = r.world.cellCenter(r.session.checkpoint.cell);
      r.player.teleport(c.x, c.z, r.session.checkpoint.yaw);
      return true;
    },
    answerCorrect: () => {
      const q = gc.run?.question;
      if (q) gc.answer(q.correctIndex);
    },
    answerWrong: () => {
      const q = gc.run?.question;
      if (q) gc.answer((q.correctIndex + 1) % 4);
    },
    skipQuestion: () => {
      if (machine.phase === 'CREATURE_ENCOUNTER') gc.showQuestion();
    },
    expireTimer: () => {
      const r = gc.run;
      if (r) r.session.timeLeft = 0.05;
    },
    setTime: (s: number) => {
      const r = gc.run;
      if (r) r.session.timeLeft = s;
    },
    resetTimer: () => {
      const r = gc.run;
      if (r) r.session.timeLeft = GAME_CONFIG.lifeDurationSec;
    },
    addLife: () => {
      const r = gc.run;
      if (r) r.session.lives = Math.min(GAME_CONFIG.startingLives, r.session.lives + 1);
    },
    removeLife: () => {
      const r = gc.run;
      if (r) r.session.lives = Math.max(1, r.session.lives - 1);
    },
    forceVictory: () => gc.startVictory(),
    forceGameOver: () => {
      const r = gc.run;
      if (!r) return;
      r.session.lives = 1;
      r.session.timeLeft = 0.05;
    },
    regenerate: () => {
      if (gc.run) {
        storage.remove(KEYS.run);
        machine.reset('PLAYER_SETUP');
        void gc.startNewRun();
      }
    },
    maze: () => gc.run?.maze,
    profiles: MAZE_PROFILES,
    quality: () => gc.engine?.quality,
    colliders: () => gc.run?.world.collision.allBoxes().length,
    toggleColliders: () => {
      const r = gc.run;
      if (!r) return false;
      const existing = r.scene.getObjectByName('debug-colliders');
      if (existing) {
        existing.removeFromParent();
        return false;
      }
      const g = new THREE.Group();
      g.name = 'debug-colliders';
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff66, depthTest: false });
      for (const b of r.world.collision.allBoxes()) {
        const box = new THREE.Box3(new THREE.Vector3(b.minX, 0.02, b.minZ), new THREE.Vector3(b.maxX, 1.2, b.maxZ));
        const helper = new THREE.Box3Helper(box, 0x00ff66);
        helper.material = mat;
        g.add(helper);
      }
      r.scene.add(g);
      return true;
    },
    player: () => (gc.run ? { x: gc.run.player.x, z: gc.run.player.z, yaw: gc.run.player.yaw, cell: worldToCell(gc.run.maze, gc.run.player.x, gc.run.player.z) } : null),
    hint: () => (gc.run?.hint ? { target: gc.run.hint.targetCell, creature: gc.run.hint.enc.creatureId } : null),
    encounters: () => gc.run?.creatures.encounters.map((e) => ({ cell: e.site.cell, creature: e.creatureId, state: e.state, correct: e.correct, dir: e.site.correctDir })),
  };
  (window as unknown as { __tm: typeof api }).__tm = api;
}
