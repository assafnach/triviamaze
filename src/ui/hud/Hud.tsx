import { UI } from '@/content/he/ui';
import { game } from '@/game/core/GameController';
import { useStore } from '@/state/store';
import { formatClock, formatNumber } from '@/utils/math';
import { Num } from '../components/common';
import { IconGem, IconHeart, IconHourglass, IconMap, IconPause, IconSound } from '../components/icons';
import { uiSound, useT } from '../hooks';

export function Hud(): React.JSX.Element {
  const hud = useStore((s) => s.hud);
  const muted = useStore((s) => s.settings.muted);
  const update = useStore((s) => s.updateSettings);
  const clock = formatClock(hud.timeLeft);
  return (
    <div className={`hud urgency-${hud.urgency}`}>
      <div className="hud-main" role="group" aria-label={UI.hud.time}>
        <div className="hud-timer" aria-label={UI.hud.timeAria.replace('{t}', clock)}>
          <IconHourglass size={22} className="hud-hourglass" />
          <span className="hud-caption">{UI.hud.time}</span>
          <Num className="hud-clock">{clock}</Num>
        </div>
        <div className="hud-lives" aria-label={UI.hud.livesAria.replace('{n}', String(hud.lives))}>
          <span className="hud-caption">{UI.hud.lives}</span>
          <span className="hearts">
            {Array.from({ length: 3 }, (_, i) => (
              <IconHeart key={i} size={20} filled={i < hud.lives} className={i < hud.lives ? 'heart-full' : 'heart-empty'} />
            ))}
          </span>
        </div>
        <div className="hud-small">
          <span className="hud-chip" title={UI.hud.treasures}>
            <IconGem size={16} />
            <span className="sr-only">{UI.hud.treasures}</span>
            <Num>{hud.treasures}</Num>
          </span>
          <span className="hud-chip" title={UI.hud.score}>
            <span className="hud-caption">{UI.hud.score}</span>
            <Num>{formatNumber(hud.score)}</Num>
          </span>
        </div>
      </div>
      <div className="hud-buttons">
        <button type="button" className="icon-btn" aria-label={UI.hud.pause} onClick={() => game.pause()}>
          <IconPause />
        </button>
        <button type="button" className="icon-btn" aria-label={UI.hud.map} onClick={() => game.toggleMap()}>
          <IconMap />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={UI.settings.mute}
          aria-pressed={muted}
          onClick={() => {
            update({ muted: !muted });
            uiSound.click();
          }}
        >
          <IconSound muted={muted} />
        </button>
      </div>
    </div>
  );
}

