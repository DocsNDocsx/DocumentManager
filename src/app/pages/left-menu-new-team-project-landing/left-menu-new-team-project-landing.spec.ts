import { TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { signal } from '@angular/core';

import { LeftMenuNewTeamProjectLandingComponent } from './left-menu-new-team-project-landing';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewTeamProjectLandingComponent', () => {
  it('clears any previous team project wizard state when starting a new project', async () => {
    const wizard = { reset: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectLandingComponent, RouterModule.forRoot([])],
      providers: [
        { provide: TeamProjectWizardService, useValue: wizard },
        {
          provide: AuthService,
          useValue: {
            currentUserFirstname: signal(''),
            currentUserLastname: signal(''),
            currentUserEmail: signal(''),
            currentUserAvatar: signal(''),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectLandingComponent);
    fixture.detectChanges();

    expect(wizard.reset).toHaveBeenCalled();
  });
});
