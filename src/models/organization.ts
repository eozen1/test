/**
 * Organization Model - represents an organization that users belong to
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: Date;
  updatedAt: Date;

  // Relations - an organization has many teams and users
  ownerId: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  createdAt: Date;

  // Relations
  organizationId: string;
  leaderId: string;
}

export interface TeamMembership {
  id: string;
  userId: string;
  teamId: string;
  role: 'member' | 'admin' | 'owner';
  joinedAt: Date;
}
