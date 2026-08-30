const closed = { additionalProperties: false } as const
const string = { type: 'string' } as const
const nullableString = { type: ['string', 'null'] } as const

const fieldBindingSchema = {
  type: 'object',
  properties: {
    componentId: { type: 'string', minLength: 1 },
    targetPath: { type: 'string' },
  },
  required: ['componentId', 'targetPath'],
  ...closed,
}

const nullableFieldBindingSchema = {
  anyOf: [{ type: 'null' }, fieldBindingSchema],
}

const validationRuleSchema = {
  oneOf: [
    {
      type: 'object',
      properties: { id: string, type: { const: 'required' }, message: string },
      required: ['id', 'type', 'message'],
      ...closed,
    },
    {
      type: 'object',
      properties: { id: string, type: { const: 'email' }, message: string },
      required: ['id', 'type', 'message'],
      ...closed,
    },
    ...(['minLength', 'maxLength'] as const).map(type => ({
      type: 'object',
      properties: {
        id: string,
        type: { const: type },
        value: { type: 'integer', minimum: 0 },
        message: string,
      },
      required: ['id', 'type', 'value', 'message'],
      ...closed,
    })),
    {
      type: 'object',
      properties: { id: string, type: { const: 'pattern' }, value: string, message: string },
      required: ['id', 'type', 'value', 'message'],
      ...closed,
    },
    {
      type: 'object',
      properties: {
        id: string,
        type: { const: 'custom' },
        description: string,
        message: string,
      },
      required: ['id', 'type', 'description', 'message'],
      ...closed,
    },
  ],
}

const configVariants = [
  {
    kind: 'page',
    properties: { kind: { const: 'page' }, title: string },
    required: ['kind', 'title'],
  },
  {
    kind: 'section',
    properties: { kind: { const: 'section' }, title: string },
    required: ['kind', 'title'],
  },
  {
    kind: 'stack',
    properties: { kind: { const: 'stack' }, gap: { type: 'string', enum: ['sm', 'md', 'lg'] } },
    required: ['kind', 'gap'],
  },
  {
    kind: 'columns',
    properties: { kind: { const: 'columns' }, columns: { type: 'integer', enum: [2, 3] } },
    required: ['kind', 'columns'],
  },
  {
    kind: 'actionArea',
    properties: {
      kind: { const: 'actionArea' },
      align: { type: 'string', enum: ['start', 'end', 'between'] },
    },
    required: ['kind', 'align'],
  },
  {
    kind: 'heading',
    properties: {
      kind: { const: 'heading' },
      text: string,
      level: { type: 'integer', enum: [1, 2, 3] },
    },
    required: ['kind', 'text', 'level'],
  },
  {
    kind: 'text',
    properties: { kind: { const: 'text' }, text: string },
    required: ['kind', 'text'],
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
      requestBinding: nullableFieldBindingSchema,
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
      'requestBinding',
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
      requestBinding: nullableFieldBindingSchema,
    },
    required: ['kind', 'fieldKey', 'label', 'required', 'options', 'requestBinding'],
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
    properties: { kind: { const: 'modal' }, title: string },
    required: ['kind', 'title'],
  },
] as const

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
        properties: { ...commonOverrideProperties, value: string },
        ...closed,
      },
    ],
  },
}
