import { readFileSync } from 'node:fs';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { resolvers } from './resolvers/index.js';

// Resolves to apps/api/schema.graphql from both src/ (tsx) and dist/ (node).
const typeDefs = readFileSync(new URL('../../schema.graphql', import.meta.url), 'utf8');

export const schema = makeExecutableSchema({ typeDefs, resolvers });
