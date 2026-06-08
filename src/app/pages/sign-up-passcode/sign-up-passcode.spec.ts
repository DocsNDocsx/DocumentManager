import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { SignUpPasscodeComponent } from './sign-up-passcode';

describe('SignUpPasscodeComponent', () => {
  let component: SignUpPasscodeComponent;
  let fixture: ComponentFixture<SignUpPasscodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignUpPasscodeComponent, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SignUpPasscodeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
