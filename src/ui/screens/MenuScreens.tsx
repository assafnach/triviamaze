import { useEffect, useState } from 'react';
import { MAZE_PROFILES } from '@/config/gameConfig';
import { THEME_TEXT } from '@/content/he/environments';
import { LOADING_TIPS, UI } from '@/content/he/ui';
import { game } from '@/game/core/GameController';
import { validateNickname } from '@/services/nickname';
import { machine, useStore } from '@/state/store';
import { AGE_GROUPS, type AgeGroup } from '@/types';
import { formatClock } from '@/utils/math';
import { Button, Num, Panel, Screen } from '../components/common';
import { Emblem, IconBook, IconGear, IconHeart, IconPlay, IconTrophy } from '../components/icons';
import { useAutoFocus, useT } from '../hooks';

export function TitleScreen(): React.JSX.Element {
  const ref = useAutoFocus<HTMLDivElement>();
  return (
    <Screen label={UI.title} className="title-screen" dim={false}>
      <div className="title-vignette" aria-hidden="true" />
      <div className="title-wrap" ref={ref}>
        <Emblem />
        <h1 className="game-title">{UI.title}</h1>
        <p className="game-subtitle">{UI.subtitle}</p>
        <nav className="menu" aria-label={UI.title}>
          <Button variant="primary" icon={<IconPlay />} onClick={() => machine.transition('AGE_SELECTION')} data-autofocus>
            {UI.menu.start}
          </Button>
          <Button icon={<IconBook />} onClick={() => game.openOverlay('HOW_TO_PLAY')}>
            {UI.menu.howTo}
          </Button>
          <Button icon={<IconTrophy />} onClick={() => game.openOverlay('LEADERBOARD')}>
            {UI.menu.leaderboard}
          </Button>
          <Button icon={<IconGear />} onClick={() => game.openOverlay('SETTINGS')}>
            {UI.menu.settings}
          </Button>
        </nav>
        <p className="title-footer">{UI.menu.footer}</p>
      </div>
    </Screen>
  );
}

const AGE_SIGIL: Record<AgeGroup, string> = { '5-7': '✦', '8-10': '✧✦', '11-13': '✦✧✦', '14-15': '✧✦✧✦', '16+': '✦✧✦✧✦' };

export function AgeSelect(): React.JSX.Element {
  const current = useStore((s) => s.ageGroup);
  const nickname = useStore((s) => s.nickname);
  const setSetup = useStore((s) => s.setSetup);
  const ref = useAutoFocus<HTMLDivElement>();
  return (
    <Screen label={UI.age.title}>
      <Panel title={UI.age.title} titleId="age-title" wide>
        <p className="panel-lead">{UI.age.prompt}</p>
        <div className="age-grid" ref={ref} role="list">
          {AGE_GROUPS.map((age) => {
            const info = UI.age.groups[age];
            const size = MAZE_PROFILES[age].size;
            return (
              <button
                key={age}
                type="button"
                role="listitem"
                className={`age-card ${age === current ? 'selected' : ''}`}
                data-autofocus={age === current ? true : undefined}
                onClick={() => {
                  setSetup(age, nickname);
                  machine.transition('PLAYER_SETUP');
                }}
                aria-label={`${info.name} ${info.label}. ${info.hint}`}
              >
                <span className="age-sigil" aria-hidden="true">
                  {AGE_SIGIL[age]}
                </span>
                <span className="age-name">{info.name}</span>
                <Num className="age-label">{info.label}</Num>
                <span className="age-hint">{info.hint}</span>
                <span className="age-size" aria-hidden="true">
                  <Num>{`${size[1]}×${size[1]}`}</Num>
                </span>
              </button>
            );
          })}
        </div>
        <div className="panel-actions">
          <Button variant="ghost" onClick={() => machine.transition('MENU')}>
            {UI.common.back}
          </Button>
        </div>
      </Panel>
    </Screen>
  );
}

