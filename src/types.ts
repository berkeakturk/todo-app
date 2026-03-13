export type Status = 'backlog' | 'wip' | 'completed';
export type Board = 'personal' | 'work';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  board: Board;
  deadline: string | null;
  reminder: string | null;
  createdAt: string;
}
