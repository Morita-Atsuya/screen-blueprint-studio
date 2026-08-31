import type { ComponentKind } from '../domain/model'
import { assertCompleteComponentKindCoverage } from '../domain/model'
import { SAFE_EXTERNAL_URL_PATTERN } from '../domain/portableUrl'

const closed = { additionalProperties: false } as const
const string = { type: 'string' } as const
const nonEmptyString = { type: 'string', minLength: 1, pattern: '\\S' } as const
const nullableString = { type: ['string', 'null'] } as const
const externalUrl = {
  type: 'string',
  pattern: SAFE_EXTERNAL_URL_PATTERN,
} as const
const portableUrl = {
  anyOf: [
    externalUrl,
    {
      type: 'string',
      pattern: '^(?:$|(?!\\s)(?!//)(?![A-Za-z][A-Za-z0-9+.-]*:)[^\\u0000-\\u001F\\u007F\\\\]*[^\\s\\u0000-\\u001F\\u007F\\\\])$',
    },
  ],
} as const

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
    kind: 'image',
    properties: {
      kind: { const: 'image' },
      source: portableUrl,
      alt: nonEmptyString,
      fit: { type: 'string', enum: ['contain', 'cover'] },
      aspectRatio: { type: 'string', enum: ['auto', 'square', '4:3', '16:9'] },
      placeholderStyle: { type: 'string', enum: ['icon', 'skeleton'] },
    },
    required: ['kind', 'source', 'alt', 'fit', 'aspectRatio', 'placeholderStyle'],
  },
  {
    kind: 'link',
    properties: {
      kind: { const: 'link' },
      label: nonEmptyString,
      destination: {
        oneOf: [
          {
            type: 'object',
            properties: { type: { const: 'internal' }, screenId: nonEmptyString },
            required: ['type', 'screenId'],
            ...closed,
          },
          {
            type: 'object',
            properties: { type: { const: 'external' }, url: externalUrl },
            required: ['type', 'url'],
            ...closed,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'resource' },
              resourceId: {
                ...nonEmptyString,
                description: 'Opaque logical resource identifier; not a catalog reference.',
              },
              url: {
                allOf: [portableUrl, { type: 'string', minLength: 1 }],
              },
              displayName: nonEmptyString,
            },
            required: ['type', 'resourceId', 'url', 'displayName'],
            ...closed,
          },
        ],
      },
      openMode: { type: 'string', enum: ['sameContext', 'newContext', 'download'] },
    },
    required: ['kind', 'label', 'destination', 'openMode'],
    allOf: [
      {
        if: {
          required: ['destination'],
          properties: {
            destination: {
              type: 'object',
              required: ['type'],
              properties: { type: { const: 'internal' } },
            },
          },
        },
        then: { properties: { openMode: { const: 'sameContext' } } },
      },
      {
        if: {
          required: ['destination'],
          properties: {
            destination: {
              type: 'object',
              required: ['type'],
              properties: { type: { const: 'external' } },
            },
          },
        },
        then: {
          properties: {
            openMode: { type: 'string', enum: ['sameContext', 'newContext'] },
          },
        },
      },
    ],
  },
  {
    kind: 'modal',
    properties: { kind: { const: 'modal' }, ...layoutProperties },
    required: ['kind', ...layoutRequired],
  },
] as const satisfies readonly {
  kind: ComponentKind
  properties: object
  required: readonly string[]
  allOf?: readonly object[]
}[]

assertCompleteComponentKindCoverage(
  'WebMCP component config schema',
  configVariants.map(variant => variant.kind),
)

export const componentConfigSchema = {
  oneOf: configVariants.map(variant => ({
    type: 'object',
    properties: variant.properties,
    required: variant.required,
    ...('allOf' in variant ? { allOf: variant.allOf } : {}),
    ...closed,
  })),
}

export const componentConfigPatchSchema = {
  anyOf: configVariants.map(variant => ({
    type: 'object',
    properties: variant.properties,
    minProperties: 1,
    ...('allOf' in variant ? { allOf: variant.allOf } : {}),
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
        properties: { ...commonOverrideProperties, value: string },
        ...closed,
      },
    ],
  },
}
