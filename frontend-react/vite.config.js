import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()],
    // Desarrollo local (`npm run dev`): /api se reenvía al backend, igual que hace Nginx en Docker. VITE_DEV_PROXY cambia el destino (p. ej. el stack aislado en :18080) y VITE_DEV_ORIGIN el origen que declara ante el CORS del backend (p. ej. http://127.0.0.1:18081).
    server: { proxy: { '/api': { target: process.env.VITE_DEV_PROXY || 'http://localhost:8080', headers: process.env.VITE_DEV_ORIGIN ? { Origin: process.env.VITE_DEV_ORIGIN } : undefined } } },
    test: { environment: 'jsdom', globals: true, testTimeout: 20000, setupFiles: ['./src/test-setup.js'],
    // Con todos los núcleos los archivos jsdom compiten por CPU y memoria y una prueba de crewContacts agotaba su espera una de cada tres corridas; con dos trabajadores 4 de 4 pasaron.
    maxWorkers: 2 } });
