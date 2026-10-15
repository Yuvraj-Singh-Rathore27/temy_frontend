import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import { applyAppearance, cachedAppearance } from './utils/appearance.js';

// Login pages use the theme from the last visit; the account's settings take over after sign-in.
applyAppearance(cachedAppearance());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
