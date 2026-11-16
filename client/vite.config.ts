import path from 'path'
import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

const logger = createLogger()
const originalLoggerError = logger.error.bind(logger)
logger.error = (msg, options) => {
  const errCode = (options?.error as (Error & { code?: string }) | undefined)?.code
  if (
    typeof msg === 'string' &&
    msg.includes('ws proxy') &&
    (errCode === 'ECONNRESET' || errCode === 'EPIPE')
  ) {
    return
  }
  originalLoggerError(msg, options)
}

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@data': path.resolve(import.meta.dirname, '../data'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': 'http://localhost:2611',
      '/ws': {
        target: 'ws://localhost:2611',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: Error & { code?: string }) => {
            if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') {
              return;
            }
            console.error('[vite] ws proxy error:', err);
          });
        },
      },
      '/assets': 'http://localhost:2611',
    },
  },
})
