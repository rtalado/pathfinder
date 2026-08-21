import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.learnpath',
  appName: 'LearnPath',
  webDir: 'dist',
  // Capacitor serveert de app via https://localhost in de webview; daardoor werkt
  // fetch() naar de contentbestanden net zoals op de desktop.
  server: { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
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
