import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Kein StrictMode: verhindert doppelte WebGL-Initialisierung auf demselben Canvas.
createRoot(document.getElementById('root')!).render(<App />)
