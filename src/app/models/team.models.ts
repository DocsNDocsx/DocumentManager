export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
}

export interface Team {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  icon: string;
  memberCount: number;
  projectCount: number;
  lastActivity: string | null;
  role: 'host' | 'member';
  createdAt: string;
  updatedAt: string;
}

export interface TeamsApiResponse {
  success: boolean;
  teams: Team[];
}

export interface TeamApiResponse {
  success: boolean;
  team: Team;
  message?: string;
}

export interface CreateTeamMember {
  firstName: string;
  lastName: string;
  email: string;
  affiliation?: string;
}

export interface CreateTeamRequest {
  userId: string;
  name: string;
  description?: string;
  icon?: string;
  members?: CreateTeamMember[];
}

export interface UpdateTeamMemberRequest {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  icon?: string;
  members?: UpdateTeamMemberRequest[];
}

export interface TeamDetailMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  isOwner: boolean;
}

export interface TeamProject {
  id: string;
  name: string;
  type: 'private' | 'public';
  status: 'active' | 'draft' | 'completed' | 'pending';
  deadline: string | null;
  collaboratorCount: number;
  documentCount: number;
}

export interface TeamDetail {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  owner: TeamDetailMember;
  members: TeamDetailMember[];
  projects: TeamProject[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamDetailApiResponse {
  success: boolean;
  team: TeamDetail;
}

export interface TeamProjectItem {
  id: string;
  teamId: string;
  teamName: string;
  userRole: 'host' | 'supervisor' | 'contributor' | null;
  name: string;
  type: 'private' | 'public';
  status: 'active' | 'draft' | 'completed' | 'not_completed' | 'deleted';
  deadline: string | null;
  projectCode: string | null;
  collaboratorCount: number;
  documentCount: number;
  submittedCount: number;
  approvedCount: number;
  collabUploadCount: number;
  createdAt: string;
  updatedAt: string;
  myCollaboratorId: string | null;
}

export interface TeamProjectsApiResponse {
  success: boolean;
  teams: { id: string; name: string; role: 'host' | 'member' }[];
  projects: TeamProjectItem[];
}

export interface TeamProjectStatsApiResponse {
  success: boolean;
  totalProjects: number;
  activeProjects: number;
  totalDocuments: number;
  teams: { id: string; name: string; totalProjects: number; activeProjects: number }[];
}

export interface TeamProjectDocumentRequirement {
  name: string;
  fileTypes: string[];
  maxSize: string;
  sizeUnit: string;
  templateName: string;
}

export interface TeamProjectSubmission {
  id: string;
  projectId: string;
  collaboratorEmail: string;
  collaboratorFirstName: string;
  collaboratorLastName: string;
  documentName: string;
  fileName: string;
  fileSize: number;
  status: 'submitted' | 'approved' | 'revision';
  feedback: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface TeamProjectSubmissionsApiResponse {
  success: boolean;
  submissions: TeamProjectSubmission[];
}

export interface TeamProjectDraft {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  type: 'private' | 'public';
  status: 'active' | 'draft' | 'completed' | 'not_completed' | 'deleted';
  deadline: string | null;
  completedStep: number;
  projectCode: string | null;
  expectedCollaborators: number | null;
  documents: TeamProjectDocumentRequirement[];
  supportStaff: { firstName: string; lastName: string; email: string; affiliation: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamProjectDraftApiResponse {
  success: boolean;
  project: TeamProjectDraft;
}

export interface TeamProjectCollaboratorInput {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  role: 'supervisor' | 'contributor';
}
