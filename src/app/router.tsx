import { createHashRouter } from 'react-router-dom';
import TheaterSelect from '../routes/TheaterSelect';
import Mission from '../routes/Mission';

export const router = createHashRouter([
  { path: '/', element: <TheaterSelect /> },
  { path: '/theaters', element: <TheaterSelect /> },
  { path: '/mission/:theaterId', element: <Mission /> },
]);
