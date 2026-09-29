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

// Las reservas en linea permanecen deshabilitadas hasta obtener una reserva
// valida de extremo a extremo y una lectura publica que no exponga datos internos.
// Las canchas publicas, aunque existan, no habilitan el formulario por si solas.
// Solo un origen local puede pedir el formulario con ?reservas=1 para las pruebas
// de navegador; cualquier otro origen (incluido el sitio publicado) queda en false.
const origenLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
window.GRASS_RESERVAS_HABILITADAS = origenLocal
  && new URLSearchParams(location.search).get('reservas') === '1';
