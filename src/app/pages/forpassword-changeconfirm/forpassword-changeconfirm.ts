import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-forpassword-changeconfirm',
  imports: [NgOptimizedImage, TrustPillsComponent, LogoComponent],
  templateUrl: './forpassword-changeconfirm.html',
  styleUrl: './forpassword-changeconfirm.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForpasswordChangeconfirmComponent {}
