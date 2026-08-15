import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { HomeComponent } from './pages/home/home';
import { SignUpComponent } from './pages/sign-up/sign-up';
import { SignInComponent } from './pages/sign-in/sign-in';
import { ForgotPasswordComponent } from './pages/forgot-password/forgot-password';
import { ForpasswordChangeconfirmComponent } from './pages/forpassword-changeconfirm/forpassword-changeconfirm';
import { ForpasswordNewpasswordComponent } from './pages/forpassword-newpassword/forpassword-newpassword';
import { SignUpPasscodeComponent } from './pages/sign-up-passcode/sign-up-passcode';
import { SignUpConfirmAccountComponent } from './pages/sign-up-confirm-account/sign-up-confirm-account';
import { SignInPasscodeComponent } from './pages/sign-in-passcode/sign-in-passcode';
import { LoginPasscodeComponent } from './pages/login-passcode/login-passcode';
import { ForPasswordPasscodeComponent } from './pages/for-password-passcode/for-password-passcode';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { DashboardRecentActivityComponent } from './pages/dashboard-recent-activity/dashboard-recent-activity';
import { CheckSubmissionsComponent } from './pages/check-submissions/check-submissions';
import { CollaboratorViewComponent } from './pages/collaborator-view/collaborator-view';
import { DropDownProfileComponent } from './pages/drop-down-profile/drop-down-profile';
import { DropDownStorageComponent } from './pages/drop-down-storage/drop-down-storage';
import { DropDownPaymentHistoryComponent } from './pages/drop-down-payment-history/drop-down-payment-history';
import { DropDownAccountSettingsComponent } from './pages/drop-down-account-settings/drop-down-account-settings';
import { TopMenuSoloProjectsComponent } from './pages/top-menu-solo-projects/top-menu-solo-projects';
import { TopMenuTeamsComponent } from './pages/top-menu-teams/top-menu-teams';
import { TopMenuTeamsEditTeamsComponent } from './pages/top-menu-teams-edit-teams/top-menu-teams-edit-teams';
import { TopMenuTeamsViewTeamsComponent } from './pages/top-menu-teams-view-teams/top-menu-teams-view-teams';
import { TopMenuTeamProjectsComponent } from './pages/top-menu-team-projects/top-menu-team-projects';
import { PricingPlanComponent } from './pages/pricing-plan/pricing-plan';
import { PricingPlanCcardInformationComponent } from './pages/pricing-plan-ccard-information/pricing-plan-ccard-information';
import { PricingPlanConfirmComponent } from './pages/pricing-plan-confirm/pricing-plan-confirm';
import { LeftMenuCreateNewTeamComponent } from './pages/left-menu-create-new-team/left-menu-create-new-team';
import { LeftMenuSignOutComponent } from './pages/left-menu-sign-out/left-menu-sign-out';
import { LeftMenuSignOutConfirmComponent } from './pages/left-menu-sign-out-confirm/left-menu-sign-out-confirm';
import { LeftMenuAddExternalProjectComponent } from './pages/left-menu-add-external-project/left-menu-add-external-project';
import { LeftMenuNewSoloProjectLandingComponent } from './pages/left-menu-new-solo-project-landing/left-menu-new-solo-project-landing';
import { LeftMenuNewSoloProjectPrivateDetailsComponent } from './pages/left-menu-new-solo-project-private-details/left-menu-new-solo-project-private-details';
import { LeftMenuNewSoloProjectPrivateCollaboratorsComponent } from './pages/left-menu-new-solo-project-private-collaborators/left-menu-new-solo-project-private-collaborators';
import { LeftMenuNewSoloProjectPrivateDocumentsComponent } from './pages/left-menu-new-solo-project-private-documents/left-menu-new-solo-project-private-documents';
import { LeftMenuNewSoloProjectPrivateAssignmentsComponent } from './pages/left-menu-new-solo-project-private-assignments/left-menu-new-solo-project-private-assignments';
import { LeftMenuNewSoloProjectPrivateStaffComponent } from './pages/left-menu-new-solo-project-private-staff/left-menu-new-solo-project-private-staff';
import { LeftMenuNewSoloProjectPrivateDecisionComponent } from './pages/left-menu-new-solo-project-private-decision/left-menu-new-solo-project-private-decision';
import { SoloProjectWizardShellComponent } from './pages/solo-project-wizard-shell/solo-project-wizard-shell';
import { StepGuard } from './guards/step.guard';
import { LeftMenuNewSoloProjectPublicDetailsComponent } from './pages/left-menu-new-solo-project-public-details/left-menu-new-solo-project-public-details';
import { LeftMenuNewSoloProjectPublicDocumentsComponent } from './pages/left-menu-new-solo-project-public-documents/left-menu-new-solo-project-public-documents';
import { LeftMenuNewSoloProjectPublicDecisionComponent } from './pages/left-menu-new-solo-project-public-decision/left-menu-new-solo-project-public-decision';
import { LeftMenuNewTeamProjectLandingComponent } from './pages/left-menu-new-team-project-landing/left-menu-new-team-project-landing';
import { LeftMenuNewTeamProjectPrivateDetailsComponent } from './pages/left-menu-new-team-project-private-details/left-menu-new-team-project-private-details';
import { LeftMenuNewTeamProjectPrivateCollaboratorsComponent } from './pages/left-menu-new-team-project-private-collaborators/left-menu-new-team-project-private-collaborators';
import { LeftMenuNewTeamProjectPrivateDocumentsComponent } from './pages/left-menu-new-team-project-private-documents/left-menu-new-team-project-private-documents';
import { LeftMenuNewTeamProjectPrivateAssignmentsComponent } from './pages/left-menu-new-team-project-private-assignments/left-menu-new-team-project-private-assignments';
import { LeftMenuNewTeamProjectPrivateDecisionComponent } from './pages/left-menu-new-team-project-private-decision/left-menu-new-team-project-private-decision';
import { LeftMenuNewTeamProjectPublicDetailsComponent } from './pages/left-menu-new-team-project-public-details/left-menu-new-team-project-public-details';
import { LeftMenuNewTeamProjectPublicDocumentsComponent } from './pages/left-menu-new-team-project-public-documents/left-menu-new-team-project-public-documents';
import { LeftMenuNewTeamProjectPublicDecisionComponent } from './pages/left-menu-new-team-project-public-decision/left-menu-new-team-project-public-decision';
import { TeamStepGuard } from './guards/team-step.guard';
import { TeamProjectUploadComponent } from './pages/team-project-upload/team-project-upload';
import { teamFeatureGuard } from './guards/team-feature.guard';

