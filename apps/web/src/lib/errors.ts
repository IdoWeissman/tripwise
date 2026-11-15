import { CombinedGraphQLErrors } from '@apollo/client/errors';

/** User-facing message from any Apollo error. */
export function messageFromError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) {
  if (CombinedGraphQLErrors.is(error)) return error.errors[0]?.message ?? fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** The API's error code (extensions.code), e.g. 'ACCOUNT_NOT_FOUND', or null. */
export function codeFromError(error: unknown): string | null {
  if (!CombinedGraphQLErrors.is(error)) return null;
  const code = error.errors[0]?.extensions?.code;
  return typeof code === 'string' ? code : null;
}
