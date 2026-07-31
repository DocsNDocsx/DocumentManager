import { TestBed } from '@angular/core/testing';

import { BillingEstimateService } from './billing-estimate.service';

describe('BillingEstimateService', () => {
  let service: BillingEstimateService;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BillingEstimateService);
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-30T12:00:00Z').getTime());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'));
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it('builds solo activation query from actual deadline days without a monthly cap', () => {
    const query = service.buildSoloActivationQuery({
      deadline: '2026-09-15',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 3,
    } as any);

    expect(query).toEqual({
      subscriptionRequired: '1',
      type: 'solo',
      projects: 1,
      collaborators: 3,
      documents: 1,
      days: 47,
      monthly: '12.69',
    });
  });

  it('builds team activation query using explicit collaborator count over project estimate', () => {
    const query = service.buildTeamActivationQuery({
      deadline: '2026-08-04',
      documents: [{ name: 'Resume' }, { name: 'Transcript' }],
      expectedCollaborators: 10,
    } as any, 4);

    expect(query).toEqual(expect.objectContaining({
      type: 'team',
      collaborators: 4,
      documents: 2,
      days: 5,
      monthly: '3.60',
    }));
  });

  it('uses minimum one active day when deadline is today or already passed', () => {
    const today = service.buildSoloActivationQuery({
      deadline: '2026-07-30',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 1,
    } as any);
    const past = service.buildSoloActivationQuery({
      deadline: '2026-07-01',
      documents: [{ name: 'Resume' }],
      expectedCollaborators: 1,
    } as any);

    expect(today?.['days']).toBe(1);
    expect(past?.['days']).toBe(1);
    expect(today?.['monthly']).toBe('0.09');
  });

  it('returns null when deadline is missing or invalid', () => {
    expect(service.buildSoloActivationQuery({ deadline: '', documents: [], expectedCollaborators: 1 } as any)).toBeNull();
    expect(service.buildSoloActivationQuery({ deadline: 'not-a-date', documents: [], expectedCollaborators: 1 } as any)).toBeNull();
  });

  it('falls back to one collaborator and one document for invalid usage counts', () => {
    const query = service.buildSoloActivationQuery({
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
