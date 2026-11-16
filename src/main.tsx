import { render } from 'preact';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/silkscreen/400.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './app';
import { CrashGuard } from './ui/ErrorScreen';

const root = document.getElementById('app');
if (root)
  render(
    <CrashGuard>
      <App />
    </CrashGuard>,
    root,
  );
