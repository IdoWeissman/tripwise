import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { SignInPage } from './pages/SignInPage';
import { TripsPage } from './pages/TripsPage';

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TripsPage /> },
      // TODO: /trips/:tripId — itinerary, proposals, expenses, members (see design canvas)
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
