// Router SPA minimaliste
const SCREENS = {
  main_menu:    () => import('./ui/screens/MainMenu.js'),
  deck_selector: () => import('./ui/screens/DeckSelector.js'),
  deck_builder:  () => import('./ui/screens/DeckBuilder.js'),
  game:          () => import('./ui/screens/GameScreen.js'),
  testbench:     () => import('./ui/screens/TestBench.js'),
};

const container = document.getElementById('screen');
let currentScreen = null;

export async function navigate(screenName, params = {}) {
  if (!SCREENS[screenName]) throw new Error(`Unknown screen: ${screenName}`);
  container.innerHTML = '';
  currentScreen = screenName;
  const mod = await SCREENS[screenName]();
  await mod.mount(container, params);
}

// Bootstrap
navigate('main_menu');