export function EncounterPanel(): React.JSX.Element | null {
  const t = useT();
  const enc = useStore((s) => s.encounter);
  const phase = useStore((s) => s.phase);
  if (!enc) return null;
  const E = UI.encounter;
  const q = enc.question;
  const showResult = enc.result !== null;
  return (
    <div className="encounter" role="dialog" aria-modal="false" aria-labelledby="enc-name">
      <div className="encounter-panel">
        <header className="encounter-head">
          <div className="nameplate">
            <span className="nameplate-name" id="enc-name">
              {enc.name}
            </span>
            <span className="nameplate-title">{enc.title}</span>
          </div>
          {q ? (
            <span className="q-meta">
              {UI.encounter.difficulty[q.question.difficulty]}
            </span>
          ) : null}
        </header>
        <p className={`encounter-line ${showResult ? `line-${enc.result}` : ''}`} aria-live="polite">
          {enc.line}
        </p>
        {phase === 'CREATURE_ENCOUNTER' && !q ? (
          <button type="button" className="skip-dialog" onClick={() => game.showQuestion()}>
            {UI.common.continue} ›
          </button>
        ) : null}
        {q ? (
          <>
            <h2 className="question-text">{q.question.question}</h2>
            <div className="answers" role="group" aria-label={t(E.chooseAnswer)}>
              {q.answers.map((a, i) => {
                const isCorrect = showResult && i === q.correctIndex;
                const isWrongPick = showResult && i === enc.selected && i !== q.correctIndex;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`answer ${isCorrect ? 'answer-correct' : ''} ${isWrongPick ? 'answer-wrong' : ''} ${showResult && !isCorrect && !isWrongPick ? 'answer-dim' : ''}`}
                    disabled={showResult}
                    onClick={() => {
                      uiSound.click();
                      game.answer(i);
                    }}
                    autoFocus={i === 0 && !showResult}
                    aria-label={`${E.letters[i]}. ${a}${isCorrect ? ` — ${E.correct}` : ''}`}
                  >
                    <span className="answer-letter" aria-hidden="true">
                      {E.letters[i]}
                    </span>
                    <span className="answer-text">{a}</span>
                    <span className="answer-key" aria-hidden="true">
                      {i + 1}
                    </span>
                    {isCorrect ? (
                      <span className="answer-mark ok" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                    {isWrongPick ? (
                      <span className="answer-mark no" aria-hidden="true">
                        ✗
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {!showResult ? <p className="answers-hint">{E.keyboardHint}</p> : null}
          </>
        ) : null}
        {showResult && q ? (
          <div className={`result result-${enc.result}`} role="status">
            <div className="result-head">
              <span className="result-badge">{enc.result === 'correct' ? E.correct : E.wrong}</span>
              <Num className={`result-points ${enc.points < 0 ? 'neg' : ''}`}>{enc.points < 0 ? `−${-enc.points}` : `+${enc.points}`}</Num>
            </div>
            {enc.result === 'wrong' ? (
              <p className="result-correct-answer">
                {E.correctAnswerWas} <strong>{q.answers[q.correctIndex]}</strong>
              </p>
            ) : null}
            <p className="result-explanation">{q.question.explanation}</p>
            <button type="button" className="btn btn-primary result-continue" onClick={() => game.continueAfterResult()} autoFocus>
              <span className="btn-label">{t(E.continue)}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SpecialPanel(): React.JSX.Element | null {
  const t = useT();
  const sp = useStore((s) => s.special);
  if (!sp) return null;
  return (
    <div className="encounter" role="dialog" aria-modal="false" aria-labelledby="sp-name">
      <div className="encounter-panel special-panel">
        <header className="encounter-head">
          <div className="nameplate nameplate-special">
            <span className="nameplate-name" id="sp-name">
              {sp.name}
            </span>
            <span className="nameplate-title">{sp.title}</span>
          </div>
        </header>
        <p className="encounter-line" aria-live="polite">
          {sp.line}
        </p>
        {!sp.resolved ? (
          <>
            <p className="special-cost">{sp.kind === 'oracle' ? UI.special.oracleCost : UI.special.merchantCost}</p>
            {!sp.canAccept ? <p className="special-warn">{t(UI.special.notEnough)}</p> : null}
            <div className="panel-actions">
              <button type="button" className="btn btn-primary" disabled={!sp.canAccept} onClick={() => game.resolveSpecial(true)} autoFocus={sp.canAccept}>
                <span className="btn-label">{t(UI.special.accept)}</span>
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => game.resolveSpecial(false)} autoFocus={!sp.canAccept}>
                <span className="btn-label">{UI.special.decline}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="panel-actions">
            <button type="button" className="btn btn-primary" onClick={() => game.continueAfterSpecial()} autoFocus>
              <span className="btn-label">{t(UI.encounter.continue)}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((tt) => (
        <div key={tt.id} className={`toast toast-${tt.kind}`}>
          {tt.text}
        </div>
      ))}
    </div>
  );
}

export function Coach(): React.JSX.Element | null {
  const t = useT();
  const coach = useStore((s) => s.coach);
  const isTouch = useStore((s) => s.isTouch);
  if (!coach) return null;
  const C = UI.coach;
  const text =
    coach === 'move'
      ? t(isTouch ? C.moveTouch : C.moveDesktop)
      : coach === 'look'
        ? t(isTouch ? C.lookTouch : C.lookDesktop)
        : coach === 'sprint'
          ? t(C.sprint)
          : coach === 'explore'
            ? t(C.explore)
            : coach === 'creatureAhead'
              ? t(C.creatureAhead)
              : coach === 'followLight'
                ? t(C.followLight)
                : coach === 'ownWay'
                  ? t(C.ownWay)
                  : isTouch
                    ? null
                    : t(C.map);
  if (!text) return null;
  return (
    <div className="coach" role="status" key={coach}>
      {text}
    </div>
  );
}

export function IntroCard(): React.JSX.Element | null {
  const card = useStore((s) => s.introCard);
  if (!card) return null;
  return (
    <div className="intro-card" aria-live="polite">
      <span className="intro-rule" aria-hidden="true" />
      <h2>{card.name}</h2>
      <p>{card.lore}</p>
      <span className="intro-rule" aria-hidden="true" />
    </div>
  );
}

export function PointerHint(): React.JSX.Element | null {
  const t = useT();
  const show = useStore((s) => s.pointerHint);
  if (!show) return null;
  return (
    <div className="pointer-hint" aria-live="polite">
      <span>{t(UI.hud.clickToPlay)}</span>
    </div>
  );
}
