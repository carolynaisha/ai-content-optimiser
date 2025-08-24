// src/main.jsx

import './state/version.js';   // ensure version check runs before anything else
import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// 🚫 Disable any old service workers that might cache old builds
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs =>
    regs.forEach(r => r.unregister())
  );
}

createRoot(document.getElementById('root')).render(<App />);
