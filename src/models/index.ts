/**
 * Data Models Index
 *
 * Entity Relationships:
 * - Organization has many Teams and Users
 * - Team belongs to Organization, has many Users (via TeamMembership)
 * - User belongs to Organization, can be in many Teams
 * - Project belongs to Team, created by User
 * - Task belongs to Project, can be assigned to User
 */

export * from './user';
export * from './organization';
export * from './project';
