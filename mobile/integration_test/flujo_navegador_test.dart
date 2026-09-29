import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/data/servicios.dart';
import 'package:mobile/main.dart';

const host = String.fromEnvironment('EMULATOR_HOST', defaultValue: '127.0.0.1');
const projectId = 'demo-grass-local';
const password = 'prueba-segura-123';
const gerenteEmail = 'gerente@e2e.local';
const gerenteUid = 'gerente-e2e-0001';

Map<String, String> get _admin => const {
  'authorization': 'Bearer owner',
  'content-type': 'application/json',
};

/// Fuerza el estado del correo en el emulador de Auth. El panel nunca marca la
/// verificacion por su cuenta: el correo se confirma fuera y la app lo relee.
Future<void> _correoVerificado(String uid, bool valor) async {
  final r = await http.post(
    Uri.parse('http://$host:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key'),
    headers: _admin,
    body: jsonEncode({'localId': uid, 'emailVerified': valor}),
  );
  if (r.statusCode != 200) throw StateError('Auth emulator: ${r.body}');
}

/// `Bearer owner` es el modo admin del emulador de Firestore: ignora las reglas.
/// Sirve para devolver el negocio al estado "sin coordinar" y repetir el flujo.
Future<void> _sinCoordinar() async {
  final r = await http.patch(
    Uri.parse(
      'http://$host:8081/v1/projects/$projectId/databases/(default)/documents/'
      'negocios/grass-sintetico?updateMask.fieldPaths=preparado',
    ),
    headers: _admin,
    body: jsonEncode({
      'fields': {
        'preparado': {'booleanValue': false},
      },
    }),
  );
  if (r.statusCode != 200) throw StateError('Firestore emulator: ${r.body}');
}

/// Espera a que aparezca un widget, bombeando frames mientras tanto.
Future<void> _esperar(WidgetTester t, Finder f, String que) async {
  final limite = DateTime.now().add(const Duration(seconds: 30));
  while (f.evaluate().isEmpty) {
    if (DateTime.now().isAfter(limite)) {
      throw TestFailure('No aparecio: $que');
    }
    await t.pump(const Duration(milliseconds: 150));
  }
  await t.pumpAndSettle();
}

/// La captura la pide WebDriver sobre la pagina real de Chrome, no al arbol de
/// widgets: por eso es evidencia de lo que el usuario ve, no del modelo.
Future<void> _capturar(IntegrationTestWidgetsFlutterBinding b, String nombre) async {
  try {
    await b.takeScreenshot(nombre);
  } catch (e) {
    // Si el driver no reporta capturas, el flujo debe continuar igual.
    debugPrint('captura $nombre no disponible: $e');
  }
}

/// El panel usa NavigationRail a partir de 1000px y NavigationDrawer por debajo.
/// El ancho de la ventana de Chrome no es fijo, asi que se resuelven ambos.
Future<void> _irAPestana(WidgetTester t, String titulo) async {
  final rail = find.byType(NavigationRail);
  if (rail.evaluate().isNotEmpty) {
    final destino = find.descendant(of: rail, matching: find.text(titulo));
    await _esperar(t, destino, 'pestana $titulo en el rail');
    await t.ensureVisible(destino);
    await t.tap(destino);
  } else {
    final menu = find.byTooltip('Open navigation menu');
    await _esperar(t, menu, 'boton de menu');
    await t.tap(menu);
    await t.pumpAndSettle();
    final destino = find.descendant(
      of: find.byType(NavigationDrawer),
      matching: find.text(titulo),
    );
    await _esperar(t, destino, 'pestana $titulo en el cajon');
    await t.ensureVisible(destino);
    await t.tap(destino);
  }
  await t.pumpAndSettle();
}

Future<void> _escribir(WidgetTester t, String etiqueta, String valor) async {
  final campo = find.widgetWithText(TextFormField, etiqueta);
  await _esperar(t, campo, 'campo $etiqueta');
  await t.ensureVisible(campo);
  await t.enterText(campo, valor);
  await t.pumpAndSettle();
}

