import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnInit } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormRecord } from '@angular/forms';
import { SchemaValidator } from '@shared/validators/schema.validator';
import {
  AssetFileType,
  Schema,
  SchemaField,
  SchemaFieldKind,
  schemaFieldKindDescriptions,
  SchemaFieldOptionSelectable,
  SchemaUpdate,
} from '@shared/models/schema.model';
import { FormErrorHandlerService } from '@core/error-handler/form-error-handler.service';
import { CommonValidator } from '@shared/validators/common.validator';
import { SchemaService } from '@shared/services/schema.service';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@core/state/core.state';
import { SpaceService } from '@shared/services/space.service';
import { NotificationService } from '@shared/services/notification.service';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { selectSettings } from '@core/state/settings/settings.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'll-schema-edit',
  templateUrl: './edit.component.html',
  styleUrls: ['./edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditComponent implements OnInit {
  @Input({ required: true })
  spaceId!: string;

  entityId: string;
  entity?: Schema;
  reservedNames: string[] = [];
  schemas: Schema[] = [];
  schemaFieldKindDescriptions = schemaFieldKindDescriptions;
  nameReadonly = true;
  fieldNameReadonly = true;

  selectedFieldIdx?: number;

  fieldReservedNames: string[] = [];
  newFieldName = this.fb.control('', [...SchemaValidator.FIELD_NAME, CommonValidator.reservedName(this.fieldReservedNames)]);

  //Loadings
  isLoading = true;
  isSaveLoading = false;
  // Subscriptions
  settings$ = this.store.select(selectSettings);
  private destroyRef = inject(DestroyRef);

  form: FormRecord = this.fb.record({
    name: this.fb.control('', SchemaValidator.NAME),
    displayName: this.fb.control<string | undefined>(undefined, SchemaValidator.DISPLAY_NAME),
    previewField: this.fb.control<string | undefined>(undefined, SchemaValidator.PREVIEW_FIELD),
    previewImage: this.fb.control<string | undefined>(undefined),
    fields: this.fb.array<SchemaField>([]),
  });

  constructor(
    readonly fe: FormErrorHandlerService,
    private readonly fb: FormBuilder,
    private readonly cd: ChangeDetectorRef,
    private readonly router: Router,
    private readonly activatedRoute: ActivatedRoute,
    private readonly spaceService: SpaceService,
    private readonly schemaService: SchemaService,
    private readonly store: Store<AppState>,
    private readonly notificationService: NotificationService
  ) {
    this.entityId = this.activatedRoute.snapshot.paramMap.get('schemaId') || '';
  }

  ngOnInit(): void {
    this.loadData(this.spaceId, this.entityId);
  }

  loadData(spaceId: string, entityId: string): void {
    combineLatest([this.schemaService.findAll(spaceId), this.schemaService.findById(spaceId, entityId)])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([schemas, schema]) => {
          this.reservedNames = schemas.map(it => it.name);
          this.schemas = schemas;
          this.entity = schema;

          // Form
          this.form.controls['name'].setValidators([
            ...SchemaValidator.NAME,
            CommonValidator.reservedName(this.reservedNames, this.entity?.name),
          ]);
          this.form.patchValue(schema);

          this.fields.clear();
          schema.fields?.forEach(it => this.addField(it));
          if (this.selectedFieldIdx === undefined) {
            this.selectComponent(this.fields.length - 1);
          }

          this.isLoading = false;
          this.cd.markForCheck();
        },
      });
  }

  get fields(): FormArray<FormGroup> {
    return this.form.controls['fields'] as FormArray<FormGroup>;
  }

  fieldControlAt(index: number, controlName: string): AbstractControl | undefined {
    return this.fields.at(index)?.controls[controlName];
  }

  fieldAt(index: number): FormGroup | undefined {
    return this.fields.at(index);
  }

  generateOptionForm(option?: SchemaFieldOptionSelectable): FormGroup {
    return this.fb.group({
      name: this.fb.control(option?.name, SchemaValidator.FIELD_OPTION_NAME),
      value: this.fb.control(option?.value, SchemaValidator.FIELD_OPTION_VALUE),
    });
  }

  addField(element?: SchemaField) {
    const fieldName = element?.name || this.newFieldName.value || '';
    this.fieldReservedNames.push(fieldName);

    const defaultKind = SchemaFieldKind.TEXT;
    const fieldForm = this.fb.group<NonNullable<unknown>>({
      // Base
      name: this.fb.control(fieldName, [...SchemaValidator.FIELD_NAME, CommonValidator.reservedName(this.fieldReservedNames, fieldName)]),
      kind: this.fb.control(element?.kind || defaultKind, SchemaValidator.FIELD_KIND),
      displayName: this.fb.control<string | undefined>(element?.displayName, SchemaValidator.FIELD_DISPLAY_NAME),
      required: this.fb.control<boolean | undefined>(element?.required, SchemaValidator.FIELD_REQUIRED),
      description: this.fb.control<string | undefined>(element?.description, SchemaValidator.FIELD_DESCRIPTION),
      defaultValue: this.fb.control<string | undefined>(element?.defaultValue, SchemaValidator.FIELD_DEFAULT_VALUE),
    });

    switch (element?.kind) {
      case SchemaFieldKind.TEXT:
      case SchemaFieldKind.TEXTAREA:
      case SchemaFieldKind.MARKDOWN: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        fieldForm.addControl('minLength', this.fb.control<number | undefined>(element.minLength, SchemaValidator.FIELD_MIN_LENGTH));
        fieldForm.addControl('maxLength', this.fb.control<number | undefined>(element.maxLength, SchemaValidator.FIELD_MAX_LENGTH));
        break;
      }
      case SchemaFieldKind.NUMBER: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        fieldForm.addControl('minValue', this.fb.control<number | undefined>(element.minValue, SchemaValidator.FIELD_MIN_VALUE));
        fieldForm.addControl('maxValue', this.fb.control<number | undefined>(element.maxValue, SchemaValidator.FIELD_MAX_VALUE));
        break;
      }
      case SchemaFieldKind.COLOR: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        break;
      }
      case SchemaFieldKind.DATE: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        break;
      }
      case SchemaFieldKind.BOOLEAN: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        break;
      }
      case SchemaFieldKind.OPTION: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        const options: FormArray = this.fb.array<SchemaFieldOptionSelectable>([], SchemaValidator.FIELD_OPTIONS);
        element.options.forEach(it => options.push(this.generateOptionForm(it)));
        fieldForm.addControl('options', options);

        break;
      }
      case SchemaFieldKind.OPTIONS: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        const options: FormArray = this.fb.array<SchemaFieldOptionSelectable>([], SchemaValidator.FIELD_OPTIONS);
        element.options.forEach(it => options.push(this.generateOptionForm(it)));
        fieldForm.addControl('options', options);
        fieldForm.addControl('minValues', this.fb.control<number | undefined>(element.minValues, SchemaValidator.FIELD_MIN_VALUES));
        fieldForm.addControl('maxValues', this.fb.control<number | undefined>(element.maxValues, SchemaValidator.FIELD_MAX_VALUES));
        break;
      }
      case SchemaFieldKind.LINK: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        break;
      }
      case SchemaFieldKind.REFERENCE:
      case SchemaFieldKind.REFERENCES: {
        fieldForm.addControl('path', this.fb.control<string | undefined>(element.path, SchemaValidator.FIELD_REFERENCE_PATH));
        break;
      }
      case SchemaFieldKind.ASSET: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        fieldForm.addControl(
          'fileTypes',
          this.fb.control<AssetFileType[] | undefined>(element.fileTypes || [AssetFileType.ANY], SchemaValidator.FIELD_FILE_TYPES)
        );
        break;
      }
      case SchemaFieldKind.ASSETS: {
        fieldForm.addControl(
          'translatable',
          this.fb.control<boolean | undefined>(element.translatable, SchemaValidator.FIELD_TRANSLATABLE)
        );
        fieldForm.addControl(
          'fileTypes',
          this.fb.control<AssetFileType[] | undefined>(element.fileTypes || [AssetFileType.ANY], SchemaValidator.FIELD_FILE_TYPES)
        );
        break;
      }
      case SchemaFieldKind.SCHEMA: {
        fieldForm.addControl('schemas', this.fb.control<string[] | undefined>(element.schemas, SchemaValidator.FIELD_SCHEMA));
        break;
      }
      case SchemaFieldKind.SCHEMAS: {
        fieldForm.addControl('schemas', this.fb.control<string[] | undefined>(element.schemas, SchemaValidator.FIELD_SCHEMAS));
        break;
      }
      // By default, it is a new TEXT
      default: {
        fieldForm.addControl('translatable', this.fb.control<boolean | undefined>(undefined, SchemaValidator.FIELD_TRANSLATABLE));
        fieldForm.addControl('minLength', this.fb.control<number | undefined>(undefined, SchemaValidator.FIELD_MIN_LENGTH));
        fieldForm.addControl('maxLength', this.fb.control<number | undefined>(undefined, SchemaValidator.FIELD_MAX_LENGTH));
      }
    }
    this.fields.push(fieldForm);
    this.newFieldName.reset();
    if (!element) {
      this.selectComponent(this.fields.length - 1);
    }
  }

  removeComponent(event: Event, index: number): void {
    // Prevent Default
    event.preventDefault();
    event.stopImmediatePropagation();
    // Remove name from reserved names
    const cValue = this.fieldControlAt(index, 'name')?.value;
    if (cValue) {
      const idx = this.fieldReservedNames.indexOf(cValue);
      if (idx !== -1) {
        this.fieldReservedNames.splice(index, 1);
      }
    }
    // Remove
    this.fields.removeAt(index);
    if (this.fields.length === 0) {
      this.selectedFieldIdx = undefined;
      this.cd.markForCheck();
    } else if (this.selectedFieldIdx) {
      if (index == 0 && this.selectedFieldIdx == 0) {
        this.selectComponent(0);
      } else if (index <= this.selectedFieldIdx) {
        this.selectComponent(this.selectedFieldIdx - 1);
      }
    }
  }

  // handle form array element selection, by enforcing refresh
  selectComponent(index: number): void {
    this.selectedFieldIdx = undefined;
    this.cd.detectChanges();
    this.fieldNameReadonly = true;
    this.selectedFieldIdx = index;
    this.cd.markForCheck();
  }

  save(): void {
    //console.group('save')
    this.isSaveLoading = true;

    this.schemaService.update(this.spaceId, this.entityId, this.form.value as SchemaUpdate).subscribe({
      next: () => {
        this.notificationService.success('Schema has been updated.');
      },
      error: () => {
        this.notificationService.error('Schema can not be updated.');
      },
      complete: () => {
        setTimeout(() => {
          this.isSaveLoading = false;
          this.cd.markForCheck();
        }, 1000);
      },
    });

    //console.groupEnd()
  }

  back(): void {
    this.router.navigate(['features', 'spaces', this.spaceId, 'schemas']);
  }

  fieldDropDrop(event: CdkDragDrop<string[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const tmp = this.fields.at(event.previousIndex);
    this.fields.removeAt(event.previousIndex);
    this.fields.insert(event.currentIndex, tmp);
  }
}
