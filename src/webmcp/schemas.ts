import type { ComponentKind } from '../domain/model'
import { assertCompleteComponentKindCoverage } from '../domain/model'

const closed = { additionalProperties: false } as const
const string = { type: 'string' } as const
const nonEmptyString = { type: 'string', minLength: 1 } as const
const nullableString = { type: ['string', 'null'] } as const

const layoutProperties = {
  layout: { type: 'string', enum: ['vertical', 'horizontal', 'grid'] },
  gap: { type: 'string', enum: ['none', 'sm', 'md', 'lg'] },
  columns: { type: 'integer', enum: [1, 2, 3, 4] },
  justify: { type: 'string', enum: ['start', 'center', 'end', 'between'] },
  align: { type: 'string', enum: ['start', 'center', 'end', 'stretch'] },
  wrap: { type: 'boolean' },
} as const

const layoutRequired = ['layout', 'gap', 'columns', 'justify', 'align', 'wrap'] as const

const validationRuleSchema = {
  oneOf: [
    {
      type: 'object',
      properties: { id: string, type: { const: 'required' }, message: nonEmptyString },
      required: ['id', 'type', 'message'],
      ...closed,
    },
    {
      type: 'object',
      properties: { id: string, type: { const: 'email' }, message: nonEmptyString },
      required: ['id', 'type', 'message'],
      ...closed,
    },
    ...(['minLength', 'maxLength'] as const).map(type => ({
      type: 'object',
      properties: {
        id: string,
        type: { const: type },
        value: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        message: nonEmptyString,
      },
      required: ['id', 'type', 'value', 'message'],
      ...closed,
    })),
    {
      type: 'object',
      properties: {
        id: string,
        type: { const: 'pattern' },
        value: nonEmptyString,
        message: nonEmptyString,
      },
      required: ['id', 'type', 'value', 'message'],
      ...closed,
    },
    {
      type: 'object',
      properties: {
        id: string,
        type: { const: 'custom' },
        description: nonEmptyString,
        message: nonEmptyString,
      },
      required: ['id', 'type', 'description', 'message'],
      ...closed,
    },
  ],
}

const configVariants = [
  {
    kind: 'page',
    properties: { kind: { const: 'page' }, ...layoutProperties },
    required: ['kind', ...layoutRequired],
  },
  {
    kind: 'section',
    properties: { kind: { const: 'section' }, ...layoutProperties },
    required: ['kind', ...layoutRequired],
  },
  {
    kind: 'container',
    properties: { kind: { const: 'container' }, ...layoutProperties },
    required: ['kind', ...layoutRequired],
  },
  {
    kind: 'text',
    properties: {
      kind: { const: 'text' },
      text: string,
      style: {
        type: 'string',
        enum: ['heading1', 'heading2', 'heading3', 'body', 'caption'],
      },
    },
    required: ['kind', 'text', 'style'],
  },
  {
    kind: 'textInput',
    properties: {
      kind: { const: 'textInput' },
      fieldKey: string,
      label: string,
      inputType: { type: 'string', enum: ['text', 'email', 'password'] },
      required: { type: 'boolean' },
      placeholder: string,
      defaultValue: string,
      validationRules: { type: 'array', items: validationRuleSchema },
    },
    required: [
      'kind',
      'fieldKey',
      'label',
      'inputType',
      'required',
      'placeholder',
      'defaultValue',
      'validationRules',
    ],
  },
  {
    kind: 'select',
    properties: {
      kind: { const: 'select' },
      fieldKey: string,
      label: string,
      required: { type: 'boolean' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: { value: string, label: string },
          required: ['value', 'label'],
          ...closed,
        },
      },
      defaultValue: string,
    },
    required: ['kind', 'fieldKey', 'label', 'required', 'options', 'defaultValue'],
  },
  {
    kind: 'button',
    properties: {
      kind: { const: 'button' },
      label: string,
      variant: { type: 'string', enum: ['primary', 'secondary', 'danger'] },
      eventId: nullableString,
      confirmationMessage: nullableString,
      preventDoubleSubmit: { type: 'boolean' },
    },
    required: ['kind', 'label', 'variant', 'eventId', 'confirmationMessage', 'preventDoubleSubmit'],
  },
  {
    kind: 'alert',
    properties: {
      kind: { const: 'alert' },
      tone: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
      message: string,
    },
    required: ['kind', 'tone', 'message'],
  },
  {
    kind: 'modal',
    properties: { kind: { const: 'modal' }, ...layoutProperties },
    required: ['kind', ...layoutRequired],
  },
] as const satisfies readonly { kind: ComponentKind; properties: object; required: readonly string[] }[]

assertCompleteComponentKindCoverage(
  'WebMCP component config schema',
  configVariants.map(variant => variant.kind),
)

export const componentConfigSchema = {
  oneOf: configVariants.map(variant => ({
    type: 'object',
    properties: variant.properties,
    required: variant.required,
    ...closed,
  })),
}

export const componentConfigPatchSchema = {
  anyOf: configVariants.map(variant => ({
    type: 'object',
    properties: variant.properties,
    minProperties: 1,
    ...closed,
  })),
}

const commonOverrideProperties = {
  visible: { type: 'boolean' },
  enabled: { type: 'boolean' },
}

export const componentOverridesSchema = {
  type: 'object',
  additionalProperties: {
    anyOf: [
      {
        type: 'object',
        properties: commonOverrideProperties,
        ...closed,
      },
      {
        type: 'object',
        properties: { ...commonOverrideProperties, text: string },
        ...closed,
      },
      {
        type: 'object',
        properties: { ...commonOverrideProperties, message: string },
        ...closed,
      },
      {
        type: 'object',
        properties: { ...commonOverrideProperties, value: string },
        ...closed,
      },
    ],
  },
}
