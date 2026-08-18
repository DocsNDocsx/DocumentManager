import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { TopMenuSoloProjectsComponent } from './top-menu-solo-projects';
import { Project } from '../../models/project.models';

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

  it('opens the project view for completed projects', () => {
    const project = { id: 'completed-1', status: 'completed', collaborators: [], documents: [] } as unknown as Project;
    const event = new Event('click');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    component.onView(project, event);

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(component.viewingProject()).toBe(project);
  });

  it('does not allow another review decision after approval', () => {
    component.reviewingSubmission.set({ status: 'approved' } as any);

    component.chooseReviewDecision('revise');

    expect(component.reviewDecision()).toBeNull();
  });
});
