import type { ReactNode } from 'react';

/**
 * **What the recipient's chat will show** (ADR-0241 §4): a raised box in `.share-send`'s paint
 * holding a thumbnail and two lines. Before and during the trip the thumbnail is the chosen
 * audience's own link cover (1200×630) and there is nothing to press, since the link's own
 * outcome sends it. After the trip it is the group-chat card (4:5), and `action` is its send.
 */
export function SharePreview({
  kind,
  src,
  title,
  line,
  action,
}: {
  kind: 'link' | 'card';
  src: string;
  title: string;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="share-preview" data-kind={kind}>
      <div className={`share-preview-thumb is-${kind}`}>
        <img src={src} alt="" />
      </div>
      <div className="share-preview-copy">
        <strong>{title}</strong>
        <span>{line}</span>
        {action}
      </div>
    </div>
  );
}
