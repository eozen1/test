/**
 * User Model - represents a user in the system
 */

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  organizationId: string;
  teamIds: string[];
}

export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark';
  emailNotifications: boolean;
  pushNotifications: boolean;
}
