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
const jsonScalar = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
    { type: 'null' },
  ],
} as const
const collectionValueSource = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'item' },
        path: string,
      },
      required: ['type', 'path'],
      ...closed,
    },
    {
      type: 'object',
      properties: {
        type: { const: 'literal' },
        value: jsonScalar,
      },
      required: ['type', 'value'],
      ...closed,
    },
  ],
} as const

const layoutProperties = {
  layout: { type: 'string', enum: ['vertical', 'horizontal', 'grid'] },
  gap: { type: 'string', enum: ['none', 'sm', 'md', 'lg'] },
  columns: { type: 'integer', minimum: 1, maximum: 12 },
  justify: { type: 'string', enum: ['start', 'center', 'end', 'between'] },
  align: { type: 'string', enum: ['start', 'center', 'end', 'stretch'] },
  wrap: { type: 'boolean' },
} as const

const layoutRequired = ['layout', 'gap', 'columns', 'justify', 'align', 'wrap'] as const
const placementInset = { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg'] } as const
const placementAnchor = {
  type: 'string',
  enum: [
    'topLeft',
    'topCenter',
    'topRight',
    'centerLeft',
    'center',
    'centerRight',
    'bottomLeft',
    'bottomCenter',
    'bottomRight',
  ],
} as const

export const componentPlacementSchema = {
  oneOf: [
    {
      type: 'object',
      properties: { mode: { const: 'flow' } },
      required: ['mode'],
      ...closed,
    },
    {
      type: 'object',
      properties: {
        mode: { const: 'sticky' },
        edge: { type: 'string', enum: ['top', 'bottom'] },
        inset: placementInset,
      },
      required: ['mode', 'edge', 'inset'],
      ...closed,
    },
    ...(['overlay', 'viewport'] as const).map(mode => ({
      type: 'object',
      properties: {
        mode: { const: mode },
        anchor: placementAnchor,
        insetX: placementInset,
        insetY: placementInset,
      },
      required: ['mode', 'anchor', 'insetX', 'insetY'],
      allOf: [
        {
          if: {
            properties: {
              anchor: { enum: ['topCenter', 'center', 'bottomCenter'] },
            },
            required: ['anchor'],
          },
          then: { properties: { insetX: { const: 'none' } } },
        },
        {
          if: {
            properties: {
              anchor: { enum: ['centerLeft', 'center', 'centerRight'] },
            },
            required: ['anchor'],
          },
          then: { properties: { insetY: { const: 'none' } } },
        },
      ],
      ...closed,
    })),
  ],
} as const

const componentSizingProperties = {
  inlineSize: { type: 'string', enum: ['auto', 'content', 'fill'] },
  minWidth: { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
  maxWidth: { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
  gridSpan: { type: 'integer', minimum: 1, maximum: 12 },
  grow: { type: 'integer', minimum: 0, maximum: 3 },
  shrink: { type: 'string', enum: ['allow', 'prevent'] },
} as const

const componentSizingRules = [
  ...(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((minWidth, index, tokens) => ({
    if: {
      properties: { minWidth: { const: minWidth } },
      required: ['minWidth'],
    },
    then: {
      properties: {
        maxWidth: { type: 'string', enum: ['none', ...tokens.slice(index)] },
      },
    },
  })),
  {
    if: {
      properties: { grow: { type: 'integer', minimum: 1 } },
      required: ['grow'],
    },
    then: {
      properties: {
        inlineSize: { const: 'fill' },
        shrink: { const: 'allow' },
      },
    },
  },
] as const

export const componentSizingSchema = {
  type: 'object',
  properties: componentSizingProperties,
  required: ['inlineSize', 'minWidth', 'maxWidth', 'gridSpan', 'grow', 'shrink'],
  allOf: componentSizingRules,
  ...closed,
} as const

export const componentSizingPatchSchema = {
  type: 'object',
  properties: componentSizingProperties,
  minProperties: 1,
  allOf: componentSizingRules,
  ...closed,
} as const

export const rootComponentSizingSchema = {
  type: 'object',
  properties: {
    inlineSize: { const: 'fill' },
    minWidth: { const: 'none' },
    maxWidth: { const: 'none' },
    gridSpan: { const: 1 },
    grow: { const: 0 },
    shrink: { const: 'allow' },
  },
  required: ['inlineSize', 'minWidth', 'maxWidth', 'gridSpan', 'grow', 'shrink'],
  ...closed,
} as const

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
    kind: 'collection',
    properties: {
      kind: { const: 'collection' },
      dataSource: {
        type: 'object',
        properties: {
          apiOperationId: nullableString,
          itemsPath: string,
          previewItems: {
            type: 'array',
            maxItems: 20,
            items: { type: 'object' },
          },
        },
        required: ['apiOperationId', 'itemsPath', 'previewItems'],
        ...closed,
      },
      itemKeyPath: nonEmptyString,
      itemTemplate: {
        type: 'object',
        properties: {
          source: {
            type: 'object',
            properties: { $ref: nonEmptyString },
            required: ['$ref'],
            ...closed,
          },
          props: {
            type: 'object',
            additionalProperties: {
              anyOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
              ],
            },
          },
          variantId: nullableString,
        },
        required: ['source', 'props', 'variantId'],
        ...closed,
      },
      propBindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            propKey: nonEmptyString,
            source: collectionValueSource,
          },
          required: ['propKey', 'source'],
          ...closed,
        },
      },
      variantSelection: {
        type: 'object',
        properties: {
          cases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: collectionValueSource,
                equals: jsonScalar,
                variantId: nonEmptyString,
              },
              required: ['source', 'equals', 'variantId'],
              ...closed,
            },
          },
          fallbackVariantId: nullableString,
        },
        required: ['cases', 'fallbackVariantId'],
        ...closed,
      },
      visibility: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: {
              source: collectionValueSource,
              equals: jsonScalar,
              visibleWhenMatched: { type: 'boolean' },
              fallback: { type: 'boolean' },
            },
            required: ['source', 'equals', 'visibleWhenMatched', 'fallback'],
            ...closed,
          },
        ],
      },
    },
    required: [
      'kind',
      'dataSource',
      'itemKeyPath',
      'itemTemplate',
      'propBindings',
      'variantSelection',
      'visibility',
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
  type: 'array',
  items: {
    type: 'object',
    properties: {
      target: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { const: 'inline' },
              componentId: nonEmptyString,
            },
            required: ['type', 'componentId'],
            ...closed,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'collectionItemNode' },
              collectionId: nonEmptyString,
              nodePath: {
                type: 'array',
                minItems: 1,
                items: nonEmptyString,
              },
            },
            required: ['type', 'collectionId', 'nodePath'],
            ...closed,
          },
          {
            type: 'object',
            properties: {
              type: { const: 'definitionNode' },
              instanceId: nonEmptyString,
              nodePath: {
                type: 'array',
                minItems: 1,
                items: nonEmptyString,
              },
            },
            required: ['type', 'instanceId', 'nodePath'],
            ...closed,
          },
        ],
      },
      override: {
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
    },
    required: ['target', 'override'],
    ...closed,
  },
}
