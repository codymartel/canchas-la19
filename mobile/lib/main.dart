import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/material.dart';
import 'core/domain/negocio.dart';
import 'features/acceso/data/acceso_repository.dart';
import 'features/acceso/domain/sesion.dart';
import 'features/acceso/presentation/acceso_provider.dart';
import 'features/acceso/presentation/login_screen.dart';
import 'features/acceso/presentation/verificacion_screen.dart';
import 'features/clientes/data/clientes_repository.dart';
import 'features/clientes/presentation/clientes_provider.dart';
import 'features/configuracion/data/configuracion_repository.dart';
import 'features/configuracion/presentation/configuracion_provider.dart';
import 'features/dashboard/presentation/panel_screen.dart';
import 'features/empleados/data/empleados_repository.dart';
import 'features/empleados/presentation/empleados_provider.dart';
import 'features/negocio/data/negocio_repository.dart';
import 'features/negocio/presentation/coordinar_screen.dart';
import 'features/negocio/presentation/estado_screens.dart';
import 'features/negocio/presentation/negocio_provider.dart';
import 'features/promociones/data/promociones_repository.dart';
import 'features/promociones/presentation/promociones_provider.dart';
import 'features/presencia/data/presencia_repository.dart';
import 'features/presencia/presentation/presencia_provider.dart';
import 'features/reservas/data/reservas_repository.dart';
import 'features/reservas/presentation/agenda_provider.dart';
import 'features/sedes/data/sedes_repository.dart';
import 'features/sedes/presentation/sedes_provider.dart';
import 'firebase_options.dart';
import 'core/data/servicios.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    const host = String.fromEnvironment('EMULATOR_HOST');
    final options = DefaultFirebaseOptions.currentPlatform;
    final inicial = await Firebase.initializeApp(
      options: host.isEmpty
          ? options
          : FirebaseOptions(
              apiKey: 'demo-key',
              appId: options.appId,
              messagingSenderId: options.messagingSenderId,
              projectId: 'demo-grass-local',
              databaseURL:
                  'https://demo-grass-local-default-rtdb.firebaseio.com',
            ),
    );
    final db = FirebaseFirestore.instance;
    final auth = FirebaseAuth.instance;
    final realtime = FirebaseDatabase.instanceFor(
      app: inicial,
      databaseURL: inicial.options.databaseURL!,
    );
    final authAltas = await authSecundaria(
      host.isEmpty
          ? options
          : FirebaseOptions(
              apiKey: 'demo-key',
              appId: options.appId,
              messagingSenderId: options.messagingSenderId,
              projectId: 'demo-grass-local',
              databaseURL:
                  'https://demo-grass-local-default-rtdb.firebaseio.com',
            ),
    );
    db.settings = const Settings(persistenceEnabled: false);
    if (host.isNotEmpty) {
      db.useFirestoreEmulator(host, 8081);
      await auth.useAuthEmulator(host, 9099);
      await authAltas.useAuthEmulator(host, 9099);
      realtime.useDatabaseEmulator(host, 9000);
    }
    runApp(
      GrassApp(
        servicios: Servicios(
          db: db,
          auth: auth,
          authAltas: authAltas,
          realtime: realtime,
        ),
        appId: inicial.options.appId,
      ),
    );
  } catch (e, st) {
    debugPrint('Inicialización fallida: $e\n$st');
    runApp(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text('No se pudo iniciar Firebase.\n${mensajeError(e)}'),
          ),
        ),
      ),
    );
  }
}

class GrassApp extends StatefulWidget {
  final Servicios servicios;
  final String appId;
  const GrassApp({super.key, required this.servicios, required this.appId});
  @override
  State<GrassApp> createState() => _GrassAppState();
}

class _GrassAppState extends State<GrassApp> {
  late final acceso = AccesoProvider(AccesoRepository(widget.servicios));
  @override
  void dispose() {
    acceso.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Grass Sintético · Personal',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff165c43))
          .copyWith(
            primary: const Color(0xff165c43),
            surface: Colors.white,
            surfaceContainerLowest: Colors.white,
            surfaceContainerLow: const Color(0xfff5f7f6),
            surfaceContainer: const Color(0xffeef2f0),
          ),
      dialogTheme: const DialogThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
      ),
      scaffoldBackgroundColor: const Color(0xfff5f7f6),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: const CardThemeData(
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
    ),
    home: ListenableBuilder(
      listenable: acceso,
      builder: (context, _) =>
          _Raiz(acceso: acceso, servicios: widget.servicios),
    ),
  );
}

