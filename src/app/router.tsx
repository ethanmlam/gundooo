import { createHashRouter } from 'react-router-dom';
import Landing from '../routes/Landing';
import TheaterSelect from '../routes/TheaterSelect';
import Mission from '../routes/Mission';

export const router = createHashRouter([
  { path: '/', element: <Landing /> },
  { path: '/theaters', element: <TheaterSelect /> },
  { path: '/mission/:theaterId', element: <Mission /> },
]);
