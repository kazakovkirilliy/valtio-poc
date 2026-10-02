import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // index.html links to the three versions of the app: valtio (src/),
      // MobX (src-mobx/) and Effector (src-effector/)
      input: {
        index: 'index.html',
        valtio: 'valtio.html',
        mobx: 'mobx.html',
        effector: 'effector.html',
      },
    },
  },
})
