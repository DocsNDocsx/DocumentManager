import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { TeamProjectWizardService } from '../services/team-project-wizard.service';

const TEAM_PRIVATE_STEPS = ['details', 'collaborators', 'documents', 'assignments', 'decision'];

export function TeamStepGuard(requiredStep: number): CanActivateFn {
  return (_route: ActivatedRouteSnapshot) => {
    const wizardService = inject(TeamProjectWizardService);
    const router = inject(Router);
    const completed = wizardService.completedStep();
    if (completed >= requiredStep - 1) return true;
    const targetIndex = Math.min(completed, TEAM_PRIVATE_STEPS.length - 1);
    return router.createUrlTree(['/new-team-project/private', TEAM_PRIVATE_STEPS[targetIndex]]);
  };
}
