import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ProjectWizardService } from '../services/project-wizard.service';
import { catchError, map, of } from 'rxjs';

const STEP_PATHS = ['details', 'collaborators', 'documents', 'assignments', 'staff', 'decision'];

export function StepGuard(requiredStep: number): CanActivateFn {
  return (route: ActivatedRouteSnapshot) => {
    const wizardService = inject(ProjectWizardService);
    const router = inject(Router);
    const projectId = route.parent?.paramMap.get('projectId');
    const parentPath = route.parent?.routeConfig?.path ?? '';
    const isPublic = parentPath.includes('/public');
    const stepPaths = isPublic ? ['details', 'documents', 'decision'] : STEP_PATHS;
    const basePath = isPublic ? '/new-solo-project/public' : '/new-solo-project/private';

    const decide = (completed: number) => {
      if (completed >= requiredStep - 1) return true;
      const targetIndex = Math.min(completed, stepPaths.length - 1);
      const segments = projectId
        ? [basePath, projectId, stepPaths[targetIndex]]
        : [basePath, stepPaths[targetIndex]];
      return router.createUrlTree(segments);
    };

    if (projectId && wizardService.projectId() !== projectId) {
      return wizardService.loadDraft(projectId).pipe(
        map(project => decide(project.completedStep)),
        catchError(() => of(router.createUrlTree(['/top-menu-solo-projects']))),
      );
    }

    return decide(wizardService.completedStep());
  };
}
