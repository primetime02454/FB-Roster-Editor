import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function removePortraitsFromBuild() {
  return {
    name: 'remove-portraits-from-build',
    closeBundle() {
      const portraitDir = path.resolve(__dirname, 'dist', 'Player_Portraits');
      if (fs.existsSync(portraitDir)) {
        fs.rmSync(portraitDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [removePortraitsFromBuild()],
});
