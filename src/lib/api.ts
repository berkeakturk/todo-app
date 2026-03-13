import { Task, Status, Board, AuthResponse, User } from '@/types';

const API_URL = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// ─── Auth ───

export async function signup(name: string, email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Signup failed' }));
    throw new Error(err.error);
  }
  const data: AuthResponse = await res.json();
  localStorage.setItem('token', data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error);
  }
  const data: AuthResponse = await res.json();
  localStorage.setItem('token', data.token);
  return data;
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_URL}/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export function logout() {
  localStorage.removeItem('token');
}

// ─── Tasks ───

export async function fetchTasks(board: Board): Promise<Task[]> {
  const res = await fetch(`${API_URL}/tasks?board=${board}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export async function createTask(data: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
  const res = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function updateTask(id: string, data: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
  const res = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function deleteTaskApi(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/tasks/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to delete task');
}

export async function moveTaskApi(id: string, status: Status): Promise<Task> {
  return updateTask(id, { status });
}
