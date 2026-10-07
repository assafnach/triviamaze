import { lazy, Suspense, useEffect, useRef } from 'react';
import { UI } from '@/content/he/ui';
import { game } from '@/game/core/GameController';
import { webglAvailable } from '@/game/core/quality';
import { IN_RUN_PHASES, MOVEMENT_PHASES } from '@/state/machine';
import { useStore } from '@/state/store';
import { Panel, Screen } from '@/ui/components/common';
import { Coach, EncounterPanel, Hud, IntroCard, PointerHint, SpecialPanel, Toasts } from '@/ui/hud/Hud';
import { Minimap } from '@/ui/hud/Minimap';
import { OrientationHint, TouchControls } from '@/ui/hud/TouchControls';
import { AgeSelect, LoadingScreen, PlayerSetup, ResumePrompt, TitleScreen } from '@/ui/screens/MenuScreens';
import { GameOverScreen, LeaderboardScreen, LifeLostOverlay, PauseMenu, ScoreSummary, SettingsScreen, VictoryOverlay } from '@/ui/screens/RunScreens';
import { Tutorial } from '@/ui/screens/Tutorial';

const DebugPanel = import.meta.env.DEV ? lazy(() => import('@/ui/hud/DebugPanel')) : null;

export function App(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const phase = useStore((s) => s.phase);
  const reducedMotion = useStore((s) => s.settings.reducedMotion);
  const isTouch = useStore((s) => s.isTouch);
  const webglError = useStore((s) => s.webglError);
  const urgency = useStore((s) => s.hud.urgency);
  const hasRun = IN_RUN_PHASES.has(phase) || phase === 'GAME_OVER' || phase === 'SCORE_SUMMARY';

  useEffect(() => {
    if (!webglAvailable()) {
      useStore.setState({ webglError: true });
      return;
    }
    if (containerRef.current) game.mount(containerRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);

  const showHud = IN_RUN_PHASES.has(phase) && phase !== 'INTRO_CINEMATIC' && phase !== 'VICTORY';
  const encounterPhase = phase === 'CREATURE_ENCOUNTER' || phase === 'QUESTION_ACTIVE' || phase === 'QUESTION_RESULT' || phase === 'SPECIAL_ENCOUNTER';

  return (
    <div className={`app phase-${phase.toLowerCase()} ${isTouch ? 'is-touch' : ''}`}>
      <div className="game-layer" ref={containerRef} />
      {webglError ? (
        <Screen label={UI.title}>
          <Panel title={UI.title} titleId="err-title">
            <p className="panel-lead">{UI.errors.noWebgl}</p>
          </Panel>
        </Screen>
      ) : null}

      {/* Cinematic framing during encounters (the world stays visible). */}
      <div className={`letterbox ${encounterPhase || phase === 'INTRO_CINEMATIC' ? 'on' : ''}`} aria-hidden="true" />
      {IN_RUN_PHASES.has(phase) ? <div className={`vignette urgency-${urgency}`} aria-hidden="true" /> : null}
      {MOVEMENT_PHASES.has(phase) && !isTouch ? <div className="crosshair" aria-hidden="true" /> : null}

      {showHud ? <Hud /> : null}
      {showHud ? <Minimap /> : null}
      {phase === 'INTRO_CINEMATIC' ? <IntroCard /> : null}
      {encounterPhase ? <EncounterPanel /> : null}
      {phase === 'SPECIAL_ENCOUNTER' ? <SpecialPanel /> : null}
      {hasRun && isTouch ? <TouchControls active={MOVEMENT_PHASES.has(phase) || phase === 'QUESTION_RESULT'} /> : null}
      {showHud ? <Coach /> : null}
      {showHud ? <PointerHint /> : null}
      {MOVEMENT_PHASES.has(phase) ? <OrientationHint /> : null}
      <Toasts />

      {phase === 'MENU' ? <TitleScreen /> : null}
      {phase === 'RESUME_PROMPT' ? <ResumePrompt /> : null}
      {phase === 'AGE_SELECTION' ? <AgeSelect /> : null}
      {phase === 'PLAYER_SETUP' ? <PlayerSetup /> : null}
      {phase === 'TUTORIAL' ? <Tutorial mode="tutorial" /> : null}
      {phase === 'HOW_TO_PLAY' ? <Tutorial mode="howto" /> : null}
      {phase === 'LOADING' ? <LoadingScreen /> : null}
      {phase === 'PAUSED' ? <PauseMenu /> : null}
      {phase === 'SETTINGS' ? <SettingsScreen /> : null}
      {phase === 'LIFE_LOST' || phase === 'CHECKPOINT' ? <LifeLostOverlay checkpoint={phase === 'CHECKPOINT'} /> : null}
      {phase === 'VICTORY' ? <VictoryOverlay /> : null}
      {phase === 'GAME_OVER' ? <GameOverScreen /> : null}
      {phase === 'SCORE_SUMMARY' ? <ScoreSummary /> : null}
      {phase === 'LEADERBOARD' ? <LeaderboardScreen /> : null}

      {DebugPanel ? (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      ) : null}
    </div>
  );
}
