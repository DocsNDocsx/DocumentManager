import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { SignInPasscodeComponent } from './sign-in-passcode';

describe('SignInPasscodeComponent', () => {
  let component: SignInPasscodeComponent;
  let fixture: ComponentFixture<SignInPasscodeComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignInPasscodeComponent, RouterModule.forRoot([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SignInPasscodeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });
  it('should create', () => { expect(component).toBeTruthy(); });
});
