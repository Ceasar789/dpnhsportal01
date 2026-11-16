import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import './styles/clarity.css';
import './styles/clarity-components.css';
// V2a: classic dark-accent fixes reach the classic dashboards too (every rule is scoped).
import './styles/classic-contrast.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);