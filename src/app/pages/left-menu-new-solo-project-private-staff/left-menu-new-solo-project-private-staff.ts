import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

@Component({
  selector: 'app-left-menu-new-solo-project-private-staff',
  templateUrl: './left-menu-new-solo-project-private-staff.html',
  styleUrl: './left-menu-new-solo-project-private-staff.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateStaffComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
  dropdownOpen = signal(false);

  toastMsg = signal('');
  toastVisible = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private showToast(msg: string): void {
    this.toastMsg.set(msg);
    this.toastVisible.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 3000);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  isSaving = computed(() => this.wizardService.isSaving());

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision'];
    return labels.map((label, i) => ({
      label,
      state: i === 4 ? 'active' : i < done ? 'completed' : 'locked',
    }));
  });

  ngOnInit(): void {
    const staff = this.wizardService.project()?.staff;
    if (staff) {
      this.addStaff.set(true);
      this.staffFirstName.set(staff.firstName);
      this.staffLastName.set(staff.lastName);
      this.staffEmail.set(staff.email);
      this.staffAffiliation.set(staff.affiliation);
    }
  }

  addStaff = signal(false);
  staffFirstName = signal('');
  staffLastName = signal('');
  staffEmail = signal('');
  staffAffiliation = signal('');


  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  toggleStaff(): void {
    const next = !this.addStaff();
    this.addStaff.set(next);
    if (!next) {
      this.staffFirstName.set('');
      this.staffLastName.set('');
      this.staffEmail.set('');
      this.staffAffiliation.set('');
    }
  }

  back(): void {
    this.router.navigate(['/new-solo-project/private/assignments']);
  }

  saveAsDraft(): void {
    this.showToast('Project saved as draft');
    this.wizardService.saveDraft().subscribe({
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    const staff = this.addStaff() ? {
      firstName: this.staffFirstName(),
      lastName: this.staffLastName(),
      email: this.staffEmail(),
      affiliation: this.staffAffiliation(),
    } : null;
    this.wizardService.saveStaff({ staff }).subscribe({
      next: () => this.router.navigate(['/new-solo-project/private/decision']),
      error: () => {},
    });
  }
}
