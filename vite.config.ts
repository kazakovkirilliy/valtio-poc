import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // two apps: the valtio version and its MobX migration (src-mobx/)
      input: { main: 'index.html', mobx: 'mobx.html' },
    },
  },
})
