import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrustPillsComponent } from '../../shared/trust-pills/trust-pills';
import { LogoComponent } from '../../shared/logo/logo';

@Component({
  selector: 'app-left-menu-sign-out',
  imports: [RouterLink, TrustPillsComponent, LogoComponent],
  templateUrl: './left-menu-sign-out.html',
  styleUrl: './left-menu-sign-out.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeftMenuSignOutComponent {}
