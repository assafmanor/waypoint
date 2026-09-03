// The Travelive mark: a map marker (teal = place) with a glowing amber core (amber = the
// live "now"), on a board disc so it reads on the dark chrome. Mirrors
// `public/icon-mark-bright.svg`.
//
// **No outer stroke** (ADR-0087 amendment): the teal edge this used to carry was the app
// icon's rounded outline in circular form — drawn artwork that only agreed with a launcher
// that rounds, and a ring rather than an edge at 20px. Separation from the dark chrome is
// the host's 1px hairline (`.land-icon` / `.join-icon`), which is a border, not a brand mark;
// `.inst-mark` sits on a light sheet and needs none.
//
// **Inlined, never `<img src="*.svg">`** — Chrome rasterizes a small `<img>`-sourced SVG and
// it comes out aliased. That was already the reason on both of the call sites this replaces.
//
// **Why it is a component now** (root `CLAUDE.md` rule 8): this vector was inlined twice,
// byte for byte, in `screens/Login.tsx` and `screens/JoinTrip.tsx`, differing only in the
// prefix of its three gradient ids (`lg-` and `jg-`). That difference is the tell — whoever
// wrote the second copy knew SVG ids are document-global and would have collided. The
// install sheet was about to be the third copy, so the one-off is generalised here instead.
//
// `useId` is what makes it safe to render more than one at a time: the ids are per instance,
// so two marks on one screen cannot capture each other's gradients. That is the bug the
// hand-prefixing was avoiding by convention, now avoided by construction.
import { useId } from 'react';

export function AppMark({ className }: { className?: string }) {
  const id = useId();
  const teal = `${id}-teal`;
  const amber = `${id}-amber`;
  const board = `${id}-board`;
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id={teal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#37B3A3" />
          <stop offset="1" stopColor="#1F7D73" />
        </linearGradient>
        <linearGradient id={amber} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2B65A" />
          <stop offset="1" stopColor="#E09A2F" />
        </linearGradient>
        <linearGradient id={board} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#182642" />
          <stop offset="1" stopColor="#0E1729" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="256" fill={`url(#${board})`} />
      <g transform="translate(256 268) scale(0.66) translate(-256 -260)">
        <path
          d="M256 44 C150 44 66 126 66 230 C66 348 206 436 256 476 C306 436 446 348 446 230 C446 126 362 44 256 44 Z"
          fill={`url(#${teal})`}
        />
        <circle
          cx="256"
          cy="216"
          r="96"
          fill="none"
          stroke="#F2B65A"
          strokeWidth="9"
          opacity={0.42}
        />
        <circle cx="256" cy="216" r="60" fill={`url(#${amber})`} />
      </g>
    </svg>
  );
}
