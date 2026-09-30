import { useUi } from '../context/UiContext';
import { st } from '../ui/st';

const LINK = 'color:var(--muted)';

/** Page footer: credit, source/issue links and the version (which opens the changelog). */
export function Footer({ version }: { version: string | null }) {
  const ui = useUi();
  return (
    <footer
      style={st('margin-top:18px;padding-top:16px;border-top:1px solid var(--chip);display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font:400 12px/1.6 var(--font-ui);color:var(--faint)')}
    >
      <span>
        Designed by{' '}
        <a href="https://trentbauer.com" target="_blank" rel="noopener noreferrer" style={st(LINK)}>
          Trent Bauer
        </a>
      </span>
      <span>·</span>
      <span>Built with Claude</span>
      <span>·</span>
      <a href="https://github.com/trentnbauer/QueueUp" target="_blank" rel="noopener noreferrer" style={st(LINK)}>
        Source
      </a>
      <span>·</span>
      <a href="https://github.com/trentnbauer/QueueUp/issues/new/choose" target="_blank" rel="noopener noreferrer" style={st(LINK)}>
        Report an issue
      </a>
      {version && (
        <>
          <span>·</span>
          <button
            type="button"
            onClick={() => ui.openDialog('changelog')}
            style={st('border:none;background:none;padding:0;color:var(--muted);font:500 12px var(--font-mono);text-decoration:underline;text-underline-offset:3px')}
          >
            {version}
          </button>
        </>
      )}
    </footer>
  );
}
