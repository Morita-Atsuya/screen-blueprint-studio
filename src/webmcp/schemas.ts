import {
  COMPONENT_KINDS,
  PLACEMENT_ANCHORS,
  PLACEMENT_INSET_TOKENS,
} from '../domain/model'

const closed = { additionalProperties: false } as const
const string = { type: 'string' } as const
const nonEmptyString = { type: 'string', minLength: 1 } as const
const nullableString = { type: ['string', 'null'] } as const
const scalar = { type: ['string', 'number', 'boolean', 'null'] } as const
const publicPropValue = { type: ['string', 'number', 'boolean'] } as const

const valueSourceSchema = {
  type: 'object',
  description:
    'Use type=item with path, or type=literal with scalar value. Runtime validation enforces the matching fields.',
  properties: {
    type: { type: 'string', enum: ['item', 'literal'] },
    path: string,
    value: scalar,
  },
  required: ['type'],
  ...closed,
} as const

const validationRuleSchema = {
  type: 'object',
  description:
    'Required: id, type, message. minLength/maxLength/pattern also require value; custom requires description.',
  properties: {
    id: nonEmptyString,
    type: {
      type: 'string',
      enum: ['required', 'email', 'minLength', 'maxLength', 'pattern', 'custom'],
    },
    message: nonEmptyString,
    value: { type: ['string', 'integer'] },
    description: nonEmptyString,
  },
  required: ['id', 'type', 'message'],
  ...closed,
} as const

const linkDestinationSchema = {
  type: 'object',
  description:
    'Required by type: internal screenId; external url; resource resourceId, url, displayName.',
  properties: {
    type: { type: 'string', enum: ['internal', 'external', 'resource'] },
    screenId: nonEmptyString,
    url: nonEmptyString,
    resourceId: nonEmptyString,
    displayName: nonEmptyString,
  },
  required: ['type'],
  ...closed,
} as const

const definitionSourceSchema = {
  type: 'object',
  properties: {
    $ref: {
      type: 'string',
      minLength: 1,
      description: 'Local #/componentDefinitions/... reference.',
    },
  },
  required: ['$ref'],
  ...closed,
} as const

const definitionInstanceFieldsSchema = {
  type: 'object',
  properties: {
    source: definitionSourceSchema,
    props: { type: 'object', additionalProperties: publicPropValue },
    variantId: nullableString,
  },
  required: ['source', 'props', 'variantId'],
  ...closed,
} as const

const componentConfigProperties = {
  kind: { type: 'string', enum: COMPONENT_KINDS },
  layout: { type: 'string', enum: ['vertical', 'horizontal', 'grid'] },
  gap: { type: 'string', enum: ['none', 'sm', 'md', 'lg'] },
  columns: { type: 'integer', minimum: 1, maximum: 12 },
  justify: { type: 'string', enum: ['start', 'center', 'end', 'between'] },
  align: { type: 'string', enum: ['start', 'center', 'end', 'stretch'] },
  wrap: { type: 'boolean' },
  text: string,
  style: { type: 'string', enum: ['heading1', 'heading2', 'heading3', 'body', 'caption'] },
  fieldKey: string,
  label: string,
  inputType: { type: 'string', enum: ['text', 'email', 'password'] },
  required: { type: 'boolean' },
  placeholder: string,
  defaultValue: string,
  validationRules: { type: 'array', items: validationRuleSchema },
  options: {
    type: 'array',
    items: {
      type: 'object',
      properties: { value: string, label: string },
      required: ['value', 'label'],
      ...closed,
    },
  },
  variant: { type: 'string', enum: ['primary', 'secondary', 'danger'] },
  eventId: nullableString,
  confirmationMessage: nullableString,
  preventDoubleSubmit: { type: 'boolean' },
  source: string,
  alt: nonEmptyString,
  fit: { type: 'string', enum: ['contain', 'cover'] },
  aspectRatio: { type: 'string', enum: ['auto', 'square', '4:3', '16:9'] },
  placeholderStyle: { type: 'string', enum: ['icon', 'skeleton'] },
  destination: linkDestinationSchema,
  openMode: { type: 'string', enum: ['sameContext', 'newContext', 'download'] },
  dataSource: {
    type: 'object',
    properties: {
      apiOperationId: nullableString,
      itemsPath: string,
      previewItems: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          description: 'JSON preview object; nested JSON is accepted and validated at runtime.',
        },
      },
    },
    required: ['apiOperationId', 'itemsPath', 'previewItems'],
    ...closed,
  },
  itemKeyPath: nonEmptyString,
  itemTemplate: definitionInstanceFieldsSchema,
  propBindings: {
    type: 'array',
    items: {
      type: 'object',
      properties: { propKey: nonEmptyString, source: valueSourceSchema },
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
            source: valueSourceSchema,
            equals: scalar,
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
    type: ['object', 'null'],
    properties: {
      source: valueSourceSchema,
      equals: scalar,
      visibleWhenMatched: { type: 'boolean' },
      fallback: { type: 'boolean' },
    },
    required: ['source', 'equals', 'visibleWhenMatched', 'fallback'],
    ...closed,
  },
} as const

