import { Injectable } from '@angular/core';
import { Params } from '@angular/router';
import { Project } from '../models/project.models';
import { TeamProjectDraft } from '../models/team.models';

const RATE = 0.09;
const DEFAULT_COLLABORATORS = 1;
const DEFAULT_DOCUMENTS = 1;
const BILLING_TIME_ZONE = 'America/New_York';

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

    const today = this.datePartsToUtcDay(this.getEasternDateParts(new Date(Date.now())));

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

    return this.datePartsToUtcDay(this.getEasternDateParts(parsed));
  }

  private getEasternDateParts(date: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BILLING_TIME_ZONE,
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

  private datePartsToUtcDay(parts: { year: number; month: number; day: number }): number {
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  }
}
