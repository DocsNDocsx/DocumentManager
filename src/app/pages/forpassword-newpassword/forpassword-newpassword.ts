import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { LogoComponent } from '../../shared/logo/logo';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

interface PasswordRule {
  id: string;
  label: string;
  test: RegExp;
}

@Component({
  selector: 'app-forpassword-newpassword',
  imports: [NgOptimizedImage, LogoComponent, TrustPillsComponent],
  templateUrl: './forpassword-newpassword.html',
  styleUrl: './forpassword-newpassword.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForpasswordNewpasswordComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(LoggingService);

  private resetToken = '';

  password = signal('');
  confirmPassword = signal('');
  showPasswords = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal('');

  readonly rules: PasswordRule[] = [
    { id: 'r1', label: '8+ characters', test: /.{8,}/ },
    { id: 'r2', label: 'Uppercase letter', test: /[A-Z]/ },
    { id: 'r3', label: 'Number', test: /[0-9]/ },
    { id: 'r4', label: 'Special character', test: /[@$!%*?&#]/ },
  ];

  ruleValidity = computed(() =>
    this.rules.map(r => ({ ...r, valid: r.test.test(this.password()) }))
  );

  allRulesValid = computed(() => this.ruleValidity().every(r => r.valid));

  passwordsMatch = computed(() =>
    this.password() === this.confirmPassword() && this.password() !== ''
  );

  showMismatchError = computed(() =>
    !this.passwordsMatch() && this.confirmPassword() !== ''
  );

  canSubmit = computed(() => this.allRulesValid() && this.passwordsMatch() && !this.isSubmitting());

  ngOnInit(): void {
    const state = history.state as { resetToken?: string };
    if (state?.resetToken) {
      this.resetToken = state.resetToken;
    }
  }

  onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  onConfirmInput(event: Event): void {
    this.confirmPassword.set((event.target as HTMLInputElement).value);
  }

  togglePasswords(event: Event): void {
    this.showPasswords.set((event.target as HTMLInputElement).checked);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.logger.debug('Password reset form submitted');

    this.authService.resetPassword(this.resetToken, this.password()).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.logger.info('Password reset successful');
        this.router.navigate(['/forpassword-change']);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.logger.warn('Password reset failed');
        this.errorMessage.set(err?.error?.reason ?? err?.error?.message ?? 'Failed to reset password. Please try again.');
      },
    });
  }
}
