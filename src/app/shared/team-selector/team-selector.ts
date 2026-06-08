import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface TeamOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-team-selector',
  templateUrl: './team-selector.html',
  styleUrl: './team-selector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamSelectorComponent {
  label = input.required<string>();
  teams = input.required<TeamOption[]>();
  selectedTeam = input('');
  teamChange = output<string>();

  onChange(value: string): void {
    this.teamChange.emit(value);
  }
}
