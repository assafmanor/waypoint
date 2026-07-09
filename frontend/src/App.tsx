import { useState } from 'react';
import type { EventKind } from '@waypoint/shared';
import './App.css';

type Tab = 'home' | 'map' | 'index' | 'days';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'בית' },
  { id: 'map', icon: '🗺️', label: 'מפה' },
  { id: 'index', icon: '📇', label: 'אינדקס' },
  { id: 'days', icon: '📅', label: 'יום-יום' },
];

// Placeholder — real screens are ported from the mockup in later tasks (T-002+).
function Placeholder({ tab }: { tab: Tab }) {
  const demoKind: EventKind = 'hard'; // proves @waypoint/shared is wired in
  return (
    <div className="placeholder">
      <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
      <p>שלד מסך — התוכן האמיתי יגיע מהמוקאפ.</p>
      <p className="mono">shared type check: EventKind = {demoKind}</p>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <div className="app">
      <main className="body">
        <Placeholder tab={tab} />
      </main>
      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'on' : ''}
            onClick={() => setTab(t.id)}
            aria-current={t.id === tab}
          >
            <span className="ic">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
