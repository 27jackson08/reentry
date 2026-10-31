import type { AppController } from '../app/controller';

export function bindKeyboard(app: AppController): void {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    switch (e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        app.running = !app.running;
        break;
      case 'i':
        app.induce();
        break;
      case 'w':
        app.planeWave();
        break;
      case 's':
        app.shock();
        break;
      case 'r':
        app.reset();
        break;
    }
  });
}
