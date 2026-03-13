import { useState, useEffect, useCallback } from 'react';
import { Task, Status, Board, User } from '@/types';
import { fetchTasks, createTask, updateTask, deleteTaskApi, moveTaskApi, getMe, logout } from '@/lib/api';
import { TaskForm } from '@/components/task-form';
import { Column } from '@/components/column';
import { AuthPage } from '@/components/auth-page';
import { Button } from '@/components/ui/button';
import { Plus, ClipboardList, Moon, Sun, User as UserIcon, Briefcase, LogOut } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeBoard, setActiveBoard] = useState<Board>('personal');
  const { theme, toggle: toggleTheme } = useTheme();

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe().then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  // Fetch tasks when user or board changes
  useEffect(() => {
    if (!user) return;
    fetchTasks(activeBoard).then(setTasks).catch(console.error);
  }, [user, activeBoard]);

  const handleLogout = () => {
    logout();
    setUser(null);
    setTasks([]);
    setShowForm(false);
    setEditingTask(null);
  };

  const addOrUpdateTask = async (data: Omit<Task, 'id' | 'createdAt' | 'board'>) => {
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, data);
        setTasks(prev => prev.map(t => t.id === editingTask.id ? updated : t));
        setEditingTask(null);
      } else {
        const created = await createTask({ ...data, board: activeBoard });
        setTasks(prev => [...prev, created]);
      }
      setShowForm(false);
    } catch (e) { console.error(e); }
  };

  const moveTask = async (id: string, status: Status) => {
    try {
      const updated = await moveTaskApi(id, status);
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
    } catch (e) { console.error(e); }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteTaskApi(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
  };

  const startEdit = (task: Task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditingTask(null);
    setShowForm(false);
  };

  const checkReminders = useCallback(() => {
    const now = new Date();
    tasks.forEach(task => {
      if (task.reminder && task.status !== 'completed') {
        const reminderTime = new Date(task.reminder);
        const diff = now.getTime() - reminderTime.getTime();
        if (diff >= 0 && diff < 30000 && Notification.permission === 'granted') {
          new Notification(`Reminder: ${task.title}`, {
            body: task.description || 'Task reminder is due!',
          });
        }
      }
    });
  }, [tasks]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [checkReminders]);

  const columns: { title: string; status: Status }[] = [
    { title: '📋 Backlog', status: 'backlog' },
    { title: '🚧 Work In Progress', status: 'wip' },
    { title: '✅ Completed', status: 'completed' },
  ];

  const switchBoard = (board: Board) => {
    setActiveBoard(board);
    setShowForm(false);
    setEditingTask(null);
  };

  // Show nothing while checking auth
  if (!authChecked) return null;

  // Show login/signup if not authenticated
  if (!user) return <AuthPage onAuth={setUser} />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Todo Board</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">Hi, {user.name}</span>
            <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={handleLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
            <Button onClick={() => { setEditingTask(null); setShowForm(!showForm); }}>
              <Plus className="h-4 w-4 mr-2" />
              {showForm ? 'Close' : 'New Task'}
            </Button>
          </div>
        </header>

        {/* Board Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => switchBoard('personal')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeBoard === 'personal'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserIcon className="h-4 w-4" />
            Personal
          </button>
          <button
            onClick={() => switchBoard('work')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeBoard === 'work'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            Work
          </button>
        </div>

        {showForm && <TaskForm onSubmit={addOrUpdateTask} editingTask={editingTask} onCancel={cancelForm} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map(col => (
            <Column
              key={col.status}
              title={col.title}
              status={col.status}
              tasks={tasks.filter(t => t.status === col.status)}
              onMove={moveTask}
              onDelete={deleteTask}
              onEdit={startEdit}
              onDrop={moveTask}
            />
          ))}
        </div>
        </div>
      </div>

      <footer className="border-t py-6 mt-8">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-sm text-muted-foreground text-center">© 2026 Todo Board</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
