import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Verificación de conectividad Supabase al arrancar (solo lectura, sin escribir basura)
import { supabase, isSupabaseConfigured } from './lib/supabase';

if (isSupabaseConfigured) {
  supabase
    .from('kernel_events')
    .select('event_id')
    .limit(1)
    .then(({ error }) => {
      if (error) {
        console.warn('[RobotOS] Supabase conectado pero sin acceso a kernel_events:', error.message);
      } else {
        console.info('[RobotOS] Supabase ✓ — kernel_events accesible (solo lectura anónima).');
      }
    });
} else {
  console.info('[RobotOS] Sin credenciales Supabase — operando en modo InMemory/Sandbox.');
}
