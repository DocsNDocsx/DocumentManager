export type ActivityIconType = 'upload' | 'invite' | 'team' | 'decision' | 'delete' | 'settings';

export interface DashboardStats {
  activeProjects: number;
  soloProjects: number;
  teamProjects: number;
  documentsCollected: number;
  documentsThisWeek: number;
  activeCollaborators: number;
  storageUsedPercent: number;
}

export interface DashboardProject {
  id: string;
  name: string;
  type: 'solo' | 'team';
  visibility: 'public' | 'private';
  projectCode: string | null;
  teamName: string | null;
  description: string | null;
  documentCount: number;
  collaboratorCount: number;
  submittedCount: number | null;
  totalExpected: number | null;
  pendingCount: number | null;
  deadline: string | null;
  isOngoing: boolean;
}

export interface ActivityItem {
  id: string;
  type: ActivityIconType;
  title: string;
  actor: string | null;
  projectName: string | null;
  timestamp: string;
}

export interface DashboardStatsApiResponse {
  success: boolean;
  activeProjects: number;
  soloProjects: number;
  teamProjects: number;
  documentsCollected: number;
  documentsThisWeek: number;
  activeCollaborators: number;
  storageUsedPercent: number;
}

export interface DashboardRecentProjectsApiResponse {
  success: boolean;
  projects: DashboardProject[];
}

export interface DashboardActivityApiResponse {
  success: boolean;
  activities: ActivityItem[];
}

export interface DashboardAllActivityApiResponse {
  success: boolean;
  activities: ActivityItem[];
}
