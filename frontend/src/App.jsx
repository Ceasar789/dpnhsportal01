import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { ProfileUnsavedChangesProvider } from './context/ProfileUnsavedChangesContext';
import { TeachingLoadUnsavedChangesProvider } from './context/TeachingLoadUnsavedChangesContext';

// A data router supplies React Router's navigation-blocking contract. The
// existing route tree stays in AppRoutes; the outer splat only gives it the
// router state needed by the Profile-specific unsaved-changes guard.
const router = createBrowserRouter([{
  path: '*',
  element: (
    <ProfileUnsavedChangesProvider>
      <TeachingLoadUnsavedChangesProvider>
        <AppRoutes />
      </TeachingLoadUnsavedChangesProvider>
    </ProfileUnsavedChangesProvider>
  ),
}]);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
