/// <reference types="vite/client" />

/** Wordt door Vite ingevuld met de versie uit package.json. */
declare const __APP_VERSION__: string;

/** "eigenaar/repo" waar de releases van deze app vandaan komen. */
declare const __RELEASE_REPO__: string;

/** Of die repository prive is; zo ja, is er een token nodig om updates te zien. */
declare const __RELEASE_PRIVATE__: boolean;
