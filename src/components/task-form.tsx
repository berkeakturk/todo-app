import { useState, useEffect } from 'react';
import { Task, Status } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { X } from 'lucide-react';

interface Props {
  onSubmit: (task: Omit<Task, 'id' | 'createdAt' | 'board'>) => void;
  editingTask: Task | null;
  onCancel: () => void;
}

export function TaskForm({ onSubmit, editingTask, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('backlog');
  const [deadline, setDeadline] = useState('');
  const [reminder, setReminder] = useState('');

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setStatus(editingTask.status);
      setDeadline(editingTask.deadline ?? '');
      setReminder(editingTask.reminder ?? '');
    } else {
      setTitle(''); setDescription(''); setStatus('backlog');
      setDeadline(''); setReminder('');
    }
  }, [editingTask]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      deadline: deadline || null,
      reminder: reminder || null,
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{editingTask ? 'Edit Task' : 'New Task'}</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} required placeholder="What needs to be done?" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." rows={2} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" value={status} onChange={e => setStatus(e.target.value as Status)}>
                <option value="backlog">Backlog</option>
                <option value="wip">WIP</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder">Reminder</Label>
              <Input id="reminder" type="datetime-local" value={reminder} onChange={e => setReminder(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit">{editingTask ? 'Update' : 'Add Task'}</Button>
            {editingTask && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
