import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ForpasswordChangeconfirmComponent } from './forpassword-changeconfirm';

describe('ForpasswordChangeconfirmComponent', () => {
  let component: ForpasswordChangeconfirmComponent;
  let fixture: ComponentFixture<ForpasswordChangeconfirmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForpasswordChangeconfirmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ForpasswordChangeconfirmComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
