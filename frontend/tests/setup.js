import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// clean up between tests
afterEach(() => {
  cleanup();
  localStorage.clear();
});
