import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: true,
    // The isolated Profile browser suite uses an invalid Supabase origin and
    // Playwright request interception. Removing these live proxies in that
    // one development mode closes the remaining relative-URL escape hatch.
    proxy: ['profile-e2e', 'sections-e2e', 'schedules-e2e', 'settings-e2e', 'admin-final-e2e'].includes(mode) ? undefined : {
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
}))
