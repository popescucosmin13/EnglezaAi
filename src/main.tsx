import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import AuthAction from './pages/AuthAction';
import { AuthProvider } from './auth/AuthContext';
import { AccessProvider } from './access/AccessContext';
import { initErrorTracking } from './logic/error-tracking';
import './styles/global.css';

initErrorTracking();

const isAuthAction = window.location.pathname.replace(/\/$/, '') === '/auth-action';

function WebAnalytics() {
  const { pathname } = useLocation();

  // HashRouter pages need explicit paths; do not include query parameters.
  return (
    <Analytics
      mode={import.meta.env.DEV ? 'development' : 'production'}
      route={pathname}
      path={pathname}
      beforeSend={(event) => {
        const url = new URL(event.url);
        url.search = '';
        url.hash = '';
        return { ...event, url: url.toString() };
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAuthAction ? <AuthAction /> : (
      <AuthProvider>
        <AccessProvider>
          <HashRouter>
            <App />
            <WebAnalytics />
          </HashRouter>
        </AccessProvider>
      </AuthProvider>
    )}
  </React.StrictMode>
);
