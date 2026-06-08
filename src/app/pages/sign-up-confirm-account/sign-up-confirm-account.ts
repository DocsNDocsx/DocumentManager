import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-sign-up-confirm-account',
  imports: [RouterLink, NgOptimizedImage, TrustPillsComponent, LogoComponent],
  templateUrl: './sign-up-confirm-account.html',
  styleUrl: './sign-up-confirm-account.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpConfirmAccountComponent {}
