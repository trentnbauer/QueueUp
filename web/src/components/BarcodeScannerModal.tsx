import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import modalStyles from './AddGameModal.module.css';
import styles from './BarcodeScannerModal.module.css';

interface BarcodeScannerModalProps {
  onScanned: (barcode: string) => void;
  onClose: () => void;
  /** True while the parent is looking up the last decoded barcode (issue #496). */
  loading: boolean;
  /** Set by the parent when the last decoded barcode didn't resolve to a game (issue #496) - shown
   * here, in place, rather than only in the parent modal the camera view was covering. */
  lookupError: string | null;
  /** Clears lookupError and lets scanning resume (issue #496). */
  onRetry: () => void;
}

const SCAN_REGION_ID = 'barcode-scanner-region';

/** Camera-based barcode scanner (issue #402) - decodes UPC-A/UPC-E/EAN-13/EAN-8 (physical game box
 * barcodes) client-side via html5-qrcode, entirely in the browser until a barcode is actually
 * found. The native BarcodeDetector API isn't supported on desktop Chrome/Firefox or Safari as of
 * 2026, so this uses the same getUserMedia + JS-decoding approach every cross-browser scanner
 * needs instead. Reuses AddGameModal's own dialog chrome (same visual language, one modal replacing
 * another) rather than a second near-identical stylesheet. */
export function BarcodeScannerModal({ onScanned, onClose, loading, lookupError, onRetry }: BarcodeScannerModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // Guards against html5-qrcode firing its success callback more than once for the same barcode
  // (it keeps decoding every frame until actually stopped, and stopping is itself async) - without
  // this, a barcode held steady in view for even a moment could call onScanned repeatedly before
  // the camera actually shuts off.
  const hasScannedRef = useRef(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  // `onScanned` is a plain inline function on AddGameModal's side (a fresh reference every render,
  // not memoized) - reading it through a ref rather than the effect's own closure means an
  // unrelated parent re-render (e.g. AddGameModal's "Added ✓" banner timing out) can't restart
  // this effect and stop/recreate the whole Html5Qrcode instance mid-scan, which previously could
  // silently drop a scan decoded in the narrow window between the old instance stopping and the
  // new one starting.
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCAN_REGION_ID, {
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
        (decodedText) => {
          if (cancelled || hasScannedRef.current) return;
          hasScannedRef.current = true;
          onScannedRef.current(decodedText);
        },
        () => {
          // Fires continuously while no barcode is in view - expected, not an error worth surfacing.
        },
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setStarting(false);
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera access was denied - allow camera access in your browser to scan a barcode.'
            : "Could not start the camera - your device or browser may not support this.",
        );
      });

    return () => {
      cancelled = true;
      // .stop() rejects if the scanner never reached a running state (e.g. permission was denied
      // before start() resolved) - harmless here, there's nothing left to clean up either way.
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
    // Deliberately empty - this should start the camera exactly once per mount and never restart
    // on a re-render; onScanned's freshness is handled via onScannedRef above instead of being a
    // dependency here (see that ref's own comment for why).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Issue #496: hasScannedRef latches true on the first decode and is never otherwise reset (it
  // exists to stop that same decode firing onScanned repeatedly - see its own comment above), so a
  // retry after a lookup miss has to clear it explicitly or the camera would keep running but never
  // report another decode.
  function handleRetry() {
    hasScannedRef.current = false;
    onRetry();
  }

  return (
    <div className={modalStyles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={modalStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Scan a barcode"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={modalStyles.header}>
          <span className={modalStyles.title}>Scan a barcode</span>
          <button type="button" className={modalStyles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error ? (
          <div className={modalStyles.error}>{error}</div>
        ) : (
          <>
            {starting && <p className={styles.hint}>Starting camera…</p>}
            <div id={SCAN_REGION_ID} className={styles.scanRegion} />
            {loading && <p className={styles.hint}>Looking up that barcode…</p>}
            {lookupError && (
              <div className={styles.lookupError}>
                <p className={modalStyles.error}>{lookupError}</p>
                <button type="button" className={modalStyles.addButton} onClick={handleRetry}>
                  Try again
                </button>
              </div>
            )}
            {!loading && !lookupError && (
              <p className={styles.hint}>Point your camera at the barcode on the game's box.</p>
            )}
          </>
        )}

        <div className={modalStyles.cancelZone}>
          <button type="button" className={modalStyles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
