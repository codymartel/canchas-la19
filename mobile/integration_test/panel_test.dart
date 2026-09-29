import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/data/servicios.dart';
import 'package:mobile/core/domain/negocio.dart';
import 'package:mobile/features/acceso/data/acceso_repository.dart';
import 'package:mobile/features/acceso/domain/sesion.dart';
import 'package:mobile/features/empleados/data/empleados_repository.dart';
import 'package:mobile/features/negocio/data/negocio_repository.dart';

const host = String.fromEnvironment('EMULATOR_HOST', defaultValue: '127.0.0.1');
const projectId = 'demo-grass-local';
const password = 'prueba-segura-123';

Future<void> marcarVerificado(String uid) async {
  final response = await http.post(
    Uri.parse('http://$host:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key'),
    headers: {'authorization': 'Bearer owner', 'content-type': 'application/json'},
    body: jsonEncode({'localId': uid, 'emailVerified': true}),
  );
  if (response.statusCode != 200) {
    throw StateError('No se verifico la cuenta: ${response.body}');
  }
}

Future<Sesion> siguienteSesion(Servicios servicios) => AccesoRepository(servicios)
    .observar()
    .firstWhere((s) => s.estado != EstadoSesion.cargando)
    .timeout(const Duration(seconds: 20));

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('flujo privado completo contra emuladores', (_) async {
    const options = FirebaseOptions(
      apiKey: 'demo-key',
      appId: '1:1:web:integration',
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
    final servicios = Servicios(
      db: db,
      auth: auth,
      authAltas: authAltas,
      realtime: realtime,
    );

    await auth.signInWithEmailAndPassword(
      email: 'admin@local.test',
      password: password,
    );
    var sesion = await siguienteSesion(servicios);
    expect(sesion.estado, EstadoSesion.noVerificado);

    await marcarVerificado(auth.currentUser!.uid);
    await auth.currentUser!.reload();
    await auth.currentUser!.getIdToken(true);
    sesion = await siguienteSesion(servicios);
    expect(sesion.estado, EstadoSesion.preparar);

    final negocio = NegocioRepository(servicios);
    final preparaciones = await Future.wait([
      negocio.preparar(uid: auth.currentUser!.uid, email: 'admin@local.test'),
      negocio.preparar(uid: auth.currentUser!.uid, email: 'admin@local.test'),
    ]);
    expect(preparaciones.every((r) => !r.esError), isTrue);
    final canchas = await negocio.leerCanchas();
    expect(canchas.keys.toSet(), sedesIds.toSet());
    expect(canchas.values.every((c) => c['activa'] == false), isTrue);
    sesion = await siguienteSesion(servicios);
    expect(sesion.esAdministrador, isTrue);

    final adminUid = auth.currentUser!.uid;
    final empleados = EmpleadosRepository(servicios, negocioId, adminUid);
    final cuenta = await empleados.crearCuenta(
      email: 'empleado@local.test',
      clave: password,
    );
    expect(cuenta.esError, isFalse);
    expect(auth.currentUser!.uid, adminUid);
    final empleadoUid = cuenta.valor!.uid;
    final alta = await empleados.registrarEmpleado(
      uid: empleadoUid,
      nombre: 'Ana',
      email: 'empleado@local.test',
      permisos: {
        'agenda': true,
        'reservas': true,
        'clientes': true,
        'promociones': false,
      },
      sedes: const ['la-19', 'la-23', 'la-24'],
      sedePrincipal: 'la-19',
      activo: true,
    );
    expect(alta.esError, isFalse);

    await auth.signOut();
    await auth.signInWithEmailAndPassword(
      email: 'empleado@local.test',
      password: password,
    );
    expect(auth.currentUser!.emailVerified, isFalse);
    sesion = await siguienteSesion(servicios);
    expect(sesion.enPanel, isTrue);
    expect(sesion.esAdministrador, isFalse);
    expect(sesion.permite('reservas'), isTrue);
    expect(sesion.permite('promociones'), isFalse);

    await auth.signOut();
    await auth.signInWithEmailAndPassword(
      email: 'admin@local.test',
      password: password,
    );
    await auth.currentUser!.reload();
    final baja = await empleados.guardar({
      'uid': empleadoUid,
      'nombre': 'Ana',
      'email': 'empleado@local.test',
      'activo': false,
      'permisos': {
        'agenda': true,
        'reservas': true,
        'clientes': true,
        'promociones': false,
      },
      'sedes': ['la-19', 'la-23', 'la-24'],
      'sedePrincipal': 'la-19',
    });
    expect(baja.esError, isFalse);
    await auth.signOut();
    await auth.signInWithEmailAndPassword(
      email: 'empleado@local.test',
      password: password,
    );
    sesion = await siguienteSesion(servicios);
    expect(sesion.estado, EstadoSesion.desactivado);

    await auth.signOut();
    await authAltas.createUserWithEmailAndPassword(
      email: 'ajeno@local.test',
      password: password,
    );
    await authAltas.signOut();
    await auth.signInWithEmailAndPassword(
      email: 'ajeno@local.test',
      password: password,
    );
    sesion = await siguienteSesion(servicios);
    expect(sesion.estado, EstadoSesion.noVinculado);
  });
}
