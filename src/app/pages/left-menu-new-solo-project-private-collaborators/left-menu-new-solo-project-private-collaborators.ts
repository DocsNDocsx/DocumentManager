import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

export interface Collaborator {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
}

@Component({
  selector: 'app-left-menu-new-solo-project-private-collaborators',
  templateUrl: './left-menu-new-solo-project-private-collaborators.html',
  styleUrl: './left-menu-new-solo-project-private-collaborators.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateCollaboratorsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
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

  collaboratorCount = signal(1);
  collaborators = signal<Collaborator[]>([]);
  formsGenerated = signal(false);
  isSaving = computed(() => this.wizardService.isSaving());

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision'];
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
      this.collaboratorCount.set(proj.collaborators.length);
      this.formsGenerated.set(true);
    }
  }

  isFormValid = computed(() => {
    const list = this.collaborators();
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
    if (n < 1) return;
    this.collaborators.set(
      Array.from({ length: n }, () => ({ firstName: '', lastName: '', email: '', affiliation: '' }))
    );
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
    if (this.collaborators().length <= 1) return;
    this.collaborators.update(list => list.filter((_, i) => i !== index));
    this.collaboratorCount.set(this.collaborators().length);
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
