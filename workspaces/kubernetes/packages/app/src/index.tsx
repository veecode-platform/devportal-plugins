import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import App from './App';

// App is already a React element (from app.createRoot()), not a component
ReactDOM.createRoot(document.getElementById('root')!).render(App);
