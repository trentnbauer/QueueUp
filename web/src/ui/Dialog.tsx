import { createContext, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { closeOnBackdropMouseDown, useModalA11y } from '../hooks/useModalA11y';
import { useIsMobile, useKeyboardInset } from './useLayout';
import { st } from './st';
import { t } from '../i18n';

// Nested dialogs (e.g. the barcode scanner opened over Add game) stack above their parent.
const DepthContext = createContext(0);

// How many dialogs are open right now (across the whole app), so a new one can sit above them all.
let openDialogCount = 0;

// Several dialogs can be open at once (a game card and the review sheet it opens). Each one used to
// save and restore body overflow on its own, so closing them in a different order than they opened
// restored "hidden" last and left the page unable to scroll. One shared count avoids that: the page
// unlocks only when the last dialog closes.
let scrollLocks = 0;
let scrollBefore = '';

export function lockPageScroll(): () => void {
  if (scrollLocks === 0) {
    scrollBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = scrollBefore;
  };
}

interface DialogProps {
  onClose: () => void;
  /** Plain-text title (rendered in the standard header) - or pass `header` for a custom one. */
  title?: string;
  /** Custom header content placed to the left of the close button (replaces `title`). */
  header?: ReactNode;
  /** Optional back button shown before the title. */
  onBack?: () => void;
  /** Desktop width in px (mobile sheets are always full width). */
  width?: number;
  /** `tall` sheets fill the viewport height on mobile (minus a 44px peek); `auto` sheets hug their
   * content. */
  height?: 'auto' | 'tall';
  /** When false the body is not wrapped in the scrolling content column - the caller lays it out. */
  padded?: boolean;
  /** Gap between body sections. */
  gap?: number;
  ariaLabel?: string;
  /** Extra styles for the scrolling body. */
  bodyStyle?: CSSProperties;
  /** Renders above the scrolling body (search boxes etc.) and does not scroll. */
  top?: ReactNode;
  /** Pinned below the scrolling body. */
  footer?: ReactNode;
  children: ReactNode;
  /** Hides the standard header entirely (caller supplies its own chrome inside `children`). */
  bare?: boolean;
  /** Alert dialogs (confirmations) use role=alertdialog. */
  alert?: boolean;
  /** Keep the dialog a centred card on phones too, instead of a bottom sheet (e.g. a video). */
  centered?: boolean;
}

const CLOSE_BTN =
  'width:36px;height:36px;flex-shrink:0;border-radius:50%;border:none;background:var(--chip);color:var(--text);font-size:18px;line-height:1';

export function CloseButton({ onClick, label = t('common.close') }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={st(CLOSE_BTN)}>
      ×
    </button>
  );
}

/** The design's dialog: a centred card on desktop, a bottom sheet on phones. One component for every
 * sheet/dialog in the app so they behave (Esc, Back, focus trap, scroll lock) and look the same. */
export function Dialog({
  onClose,
  title,
  header,
  onBack,
  width = 600,
  height = 'auto',
  padded = true,
  gap = 16,
  ariaLabel,
  bodyStyle,
  top,
  footer,
  children,
  bare,
  alert,
  centered,
}: DialogProps) {
  const mobile = useIsMobile();
  const keyboardInset = useKeyboardInset();
  const depth = useContext(DepthContext);
  const ref = useModalA11y<HTMLDivElement>(onClose);
  // Which layer this dialog sits on: one above everything already open. Dialogs opened from another
  // one are usually rendered *next to* it, not inside it, so DepthContext alone left both on the same
  // layer - the one underneath then sat above the new backdrop, un-blurred and still tappable.
  // Whichever is higher wins (nested in a parent's content, or simply opened after it).
  const layerRef = useRef<number | null>(null);
  if (layerRef.current === null) layerRef.current = openDialogCount;
  const layer = Math.max(depth, layerRef.current);
  const z = 60 + layer * 4;

  // Lock page scroll behind the dialog.
  useEffect(() => lockPageScroll(), []);
  // Count this dialog as open (layout effect so a dialog opened in the same tick sees it).
  useLayoutEffect(() => {
    openDialogCount += 1;
    return () => {
      openDialogCount -= 1;
    };
  }, []);

  const shell: CSSProperties = mobile && !centered
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        // Sits above the on-screen keyboard rather than behind it, so a search field stays visible.
        bottom: keyboardInset,
        ...(height === 'tall' ? { top: 44 } : { maxHeight: `calc(100% - 44px - ${keyboardInset}px)` }),
        borderRadius: '28px 28px 0 0',
        borderBottom: 'none',
        boxShadow: '0 -12px 40px oklch(0 0 0 / 0.35)',
        animation: 'qu-slide-up .22s cubic-bezier(.2,.8,.3,1) both',
      }
    : {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        width: `min(${width}px, calc(100% - ${mobile ? 32 : 64}px))`,
        maxHeight: 'calc(100% - 64px)',
        borderRadius: 24,
        boxShadow: '0 24px 60px oklch(0 0 0 / 0.5)',
      };

  return createPortal(
    <DepthContext.Provider value={depth + 1}>
      <div
        role="presentation"
        onMouseDown={closeOnBackdropMouseDown(onClose)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: z,
          background: 'oklch(0 0 0 / 0.5)',
          // A dialog on top of another blurs the one beneath harder, so it's clearly out of play.
          backdropFilter: layer > 0 ? 'blur(8px)' : 'blur(3px)',
          animation: 'qu-fade .18s ease both',
        }}
      />
      <div
        ref={ref}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        style={{
          zIndex: z + 1,
          background: 'var(--sheet)',
          border: '1px solid var(--chip)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text)',
          outline: 'none',
          ...shell,
        }}
      >
        {!bare && (
          <div style={st('display:flex;align-items:center;gap:10px;padding:18px 20px 12px;flex-shrink:0')}>
            {onBack && (
              <button type="button" onClick={onBack} aria-label={t('common.back')} style={st(CLOSE_BTN)}>
                ‹
              </button>
            )}
            {header ?? (
              <span style={st('flex:1;min-width:0;font:700 22px var(--font-display);letter-spacing:-0.02em')}>{title}</span>
            )}
            <CloseButton onClick={onClose} />
          </div>
        )}
        {top}
        {padded ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '4px 20px 30px',
              display: 'flex',
              flexDirection: 'column',
              gap,
              ...bodyStyle,
            }}
          >
            {children}
          </div>
        ) : (
          children
        )}
        {footer}
      </div>
    </DepthContext.Provider>,
    document.body,
  );
}
