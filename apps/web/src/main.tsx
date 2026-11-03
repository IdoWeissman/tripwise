import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';
import { ApolloProvider } from '@apollo/client/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { apolloClient } from './lib/apollo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ApolloProvider>
  </StrictMode>,
);
