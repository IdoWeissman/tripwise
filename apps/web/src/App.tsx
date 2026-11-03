import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AppLayout, RequireAuth } from './components/AppLayout';
import { TripLayout } from './components/TripLayout';
import { ExpensesPage } from './pages/ExpensesPage';
import { ItineraryPage } from './pages/ItineraryPage';
import { JoinPage } from './pages/JoinPage';
import { MembersPage } from './pages/MembersPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProposalsPage } from './pages/ProposalsPage';
import { SignInPage } from './pages/SignInPage';
import { TripsPage } from './pages/TripsPage';

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/sign-up', element: <SignInPage mode="signUp" /> },
  { path: '/join/:token', element: <JoinPage /> },
  {
    element: <RequireAuth />,
    children: [
      { element: <AppLayout />, children: [{ index: true, element: <TripsPage /> }] },
      {
        path: '/trips/:tripId',
        element: <TripLayout />,
        children: [
          { index: true, element: <Navigate to="itinerary" replace /> },
          { path: 'itinerary', element: <ItineraryPage /> },
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
