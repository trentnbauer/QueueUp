import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import modalStyles from './AddGameModal.module.css';
import styles from './BarcodeScannerModal.module.css';

interface BarcodeScannerModalProps {
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

const SCAN_REGION_ID = 'barcode-scanner-region';

/** Camera-based barcode scanner (issue #402) - decodes UPC-A/UPC-E/EAN-13/EAN-8 (physical game box
 * barcodes) client-side via html5-qrcode, entirely in the browser until a barcode is actually
 * found. The native BarcodeDetector API isn't supported on desktop Chrome/Firefox or Safari as of
 * 2026, so this uses the same getUserMedia + JS-decoding approach every cross-browser scanner
 * needs instead. Reuses AddGameModal's own dialog chrome (same visual language, one modal replacing
 * another) rather than a second near-identical stylesheet. */
export function BarcodeScannerModal({ onScanned, onClose }: BarcodeScannerModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // Guards against html5-qrcode firing its success callback more than once for the same barcode
  // (it keeps decoding every frame until actually stopped, and stopping is itself async) - without
  // this, a barcode held steady in view for even a moment could call onScanned repeatedly before
  // the camera actually shuts off.
  const hasScannedRef = useRef(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

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
          onScanned(decodedText);
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
  }, [onScanned]);

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
            <p className={styles.hint}>Point your camera at the barcode on the game's box.</p>
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
