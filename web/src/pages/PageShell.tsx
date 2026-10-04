import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useUi } from '../context/UiContext';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { Footer } from '../shell/Footer';
import { useVersion } from '../hooks/useVersion';
import { useT } from '../i18n';

/** Page chrome for everything that isn't the shelf/room home: back button, title, hint. */
export function PageShell({ title, hint, backLabel, to, children }: { title: string; hint?: string; backLabel?: string; to?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const ui = useUi();
  const mobile = useIsMobile();
  const { version } = useVersion();
  const t = useT();

  return (
    <>
      <div style={st('display:flex;align-items:center;gap:10px')}>
        <button
          type="button"
          onClick={() => {
            ui.selectGame(null);
            if (to) navigate(to);
            else navigate(-1);
          }}
          aria-label={t('common.back')}
          style={st('width:40px;height:40px;flex-shrink:0;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);font-size:20px;line-height:1;padding:0 0 2px')}
        >
          ‹
        </button>
        <span style={st('font:600 14px var(--font-ui);color:var(--muted)')}>{backLabel ?? t('common.back')}</span>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:8px')}>
        <h1 style={st(`margin:0;font:700 ${mobile ? 34 : 44}px/1.05 var(--font-display);letter-spacing:-0.03em;text-wrap:balance`)}>{title}</h1>
        {hint && <span style={st('font:400 14px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty;max-width:640px')}>{hint}</span>}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:22px')}>{children}</div>
      <Footer version={version} />
    </>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <span style={st('font:600 16px var(--font-display)')}>{children}</span>;
}

export function StatTiles({ stats, columns = 3 }: { stats: { v: string | number; l: string }[]; columns?: number }) {
  return (
    <div style={st(`display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:8px`)}>
      {stats.map((s) => (
        <div key={s.l} style={st('display:flex;flex-direction:column;gap:4px;padding:14px 12px;border-radius:18px;background:var(--surf);min-width:0')}>
          <span style={st('font:700 28px var(--font-display);letter-spacing:-0.02em;overflow:hidden;text-overflow:ellipsis')}>{s.v}</span>
          <span style={st('font:400 12px/1.35 var(--font-ui);color:var(--muted)')}>{s.l}</span>
        </div>
      ))}
    </div>
  );
}
