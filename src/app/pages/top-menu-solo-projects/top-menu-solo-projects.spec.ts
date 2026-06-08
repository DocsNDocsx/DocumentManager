import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { TopMenuSoloProjectsComponent } from './top-menu-solo-projects';

describe('TopMenuSoloProjectsComponent', () => {
  let component: TopMenuSoloProjectsComponent;
  let fixture: ComponentFixture<TopMenuSoloProjectsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopMenuSoloProjectsComponent, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TopMenuSoloProjectsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => { expect(component).toBeTruthy(); });
});
