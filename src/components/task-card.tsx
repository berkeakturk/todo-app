import { useState, useEffect } from 'react';
import { Task, Status } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, ArrowLeft, ArrowRight, Calendar, Bell, Clock } from 'lucide-react';

function timeLeft(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

interface Props {
  task: Task;
  onMove: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}

export function TaskCard({ task, onMove, onDelete, onEdit }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!task.deadline || task.status === 'completed') return;
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [task.deadline, task.status]);

  const isOverdue = task.deadline && new Date(task.deadline).getTime() < now && task.status !== 'completed';
  const isReminderDue = task.reminder && new Date(task.reminder).getTime() <= now && task.status !== 'completed';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', task.id);
  };

  return (
    <Card
      className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${isOverdue ? 'border-l-4 border-l-destructive' : ''}`}
      draggable
      onDragStart={handleDragStart}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex-1">{task.title}</CardTitle>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {task.deadline && (
            <Badge variant={isOverdue ? 'destructive' : 'secondary'} className="gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(task.deadline).toLocaleDateString()}
            </Badge>
          )}
          {task.deadline && task.status !== 'completed' && (
            <Badge variant={isOverdue ? 'destructive' : 'outline'} className="gap-1">
              <Clock className="h-3 w-3" />
              {timeLeft(task.deadline)}
            </Badge>
          )}
          {isReminderDue && (
            <Badge className="gap-1 bg-amber-500 text-white animate-pulse">
              <Bell className="h-3 w-3" />
              Reminder!
            </Badge>
          )}
          {task.reminder && !isReminderDue && (
            <Badge variant="outline" className="gap-1">
              <Bell className="h-3 w-3" />
              {new Date(task.reminder).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </Badge>
          )}
        </div>

        <div className="flex gap-1.5 pt-1">
          {task.status !== 'backlog' && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onMove(task.id, task.status === 'completed' ? 'wip' : 'backlog')}>
              <ArrowLeft className="h-3 w-3 mr-1" />
              {task.status === 'completed' ? 'WIP' : 'Backlog'}
            </Button>
          )}
          {task.status !== 'completed' && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onMove(task.id, task.status === 'backlog' ? 'wip' : 'completed')}>
              {task.status === 'backlog' ? 'WIP' : 'Done'}
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
