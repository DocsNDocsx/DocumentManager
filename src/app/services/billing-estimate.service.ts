import { Injectable } from '@angular/core';
import { Params } from '@angular/router';
import { Project } from '../models/project.models';
import { TeamProjectDraft } from '../models/team.models';

const RATE = 0.09;
const DEFAULT_COLLABORATORS = 1;
const DEFAULT_DOCUMENTS = 1;

type BillingProject = Pick<Project | TeamProjectDraft, 'id' | 'deadline' | 'documents' | 'expectedCollaborators'>;

@Injectable({ providedIn: 'root' })
export class BillingEstimateService {
  buildSoloActivationQuery(project: BillingProject, collaboratorCount?: number): Params | null {
    return this.buildActivationQuery('solo', project, collaboratorCount);
  }

  buildTeamActivationQuery(project: BillingProject, collaboratorCount?: number): Params | null {
    return this.buildActivationQuery('team', project, collaboratorCount);
  }

  private buildActivationQuery(
    type: 'solo' | 'team',
    project: BillingProject,
    collaboratorCount?: number,
  ): Params | null {
    const projects = 1;
    const collaborators = this.usageCount(
      collaboratorCount ?? project.expectedCollaborators,
      DEFAULT_COLLABORATORS,
    );
    const documents = this.usageCount(project.documents?.length, DEFAULT_DOCUMENTS);
    const days = this.activeDays(project.deadline);
    if (days === null) return null;

    const monthly = projects * collaborators * documents * days * RATE;

    return {
      subscriptionRequired: '1',
      type,
      projectId: project.id,
      projects,
      collaborators,
      documents,
      days,
      monthly: monthly.toFixed(2),
    };
  }

  private usageCount(value: number | null | undefined, fallback: number): number {
    if (!Number.isFinite(value) || Number(value) < 1) return fallback;
    return Math.floor(Number(value));
  }

  private activeDays(deadline: string | null | undefined): number | null {
    if (!deadline) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = this.parseDeadline(deadline);
    if (Number.isNaN(dueDate.getTime())) return null;
    dueDate.setHours(0, 0, 0, 0);

    const daysUntilDeadline = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
    return Math.max(daysUntilDeadline, 1);
  }

  private parseDeadline(deadline: string): Date {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
    if (!dateOnly) return new Date(deadline);

    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
}
