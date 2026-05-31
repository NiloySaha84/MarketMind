import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the network layer and toasts so the test exercises the UI + auth-state
// journey without a backend or DOM gaps (react-hot-toast uses matchMedia).
vi.mock('../src/api/auth.js', () => ({
  loginRequest: vi.fn(),
  signupRequest: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { loginRequest } from '../src/api/auth.js';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import Login from '../src/pages/Login.jsx';

const renderLogin = () =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard ready</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );

describe('Login journey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test('logs in, stores the token, and navigates to the dashboard', async () => {
    loginRequest.mockResolvedValue({
      user: { id: 1, name: 'Ada', email: 'ada@example.com' },
      token: 'fake-jwt-token',
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText('you@company.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'sup3rsecret');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard ready')).toBeInTheDocument();
    });

    expect(loginRequest).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'sup3rsecret',
    });
    expect(localStorage.getItem('marketmind_token')).toBe('fake-jwt-token');
    expect(JSON.parse(localStorage.getItem('marketmind_user')).email).toBe('ada@example.com');
  });

  test('shows a validation message when fields are empty', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/enter your email and password/i)).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();
  });

  test('surfaces an error message when login fails', async () => {
    loginRequest.mockRejectedValue({
      response: { data: { error: 'Invalid password' } },
    });

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByPlaceholderText('you@company.com'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText('Invalid password')).toBeInTheDocument();
    expect(localStorage.getItem('marketmind_token')).toBeNull();
  });
});
