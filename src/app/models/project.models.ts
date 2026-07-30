export interface ProjectAttachment {
  name: string;
  size: string;
  iconClass: string;
  url?: string;
  bytes?: number;
  mimeType?: string;
}

export interface ProjectCollaborator {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
}

export interface ProjectDocument {
  name: string;
  fileTypes: string[];
  maxSize: string;
  sizeUnit: string;
  templateName: string;
}

export type ProjectAssignments = Record<string, number[]>;

export interface ProjectStaff {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
}

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  deadline: string | null;
  attachments: ProjectAttachment[];
  collaborators: ProjectCollaborator[];
  documents: ProjectDocument[];
  assignments: ProjectAssignments;
  staff: ProjectStaff | null;
  expectedCollaborators: number | null;
  projectCode: string | null;
  completedStep: number;
  status: ProjectStatus;
  type: string;
  createdAt: string;
  updatedAt: string;
  ownerName?: string | null;
}

export interface ProjectApiResponse {
  success: boolean;
  project: Project;
  message?: string;
}

export interface ProjectsApiResponse {
  success: boolean;
  projects: Project[];
}

export interface Submission {
  id: string;
  project_id: string;
  collaborator_index: number;
  document_index: number;
  file_name: string;
  file_size: number;
  file_path: string;
  status: 'submitted' | 'approved' | 'revision';
  feedback: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface SubmissionsApiResponse {
  success: boolean;
  submissions: Submission[];
}
