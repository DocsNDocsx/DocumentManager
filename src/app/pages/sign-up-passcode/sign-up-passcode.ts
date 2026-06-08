import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-sign-up-passcode',
  imports: [RouterLink, ReactiveFormsModule, NgOptimizedImage, TrustPillsComponent, LogoComponent],
  templateUrl: './sign-up-passcode.html',
  styleUrl: './sign-up-passcode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpPasscodeComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggingService);

  readonly form = new FormGroup({
    otp: new FormControl('', [
      Validators.required,
      Validators.pattern(/^\d{6}$/),
    ]),
  });

  get otp() { return this.form.controls.otp; }

  readonly showPasscode = signal(false);
  readonly secondsLeft = signal(30);
  readonly canResend = computed(() => this.secondsLeft() <= 0);
  readonly isSubmitting = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly userEmail = signal<string>('');

  private timerId: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    const email = this.router.lastSuccessfulNavigation()?.extras?.state?.['email'] ?? '';
    this.userEmail.set(email);
    this.startTimer();
    this.destroyRef.onDestroy(() => {
      if (this.timerId) clearInterval(this.timerId);
    });
  }

  togglePasscode() {
    this.showPasscode.update(v => !v);
  }

  startTimer() {
    if (this.timerId) clearInterval(this.timerId);
    this.secondsLeft.set(30);
    this.timerId = setInterval(() => {
      this.secondsLeft.update(v => v - 1);
      if (this.secondsLeft() <= 0) {
        clearInterval(this.timerId!);
        this.timerId = null;
      }
    }, 1000);
  }

  resendCode() {
    this.startTimer();
  }

  onVerify() {
    if (this.otp.invalid) {
      this.otp.markAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.serverError.set(null);
    this.logger.debug('Email OTP verification submitted', { email: this.userEmail() });

    this.authService.verifyOtp(this.userEmail(), this.otp.value ?? '', 'signup').subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res.valid) {
          if (res.jwt) this.authService.saveToken(res.jwt);
          if (res.userid != null) this.authService.saveUserId(res.userid);
          if (res.firstname) this.authService.saveUserFirstname(res.firstname);
          if (res.lastname) this.authService.saveUserLastname(res.lastname);
          if (res.email) this.authService.saveUserEmail(res.email);
          this.logger.info('Email verified, navigating to dashboard');
          this.router.navigate(['/dashboard']);
        } else {
          this.logger.warn('Email OTP invalid', res.message);
          this.serverError.set(res.message ?? 'Invalid code. Please try again.');
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.logger.warn('Email OTP verification failed', err?.error?.message);
        this.serverError.set(err?.error?.message ?? 'Verification failed. Please try again.');
      },
    });
  }
}
