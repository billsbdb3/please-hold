import { mount } from 'svelte';
import App from './App.svelte';
import CctvDemo from './cctv/CctvDemo.svelte';
import './styles/theme.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app missing from index.html');

/**
 * Dev-only CCTV preview. Reachable at `#cctv` (e.g. http://127.0.0.1:5173/#cctv)
 * so a human can look at the surveillance wall before Phase 2 mounts it in the
 * live UI. Any other hash boots the game normally — this adds nothing to the
 * live path.
 */
const component = location.hash === '#cctv' ? CctvDemo : App;

export default mount(component, { target });
