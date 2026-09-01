import canonicalExample from '../../public/examples/screen-blueprint-project-v3.json'
import { validateProjectDocumentMetadata } from '../../src/domain/runtimeValidation'

const regressionProject: unknown = canonicalExample
validateProjectDocumentMetadata(regressionProject)

export const sampleProject = regressionProject
