import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { DashboardRecentActivityComponent } from './dashboard-recent-activity';

describe('DashboardRecentActivityComponent', () => {
  let component: DashboardRecentActivityComponent;
  let fixture: ComponentFixture<DashboardRecentActivityComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardRecentActivityComponent, RouterModule.forRoot([])],
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardRecentActivityComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });
  it('should create', () => { expect(component).toBeTruthy(); });
});
