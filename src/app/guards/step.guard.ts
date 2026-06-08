import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ProjectWizardService } from '../services/project-wizard.service';

const STEP_PATHS = ['details', 'collaborators', 'documents', 'assignments', 'staff', 'decision'];

export function StepGuard(requiredStep: number): CanActivateFn {
  return (route: ActivatedRouteSnapshot) => {
    const wizardService = inject(ProjectWizardService);
    const router = inject(Router);
    const completed = wizardService.completedStep();

    if (completed >= requiredStep - 1) return true;

    const projectId = route.parent?.paramMap.get('projectId');
    const targetIndex = Math.min(completed, STEP_PATHS.length - 1);
    const segments = projectId
      ? ['/new-solo-project/private', projectId, STEP_PATHS[targetIndex]]
      : ['/new-solo-project/private', STEP_PATHS[targetIndex]];
    return router.createUrlTree(segments);
  };
}
