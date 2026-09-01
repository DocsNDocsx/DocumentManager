import { Injectable } from '@angular/core';
import { Params } from '@angular/router';
import { Project } from '../models/project.models';
import { TeamProjectDraft } from '../models/team.models';
import { AuthService } from './auth.service';
import { inject } from '@angular/core';

const RATE = 0.09;
const DEFAULT_COLLABORATORS = 1;
const DEFAULT_DOCUMENTS = 1;
const LEGACY_TIME_ZONES: Record<string, string> = {
  'UTC-5': 'America/New_York',
  'UTC-6': 'America/Chicago',
  'UTC-7': 'America/Denver',
  'UTC-8': 'America/Los_Angeles',
  'UTC+0': 'UTC',
  'UTC+1': 'Europe/Paris',
};

type BillingProject = Pick<Project | TeamProjectDraft, 'id' | 'deadline' | 'documents' | 'expectedCollaborators'> & {
  projectCode?: string | null;
  type?: string | null;
  collaborators?: Project['collaborators'];
  assignments?: Project['assignments'];
};

@Injectable({ providedIn: 'root' })
export class BillingEstimateService {
  private auth = inject(AuthService);

  buildSoloActivationQuery(project: BillingProject, collaboratorCount?: number, documentCount?: number): Params | null {
    return this.buildActivationQuery('solo', project, collaboratorCount, documentCount);
  }

  buildTeamActivationQuery(project: BillingProject, collaboratorCount?: number): Params | null {
    return this.buildActivationQuery('team', project, collaboratorCount);
  }

  deadlineExtensionDays(previousDeadline: string | null | undefined, newDeadline: string | null | undefined): number {
    const previous = previousDeadline ? this.parseDeadlineToUtcDay(previousDeadline) : null;
    const current = newDeadline ? this.parseDeadlineToUtcDay(newDeadline) : null;
    if (previous === null || current === null || current <= previous) return 0;
    return Math.round((current - previous) / 86_400_000);
  }

  private buildActivationQuery(
    type: 'solo' | 'team',
    project: BillingProject,
    collaboratorCount?: number,
    documentCount?: number,
  ): Params | null {
    const projects = 1;
    const collaborators = this.usageCount(
      collaboratorCount ?? project.expectedCollaborators,
      DEFAULT_COLLABORATORS,
    );
    const documents = this.usageCount(documentCount ?? project.documents?.length, DEFAULT_DOCUMENTS);
    const days = this.activeDays(project.deadline);
    if (days === null) return null;

    const assignmentCount = type === 'solo' && project.type === 'private'
      ? this.activeAssignmentCount(project)
      : null;
    if (assignmentCount !== null && assignmentCount < 1) return null;
    const monthly = projects * (assignmentCount ?? (collaborators * documents)) * days * RATE;

    return {
      subscriptionRequired: '1',
      type,
      projectId: project.id,
      ...(project.projectCode ? { projectCode: project.projectCode } : {}),
      ...(project.type ? { visibility: project.type } : {}),
      projects,
      collaborators,
      documents,
      ...(assignmentCount !== null ? { assignmentCount } : {}),
      days,
      monthly: monthly.toFixed(2),
    };
  }

  private activeAssignmentCount(project: BillingProject): number {
    const activeCollaborators = project.collaborators ?? [];
    const activeDocuments = project.documents ?? [];
    return Object.entries(project.assignments ?? {}).reduce((total, [collaboratorIndex, documentIndexes]) => {
      const collaborator = activeCollaborators[Number(collaboratorIndex)];
      if (!collaborator || collaborator.status === 'inactive' || !Array.isArray(documentIndexes)) return total;
      const validDocuments = new Set(documentIndexes.filter(index => {
        const document = activeDocuments[index];
        if (!Number.isInteger(index) || index < 0 || !document) return false;
        return !('status' in document) || document.status !== 'inactive';
      }));
      return total + validDocuments.size;
    }, 0);
  }

  private usageCount(value: number | null | undefined, fallback: number): number {
    if (!Number.isFinite(value) || Number(value) < 1) return fallback;
    return Math.floor(Number(value));
  }

  private activeDays(deadline: string | null | undefined): number | null {
    if (!deadline) return null;

    const today = this.datePartsToUtcDay(this.getTimeZoneDateParts(new Date(Date.now())));

    const dueDate = this.parseDeadlineToUtcDay(deadline);
    if (dueDate === null) return null;

    const daysUntilDeadline = Math.ceil((dueDate - today) / 86_400_000);
    return Math.max(daysUntilDeadline, 1);
  }

  private parseDeadlineToUtcDay(deadline: string): number | null {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return this.datePartsToUtcDay({
        year: Number(year),
        month: Number(month),
        day: Number(day),
      });
    }

    const parsed = new Date(deadline);
    if (Number.isNaN(parsed.getTime())) return null;

    return this.datePartsToUtcDay(this.getTimeZoneDateParts(parsed));
  }

  private getTimeZoneDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.billingTimeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    return {
      year: Number(parts.find(part => part.type === 'year')?.value),
      month: Number(parts.find(part => part.type === 'month')?.value),
      day: Number(parts.find(part => part.type === 'day')?.value),
    };
  }

  billingTimeZone(): string {
    const saved = this.auth.currentUserTimezone();
    return LEGACY_TIME_ZONES[saved] ?? saved ?? 'America/New_York';
  }

  private datePartsToUtcDay(parts: { year: number; month: number; day: number }): number {
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  }
}