Future<void> _iniciarSesion(WidgetTester t, String email) async {
  await _esperar(t, find.text('Ingresar'), 'pantalla de login');
  await _escribir(t, 'Correo', email);
  await _escribir(t, 'Contrasena', password);
  await t.tap(find.text('Ingresar'));
  await t.pumpAndSettle();
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('flujo del gerente y del empleado en el navegador', (t) async {
    // Repetible: el correo del gerente arranca sin verificar y el negocio sin
    // coordinar, tal como si nunca se hubiera usado.
    await _correoVerificado(gerenteUid, false);
    await _sinCoordinar();

    const options = FirebaseOptions(
      apiKey: 'demo-key',
      appId: '1:1:web:navegador',
      messagingSenderId: '1',
      projectId: projectId,
      databaseURL: 'https://demo-grass-local-default-rtdb.firebaseio.com',
    );
    final app = Firebase.apps.isEmpty
        ? await Firebase.initializeApp(options: options)
        : Firebase.app();
    final db = FirebaseFirestore.instanceFor(app: app);
    final auth = FirebaseAuth.instanceFor(app: app);
    final authAltas = await authSecundaria(options);
    final realtime = FirebaseDatabase.instanceFor(
      app: app,
      databaseURL: options.databaseURL!,
    );
    db.useFirestoreEmulator(host, 8081);
    await auth.useAuthEmulator(host, 9099);
    await authAltas.useAuthEmulator(host, 9099);
    realtime.useDatabaseEmulator(host, 9000);
    db.settings = const Settings(persistenceEnabled: false);

    final correoEmpleado =
        'empleado.${DateTime.now().millisecondsSinceEpoch}@local.test';

    await t.pumpWidget(
      GrassApp(
        servicios: Servicios(
          db: db,
          auth: auth,
          authAltas: authAltas,
          realtime: realtime,
        ),
        appId: options.appId,
      ),
    );

    // --- Paso 1: el gerente entra con un correo sin verificar. -------------
    await _iniciarSesion(t, gerenteEmail);
    await _esperar(t, find.text('Verifica tu correo'), 'verificacion');
    expect(find.textContaining(gerenteEmail), findsWidgets);
    await _capturar(binding, '01_verificacion_correo');

    // --- Paso 2: confirma el correo y la app lo relee desde Auth. ----------
    await _correoVerificado(gerenteUid, true);
    await t.tap(find.text('Ya verifique mi correo'));
    await t.pumpAndSettle();
    await _esperar(t, find.text('Vamos a coordinar'), 'Vamos a coordinar');
    await _capturar(binding, '02_vamos_a_coordinar');

    // --- Paso 3: coordinar una sola vez. ----------------------------------
    await t.tap(find.text('Vamos a coordinar'));
    await _esperar(t, find.text('Agenda'), 'panel');
    await t.pumpAndSettle();
    await _capturar(binding, '03_panel_agenda');

    // --- Paso 4: las tres canchas existen y son reservables. ---------------
    await _irAPestana(t, 'Canchas');
    for (final id in ['19', '23', '24']) {
      await _esperar(t, find.textContaining('La $id'), 'cancha La $id');
    }
    expect(find.textContaining('Reservable'), findsNWidgets(3));
    await _capturar(binding, '04_canchas');

    // --- Paso 5: alta de empleado sin cerrar la sesion del gerente. --------
    await _irAPestana(t, 'Empleados');
    await t.tap(find.text('Crear cuenta de empleado'));
    await t.pumpAndSettle();
    await _escribir(t, 'Nombre completo', 'Empleado Navegador');
    await _escribir(t, 'Correo del empleado', correoEmpleado);
    await _escribir(t, 'Contrasena inicial', password);
    // Sin promociones: sirve para comprobar los permisos del empleado.
    final promo = find.text('Gestionar promociones');
    await _esperar(t, promo, 'permiso de promociones');
    await t.ensureVisible(promo);
    await t.pumpAndSettle();
    await t.tap(promo);
    await t.pumpAndSettle();
    await _capturar(binding, '05_alta_empleado');

    final crear = find.widgetWithText(FilledButton, 'Crear cuenta');
    await t.ensureVisible(crear);
    await t.tap(crear);
    await t.pumpAndSettle();
    await _esperar(t, find.textContaining('Creado: $correoEmpleado'), 'alta confirmada');
    // La sesion del gerente sigue viva: no se cerro al crear la cuenta.
    expect(find.text('Empleados'), findsWidgets);
    await _capturar(binding, '06_empleado_creado');

    // --- Paso 6: el empleado entra por su cuenta y con menos permisos. ----
    await t.tap(find.byTooltip('Cerrar sesión ($gerenteEmail)'));
    await t.pumpAndSettle();
    await _iniciarSesion(t, correoEmpleado);
    await _esperar(t, find.text('Agenda'), 'panel del empleado');
    await t.pumpAndSettle();
    await _capturar(binding, '07_panel_empleado');

    final rail = find.byType(NavigationRail);
    final drawer = find.byType(NavigationDrawer);
    expect(rail.evaluate().isNotEmpty || drawer.evaluate().isNotEmpty, isTrue);
    if (rail.evaluate().isNotEmpty) {
      // El empleado no administra personal, ni canchas, ni configuracion.
      expect(
        find.descendant(of: rail, matching: find.text('Empleados')),
        findsNothing,
      );
      expect(
        find.descendant(of: rail, matching: find.text('Configuracion')),
        findsNothing,
      );
      expect(
        find.descendant(of: rail, matching: find.text('Canchas')),
        findsNothing,
      );
    }

    // --- Paso 7: el empleado ve la misma agenda global del negocio. --------
    await _irAPestana(t, 'Agenda');
    for (final id in ['19', '23', '24']) {
      await _esperar(t, find.textContaining('La $id'), 'agenda del empleado: La $id');
    }
    await _capturar(binding, '08_agenda_compartida');
  });
}
