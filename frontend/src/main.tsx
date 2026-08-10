import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/fonts.css';
import './styles/tokens.css';
import { startTheme } from './lib/theme';
import { App } from './App';

// The inline script in index.html already applied the theme before first paint;
// this keeps it correct afterwards — following the OS while the pick is
// `system`, and picking up a change made in another tab (ADR-0158 §8). Started
// outside React because it is document state, not component state, and it must
// not depend on a mount.
startTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
