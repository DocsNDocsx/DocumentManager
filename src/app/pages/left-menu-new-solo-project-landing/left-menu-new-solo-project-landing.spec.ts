import { TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { signal } from '@angular/core';

import { LeftMenuNewSoloProjectLandingComponent } from './left-menu-new-solo-project-landing';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectLandingComponent', () => {
  it('clears any previous solo wizard state when starting a new project', async () => {
    const wizard = { reset: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectLandingComponent, RouterModule.forRoot([])],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
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

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectLandingComponent);
    fixture.detectChanges();

    expect(wizard.reset).toHaveBeenCalled();
  });
});
