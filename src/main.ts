// Point d'entrée : monte l'application dans la page.
import './style.css';
import { App } from './ui/app.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) new App(root).start();