class _Raiz extends StatelessWidget {
  final AccesoProvider acceso;
  final Servicios servicios;
  const _Raiz({required this.acceso, required this.servicios});

  @override
  Widget build(BuildContext context) {
    final s = acceso.sesion;
    if (s.estado == EstadoSesion.cargando) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (acceso.error != null && s.estado == EstadoSesion.sinSesion) {
      return _Fallo(acceso: acceso);
    }
    return switch (s.estado) {
      EstadoSesion.cargando => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      EstadoSesion.sinSesion => LoginScreen(provider: acceso),
      EstadoSesion.noVerificado => VerificacionScreen(provider: acceso),
      EstadoSesion.sinConfiguracion => SinConfiguracionScreen(
        reintentar: acceso.recargar,
        cerrarSesion: acceso.salir,
      ),
      EstadoSesion.preparar => _Preparar(
        acceso: acceso,
        servicios: servicios,
        sesion: s,
      ),
      EstadoSesion.vinculado => _Panel(
        key: ValueKey('${s.uid}:${s.negocioId}'),
        servicios: servicios,
        acceso: acceso,
        sesion: s,
      ),
      EstadoSesion.desactivado => NoVinculadoScreen(
        email: s.email ?? '',
        desactivado: true,
        reintentar: acceso.recargar,
        cerrarSesion: acceso.salir,
      ),
      EstadoSesion.noVinculado => NoVinculadoScreen(
        email: s.email ?? '',
        reintentar: acceso.recargar,
        cerrarSesion: acceso.salir,
      ),
    };
  }
}

class _Fallo extends StatelessWidget {
  final AccesoProvider acceso;
  const _Fallo({required this.acceso});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(acceso.error!, textAlign: TextAlign.center),
            FilledButton(
              onPressed: acceso.recargar,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _Preparar extends StatefulWidget {
  final AccesoProvider acceso;
  final Servicios servicios;
  final Sesion sesion;
  const _Preparar({
    required this.acceso,
    required this.servicios,
    required this.sesion,
  });
  @override
  State<_Preparar> createState() => _PrepararState();
}

class _PrepararState extends State<_Preparar> {
  late final negocio = NegocioProvider(
    NegocioRepository(widget.servicios, widget.sesion.negocioId ?? negocioId),
  );
  @override
  void dispose() {
    negocio.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => CoordinarScreen(
    provider: negocio,
    uid: widget.sesion.uid ?? '',
    email: widget.sesion.email ?? '',
    alTerminar: widget.acceso.recargar,
  );
}

class _Panel extends StatefulWidget {
  final Servicios servicios;
  final AccesoProvider acceso;
  final Sesion sesion;
  const _Panel({
    super.key,
    required this.servicios,
    required this.acceso,
    required this.sesion,
  });
  @override
  State<_Panel> createState() => _PanelState();
}

class _PanelState extends State<_Panel> {
  late final String negocio = widget.sesion.negocioId!;
  late final agenda = AgendaProvider(
    ReservasRepository(widget.servicios, negocio),
  );
  late final sedes = SedesProvider(SedesRepository(widget.servicios, negocio));
  late final clientes = ClientesProvider(
    ClientesRepository(widget.servicios, negocio),
  );
  late final empleados = EmpleadosProvider(
    EmpleadosRepository(
      widget.servicios,
      negocio,
      widget.sesion.negocioId == negocioId ? (widget.sesion.uid ?? '') : '',
    ),
  );
  late final promociones = PromocionesProvider(
    PromocionesRepository(widget.servicios, negocio),
  );
  late final configuracion = ConfiguracionProvider(
    ConfiguracionRepository(widget.servicios, negocio),
  );
  late final presencia = PresenciaProvider(
    PresenciaRepository(widget.servicios, negocio),
  );

  @override
  void dispose() {
    agenda.dispose();
    sedes.dispose();
    clientes.dispose();
    empleados.dispose();
    promociones.dispose();
    configuracion.dispose();
    presencia.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PanelScreen(
    sesion: widget.sesion,
    acceso: widget.acceso,
    agenda: agenda,
    sedes: sedes,
    clientes: clientes,
    empleados: empleados,
    promociones: promociones,
    configuracion: configuracion,
    presencia: presencia,
  );
}
