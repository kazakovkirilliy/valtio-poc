import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // Build every comparison page so all five versions work in production.
      input: {
        index: 'index.html',
        valtio: 'valtio.html',
        mobx: 'mobx.html',
        effector: 'effector.html',
        jotai: 'jotai.html',
        zustand: 'zustand.html',
      },
    },
  },
})
