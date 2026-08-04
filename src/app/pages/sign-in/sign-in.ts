import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, NgOptimizedImage, TrustPillsComponent, LogoComponent],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private logger = inject(LoggingService);

  showPassword = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  onSubmit() {
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { email, password } = this.form.getRawValue();
    this.logger.debug('Sign-in form submitted', { email });

    this.authService.login(email!, password!).subscribe({
      next: ({ token, userid, firstname, lastname, email, avatarPath, timezone }) => {
        this.authService.saveToken(token);
        this.authService.saveUserId(userid);
        this.authService.saveUserFirstname(firstname);
        this.authService.saveUserLastname(lastname);
        this.authService.saveUserEmail(email);
        this.authService.saveUserAvatar(avatarPath);
        this.authService.saveUserTimezone(timezone ?? 'UTC-5');
        this.isLoading.set(false);
        this.logger.info('User signed in, navigating to dashboard');
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.isLoading.set(false);
        this.logger.warn('Sign-in failed — invalid credentials', { email });
        this.errorMessage.set('Invalid email or password. Please try again.');
      },
    });
  }
}
