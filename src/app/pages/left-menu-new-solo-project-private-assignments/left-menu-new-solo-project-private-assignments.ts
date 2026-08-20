import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

interface CollabSummary {
  firstName: string;
  lastName: string;
  email: string;
  projectIndex: number;
  status?: 'active' | 'inactive';
}

interface DocSummary {
  name: string;
  projectIndex: number;
  status?: 'active' | 'inactive';
}

@Component({
  selector: 'app-left-menu-new-solo-project-private-assignments',
  templateUrl: './left-menu-new-solo-project-private-assignments.html',
  styleUrl: './left-menu-new-solo-project-private-assignments.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, RouterLink],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateAssignmentsComponent implements OnInit, OnDestroy {
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

  collaborators = signal<CollabSummary[]>([]);
  documents = signal<DocSummary[]>([]);
  assignments = signal<Record<number, Set<number>>>({});

  isSaving = computed(() => this.wizardService.isSaving());

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision', 'Payment'];
    return labels.map((label, i) => ({
      label,
      state: i === 3 ? 'active' : i < done ? 'completed' : 'locked',
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
    if (proj) {
      this.collaborators.set(proj.collaborators
        .map((c, projectIndex) => ({ firstName: c.firstName, lastName: c.lastName, email: c.email, projectIndex, status: c.status }))
        .filter(c => c.status !== 'inactive'));
      this.documents.set(proj.documents
        .map((d, projectIndex) => ({ name: d.name, projectIndex, status: d.status }))
        .filter(d => d.status !== 'inactive'));
      const activeDocumentIndexes = new Set(this.documents().map(document => document.projectIndex));
      const restored: Record<number, Set<number>> = {};
      this.collaborators().forEach(collaborator => {
        restored[collaborator.projectIndex] = new Set(
          (proj.assignments[String(collaborator.projectIndex)] ?? []).filter(index => activeDocumentIndexes.has(index))
        );
      });
      this.assignments.set(restored);
    }
  }

  warnings = computed(() => {
    const collabs = this.collaborators();
    const assigns = this.assignments();
    return collabs
      .map(c => ({ name: `${c.firstName} ${c.lastName}`, assigned: assigns[c.projectIndex]?.size ?? 0 }))
      .filter(item => item.assigned === 0)
      .map(item => `${item.name} has no documents assigned`);
  });

  allAssigned = computed(() => this.warnings().length === 0);


  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  isChecked(collabIndex: number, docIndex: number): boolean {
    const projectIndex = this.collaborators()[collabIndex]?.projectIndex;
    const projectDocIndex = this.documents()[docIndex]?.projectIndex;
    return projectIndex == null || projectDocIndex == null ? false : (this.assignments()[projectIndex]?.has(projectDocIndex) ?? false);
  }

  toggleAssignment(collabIndex: number, docIndex: number, checked: boolean): void {
    const projectIndex = this.collaborators()[collabIndex]?.projectIndex;
    const projectDocIndex = this.documents()[docIndex]?.projectIndex;
    if (projectIndex == null || projectDocIndex == null) return;
    this.assignments.update(curr => {
      const copy: Record<number, Set<number>> = {};
      for (const key in curr) {
        copy[key] = new Set(curr[key]);
      }
      if (!copy[projectIndex]) copy[projectIndex] = new Set();
      if (checked) {
        copy[projectIndex].add(projectDocIndex);
      } else {
        copy[projectIndex].delete(projectDocIndex);
      }
      return copy;
    });
  }

  isColumnAllSelected(docIndex: number): boolean {
    return this.collaborators().every((_, ci) => this.isChecked(ci, docIndex));
  }

  toggleColumn(docIndex: number): void {
    const allSelected = this.isColumnAllSelected(docIndex);
    const projectDocIndex = this.documents()[docIndex]?.projectIndex;
    if (projectDocIndex == null) return;
    this.assignments.update(curr => {
      const copy: Record<number, Set<number>> = {};
      for (const key in curr) copy[key] = new Set(curr[key]);
      this.collaborators().forEach(collaborator => {
        const ci = collaborator.projectIndex;
        if (!copy[ci]) copy[ci] = new Set();
        if (allSelected) {
          copy[ci].delete(projectDocIndex);
        } else {
          copy[ci].add(projectDocIndex);
        }
      });
      return copy;
    });
  }

  selectAll(): void {
    const newAssign: Record<number, Set<number>> = {};
    this.collaborators().forEach(collaborator => {
      newAssign[collaborator.projectIndex] = new Set(this.documents().map(document => document.projectIndex));
    });
    this.assignments.set(newAssign);
  }

  clearAll(): void {
    const newAssign: Record<number, Set<number>> = {};
    this.collaborators().forEach(collaborator => { newAssign[collaborator.projectIndex] = new Set(); });
    this.assignments.set(newAssign);
  }

  trackByIndex(index: number): number {
    return index;
  }

  back(): void {
    this.router.navigate(['../documents'], { relativeTo: this.route });
  }

  cancel(): void {
    this.router.navigate(['/left-menu-new-solo-project-landing']);
  }

  saveAsDraft(): void {
    this.showToast('Project saved as draft');
    this.wizardService.saveDraft().subscribe({
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    const raw = this.assignments();
    const serializable: Record<string, number[]> = {};
    for (const key in raw) serializable[key] = Array.from(raw[key]);
    this.wizardService.saveAssignments({ assignments: serializable }).subscribe({
      next: () => this.router.navigate(['../staff'], { relativeTo: this.route }),
      error: () => {},
    });
  }
}