export function PlayerSetup(): React.JSX.Element {
  const t = useT();
  const ageGroup = useStore((s) => s.ageGroup);
  const saved = useStore((s) => s.nickname);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setSetup = useStore((s) => s.setSetup);
  const [nick, setNick] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const ref = useAutoFocus<HTMLDivElement>();

  const commit = (): boolean => {
    if (nick.trim() === '') {
      setSetup(ageGroup, '');
      return true;
    }
    const v = validateNickname(nick);
    if (!v.ok) {
      setError(t(UI.setup.errors[v.error]));
      return false;
    }
    setSetup(ageGroup, v.value);
    return true;
  };
  const go = (withTutorial: boolean): void => {
    if (!commit()) return;
    if (withTutorial) machine.transition('TUTORIAL');
    else void game.startNewRun();
  };

  return (
    <Screen label={UI.setup.title}>
      <Panel title={UI.setup.title} titleId="setup-title">
        <div className="setup" ref={ref}>
          <fieldset className="field">
            <legend>{UI.setup.addressLabel}</legend>
            <div className="choice-row">
              {(['m', 'f'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`choice ${settings.address === a ? 'active' : ''}`}
                  aria-pressed={settings.address === a}
                  onClick={() => updateSettings({ address: a })}
                >
                  {a === 'm' ? UI.setup.addressM : UI.setup.addressF}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="field-label">{UI.setup.nicknameLabel}</span>
            <input
              className="text-input"
              value={nick}
              dir="auto"
              maxLength={24}
              autoComplete="off"
              spellCheck={false}
              placeholder={UI.setup.nicknamePlaceholder}
              aria-invalid={!!error}
              aria-describedby="nick-hint"
              onChange={(e) => {
                setNick(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') go(!settings.tutorialSeen);
              }}
              data-autofocus
            />
            <small id="nick-hint" className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
              {error ?? UI.setup.nicknameHint}
            </small>
          </label>
          <div className="panel-actions">
            {!settings.tutorialSeen ? (
              <>
                <Button variant="primary" onClick={() => go(true)}>
                  {t(UI.setup.tutorialFirst)}
                </Button>
                <Button variant="ghost" onClick={() => go(false)}>
                  {UI.setup.skipTutorial}
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => go(false)}>
                {t(UI.setup.enter)}
              </Button>
            )}
            <Button variant="ghost" onClick={() => machine.transition('AGE_SELECTION')}>
              {UI.common.back}
            </Button>
          </div>
        </div>
      </Panel>
    </Screen>
  );
}

export function LoadingScreen(): React.JSX.Element {
  const t = useT();
  const loading = useStore((s) => s.loading);
  const [step, setStep] = useState(0);
  const [tip] = useState(() => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % UI.loading.steps.length), 900);
    return () => clearInterval(id);
  }, []);
  const pct = Math.round((loading?.progress ?? 0) * 100);
  return (
    <Screen label={UI.loading.building} className="loading-screen">
      <div className="loading" aria-live="polite">
        <p className="loading-kicker">{UI.loading.enteringTheme}</p>
        <h2 className="loading-theme">{loading?.themeName ?? UI.loading.building}</h2>
        {loading?.lore ? <p className="loading-lore">{loading.lore}</p> : null}
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="loading-step">{UI.loading.steps[step]}…</p>
        {tip ? <p className="loading-tip">{t(tip)}</p> : null}
      </div>
    </Screen>
  );
}

export function ResumePrompt(): React.JSX.Element {
  const resume = useStore((s) => s.resume);
  const ref = useAutoFocus<HTMLDivElement>();
  return (
    <Screen label={UI.resume.title}>
      <Panel title={UI.resume.title} titleId="resume-title">
        <div ref={ref}>
          {resume ? (
            <p className="panel-lead resume-details">
              {THEME_TEXT[resume.theme].name} · {UI.age.groups[resume.ageGroup].name} <Num>{UI.age.groups[resume.ageGroup].label}</Num> ·{' '}
              <Num>{formatClock(resume.timeLeft)}</Num> ·{' '}
              <span className="inline-hearts" aria-label={UI.hud.livesAria.replace('{n}', String(resume.lives))}>
                {Array.from({ length: resume.lives }, (_, i) => (
                  <IconHeart key={i} size={16} />
                ))}
              </span>
            </p>
          ) : null}
          <div className="panel-actions">
            <Button variant="primary" onClick={() => void game.resumeSaved()} data-autofocus>
              {UI.resume.continue}
            </Button>
            <Button variant="ghost" onClick={() => game.discardSaved()}>
              {UI.resume.newGame}
            </Button>
          </div>
        </div>
      </Panel>
    </Screen>
  );
}
