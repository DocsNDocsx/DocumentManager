import { TestBed } from '@angular/core/testing';

import { BillingEstimateService } from './billing-estimate.service';
import { AuthService } from './auth.service';
import { signal } from '@angular/core';

describe('BillingEstimateService', () => {
  let service: BillingEstimateService;
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let timezone: ReturnType<typeof signal<string>>;

  beforeEach(() => {
    timezone = signal('UTC-5');
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUserTimezone: timezone } }],
    });
    service = TestBed.inject(BillingEstimateService);
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-30T12:00:00Z').getTime());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'));
  });

  it('calculates duration using the saved profile timezone', () => {
    vi.setSystemTime(new Date('2026-07-30T04:30:00Z'));
    timezone.set('UTC-8');

    const query = service.buildSoloActivationQuery({
      id: 'timezone-project', deadline: '2026-07-31', documents: [{}], expectedCollaborators: 1,
    } as any);

    expect(query?.['days']).toBe(2);
    expect(service.billingTimeZone()).toBe('America/Los_Angeles');
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it('builds solo activation query from actual deadline days without a monthly cap', () => {
    const query = service.buildSoloActivationQuery({
      id: 'solo-project-1',
      type: 'private',
      deadline: '2026-09-15',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 3,
    } as any);

    expect(query).toEqual({
      subscriptionRequired: '1',
      type: 'solo',
      projectId: 'solo-project-1',
      visibility: 'private',
      projects: 1,
      collaborators: 3,
      documents: 1,
      days: 47,
      monthly: '12.69',
    });
  });

  it('builds team activation query using explicit collaborator count over project estimate', () => {
    const query = service.buildTeamActivationQuery({
      id: 'team-project-1',
      deadline: '2026-08-04',
      documents: [{ name: 'Resume' }, { name: 'Transcript' }],
      expectedCollaborators: 10,
    } as any, 4);

    expect(query).toEqual(expect.objectContaining({
      type: 'team',
      projectId: 'team-project-1',
      collaborators: 4,
      documents: 2,
      days: 5,
      monthly: '3.60',
    }));
  });

  it('calculates the activation price from projects, collaborators, documents, duration, and rate', () => {
    const query = service.buildSoloActivationQuery({
      id: 'priced-project',
      deadline: '2026-08-03',
      documents: [
        { name: 'Resume' },
        { name: 'Transcript' },
        { name: 'Cover Letter' },
      ],
      expectedCollaborators: 5,
    } as any);

    expect(query).toEqual(expect.objectContaining({
      projects: 1,
      collaborators: 5,
      documents: 3,
      days: 4,
      monthly: '5.40',
    }));
  });

  it('uses minimum one active day when deadline is today or already passed', () => {
    const today = service.buildSoloActivationQuery({
      id: 'today-project',
      deadline: '2026-07-30',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 1,
    } as any);
    const past = service.buildSoloActivationQuery({
      id: 'past-project',
      deadline: '2026-07-01',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 1,
    } as any);

    expect(today?.['days']).toBe(1);
    expect(past?.['days']).toBe(1);
    expect(today?.['monthly']).toBe('0.09');
  });

  it('uses Eastern Time when calculating active days', () => {
    vi.setSystemTime(new Date('2026-07-31T03:30:00Z'));
    nowSpy.mockReturnValue(new Date('2026-07-31T03:30:00Z').getTime());

    const query = service.buildSoloActivationQuery({
      id: 'eastern-boundary-project',
      deadline: '2026-08-01',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 1,
    } as any);

    expect(query?.['days']).toBe(2);
  });

  it('returns null when deadline is missing or invalid', () => {
    expect(service.buildSoloActivationQuery({ id: 'missing-deadline', deadline: '', documents: [], expectedCollaborators: 1 } as any)).toBeNull();
    expect(service.buildSoloActivationQuery({ id: 'invalid-deadline', deadline: 'not-a-date', documents: [], expectedCollaborators: 1 } as any)).toBeNull();
  });

  it('falls back to one collaborator and one document for invalid usage counts', () => {
    const query = service.buildSoloActivationQuery({
      id: 'fallback-project',
      deadline: '2026-07-31',
      documents: [],
      expectedCollaborators: 0,
    } as any);

    expect(query).toEqual(expect.objectContaining({
      collaborators: 1,
      documents: 1,
      days: 1,
      monthly: '0.09',
    }));
  });
});
