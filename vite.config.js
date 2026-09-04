import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': {
        target: 'https://jllstakxiamxiycnwrbd.supabase.co',
        changeOrigin: true,
        secure: false,
      },
      '/rest': {
        target: 'https://jllstakxiamxiycnwrbd.supabase.co',
        changeOrigin: true,
        secure: false,
      },
      '/storage': {
        target: 'https://jllstakxiamxiycnwrbd.supabase.co',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})