export const routes: Routes = [
    { path: '', component: HomeComponent },

    
    // Auth
    { path: 'sign-up', component: SignUpComponent },
    { path: 'sign-up-passcode', component: SignUpPasscodeComponent },
    { path: 'sign-up-confirm-account', component: SignUpConfirmAccountComponent },
    { path: 'sign-in', component: SignInComponent },
    { path: 'sign-in-passcode', component: LoginPasscodeComponent },
    { path: 'forgot-password', component: ForgotPasswordComponent },
    { path: 'forpassword-passcode', component: SignInPasscodeComponent },
    { path: 'forpassword-change', component: ForpasswordChangeconfirmComponent },
    { path: 'forpassword-newpassword', component: ForpasswordNewpasswordComponent },
    //{ path: 'for-password-passcode', component: ForPasswordPasscodeComponent },

    // Dashboard
    { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
    { path: 'dashboard-recent-activity', component: DashboardRecentActivityComponent, canActivate: [authGuard] },
    { path: 'check-submissions', component: CheckSubmissionsComponent, canActivate: [authGuard] },
    { path: 'collaborator-view/:projectId/:collabIndex', component: CollaboratorViewComponent, canActivate: [authGuard] },

    // Dropdown menus
    { path: 'drop-down-profile', component: DropDownProfileComponent, canActivate: [authGuard] },
    { path: 'drop-down-storage', component: DropDownStorageComponent, canActivate: [authGuard] },
    { path: 'drop-down-payment-history', component: DropDownPaymentHistoryComponent, canActivate: [authGuard] },
    { path: 'drop-down-payment-cards', redirectTo: 'drop-down-payment-history', pathMatch: 'full' },
    { path: 'drop-down-account-settings', component: DropDownAccountSettingsComponent, canActivate: [authGuard] },

    // Top-menu pages
    { path: 'top-menu-solo-projects', component: TopMenuSoloProjectsComponent, canActivate: [authGuard] },
    { path: 'top-menu-teams', component: TopMenuTeamsComponent, canActivate: [authGuard, teamFeatureGuard] },
    { path: 'top-menu-teams-edit-teams', component: TopMenuTeamsEditTeamsComponent, canActivate: [authGuard, teamFeatureGuard] },
    { path: 'top-menu-teams-view-teams', component: TopMenuTeamsViewTeamsComponent, canActivate: [authGuard, teamFeatureGuard] },
    { path: 'top-menu-team-projects', component: TopMenuTeamProjectsComponent, canActivate: [authGuard, teamFeatureGuard] },
    { path: 'team-project-upload/:projectId/:collaboratorId', component: TeamProjectUploadComponent, canActivate: [teamFeatureGuard] },

    // Pricing — unified usage-based flow
    { path: 'pricing-plan', component: PricingPlanComponent, canActivate: [authGuard] },
    { path: 'pricing-plan-ccard-information', component: PricingPlanCcardInformationComponent, canActivate: [authGuard] },
    { path: 'pricing-plan-confirm', component: PricingPlanConfirmComponent, canActivate: [authGuard] },


    // Left-menu — shared
    { path: 'left-menu-create-new-team', component: LeftMenuCreateNewTeamComponent, canActivate: [authGuard, teamFeatureGuard] },
    { path: 'left-menu-sign-out', component: LeftMenuSignOutComponent, canActivate: [authGuard] },
    { path: 'left-menu-sign-out-confirm', component: LeftMenuSignOutConfirmComponent, canActivate: [authGuard] },
    { path: 'left-menu-add-external-project', component: LeftMenuAddExternalProjectComponent, canActivate: [authGuard] },

    // Left-menu — solo project wizard
    { path: 'left-menu-new-solo-project-landing', component: LeftMenuNewSoloProjectLandingComponent, canActivate: [authGuard] },
    {
      path: 'new-solo-project/private',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',       component: LeftMenuNewSoloProjectPrivateDetailsComponent,       canActivate: [StepGuard(1)] },
        { path: 'collaborators', component: LeftMenuNewSoloProjectPrivateCollaboratorsComponent,  canActivate: [StepGuard(2)] },
        { path: 'documents',     component: LeftMenuNewSoloProjectPrivateDocumentsComponent,     canActivate: [StepGuard(3)] },
        { path: 'assignments',   component: LeftMenuNewSoloProjectPrivateAssignmentsComponent,   canActivate: [StepGuard(4)] },
        { path: 'staff',         component: LeftMenuNewSoloProjectPrivateStaffComponent,         canActivate: [StepGuard(5)] },
        { path: 'decision',      component: LeftMenuNewSoloProjectPrivateDecisionComponent,      canActivate: [StepGuard(6)] },
      ],
    },
    {
      path: 'new-solo-project/private/:projectId',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',       component: LeftMenuNewSoloProjectPrivateDetailsComponent,       canActivate: [StepGuard(1)] },
        { path: 'collaborators', component: LeftMenuNewSoloProjectPrivateCollaboratorsComponent,  canActivate: [StepGuard(2)] },
        { path: 'documents',     component: LeftMenuNewSoloProjectPrivateDocumentsComponent,     canActivate: [StepGuard(3)] },
        { path: 'assignments',   component: LeftMenuNewSoloProjectPrivateAssignmentsComponent,   canActivate: [StepGuard(4)] },
        { path: 'staff',         component: LeftMenuNewSoloProjectPrivateStaffComponent,         canActivate: [StepGuard(5)] },
        { path: 'decision',      component: LeftMenuNewSoloProjectPrivateDecisionComponent,      canActivate: [StepGuard(6)] },
      ],
    },
    {
      path: 'new-solo-project/public',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',   component: LeftMenuNewSoloProjectPublicDetailsComponent,   canActivate: [StepGuard(1)] },
        { path: 'documents', component: LeftMenuNewSoloProjectPublicDocumentsComponent, canActivate: [StepGuard(2)] },
        { path: 'decision',  component: LeftMenuNewSoloProjectPublicDecisionComponent,  canActivate: [StepGuard(3)] },
      ],
    },
    {
      path: 'new-solo-project/public/:projectId',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',   component: LeftMenuNewSoloProjectPublicDetailsComponent,   canActivate: [StepGuard(1)] },
        { path: 'documents', component: LeftMenuNewSoloProjectPublicDocumentsComponent, canActivate: [StepGuard(2)] },
        { path: 'decision',  component: LeftMenuNewSoloProjectPublicDecisionComponent,  canActivate: [StepGuard(3)] },
      ],
    },

    // Left-menu — team project wizard
    { path: 'left-menu-new-team-project-landing', component: LeftMenuNewTeamProjectLandingComponent, canActivate: [authGuard, teamFeatureGuard] },
    {
      path: 'new-team-project/private',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard, teamFeatureGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',       component: LeftMenuNewTeamProjectPrivateDetailsComponent,       canActivate: [TeamStepGuard(1)] },
        { path: 'collaborators', component: LeftMenuNewTeamProjectPrivateCollaboratorsComponent, canActivate: [TeamStepGuard(2)] },
        { path: 'documents',     component: LeftMenuNewTeamProjectPrivateDocumentsComponent,     canActivate: [TeamStepGuard(3)] },
        { path: 'assignments',   component: LeftMenuNewTeamProjectPrivateAssignmentsComponent,   canActivate: [TeamStepGuard(4)] },
        { path: 'decision',      component: LeftMenuNewTeamProjectPrivateDecisionComponent,      canActivate: [TeamStepGuard(5)] },
      ],
    },
    {
      path: 'new-team-project/public',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard, teamFeatureGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',   component: LeftMenuNewTeamProjectPublicDetailsComponent,   canActivate: [TeamStepGuard(1)] },
        { path: 'documents', component: LeftMenuNewTeamProjectPublicDocumentsComponent, canActivate: [TeamStepGuard(2)] },
        { path: 'decision',  component: LeftMenuNewTeamProjectPublicDecisionComponent,  canActivate: [TeamStepGuard(3)] },
      ],
    },
    {
      path: 'new-team-project/private/:projectId',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard, teamFeatureGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',       component: LeftMenuNewTeamProjectPrivateDetailsComponent,       canActivate: [TeamStepGuard(1)] },
        { path: 'collaborators', component: LeftMenuNewTeamProjectPrivateCollaboratorsComponent, canActivate: [TeamStepGuard(2)] },
        { path: 'documents',     component: LeftMenuNewTeamProjectPrivateDocumentsComponent,     canActivate: [TeamStepGuard(3)] },
        { path: 'assignments',   component: LeftMenuNewTeamProjectPrivateAssignmentsComponent,   canActivate: [TeamStepGuard(4)] },
        { path: 'decision',      component: LeftMenuNewTeamProjectPrivateDecisionComponent,      canActivate: [TeamStepGuard(5)] },
      ],
    },
    {
      path: 'new-team-project/public/:projectId',
      component: SoloProjectWizardShellComponent,
      canActivate: [authGuard, teamFeatureGuard],
      children: [
        { path: '', redirectTo: 'details', pathMatch: 'full' },
        { path: 'details',   component: LeftMenuNewTeamProjectPublicDetailsComponent,   canActivate: [TeamStepGuard(1)] },
        { path: 'documents', component: LeftMenuNewTeamProjectPublicDocumentsComponent, canActivate: [TeamStepGuard(2)] },
        { path: 'decision',  component: LeftMenuNewTeamProjectPublicDecisionComponent,  canActivate: [TeamStepGuard(3)] },
      ],
    },
];
