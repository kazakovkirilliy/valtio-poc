import { fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Effector apps only: names every store, event and effect after its
    // variable, with its code location, for the devtools and error messages
    babel({
      include: /[\\/]src-effector(-nested)?[\\/]/,
      plugins: [['effector/babel-plugin', { addLoc: true }]],
    }),
  ],
  resolve: {
    // library-independent code shared by the three apps
    alias: { '@shared': fileURLToPath(new URL('./src-shared', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      // index.html links to every version of the app: valtio (src-valtio/),
      // MobX (src-mobx/), Effector (src-effector/) and nested Effector
      // (src-effector-nested/)
      input: {
        index: 'index.html',
        valtio: 'valtio.html',
        mobx: 'mobx.html',
        effector: 'effector.html',
        'effector-nested': 'effector-nested.html',
      },
    },
  },
})
