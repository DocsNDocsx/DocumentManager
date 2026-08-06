import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TEAM_FEATURE_ENABLED } from '../config/features';

export const teamFeatureGuard: CanActivateFn = () =>
  TEAM_FEATURE_ENABLED || inject(Router).createUrlTree(['/dashboard']);
