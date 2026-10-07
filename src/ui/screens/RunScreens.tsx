import { useEffect, useState } from 'react';
import { UI } from '@/content/he/ui';
import { game } from '@/game/core/GameController';
import { leaderboard, type LeaderboardEntry } from '@/services/leaderboard';
import { machine, useStore, type SummaryData } from '@/state/store';
import { AGE_GROUPS, type AgeGroup } from '@/types';
import { formatClock, formatNumber } from '@/utils/math';
import { Button, Num, Panel, Screen, Segmented, Slider, Toggle } from '../components/common';
import { IconCheck, IconCross, IconHeart, IconStar } from '../components/icons';
import { useAutoFocus, useT } from '../hooks';

export function PauseMenu(): React.JSX.Element {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const ref = useAutoFocus<HTMLDivElement>();
  return (
    <Screen label={UI.pause.title}>
      <Panel title={UI.pause.title} titleId="pause-title">
        <div className="menu" ref={ref}>
          {confirm ? (
            <>
              <p className="panel-lead">{t(UI.pause.quitConfirm)}</p>
              <Button variant="danger" onClick={() => game.quitToMenu()}>
                {UI.pause.quitYes}
              </Button>
              <Button variant="primary" onClick={() => setConfirm(false)} data-autofocus>
                {UI.pause.quitNo}
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={() => game.resume()} data-autofocus>
                {UI.pause.resume}
              </Button>
              <Button onClick={() => game.openOverlay('SETTINGS')}>{UI.pause.settings}</Button>
              <Button onClick={() => game.openOverlay('HOW_TO_PLAY')}>{UI.pause.howTo}</Button>
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                {UI.pause.quit}
              </Button>
            </>
          )}
        </div>
      </Panel>
    </Screen>
  );
}

export function SettingsScreen(): React.JSX.Element {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  const [tutorialReset, setTutorialReset] = useState(false);
  const ref = useAutoFocus<HTMLDivElement>();
  const S = UI.settings;
  return (
    <Screen label={S.title}>
      <Panel title={S.title} titleId="settings-title" wide className="settings">
        <div className="settings-grid" ref={ref}>
          <section aria-labelledby="set-audio">
            <h3 id="set-audio">{S.audio}</h3>
            <Slider label={S.master} value={s.masterVolume} onChange={(v) => update({ masterVolume: v })} />
            <Slider label={S.music} value={s.musicVolume} onChange={(v) => update({ musicVolume: v })} />
            <Slider label={S.sfx} value={s.sfxVolume} onChange={(v) => update({ sfxVolume: v })} />
            <Toggle label={S.mute} checked={s.muted} onChange={(v) => update({ muted: v })} />
          </section>
          <section aria-labelledby="set-gfx">
            <h3 id="set-gfx">{S.graphics}</h3>
            <Segmented
              label={S.graphics}
              value={s.quality}
              onChange={(v) => update({ quality: v })}
              options={(['auto', 'low', 'medium', 'high', 'ultra'] as const).map((q) => ({ value: q, label: S.quality[q] }))}
            />
            <h3>{S.controls}</h3>
            <Slider label={S.mouseSensitivity} value={s.mouseSensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => update({ mouseSensitivity: v })} format={(v) => `×${v.toFixed(2)}`} />
            <Slider label={S.touchSensitivity} value={s.touchSensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => update({ touchSensitivity: v })} format={(v) => `×${v.toFixed(2)}`} />
          </section>
          <section aria-labelledby="set-a11y">
            <h3 id="set-a11y">{S.accessibility}</h3>
            <Toggle label={S.reducedMotion} hint={S.reducedMotionHint} checked={s.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
            <Toggle label={S.showMinimap} checked={s.showMinimap} onChange={(v) => update({ showMinimap: v })} />
            <div className="field">
              <span className="field-label">{S.address}</span>
              <Segmented
                label={S.address}
                value={s.address}
                onChange={(v) => update({ address: v })}
                options={[
                  { value: 'm', label: UI.setup.addressM },
                  { value: 'f', label: UI.setup.addressF },
                ]}
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                update({ tutorialSeen: false });
                setTutorialReset(true);
              }}
            >
              {S.resetTutorial}
            </Button>
            {tutorialReset ? (
              <small className="field-hint" role="status">
                {S.tutorialReset}
              </small>
            ) : null}
          </section>
        </div>
        <div className="panel-actions">
          <Button variant="primary" onClick={() => game.closeOverlay()} data-autofocus>
            {UI.common.back}
          </Button>
        </div>
      </Panel>
    </Screen>
  );
}

