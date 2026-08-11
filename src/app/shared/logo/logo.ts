import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-logo',
  templateUrl: './logo.html',
  styleUrl: './logo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, RouterLink],
})
export class LogoComponent {
  routerLink = input<string | null>(null);
  href = input<string | null>(null);
  ariaLabel = input('DocNDocs home');
  showImage = input(true);
  imageSize = input(32);
  imageWidth = input<number | null>(null);
  imageHeight = input<number | null>(null);
  variant = input<'dark' | 'light'>('dark');
  nColor = input('');
}
