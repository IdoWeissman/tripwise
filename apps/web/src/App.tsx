import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AppLayout, RequireAuth } from './components/AppLayout';
import { TripLayout } from './components/TripLayout';
import { AiAssistantsPage } from './pages/AiAssistantsPage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { BookingsPage } from './pages/BookingsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ItineraryPage } from './pages/ItineraryPage';
import { JoinPage } from './pages/JoinPage';
import { MembersPage } from './pages/MembersPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProposalsPage } from './pages/ProposalsPage';
import { SignInPage } from './pages/SignInPage';
import { TripsPage } from './pages/TripsPage';
import { WelcomePage } from './pages/WelcomePage';

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/sign-up', element: <SignInPage mode="signUp" /> },
  { path: '/join/:token', element: <JoinPage /> },
  {
    element: <RequireAuth />,
    children: [
      // first run after sign-up — full page, outside the dashboard shell
      { path: '/welcome', element: <WelcomePage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <TripsPage /> },
          { path: '/settings/ai', element: <AiAssistantsPage /> },
        ],
      },
      {
        path: '/trips/:tripId',
        element: <TripLayout />,
        children: [
          { index: true, element: <Navigate to="overview" replace /> },
          { path: 'overview', element: <OverviewPage /> },
          { path: 'itinerary', element: <ItineraryPage /> },
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'bookings/:bookingId', element: <BookingDetailPage /> },
          { path: 'proposals', element: <ProposalsPage /> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'members', element: <MembersPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
