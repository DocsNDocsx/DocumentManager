import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-sign-in-passcode',
  imports: [RouterLink, NgOptimizedImage, TrustPillsComponent, LogoComponent],
  templateUrl: './sign-in-passcode.html',
  styleUrl: './sign-in-passcode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInPasscodeComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(LoggingService);

  email = signal('');
  showPasscode = signal(false);
  passcode = signal('');
  secondsLeft = signal(30);
  canResend = signal(false);
  isSubmitting = signal(false);
  passcodeError = signal(false);
  errorMessage = signal('');

  private countdownId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const state = history.state as { email?: string };
    if (state?.email) {
      this.email.set(state.email);
    }
    this.startTimer();
    this.destroyRef.onDestroy(() => {
      if (this.countdownId !== null) clearInterval(this.countdownId);
    });
  }

  togglePasscode(): void {
    this.showPasscode.update(v => !v);
  }

  onPasscodeInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.passcode.set(value);
    this.passcodeError.set(false);
    this.errorMessage.set('');
  }

  startTimer(): void {
    if (this.countdownId !== null) clearInterval(this.countdownId);
    this.secondsLeft.set(30);
    this.canResend.set(false);

    this.countdownId = setInterval(() => {
      this.secondsLeft.update(v => v - 1);
      if (this.secondsLeft() <= 0) {
        clearInterval(this.countdownId!);
        this.countdownId = null;
        this.canResend.set(true);
      }
    }, 1000);
  }

  resendCode(): void {
    const email = this.email();
    if (!email) return;
    this.authService.forgotPassword(email).subscribe({
      next: () => this.startTimer(),
      error: () => this.errorMessage.set('Failed to resend code. Please try again.'),
    });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const honeypot = (form.elements.namedItem('b_trap') as HTMLInputElement)?.value;
    if (honeypot !== '') return;

    const cleaned = this.passcode().replace(/\D/g, '').replace(/[<>]/g, '');
    this.passcode.set(cleaned);

    if (cleaned.length !== 6) {
      this.passcodeError.set(true);
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.logger.debug('OTP submitted for password reset', { email: this.email() });

    this.authService.verifyOtp(this.email(), cleaned).subscribe({
      next: ({ token }) => {
        this.isSubmitting.set(false);
        this.logger.info('OTP verified, redirecting to reset password');
        this.router.navigate(['/forpassword-newpassword'], { state: { resetToken: token } });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.passcodeError.set(true);
        this.logger.warn('OTP verification failed', err?.error?.message);
        this.errorMessage.set(err?.error?.message ?? 'Invalid passcode. Please try again.');
      },
    });
  }
}
