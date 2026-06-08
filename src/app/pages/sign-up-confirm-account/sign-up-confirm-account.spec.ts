import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { SignUpConfirmAccountComponent } from './sign-up-confirm-account';

describe('SignUpConfirmAccountComponent', () => {
  let component: SignUpConfirmAccountComponent;
  let fixture: ComponentFixture<SignUpConfirmAccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignUpConfirmAccountComponent, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SignUpConfirmAccountComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
