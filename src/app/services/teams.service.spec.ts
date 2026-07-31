import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { TeamsService } from './teams.service';
import { AuthService } from './auth.service';
import { LoggingService } from './logging.service';
import { environment } from '../../environments/environment';
import { Team, TeamDetail } from '../models/team.models';

describe('TeamsService', () => {
  let service: TeamsService;
  let http: HttpTestingController;
  let logger: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let auth: { currentUserId: ReturnType<typeof signal<string>> };

  const hostTeam: Team = {
    id: 'team-1',
    userId: '123',
    name: 'Alpha',
    description: 'Host team',
    icon: 'A',
    memberCount: 3,
    projectCount: 2,
    lastActivity: '2026-07-30',
    role: 'host',
    createdAt: '2026-07-01',
    updatedAt: '2026-07-30',
  };
  const memberTeam: Team = {
    ...hostTeam,
    id: 'team-2',
    name: 'Beta',
    role: 'member',
  };
  const detail: TeamDetail = {
    id: 'team-1',
    name: 'Alpha',
    description: 'Host team',
    icon: 'A',
    owner: {
      id: 'owner-1',
      firstName: 'Mridul',
      lastName: 'Mishra',
      email: 'mridul@example.com',
      affiliation: 'DocsNDocs',
      isOwner: true,
    },
    members: [],
    projects: [],
    createdAt: '2026-07-01',
    updatedAt: '2026-07-30',
  };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    auth = { currentUserId: signal('123') };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: LoggingService, useValue: logger },
      ],
    });

    service = TestBed.inject(TeamsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads teams for the current user and exposes hosted/member computed lists', () => {
    service.load();

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/teams`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('userid')).toBe('123');

    req.flush({ success: true, teams: [hostTeam, memberTeam] });

    expect(service.teams()).toEqual([hostTeam, memberTeam]);
    expect(service.hostedTeams()).toEqual([hostTeam]);
    expect(service.memberTeams()).toEqual([memberTeam]);
    expect(service.isLoading()).toBe(false);
  });

  it('does not load teams without a current user', () => {
    auth.currentUserId.set('');

    service.load();

    http.expectNone(`${environment.apiUrl}/teams`);
    expect(service.teams()).toEqual([]);
  });

  it('stores load errors from the backend message', () => {
    service.load();

    http.expectOne(r => r.url === `${environment.apiUrl}/teams`)
      .flush({ message: 'Invalid or expired token' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.error()).toBe('Invalid or expired token');
    expect(service.isLoading()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('Failed to load teams', expect.anything());
  });

  it('loads team detail once and caches it', () => {
    service.loadDetail('team-1');

    const req = http.expectOne(`${environment.apiUrl}/teams/team-1`);
    expect(req.request.method).toBe('GET');
    expect(service.teamDetailsLoading()['team-1']).toBe(true);

    req.flush({ success: true, team: detail });

    expect(service.teamDetails()['team-1']).toEqual(detail);
    expect(service.teamDetailsLoading()['team-1']).toBe(false);

    service.loadDetail('team-1');
    http.expectNone(`${environment.apiUrl}/teams/team-1`);
  });

  it('creates, updates, and removes teams through the expected endpoints', () => {
    service.create({ userId: '123', name: 'Alpha', members: [] }).subscribe();
    const createReq = http.expectOne(`${environment.apiUrl}/teams`);
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body.name).toBe('Alpha');
    createReq.flush({ success: true, team: hostTeam });

    service.update('team-1', { name: 'Alpha Updated' }).subscribe();
    const updateReq = http.expectOne(`${environment.apiUrl}/teams/team-1`);
    expect(updateReq.request.method).toBe('PUT');
    expect(updateReq.request.body).toEqual({ name: 'Alpha Updated' });
    updateReq.flush({ success: true, team: { ...hostTeam, name: 'Alpha Updated' } });

    service.remove('team-1').subscribe();
    const removeReq = http.expectOne(`${environment.apiUrl}/teams/team-1`);
    expect(removeReq.request.method).toBe('DELETE');
    removeReq.flush({ success: true, message: 'Removed' });

    expect(logger.info).toHaveBeenCalledWith('Team created', { id: 'team-1' });
    expect(logger.info).toHaveBeenCalledWith('Team updated', { id: 'team-1' });
    expect(logger.info).toHaveBeenCalledWith('Team removed', { id: 'team-1' });
  });

  it('updates one team in the local list without changing other teams', () => {
    service.teams.set([hostTeam, memberTeam]);

    service.updateOne('team-1', { name: 'Alpha Updated', projectCount: 5 });

    expect(service.teams()[0]).toEqual({ ...hostTeam, name: 'Alpha Updated', projectCount: 5 });
    expect(service.teams()[1]).toEqual(memberTeam);
  });
});
