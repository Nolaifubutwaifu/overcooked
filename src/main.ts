import './style.css';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.ts';
import { renderApp } from './render.ts';
import {
  KeyboardInputProvider,
  WASD_BINDINGS,
  ARROW_BINDINGS,
  type InputProvider,
} from './input.ts';
import { App } from './app.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d')!;

const providers: InputProvider[] = [
  new KeyboardInputProvider(WASD_BINDINGS),
  new KeyboardInputProvider(ARROW_BINDINGS),
];

const app = new App(providers);

let lastTime = performance.now();
const MAX_DT = 1 / 30;

function loop(now: number): void {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > MAX_DT) dt = MAX_DT;

  app.tick(dt);
  renderApp(ctx, app.state);

  requestAnimationFrame(loop);
}

requestAnimationFrame((now) => {
  lastTime = now;
  loop(now);
});
