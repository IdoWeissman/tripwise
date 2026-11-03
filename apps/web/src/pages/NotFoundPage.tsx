import { Link } from 'react-router';
import { EmptyState } from '../components/States';

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <EmptyState
        title="Page not found"
        body="The page you're looking for doesn't exist."
        action={
          <Link to="/" className="font-semibold text-accent">
            Back to your trips
          </Link>
        }
      />
    </main>
  );
}
