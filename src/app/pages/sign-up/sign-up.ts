import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

function passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = control.value ?? '';
  const valid =
    v.length >= 8 &&
    /[A-Z]/.test(v) &&
    /[0-9]/.test(v) &&
    /[@$!%*?&#]/.test(v);
  return valid ? null : { passwordStrength: true };
}

@Component({
  selector: 'app-sign-up',
  imports: [ReactiveFormsModule, NgOptimizedImage, TrustPillsComponent, LogoComponent],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggingService);

  readonly showPassword = signal(false);
  readonly isSubmitting = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.pattern('[A-Za-z]+'), Validators.maxLength(30)]],
    lastName:  ['', [Validators.required, Validators.pattern('[A-Za-z]+'), Validators.maxLength(30)]],
    email:     ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    password:  ['', [Validators.required, passwordStrengthValidator]],
    ageRequirement: [false, Validators.requiredTrue],
  });

  private readonly passwordValue = toSignal(
    this.form.controls.password.valueChanges,
    { initialValue: '' }
  );

  readonly reqLength  = computed(() => (this.passwordValue() ?? '').length >= 8);
  readonly reqUpper   = computed(() => /[A-Z]/.test(this.passwordValue() ?? ''));
  readonly reqNumber  = computed(() => /[0-9]/.test(this.passwordValue() ?? ''));
  readonly reqSpecial = computed(() => /[@$!%*?&#]/.test(this.passwordValue() ?? ''));

  get f() { return this.form.controls; }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.serverError.set(null);

    const { firstName, lastName, email, password } = this.form.value;
    this.logger.debug('Registration form submitted', { email });

    this.authService.register(firstName!, lastName!, email!, password!).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.logger.info('Registration successful, redirecting to passcode');
        this.router.navigate(['/sign-up-passcode'], { state: { email } });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.logger.warn('Registration failed', err?.error?.message);
        this.serverError.set(err?.error?.message ?? 'Registration failed. Please try again.');
      },
    });
  }
}
