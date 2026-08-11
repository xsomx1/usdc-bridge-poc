import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { XUIProvider } from '@xsolla/xui-core';

import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <XUIProvider initialMode="dark" initialProductContext="b2b">
      <App />
    </XUIProvider>
  </StrictMode>,
);
