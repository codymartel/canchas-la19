window.GRASS_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCxZ3cbXROSZd67zp6WWe72iOpyDRVqrhc',
  authDomain: 'glass-sintetico.firebaseapp.com',
  projectId: 'glass-sintetico',
  storageBucket: 'glass-sintetico.firebasestorage.app',
  messagingSenderId: '666840330833',
  appId: '1:666840330833:web:cf55eab78a7c087d68be70'
};
// Un origen local NUNCA usa servicios reales. Solo el proyecto demo del emulador.
if (['localhost','127.0.0.1'].includes(location.hostname)) {
  window.GRASS_FIREBASE_CONFIG.projectId = 'demo-grass-local';
  window.GRASS_FIREBASE_CONFIG.apiKey = 'demo-key';
}

// La activacion en produccion es deliberada, despues de verificar reglas y panel.
// Un origen local usa exclusivamente demo-grass-local y requiere ?reservas=1.
const origenLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const reservasProduccionHabilitadas = false;
window.GRASS_RESERVAS_HABILITADAS = reservasProduccionHabilitadas
  || (origenLocal && new URLSearchParams(location.search).get('reservas') === '1');
