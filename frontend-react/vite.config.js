import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', globals: true, testTimeout: 20000, setupFiles: ['./src/test-setup.js'],
    // Con todos los núcleos los archivos jsdom compiten por CPU y memoria y una prueba de crewContacts agotaba su espera una de cada tres corridas; con dos trabajadores 4 de 4 pasaron.
    maxWorkers: 2 } });
