import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only auto-cleans with vitest globals on; unmount between tests explicitly.
afterEach(() => cleanup());
