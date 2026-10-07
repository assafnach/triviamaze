import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { uiSound } from '../hooks';

/** Left-to-right isolate for numbers, clocks and signed values inside RTL text. */
export function Num({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <bdi dir="ltr" className={`num ${className ?? ''}`}>
      {children}
    </bdi>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  children,
  onClick,
  className,
  icon,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className ?? ''}`}
      onMouseEnter={() => uiSound.hover()}
      onClick={(e) => {
        uiSound.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {icon ? <span className="btn-icon" aria-hidden="true">{icon}</span> : null}
      <span className="btn-label">{children}</span>
    </button>
  );
}

export function Panel({
  children,
  className,
  title,
  titleId,
  wide,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  titleId?: string;
  wide?: boolean;
}): React.JSX.Element {
  return (
    <section className={`panel ${wide ? 'panel-wide' : ''} ${className ?? ''}`} aria-labelledby={titleId}>
      <span className="panel-corner tl" aria-hidden="true" />
      <span className="panel-corner tr" aria-hidden="true" />
      <span className="panel-corner bl" aria-hidden="true" />
      <span className="panel-corner br" aria-hidden="true" />
      {title ? (
        <h2 className="panel-title" id={titleId}>
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/** Full-screen modal layer for menus; the 3D world stays visible behind it. */
export function Screen({ children, label, className, dim = true }: { children: ReactNode; label: string; className?: string; dim?: boolean }): React.JSX.Element {
  return (
    <div className={`screen ${dim ? 'screen-dim' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }): React.JSX.Element {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => {
          uiSound.click();
          onChange(e.target.checked);
        }}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

export function Slider({ value, onChange, label, min = 0, max = 1, step = 0.05, format }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; format?: (v: number) => string }): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        dir="rtl"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format ? format(value) : `${Math.round(pct)}%`}
      />
      <Num className="slider-value">{format ? format(value) : `${Math.round(pct)}%`}</Num>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => {
            uiSound.click();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
