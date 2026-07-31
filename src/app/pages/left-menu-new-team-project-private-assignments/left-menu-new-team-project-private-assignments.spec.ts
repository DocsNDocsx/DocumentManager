import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewTeamProjectPrivateAssignmentsComponent } from './left-menu-new-team-project-private-assignments';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

describe('LeftMenuNewTeamProjectPrivateAssignmentsComponent', () => {
  let component: LeftMenuNewTeamProjectPrivateAssignmentsComponent;
  let http: HttpTestingController;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      projectId: signal('team-project-1'),
      project: signal<any>({
        documents: [{ name: 'Resume' }, { name: 'Transcript' }],
      }),
      isSaving: signal(false),
      saveAssignments: vi.fn(() => of({})),
      reset: vi.fn(),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPrivateAssignmentsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateAssignmentsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http?.verify());

  it('loads collaborators and assigns every document by default', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({
      success: true,
      collaborators: [
        { firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com' },
        { firstName: 'Bob', lastName: 'Chen', email: 'bob@example.com' },
      ],
    });

    expect(component.collaborators().length).toBe(2);
    expect(component.isChecked(0, 0)).toBe(true);
    expect(component.isChecked(1, 1)).toBe(true);
    expect(component.allAssigned()).toBe(true);
  });

  it('toggles assignment state and blocks continue until everyone has documents', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({
      success: true,
      collaborators: [
        { firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com' },
        { firstName: 'Bob', lastName: 'Chen', email: 'bob@example.com' },
      ],
    });

    component.clearAll();
    component.continue();
    expect(component.warnings()).toEqual([
      'Alice Morgan has no documents assigned',
      'Bob Chen has no documents assigned',
    ]);
    expect(wizard.saveAssignments).not.toHaveBeenCalled();

    component.toggleAssignment(0, 0, true);
    component.toggleColumn(1);
    component.selectAll();
    component.continue();

    expect(wizard.saveAssignments).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/decision']);
  });

  it('redirects to details when project id is missing', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({ success: true, collaborators: [] });
    wizard.projectId.set(null);

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateAssignmentsComponent);
    fixture.componentInstance.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/details']);
  });
});
