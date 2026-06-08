import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { DropDownStorageComponent } from './drop-down-storage';

describe('DropDownStorageComponent', () => {
  let component: DropDownStorageComponent;
  let fixture: ComponentFixture<DropDownStorageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropDownStorageComponent, RouterModule.forRoot([])],
    }).compileComponents();
    fixture = TestBed.createComponent(DropDownStorageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => { expect(component).toBeTruthy(); });
});
