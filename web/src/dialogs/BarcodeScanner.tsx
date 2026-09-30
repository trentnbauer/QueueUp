import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { BarcodeGameMatch } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useModalA11y } from '../hooks/useModalA11y';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';

const REGION = 'qu-barcode-region';
const ACC = 'oklch(0.74 0.15 45)';
const CORNER = (pos: string, radius: string) =>
  `position:absolute;${pos};width:28px;height:28px;border:0 solid ${ACC};border-radius:${radius}`;

/** Full-screen, always-dark barcode scanner: live camera (UPC/EAN decoded in the browser), plus a
 * type-the-number fallback. A lookup that resolves shows the match with an Add button; a miss shows
 * an inline error and scanning resumes. */
export function BarcodeScanner({ onPick, onClose }: { onPick: (match: BarcodeGameMatch) => void; onClose: () => void }) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<BarcodeGameMatch | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const scanned = useRef(false);

  async function lookup(code: string) {
    setBusy(true);
    setMiss(null);
    setFound(null);
    try {
      const { result } = await gamesApi.barcodeLookup(code);
      if (result) setFound(result);
      else setMiss("Couldn't find that one. Try searching by name instead.");
    } catch (err) {
      setMiss(err instanceof Error ? err.message : "Couldn't look up that barcode.");
    } finally {
      setBusy(false);
      scanned.current = false;
    }
  }
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(REGION, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
      verbose: false,
    });
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (text) => {
          if (cancelled || scanned.current) return;
          scanned.current = true;
          setValue(text);
          void lookupRef.current(text);
        },
        () => {},
      )
      .then(() => !cancelled && setStarting(false))
      .catch((err) => {
        if (cancelled) return;
        setStarting(false);
        setCameraError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow it in your browser, or type the number below.'
            : 'Could not start the camera. Type the number under the barcode instead.',
        );
      });
    return () => {
      cancelled = true;
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, []);

  const digits = value.replace(/\D/g, '');
  const hint = found ? 'Found it' : cameraError ? cameraError : starting ? 'Starting camera…' : busy ? 'Looking that up…' : 'Point your camera at the barcode on the box';

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
      tabIndex={-1}
      style={st('position:fixed;inset:0;z-index:200;background:oklch(0.12 0.005 55);color:oklch(0.95 0.006 70);display:flex;flex-direction:column;outline:none')}
    >
      <div style={st('flex-shrink:0;display:flex;align-items:center;gap:12px;padding:16px 16px 10px')}>
        <span style={st('flex:1;font:700 20px var(--font-display)')}>Scan a barcode</span>
        <button type="button" onClick={onClose} aria-label="Close" style={st('width:36px;height:36px;border-radius:50%;border:none;background:oklch(1 0 0 / 0.1);color:inherit;font-size:18px;line-height:1')}>
          ×
        </button>
      </div>
      <div style={st('width:min(560px, calc(100% - 32px));margin:0 auto;display:flex;flex-direction:column;flex:1;min-height:0')}>
        <div style={st('flex-shrink:0;position:relative;margin:6px 0 0;aspect-ratio:4/3;border-radius:22px;background:oklch(0.2 0.006 55);overflow:hidden;display:flex;align-items:center;justify-content:center')}>
          <div id={REGION} style={{ position: 'absolute', inset: 0 }} />
          <div style={st('position:relative;width:74%;height:42%;pointer-events:none')}>
            <span style={st(CORNER('left:0;top:0', '8px 0 0 0'), { borderLeftWidth: 3, borderTopWidth: 3 })} />
            <span style={st(CORNER('right:0;top:0', '0 8px 0 0'), { borderRightWidth: 3, borderTopWidth: 3 })} />
            <span style={st(CORNER('left:0;bottom:0', '0 0 0 8px'), { borderLeftWidth: 3, borderBottomWidth: 3 })} />
            <span style={st(CORNER('right:0;bottom:0', '0 0 8px 0'), { borderRightWidth: 3, borderBottomWidth: 3 })} />
            <span style={st(`position:absolute;left:8%;right:8%;top:50%;height:2px;background:oklch(0.74 0.15 45 / 0.8);box-shadow:0 0 12px ${ACC}`)} />
          </div>
          <span style={st('position:absolute;bottom:14px;left:0;right:0;text-align:center;font:500 13px var(--font-ui);color:oklch(0.8 0.01 65);padding:0 16px')}>{hint}</span>
        </div>
        <div style={st('flex:1;overflow-y:auto;padding:16px 0;display:flex;flex-direction:column;gap:12px')}>
          <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:oklch(0.7 0.01 65)')}>OR TYPE THE NUMBER UNDER THE BARCODE</span>
          <div style={st('display:flex;gap:8px')}>
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setFound(null);
                setMiss(null);
              }}
              inputMode="numeric"
              placeholder="e.g. 045496590420"
              aria-label="Barcode number"
              style={st('flex:1;min-width:0;height:46px;padding:0 14px;border-radius:14px;background:oklch(0.2 0.006 55);border:1px solid oklch(1 0 0 / 0.14);color:inherit;font:500 15px var(--font-mono);outline:none')}
            />
            <button
              type="button"
              disabled={digits.length < 8 || busy}
              onClick={() => void lookup(value)}
              style={st(`height:46px;padding:0 16px;border-radius:999px;border:none;background:oklch(0.95 0.006 70);color:oklch(0.18 0.01 55);font:700 13.5px var(--font-ui);opacity:${digits.length >= 8 && !busy ? 1 : 0.4}`)}
            >
              Look up
            </button>
          </div>
          {found && (
            <div style={st('display:flex;align-items:center;gap:12px;padding:12px;border-radius:18px;background:oklch(0.2 0.006 55)')}>
              <Cover title={found.title} url={found.coverImageUrl} width={44} radius={8} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{found.title}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:oklch(0.7 0.01 65)')}>{found.platform}</span>
              </span>
              <button type="button" onClick={() => onPick(found)} style={st(`height:38px;padding:0 16px;border-radius:999px;border:none;background:${ACC};color:oklch(0.2 0.03 45);font:700 13px var(--font-ui)`)}>
                Add
              </button>
            </div>
          )}
          {miss && <div role="alert" style={st('padding:12px 14px;border-radius:14px;background:oklch(0.62 0.19 25 / 0.18);font:500 13.5px var(--font-ui)')}>{miss}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
