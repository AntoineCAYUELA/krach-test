// Point d'entrée : monte le jeu dans la page.
import './style.css';
import { Game } from './ui/game.ts';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) new Game(root).start();
