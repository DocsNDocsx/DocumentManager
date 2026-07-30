import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TopMenuTeamsEditTeamsComponent } from './top-menu-teams-edit-teams';

describe('TopMenuTeamsEditTeamsComponent', () => {
  let component: TopMenuTeamsEditTeamsComponent;
  let fixture: ComponentFixture<TopMenuTeamsEditTeamsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopMenuTeamsEditTeamsComponent],
      providers: [provideRouter([{ path: 'top-menu-teams', children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(TopMenuTeamsEditTeamsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
