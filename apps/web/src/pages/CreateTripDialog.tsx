import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { TripForm } from './trips/TripForm';

export function CreateTripDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open onClose={onClose} title="New trip">
      <TripForm
        onCreated={(id) => navigate(`/trips/${id}`)}
        actions={({ loading, disabled }) => (
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {loading ? 'Creating…' : 'Create trip'}
            </Button>
          </div>
        )}
      />
    </Dialog>
  );
}
