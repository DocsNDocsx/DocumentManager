import { ChangeDetectionStrategy, Component, signal, computed, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { LogoComponent } from '../../shared/logo/logo';

interface PasswordRule {
  id: string;
  label: string;
  test: RegExp;
}

@Component({
  selector: 'app-for-password-passcode',
  imports: [RouterLink, NgOptimizedImage, LogoComponent],
  templateUrl: './for-password-passcode.html',
  styleUrl: './for-password-passcode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForPasswordPasscodeComponent {
  private readonly router = inject(Router);

  password = signal('');
  confirmPassword = signal('');
  showPasswords = signal(false);

  readonly rules: PasswordRule[] = [
    { id: 'r1', label: '8+ characters', test: /.{8,}/ },
    { id: 'r2', label: 'Uppercase letter', test: /[A-Z]/ },
    { id: 'r3', label: 'Number', test: /[0-9]/ },
    { id: 'r4', label: 'Special character', test: /[@$!%*?&#]/ },
  ];

  ruleValidity = computed(() => {
    return this.rules.map(r => ({ ...r, valid: r.test.test(this.password()) }));
  });

  allRulesValid = computed(() => this.ruleValidity().every(r => r.valid));

  passwordsMatch = computed(() =>
    this.password() === this.confirmPassword() && this.password() !== ''
  );

  showMismatchError = computed(() =>
    !this.passwordsMatch() && this.confirmPassword() !== ''
  );

  canSubmit = computed(() => this.allRulesValid() && this.passwordsMatch());

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
    if (this.canSubmit()) {
      this.router.navigate(['/forpassword-changeconfirm']);
    }
  }
}
