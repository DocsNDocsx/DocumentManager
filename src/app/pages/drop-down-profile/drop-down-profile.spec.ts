import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { DropDownProfileComponent } from './drop-down-profile';

describe('DropDownProfileComponent', () => {
  let component: DropDownProfileComponent;
  let fixture: ComponentFixture<DropDownProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropDownProfileComponent, RouterModule.forRoot([])],
    }).compileComponents();
    fixture = TestBed.createComponent(DropDownProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => { expect(component).toBeTruthy(); });
});
