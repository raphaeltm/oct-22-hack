import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthGate, SignOutButton } from './Login';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <SignOutButton />
      <App />
    </AuthGate>
  </StrictMode>,
);
