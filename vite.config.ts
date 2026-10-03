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
      include: /[\\/]src-effector-(nested|model)[\\/]/,
      plugins: [['effector/babel-plugin', { addLoc: true }]],
    }),
  ],
  resolve: {
    // library-independent code shared by every app
    alias: { '@shared': fileURLToPath(new URL('./src-shared', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      // index.html links to every version of the app: valtio (src-valtio/),
      // MobX (src-mobx/), nested Effector (src-effector-nested/) and
      // @effector/model (src-effector-model/)
      input: {
        index: 'index.html',
        valtio: 'valtio.html',
        mobx: 'mobx.html',
        'effector-nested': 'effector-nested.html',
        'effector-model': 'effector-model.html',
      },
    },
  },
})
