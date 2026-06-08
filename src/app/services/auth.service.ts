import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpHeaders } from '@angular/common/http';
import { DeleteAccountResponse, ForgotPasswordResponse, LoginResponse, RegisterResponse, ResetPasswordResponse, UpdateProfileRequest, UpdateProfileResponse, UploadAvatarResponse, VerifyOtpResponse } from '../models/auth.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  currentUserId = signal<string>(localStorage.getItem('user_id') ?? '');
  currentUserFirstname = signal<string>(localStorage.getItem('user_firstname') ?? '');
  currentUserLastname = signal<string>(localStorage.getItem('user_lastname') ?? '');
  currentUserEmail = signal<string>(localStorage.getItem('user_email') ?? '');
  currentUserAvatar = signal<string>(localStorage.getItem('user_avatar') ?? '');

  login(email: string, password: string) {
    this.logger.debug('Login attempt', { email });
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap({
        next: () => this.logger.info('Login successful', { email }),
        error: err => this.logger.warn('Login failed', err?.error?.message),
      }),
    );
  }

  register(firstname: string, lastname: string, email: string, password: string) {
    this.logger.debug('Registration attempt', { email });
    return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register`, {
      firstname,
      lastname,
      email,
      password,
    }).pipe(
      tap({
        next: () => this.logger.info('Registration successful', { email }),
        error: err => this.logger.warn('Registration failed', err?.error?.message),
      }),
    );
  }

  forgotPassword(email: string) {
    this.logger.debug('Forgot password request', { email });
    return this.http.post<ForgotPasswordResponse>(`${environment.apiUrl}/auth/password/forgot`, { email }).pipe(
      tap({
        next: () => this.logger.info('Password reset email sent', { email }),
        error: err => this.logger.warn('Forgot password failed', err?.error?.message),
      }),
    );
  }

  verifyOtp(email: string, otp: string, context?: 'signup') {
    this.logger.debug('OTP verification attempt', { email });
    const headers = new HttpHeaders({
      'x-user-email': email,
      'x-user-otp': otp,
      ...(context ? { 'x-verify-context': context } : {}),
    });
    return this.http.post<VerifyOtpResponse>(`${environment.apiUrl}/verify-otp`, {}, { headers }).pipe(
      tap({
        next: () => this.logger.info('OTP verified', { email }),
        error: err => this.logger.warn('OTP verification failed', err?.error?.message),
      }),
    );
  }

  resetPassword(resetToken: string, newPassword: string) {
    this.logger.debug('Password reset attempt');
    return this.http.post<ResetPasswordResponse>(`${environment.apiUrl}/auth/password/reset`, {
      resetToken,
      newPassword,
    }).pipe(
      tap({
        next: () => this.logger.info('Password reset successful'),
        error: err => this.logger.warn('Password reset failed', err?.error?.message),
      }),
    );
  }

  saveToken(token: string) {
    localStorage.setItem('auth_token', token);
    this.logger.debug('Auth token saved');
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  saveUserFirstname(firstname: string) {
    localStorage.setItem('user_firstname', firstname);
    this.currentUserFirstname.set(firstname);
  }

  saveUserLastname(lastname: string) {
    localStorage.setItem('user_lastname', lastname);
    this.currentUserLastname.set(lastname);
  }

  saveUserId(userId: number) {
    localStorage.setItem('user_id', String(userId));
    this.currentUserId.set(String(userId));
  }

  uploadAvatar(file: File, email: string) {
    this.logger.debug('Uploading avatar', { email });
    const formData = new FormData();
    // userId and email must be appended before the file so multer can read them in destination callback
    formData.append('userid', this.currentUserId());
    formData.append('email', email);
    formData.append('avatar', file);
    return this.http.post<UploadAvatarResponse>(`${environment.apiUrl}/auth/profile/avatar`, formData).pipe(
      tap({
        next: () => this.logger.info('Avatar uploaded successfully'),
        error: err => this.logger.error('Avatar upload failed', err),
      }),
    );
  }

  saveUserAvatar(avatarPath: string) {
    const fullUrl = avatarPath ? `${environment.serverUrl}${avatarPath}` : '';
    localStorage.setItem('user_avatar', fullUrl);
    this.currentUserAvatar.set(fullUrl);
  }

  updateProfile(data: UpdateProfileRequest) {
    this.logger.debug('Updating profile');
    return this.http.put<UpdateProfileResponse>(`${environment.apiUrl}/auth/profile`, data).pipe(
      tap({
        next: () => this.logger.info('Profile updated successfully'),
        error: err => this.logger.error('Profile update failed', err),
      }),
    );
  }

  saveUserEmail(email: string) {
    localStorage.setItem('user_email', email);
    this.currentUserEmail.set(email);
  }

  deleteAccount(userid: string) {
    this.logger.warn('Account deletion requested', { userid });
    return this.http.delete<DeleteAccountResponse>(`${environment.apiUrl}/account`, { body: { userid } }).pipe(
      tap({
        next: () => this.logger.info('Account deleted', { userid }),
        error: err => this.logger.error('Account deletion failed', err),
      }),
    );
  }

  logout() {
    this.logger.info('User logged out');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_firstname');
    localStorage.removeItem('user_lastname');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_avatar');
    this.currentUserId.set('');
    this.currentUserFirstname.set('');
    this.currentUserLastname.set('');
    this.currentUserEmail.set('');
    this.currentUserAvatar.set('');
  }
}
