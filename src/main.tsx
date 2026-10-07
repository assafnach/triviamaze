import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/700.css';
import '@fontsource/frank-ruhl-libre/900.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/heebo/700.css';
import './ui/styles/app.css';
import { App } from './app/App';

if (import.meta.env.DEV) {
  // Validate the question database at startup in development.
  void Promise.all([import('./game/questions/validate'), import('./content/he/questions')]).then(([v, q]) => {
    const issues = v.validateQuestions(q.ALL_QUESTIONS);
    if (issues.length > 0) console.warn('[questions] validation issues', issues);
  });
}

const previewName = import.meta.env.DEV ? new URLSearchParams(location.search).get('preview') : null;
if (import.meta.env.DEV && previewName) {
  // Development-only creature turntable (stripped from production builds).
  void import('./dev/preview').then((m) => m.startPreview(previewName));
} else {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
