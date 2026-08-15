import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-login-passcode',
  imports: [RouterLink, LogoComponent],
  templateUrl: './login-passcode.html',
  styleUrl: './login-passcode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPasscodeComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  email = signal('');
  challengeId = signal('');
  passcode = signal('');
  errorMessage = signal('');
  isSubmitting = signal(false);
  secondsLeft = signal(30);
  canResend = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const state = history.state as { email?: string; challengeId?: string };
    if (!state.email || !state.challengeId) {
      this.router.navigate(['/sign-in']);
      return;
    }
    this.email.set(state.email);
    this.challengeId.set(state.challengeId);
    this.startTimer();
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  onInput(event: Event): void {
    this.passcode.set((event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6));
    this.errorMessage.set('');
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.passcode().length !== 6) {
      this.errorMessage.set('Enter the six-digit passcode.');
      return;
    }
    this.isSubmitting.set(true);
    this.auth.verifyLoginPasscode(this.challengeId(), this.passcode()).subscribe({
      next: response => {
        this.isSubmitting.set(false);
        if (!this.auth.saveLogin(response)) {
          this.errorMessage.set('Sign-in could not be completed. Please try again.');
          return;
        }
        this.router.navigate(['/dashboard']);
      },
      error: err => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Invalid passcode. Please try again.');
      },
    });
  }

  resend(): void {
    if (!this.canResend()) return;
    this.auth.resendLoginPasscode(this.challengeId()).subscribe({
      next: () => this.startTimer(),
      error: err => this.errorMessage.set(err?.error?.message ?? 'Could not resend the passcode.'),
    });
  }

  private startTimer(): void {
    this.clearTimer();
    this.secondsLeft.set(30);
    this.canResend.set(false);
    this.timer = setInterval(() => {
      this.secondsLeft.update(value => value - 1);
      if (this.secondsLeft() <= 0) {
        this.clearTimer();
        this.canResend.set(true);
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
