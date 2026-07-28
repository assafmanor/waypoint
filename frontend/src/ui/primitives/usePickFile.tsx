// The file-pick MECHANISM, with no presentation attached — ADR-0133 §6.
//
// It was inside `FilePicker`, which is fine while there is one presentation. There are
// now two: a document has no on-screen representation yet, so its target has to be a
// pair of dashed tiles; an avatar is already on screen, large and round, so its target
// is a camera badge on the face itself. Those are genuinely different layouts over
// genuinely identical plumbing — the off-screen `<input>`s, `accept`, `capture`, the
// coarse-pointer detect, and the reset-after-pick that lets you re-choose the same file.
//
// So the shared thing is this hook, not a `variant` prop that would switch between two
// unrelated trees. `FilePicker` renders the tiles over it; the picture page renders a
// badge over it. One mechanism, two presentations — which is what rule 8 asks for when
// shared plumbing meets a genuinely different surface.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './use-pick-file.css';

/** Which camera to open. `environment` (rear) is right for photographing a document;
 *  `user` (front) is right for photographing your own face, and getting this wrong
 *  means the avatar flow opens a camera pointed away from the subject. */
export type CaptureFacing = 'environment' | 'user';

/** Whether to offer camera capture: on a touch / coarse-pointer device, hidden on a
 *  desktop where `capture` would just reopen a file dialog. A synchronous media-query
 *  proxy — no async camera enumeration that can false-negative on a real phone and
 *  silently drop the camera path (ADR-0086 §2). */
function useCameraCapture(enabled: boolean): boolean {
  const coarse = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const [supported, setSupported] = useState(coarse);
  // Re-evaluate on mount so a hydration/first-paint mismatch self-corrects.
  useEffect(() => setSupported(coarse()), []);
  return enabled && supported;
}

export interface PickFile {
  /** Open the OS file browser. */
  openUpload: () => void;
  /** Open the camera, or `null` where there is none — null rather than a `hasCamera`
   *  boolean so a call site cannot render a control it has no handler for. */
  openCamera: (() => void) | null;
  /** The off-screen inputs. A caller must render this somewhere in its tree, or
   *  nothing opens — they are real `<input type="file">`s so the OS accept filter and
   *  the camera intent are the platform's, not an emulation. */
  inputs: ReactNode;
}

export function usePickFile({
  accept,
  capture = false,
  onPick,
  disabled = false,
}: {
  /** OS accept filter, e.g. "image/*" or "image/*,application/pdf". */
  accept: string;
  /** Which camera to offer, or `false` for none. Shown only where a camera plausibly
   *  exists regardless. */
  capture?: CaptureFacing | false;
  onPick: (file: File) => void;
  disabled?: boolean;
}): PickFile {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const showCapture = useCameraCapture(capture !== false);

  // Reset the input value after each pick so choosing the same file again still fires
  // `change` (a re-pick after clearing an identical file).
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };

  return {
    openUpload: () => {
      if (!disabled) fileInput.current?.click();
    },
    openCamera: showCapture
      ? () => {
          if (!disabled) cameraInput.current?.click();
        }
      : null,
    inputs: (
      <>
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          className="file-picker-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleInput}
        />
        {showCapture && capture !== false && (
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture={capture}
            className="file-picker-input"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleInput}
          />
        )}
      </>
    ),
  };
}
