/**
 * Project Model - represents projects owned by teams
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived' | 'deleted';
  createdAt: Date;
  updatedAt: Date;

  // Relations
  teamId: string;
  createdById: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  projectId: string;
  assigneeId: string | null;
  createdById: string;
}
