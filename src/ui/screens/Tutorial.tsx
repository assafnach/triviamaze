import { useState } from 'react';
import { TUTORIAL_CARDS, TUTORIAL_UI, type TutorialCard } from '@/content/he/tutorial';
import { UI } from '@/content/he/ui';
import { game } from '@/game/core/GameController';
import { Button, Num, Panel, Screen } from '../components/common';
import { IconCheck, IconCross, IconGem, IconHeart, IconHourglass } from '../components/icons';
import { useAutoFocus, useT } from '../hooks';

function Illustration({ icon }: { icon: TutorialCard['icon'] }): React.JSX.Element {
  switch (icon) {
    case 'maze':
      return (
        <div className="illus illus-maze" aria-hidden="true">
          <div className="keys">
            <span className="key">W</span>
            <span className="key-row">
              <span className="key">A</span>
              <span className="key">S</span>
              <span className="key">D</span>
            </span>
          </div>
          <svg viewBox="0 0 120 80" className="illus-svg">
            <path d="M10 10h100v60H10zM30 10v40h20M70 30h20v40M50 30v20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="20" cy="60" r="4" fill="#ffd27a" />
            <rect x="100" y="16" width="6" height="12" rx="2" fill="#ffe6a8" />
          </svg>
        </div>
      );
    case 'creature':
      return (
        <div className="illus" aria-hidden="true">
          <svg viewBox="0 0 120 80" className="illus-svg">
            <path d="M10 70V20h35v50M75 70V20h35v50M45 40h30" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="60" cy="52" r="10" fill="#8fd8ff" opacity=".9" />
            <circle cx="56" cy="50" r="2" fill="#0b0a12" />
            <circle cx="64" cy="50" r="2" fill="#0b0a12" />
            <path d="M52 34l8-12 8 12" fill="#6a4ad8" />
            <text x="60" y="16" textAnchor="middle" fontSize="14" fill="#ffd27a">?</text>
          </svg>
        </div>
      );
    case 'knowledge':
      return (
        <div className="illus illus-knowledge" aria-hidden="true">
          <div className="kn-row ok">
            <IconCheck size={20} />
            <svg viewBox="0 0 120 40" className="illus-svg small">
              <path d="M10 35V10h25v25M85 35V10h25v25" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M85 35V10h25v25" fill="none" stroke="#8fd8ff" strokeWidth="4" />
              <circle cx="40" cy="22" r="2" fill="#8fd8ff" />
              <circle cx="55" cy="22" r="2.5" fill="#8fd8ff" />
              <circle cx="70" cy="22" r="3" fill="#8fd8ff" />
            </svg>
          </div>
          <div className="kn-row no">
            <IconCross size={20} />
            <svg viewBox="0 0 120 40" className="illus-svg small">
              <path d="M10 35V10h25v25M85 35V10h25v25" fill="none" stroke="currentColor" strokeWidth="3" />
              <text x="60" y="27" textAnchor="middle" fontSize="16" fill="currentColor">?</text>
            </svg>
          </div>
        </div>
      );
    case 'time':
      return (
        <div className="illus illus-time" aria-hidden="true">
          <IconHourglass size={40} />
          <Num className="illus-clock">10:00</Num>
          <span className="illus-hearts">
            <IconHeart size={22} />
            <IconHeart size={22} />
            <IconHeart size={22} />
          </span>
        </div>
      );
    default:
      return (
        <div className="illus illus-score" aria-hidden="true">
          <IconGem size={34} />
          <Num className="illus-clock">2,820</Num>
        </div>
      );
  }
}

/** Short card tutorial (< 1 minute). Movement and the rest are coached in-game. */
export function Tutorial({ mode }: { mode: 'tutorial' | 'howto' }): React.JSX.Element {
  const t = useT();
  const [i, setI] = useState(0);
  const ref = useAutoFocus<HTMLDivElement>();
  const card = TUTORIAL_CARDS[i] as TutorialCard;
  const last = i === TUTORIAL_CARDS.length - 1;
  const finish = (): void => {
    if (mode === 'howto') {
      game.closeOverlay();
      return;
    }
    void game.startNewRun();
  };
  return (
    <Screen label={TUTORIAL_UI.title}>
      <Panel title={TUTORIAL_UI.title} titleId="tut-title" className="tutorial">
        <div ref={ref}>
          <div className="tut-step" aria-live="polite">
            <Illustration icon={card.icon} />
            <h3 className="tut-heading">{card.title}</h3>
            {card.lines.map((line, k) => (
              <p key={k} className={`tut-line ${card.icon === 'knowledge' ? `tut-emph tut-emph-${k}` : ''}`}>
                {t(line)}
              </p>
            ))}
          </div>
          <div className="tut-dots" aria-label={TUTORIAL_UI.step.replace('{n}', String(i + 1)).replace('{total}', String(TUTORIAL_CARDS.length))}>
            {TUTORIAL_CARDS.map((_, k) => (
              <span key={k} className={k === i ? 'on' : ''} />
            ))}
          </div>
          <div className="panel-actions">
            {last ? (
              <Button variant="primary" onClick={finish} data-autofocus>
                {mode === 'howto' ? UI.common.back : t(TUTORIAL_UI.start)}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setI(i + 1)} data-autofocus>
                {TUTORIAL_UI.next}
              </Button>
            )}
            {i > 0 ? (
              <Button variant="ghost" onClick={() => setI(i - 1)}>
                {TUTORIAL_UI.prev}
              </Button>
            ) : null}
            {!last ? (
              <Button variant="ghost" onClick={finish}>
                {mode === 'howto' ? UI.common.close : TUTORIAL_UI.skip}
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>
    </Screen>
  );
}
