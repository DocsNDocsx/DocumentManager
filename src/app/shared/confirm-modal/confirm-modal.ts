import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-modal',
  template: `
    <div class="modal-overlay" role="dialog" aria-modal="true" [attr.aria-labelledby]="modalId()" (click)="cancel.emit()">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h2 class="modal-title" [id]="modalId()">{{ title() }}</h2>
        <div class="modal-body">
          <ng-content />
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" type="button" (click)="cancel.emit()">{{ cancelLabel() }}</button>
          <button class="btn-modal-confirm" type="button" (click)="confirm.emit()">
            @if (confirmIcon()) {
              <i [class]="confirmIcon()" aria-hidden="true"></i>
            }
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './confirm-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmModalComponent {
  title = input.required<string>();
  confirmLabel = input('Confirm');
  cancelLabel = input('Cancel');
  confirmIcon = input('');
  modalId = input('confirmModal');
  confirm = output<void>();
  cancel = output<void>();
}