export function LifeLostOverlay({ checkpoint }: { checkpoint: boolean }): React.JSX.Element {
  const remaining = useStore((s) => s.lifeLostRemaining);
  return (
    <div className={`lifelost ${checkpoint ? 'lifelost-out' : ''}`} role="alert" aria-live="assertive">
      <div className="lifelost-vortex" aria-hidden="true" />
      {!checkpoint ? (
        <div className="lifelost-content">
          <h2>{UI.lifeLost.title}</h2>
          <p>{UI.lifeLost.subtitle}</p>
          {remaining > 0 ? (
            <>
              <div className="lifelost-hearts" aria-label={UI.hud.livesAria.replace('{n}', String(remaining))}>
                {Array.from({ length: 3 }, (_, i) => (
                  <IconHeart key={i} size={34} filled={i < remaining} className={i === remaining ? 'heart-breaking' : ''} />
                ))}
              </div>
              <p className="lifelost-remaining">{remaining === 1 ? UI.lifeLost.remainingOne : UI.lifeLost.remaining.replace('{n}', String(remaining))}</p>
              <p className="lifelost-note">{UI.lifeLost.treasuresLost}</p>
              <p className="lifelost-note">{UI.lifeLost.returning}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatGrid({ summary }: { summary: SummaryData }): React.JSX.Element {
  const S = UI.summary;
  const items: [string, React.ReactNode][] = [
    [S.questionsAnswered, <Num>{summary.questions}</Num>],
    [S.correct, <span className="stat-ok"><IconCheck size={16} /> <Num>{summary.breakdown.correct}</Num></span>],
    [S.wrong, <span className="stat-no"><IconCross size={16} /> <Num>{summary.breakdown.wrong}</Num></span>],
    [S.timeSurvived, <Num>{formatClock(summary.timeSec)}</Num>],
    [S.livesLost, <Num>{summary.livesLost}</Num>],
    [S.treasuresFound, <Num>{summary.treasures}</Num>],
  ];
  return (
    <dl className="stat-grid">
      {items.map(([label, value]) => (
        <div key={label} className="stat">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Breakdown({ summary }: { summary: SummaryData }): React.JSX.Element {
  const b = summary.breakdown;
  const L = UI.summary.breakdown;
  const rows: [string, number][] = [
    [L.trivia, b.trivia],
    [L.timeBonus, b.timeBonus],
    [L.livesBonus, b.livesBonus],
    [L.treasures, b.treasures],
    [L.efficiency, b.efficiency],
    [L.penalties, b.penalties],
  ];
  return (
    <table className="breakdown">
      <tbody>
        {rows.map(([label, v]) => (
          <tr key={label} className={v < 0 ? 'neg' : v === 0 ? 'zero' : ''}>
            <th scope="row">{label}</th>
            <td>
              <Num>{v < 0 ? `−${formatNumber(-v)}` : formatNumber(v)}</Num>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{L.total}</th>
          <td>
            <Num>{formatNumber(b.total)}</Num>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function GameOverScreen(): React.JSX.Element {
  const t = useT();
  const summary = useStore((s) => s.summary);
  const ref = useAutoFocus<HTMLDivElement>();
  return (
    <Screen label={t(UI.gameOver.title)} className="gameover-screen">
      <Panel wide className="end-panel">
        <div ref={ref}>
          <h2 className="end-title end-title-dark">{t(UI.gameOver.title)}</h2>
          <p className="end-subtitle">{UI.gameOver.subtitle}</p>
          {summary ? (
            <div className="end-body">
              <StatGrid summary={summary} />
              <Breakdown summary={summary} />
            </div>
          ) : null}
          <div className="panel-actions">
            <Button variant="primary" onClick={() => game.playAgain()} data-autofocus>
              {UI.gameOver.retry}
            </Button>
            <Button onClick={() => game.quitToMenu()}>{UI.gameOver.menu}</Button>
            <Button variant="ghost" onClick={() => game.openOverlay('LEADERBOARD')}>
              {UI.gameOver.leaderboard}
            </Button>
          </div>
        </div>
      </Panel>
    </Screen>
  );
}

export function VictoryOverlay(): React.JSX.Element {
  const t = useT();
  return (
    <div className="victory-light" aria-live="assertive">
      <div className="victory-rays" aria-hidden="true" />
      <div className="victory-text">
        <h2>{UI.victory.title}</h2>
        <p>{t(UI.victory.subtitle)}</p>
      </div>
    </div>
  );
}

export function ScoreSummary(): React.JSX.Element {
  const t = useT();
  const summary = useStore((s) => s.summary);
  const nickname = useStore((s) => s.nickname);
  const ref = useAutoFocus<HTMLDivElement>();
  if (!summary) return <></>;
  const S = UI.summary;
  const submitLabel =
    summary.submitState === 'submitting'
      ? S.submitting
      : summary.submitState === 'done'
        ? S.submitted
        : summary.submitState === 'failed'
          ? S.submitFailed
          : summary.submitState === 'rejected'
            ? S.submitRejected
            : S.submit;
  return (
    <Screen label={summary.victory ? UI.victory.title : S.title} className="summary-screen">
      <Panel wide className="end-panel">
        <div ref={ref}>
          {summary.victory ? (
            <>
              <div className="end-stars" aria-hidden="true">
                <IconStar size={26} />
                <IconStar size={36} />
                <IconStar size={26} />
              </div>
              <h2 className="end-title">{UI.victory.title}</h2>
              <p className="end-subtitle">{t(UI.victory.subtitle)}</p>
            </>
          ) : (
            <h2 className="end-title">{S.title}</h2>
          )}
          {summary.personalBest ? <p className="badge">{S.newBest}</p> : null}
          <div className="end-body">
            <StatGrid summary={summary} />
            <Breakdown summary={summary} />
          </div>
          {summary.submission ? (
            <div className="submit-row">
              <p className="submit-as">
                {nickname || UI.setup.anonymous} · {UI.age.groups[summary.ageGroup].name} <Num>{UI.age.groups[summary.ageGroup].label}</Num>
              </p>
              <Button
                variant={summary.submitState === 'done' ? 'ghost' : 'secondary'}
                disabled={summary.submitState === 'submitting' || summary.submitState === 'done' || summary.submitState === 'rejected'}
                onClick={() => void game.submitScore()}
              >
                {submitLabel}
              </Button>
              {summary.rank ? <p className="rank" role="status">{S.rank.replace('{n}', String(summary.rank))}</p> : null}
            </div>
          ) : null}
          <div className="panel-actions">
            <Button variant="primary" onClick={() => game.playAgain()} data-autofocus>
              {S.playAgain}
            </Button>
            <Button onClick={() => game.openOverlay('LEADERBOARD')}>{S.leaderboard}</Button>
            <Button variant="ghost" onClick={() => game.quitToMenu()}>
              {S.menu}
            </Button>
          </div>
        </div>
      </Panel>
    </Screen>
  );
}

export function LeaderboardScreen(): React.JSX.Element {
  const t = useT();
  const defaultAge = useStore((s) => s.summary?.ageGroup ?? s.ageGroup);
  const [age, setAge] = useState<AgeGroup>(defaultAge);
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ref = useAutoFocus<HTMLDivElement>();
  const L = UI.leaderboard;
  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(false);
    leaderboard
      .list(age, 50)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [age, attempt]);
  const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
  };
  return (
    <Screen label={L.title}>
      <Panel title={L.title} titleId="lb-title" wide className="leaderboard">
        <div ref={ref}>
          <p className="panel-lead">
            {L.subtitle} · <span className="lb-kind">{leaderboard.kind === 'online' ? L.onlineNote : L.localNote}</span>
          </p>
          <div className="tabs" role="tablist" aria-label={L.title}>
            {AGE_GROUPS.map((a) => (
              <button
                key={a}
                role="tab"
                type="button"
                aria-selected={a === age}
                className={a === age ? 'active' : ''}
                onClick={() => setAge(a)}
                data-autofocus={a === age ? true : undefined}
              >
                <Num>{UI.age.groups[a].label}</Num>
              </button>
            ))}
          </div>
          <div className="lb-body" role="tabpanel">
            {error ? (
              <div className="lb-empty">
                <p>{L.unavailable}</p>
                <Button variant="ghost" onClick={() => setAttempt((x) => x + 1)}>
                  {L.retry}
                </Button>
              </div>
            ) : rows === null ? (
              <p className="lb-empty">{UI.common.loading}</p>
            ) : rows.length === 0 ? (
              <p className="lb-empty">{t(L.empty)}</p>
            ) : (
              <table className="lb-table">
                <thead>
                  <tr>
                    <th scope="col">{L.columns.rank}</th>
                    <th scope="col">{L.columns.nickname}</th>
                    <th scope="col">{L.columns.score}</th>
                    <th scope="col" className="hide-sm">{L.columns.correct}</th>
                    <th scope="col">{L.columns.time}</th>
                    <th scope="col" className="hide-sm">{L.columns.livesLost}</th>
                    <th scope="col" className="hide-sm">{L.columns.date}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={r.isMine ? 'mine' : ''}>
                      <td>
                        <span className={`rank-badge r${i + 1}`}>
                          <Num>{i + 1}</Num>
                        </span>
                      </td>
                      <td className="lb-nick">
                        <bdi>{r.nickname}</bdi>
                      </td>
                      <td>
                        <Num>{formatNumber(r.score)}</Num>
                      </td>
                      <td className="hide-sm">
                        <Num>{r.correct}</Num>
                      </td>
                      <td>
                        <Num>{formatClock(r.completionTimeSec)}</Num>
                      </td>
                      <td className="hide-sm">
                        <Num>{r.livesLost}</Num>
                      </td>
                      <td className="hide-sm">
                        <Num>{fmtDate(r.createdAt)}</Num>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="panel-actions">
            <Button variant="primary" onClick={() => (machine.phase === 'LEADERBOARD' ? game.closeOverlay() : undefined)}>
              {UI.common.back}
            </Button>
          </div>
        </div>
      </Panel>
    </Screen>
  );
}
