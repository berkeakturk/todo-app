import { Task, Status } from '@/types';
import { TaskCard } from '@/components/task-card';
import { Badge } from '@/components/ui/badge';

interface Props {
  title: string;
  status: Status;
  tasks: Task[];
  onMove: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onDrop: (taskId: string, status: Status) => void;
}

const statusColors: Record<Status, string> = {
  backlog: 'border-t-amber-500',
  wip: 'border-t-blue-500',
  completed: 'border-t-emerald-500',
};

export function Column({ title, status, tasks, onMove, onDelete, onEdit, onDrop }: Props) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('ring-2', 'ring-primary/30');
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-2', 'ring-primary/30');
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-2', 'ring-primary/30');
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) onDrop(taskId, status);
  };

  return (
    <div
      className={`rounded-lg border border-t-4 ${statusColors[status]} bg-muted/30 p-4 min-h-[400px] transition-shadow`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <div className="space-y-3">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onMove={onMove} onDelete={onDelete} onEdit={onEdit} />
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No tasks yet</p>
        )}
      </div>
    </div>
  );
}
