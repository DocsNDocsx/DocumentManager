import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';
import { LogoComponent } from '../../shared/logo/logo';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, NgOptimizedImage, LogoComponent, TrustPillsComponent],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private logger = inject(LoggingService);

  isLoading = signal(false);
  errorMessage = signal('');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  onSubmit(): void {
    if (this.form.invalid) return;

    const email = this.form.getRawValue().email!;
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.logger.debug('Forgot password submitted', { email });

    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.logger.info('OTP sent, navigating to passcode page');
        this.router.navigate(['/forpassword-passcode'], { state: { email } });
      },
      error: () => {
        this.isLoading.set(false);
        this.logger.warn('Forgot password request failed', { email });
        this.errorMessage.set('Could not send reset code. Please check the email and try again.');
      },
    });
  }
}
