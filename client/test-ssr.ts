if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    location: { search: '?room=test-room-123', pathname: '/', origin: 'http://localhost:5173' },
    history: { pushState: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
} else {
  (global as any).window.location.search = '?room=test-room-123';
}

if (typeof (global as any).document === 'undefined') {
  (global as any).document = {
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { App } from './src/App';

console.log('--- Testing App Component (Active Room State) ---');
const appHtml = ReactDOMServer.renderToString(React.createElement(App));
console.log('✓ App (Active Room State) rendered successfully, html length:', appHtml.length);

console.log('\n=============================================');
console.log(' ACTIVE ROOM RENDERING VERIFIED WITHOUT CRASH! 🎉');
console.log('=============================================\n');
