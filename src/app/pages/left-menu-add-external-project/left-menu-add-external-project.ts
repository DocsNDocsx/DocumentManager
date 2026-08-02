import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-left-menu-add-external-project',
  templateUrl: './left-menu-add-external-project.html',
  styleUrl: './left-menu-add-external-project.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuAddExternalProjectComponent {
  private router = inject(Router);
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  dropdownOpen = signal(false);
  projectCode = signal('');
  submitted = signal(false);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  joinedProjectName = signal<string | null>(null);
  joinedByName = signal<string | null>(null);

  isFormValid = computed(() => this.projectCode().trim().length >= 6);

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  joinProject(): void {
    if (!this.isFormValid() || this.isLoading()) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.http.post<{ success: boolean; project: { id: string; name: string; teamName?: string; ownerName?: string; collaboratorIndex?: number; workspacePath?: string; projectType?: string } }>(
      `${environment.apiUrl}/teams/projects/join`,
      { projectCode: this.projectCode().trim().toUpperCase(), userId: this.auth.currentUserId() }
    ).subscribe({
      next: res => {
        this.isLoading.set(false);
        if (res.project.projectType === 'solo' && res.project.collaboratorIndex !== undefined) {
          this.router.navigate(['/collaborator-view', res.project.id, res.project.collaboratorIndex]);
          return;
        }
        this.joinedProjectName.set(res.project.name);
        this.joinedByName.set(res.project.teamName ?? res.project.ownerName ?? null);
        this.submitted.set(true);
      },
      error: err => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Failed to join project. Please check the code and try again.');
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/dashboard']);
  }
}
