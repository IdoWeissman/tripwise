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
