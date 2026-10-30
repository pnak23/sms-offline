import { afterEach } from 'vitest';

afterEach(() => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // storage may be unavailable in some environments
  }
});