export const componentConfigSchema = {
  type: 'object',
  description:
    'Complete config. Required fields depend on kind and are validated exactly at runtime: layout kinds need layout/gap/columns/justify/align/wrap; text needs text/style; textInput and select need field fields; other kinds need their typed fields.',
  properties: componentConfigProperties,
  required: ['kind'],
  ...closed,
} as const

export const componentConfigPatchSchema = {
  type: 'object',
  properties: componentConfigProperties,
  minProperties: 1,
  ...closed,
} as const

export const componentPlacementSchema = {
  type: 'object',
  description:
    'Required by mode: flow only mode; sticky edge+inset; overlay/viewport anchor+insetX+insetY.',
  properties: {
    mode: { type: 'string', enum: ['flow', 'sticky', 'overlay', 'viewport'] },
    edge: { type: 'string', enum: ['top', 'bottom'] },
    anchor: { type: 'string', enum: PLACEMENT_ANCHORS },
    inset: { type: 'string', enum: PLACEMENT_INSET_TOKENS },
    insetX: { type: 'string', enum: PLACEMENT_INSET_TOKENS },
    insetY: { type: 'string', enum: PLACEMENT_INSET_TOKENS },
  },
  required: ['mode'],
  ...closed,
} as const

const componentSizingProperties = {
  inlineSize: { type: 'string', enum: ['auto', 'content', 'fill'] },
  minWidth: { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
  maxWidth: { type: 'string', enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl'] },
  gridSpan: { type: 'integer', minimum: 1, maximum: 12 },
  grow: { type: 'integer', minimum: 0, maximum: 3 },
  shrink: { type: 'string', enum: ['allow', 'prevent'] },
} as const

export const componentSizingSchema = {
  type: 'object',
  properties: componentSizingProperties,
  required: ['inlineSize', 'minWidth', 'maxWidth', 'gridSpan', 'grow', 'shrink'],
  ...closed,
} as const

export const componentSizingPatchSchema = {
  type: 'object',
  properties: componentSizingProperties,
  minProperties: 1,
  ...closed,
} as const

export const rootComponentSizingSchema = {
  type: 'object',
  properties: componentSizingProperties,
  required: ['inlineSize', 'minWidth', 'maxWidth', 'gridSpan', 'grow', 'shrink'],
  description: 'Modal roots require inlineSize=fill; runtime validation enforces root constraints.',
  ...closed,
} as const

export const componentTargetSchema = {
  type: 'object',
  description:
    'Required by type: inline componentId; definitionNode instanceId+nodePath; collectionItemNode collectionId+nodePath.',
  properties: {
    type: {
      type: 'string',
      enum: ['inline', 'definitionNode', 'collectionItemNode'],
    },
    componentId: nonEmptyString,
    instanceId: nonEmptyString,
    collectionId: nonEmptyString,
    nodePath: { type: 'array', minItems: 1, items: nonEmptyString },
  },
  required: ['type'],
  ...closed,
} as const

export const componentOverridesSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      target: componentTargetSchema,
      override: {
        type: 'object',
        properties: {
          visible: { type: 'boolean' },
          enabled: { type: 'boolean' },
          text: string,
          value: string,
        },
        minProperties: 1,
        ...closed,
      },
    },
    required: ['target', 'override'],
    ...closed,
  },
} as const

export const publicPropFieldSchema = {
  type: 'string',
  minLength: 1,
  description:
    'A supported common.*, config.*, placement.*, or sizing.* public field path.',
} as const
