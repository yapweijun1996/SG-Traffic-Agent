import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize Lucide icons or other global setups if needed here

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
