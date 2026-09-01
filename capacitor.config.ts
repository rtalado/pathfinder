import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.pathfinder',
  appName: 'Pathfinder',
  webDir: 'dist',
  // Capacitor serveert de app via https://localhost in de webview; daardoor werkt
  // fetch() naar de contentbestanden net zoals op de desktop.
  server: { androidScheme: 'https' },
  android: {
    // De app draait in de webview op https://localhost. Wil je synchroniseren met
    // een eigen server op je thuisnetwerk, dan is dat vrijwel altijd een adres
    // zonder https, en dat blokkeert Android standaard. De app praat alleen met
    // GitHub en met de server die jij zelf instelt.
    allowMixedContent: true,
    backgroundColor: '#0d1117',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0d1117',
      showSpinner: false,
    },
  },
};

export default config;
