import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

export interface Collaborator {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  status?: 'active' | 'inactive';
  removedAt?: string | null;
}

@Component({
  selector: 'app-left-menu-new-solo-project-private-collaborators',
  templateUrl: './left-menu-new-solo-project-private-collaborators.html',
  styleUrl: './left-menu-new-solo-project-private-collaborators.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent, RouterLink],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateCollaboratorsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
  readonly isActiveProject = computed(() => this.wizardService.project()?.status === 'active');
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

  collaboratorCount = signal(1);
  minimumCollaboratorCount = signal(1);
  collaborators = signal<Collaborator[]>([]);
  activeCollaboratorCount = computed(() => this.collaborators().filter(c => c.status !== 'inactive').length);
  formsGenerated = signal(false);
  isSaving = computed(() => this.wizardService.isSaving());

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision', 'Payment'];
    return labels.map((label, i) => ({
      label,
      state: i === 1 ? 'active' : i < done ? 'completed' : 'locked',
    }));
  });

  ngOnInit(): void {
    const id = this.route.parent?.snapshot.paramMap.get('projectId') ?? null;
    if (id && this.wizardService.projectId() !== id) {
      this.wizardService.loadDraft(id).subscribe(() => this.populateForm());
    } else {
      this.populateForm();
    }
  }

  private populateForm(): void {
    const proj = this.wizardService.project();
    if (proj && proj.collaborators.length > 0) {
      this.collaborators.set(proj.collaborators);
      this.collaboratorCount.set(proj.collaborators.filter(c => c.status !== 'inactive').length);
      this.minimumCollaboratorCount.set(1);
      this.formsGenerated.set(true);
    }
  }

  isFormValid = computed(() => {
    const list = this.collaborators().filter(c => c.status !== 'inactive');
    if (!list.length) return false;
    return list.every(c =>
      c.firstName.trim() !== '' &&
      c.lastName.trim() !== '' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)
    );
  });


  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  generateForms(): void {
    const n = this.collaboratorCount();
    const activeCount = this.activeCollaboratorCount();
    if (n < activeCount || n < 1) return;
    const existing = this.collaborators();
    const additions = Array.from({ length: n - activeCount }, () =>
      ({ firstName: '', lastName: '', email: '', affiliation: '', status: 'active' as const })
    );
    this.collaborators.set([...existing, ...additions]);
    this.formsGenerated.set(true);
  }

  updateField(index: number, field: keyof Collaborator, value: string): void {
    this.collaborators.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  removeCollaborator(index: number): void {
    if (this.activeCollaboratorCount() <= 1) return;
    if (this.isActiveProject()) {
      this.collaborators.update(list => list.map((collaborator, i) => i === index
        ? { ...collaborator, status: 'inactive', removedAt: new Date().toISOString() }
        : collaborator));
    } else {
      this.collaborators.update(list => list.filter((_, i) => i !== index));
    }
    this.collaboratorCount.set(this.activeCollaboratorCount());
  }

  trackByIndex(index: number): number {
    return index;
  }

  back(): void {
    this.router.navigate(['../details'], { relativeTo: this.route });
  }

  saveAsDraft(): void {
    this.showToast('Project saved as draft');
    this.wizardService.saveDraft().subscribe({
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    if (!this.isFormValid()) return;
    this.wizardService.saveCollaborators({ collaborators: this.collaborators() }).subscribe({
      next: () => this.router.navigate(['../documents'], { relativeTo: this.route }),
      error: () => {},
    });
  }
}
