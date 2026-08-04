import { ChangeDetectionStrategy, Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { environment } from '../../../environments/environment';

interface CollabSummary {
  firstName: string;
  lastName: string;
  email: string;
}

@Component({
  selector: 'app-left-menu-new-team-project-private-assignments',
  templateUrl: './left-menu-new-team-project-private-assignments.html',
  styleUrl: './left-menu-new-team-project-private-assignments.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent],
  host: { '(document:click)': 'closeDropdown()' },
})
export class LeftMenuNewTeamProjectPrivateAssignmentsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  readonly wizardService = inject(TeamProjectWizardService);
  readonly isActiveProject = computed(() => this.wizardService.project()?.status === 'active');

  dropdownOpen = signal(false);
  collaborators = signal<CollabSummary[]>([]);
  documents = computed(() => this.wizardService.project()?.documents ?? []);
  assignments = signal<Record<number, Set<number>>>({});

  warnings = computed(() => {
    const collabs = this.collaborators();
    const assigns = this.assignments();
    return collabs
      .map((c, i) => ({ name: `${c.firstName} ${c.lastName}`, assigned: assigns[i]?.size ?? 0 }))
      .filter(item => item.assigned === 0)
      .map(item => `${item.name} has no documents assigned`);
  });

  allAssigned = computed(() => this.collaborators().length > 0 && this.warnings().length === 0);

  ngOnInit(): void {
    const id = this.wizardService.projectId();
    if (!id) {
      this.router.navigate(['/new-team-project/private/details']);
      return;
    }
    this.http.get<{ success: boolean; collaborators: CollabSummary[] }>(
      `${environment.apiUrl}/teams/projects/${id}/collaborators`
    ).subscribe({
      next: res => {
        this.collaborators.set(res.collaborators);
        const docCount = this.documents().length;
        const init: Record<number, Set<number>> = {};
        res.collaborators.forEach((_, ci) => {
          init[ci] = new Set(Array.from({ length: docCount }, (_, di) => di));
        });
        this.assignments.set(init);
      },
    });
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  isChecked(collabIndex: number, docIndex: number): boolean {
    return this.assignments()[collabIndex]?.has(docIndex) ?? false;
  }

  toggleAssignment(collabIndex: number, docIndex: number, checked: boolean): void {
    this.assignments.update(curr => {
      const copy: Record<number, Set<number>> = {};
      for (const key in curr) copy[key] = new Set(curr[key]);
      if (!copy[collabIndex]) copy[collabIndex] = new Set();
      if (checked) copy[collabIndex].add(docIndex);
      else copy[collabIndex].delete(docIndex);
      return copy;
    });
  }

  isColumnAllSelected(docIndex: number): boolean {
    return this.collaborators().every((_, ci) => this.isChecked(ci, docIndex));
  }

  toggleColumn(docIndex: number): void {
    const allSelected = this.isColumnAllSelected(docIndex);
    this.assignments.update(curr => {
      const copy: Record<number, Set<number>> = {};
      for (const key in curr) copy[key] = new Set(curr[key]);
      this.collaborators().forEach((_, ci) => {
        if (!copy[ci]) copy[ci] = new Set();
        if (allSelected) copy[ci].delete(docIndex);
        else copy[ci].add(docIndex);
      });
      return copy;
    });
  }

  selectAll(): void {
    const newAssign: Record<number, Set<number>> = {};
    this.collaborators().forEach((_, ci) => {
      newAssign[ci] = new Set(this.documents().map((_, di) => di));
    });
    this.assignments.set(newAssign);
  }

  clearAll(): void {
    const newAssign: Record<number, Set<number>> = {};
    this.collaborators().forEach((_, ci) => { newAssign[ci] = new Set(); });
    this.assignments.set(newAssign);
  }

  trackByIndex(index: number): number {
    return index;
  }

  cancel(): void {
    this.wizardService.reset();
    this.router.navigate(['/left-menu-new-team-project-landing']);
  }

  saveAsDraft(): void {
    this.wizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  continue(): void {
    if (!this.allAssigned() || this.wizardService.isSaving()) return;
    this.wizardService.saveAssignments().subscribe({
      next: () => this.router.navigate(['/new-team-project/private/decision']),
      error: () => { /* error shown via wizardService.saveError() */ },
    });
  }
}
