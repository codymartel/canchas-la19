import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/domain/formatos.dart';
import 'package:mobile/core/domain/negocio.dart';
import 'package:mobile/core/domain/resultado.dart';
import 'package:mobile/features/reservas/domain/reserva.dart';
import 'package:mobile/features/reservas/data/reservas_repository.dart';
import 'package:mobile/features/reservas/presentation/agenda_provider.dart';
import 'package:mobile/features/reservas/presentation/agenda_screen.dart';
import 'package:mobile/features/sedes/data/sedes_repository.dart';
import 'package:mobile/features/sedes/presentation/sedes_provider.dart';
import 'package:mobile/features/clientes/data/clientes_repository.dart';
import 'package:mobile/features/clientes/presentation/clientes_provider.dart';
import 'package:mobile/features/presencia/domain/actividad.dart';
import 'package:mobile/features/presencia/domain/presencia_control.dart';

class Repo extends Mock implements ReservasRepository {}

class SedesRepo extends Mock implements SedesRepository {}

/// Horario global de ejemplo; las canchas ya no llevan horario propio.
const horarioGlobal = HorarioNegocio(
  apertura: 420,
  cierre: 60,
  duracionTurno: 30,
);

const canchaReservable = Registro('la-19', {
  'activa': true,
  'sedeId': 'la-19',
  'nombre': 'Cancha 19',
  'direccion': 'Av. Siempre Viva 742',
  'tarifaTurnoCentimos': 5000,
});

/// Dirección y tarifa pendientes no impiden reservar.
const canchaIncompleta = Registro('la-23', {
  'activa': true,
  'sedeId': 'la-23',
  'nombre': 'Cancha 23',
  'direccion': '',
  'tarifaTurnoCentimos': null,
});

void stubSedes(SedesRepo sr, {List<Registro> canchas = const []}) {
  when(() => sr.observarCanchas()).thenAnswer((_) => Stream.value(canchas));
  when(
    () => sr.observarHorario(),
  ).thenAnswer((_) => Stream.value(horarioGlobal));
}

class ClientesRepo extends Mock implements ClientesRepository {}

class PresenciaFake extends ChangeNotifier implements PresenciaControl {
  @override
  bool conectado = true;
  @override
  EstadoConexionPresencia estadoConexion = EstadoConexionPresencia.conectado;
  @override
  String? error;
  @override
  List<Actividad> actividades = const [];
  @override
  void observar(String dia) {}
  @override
  Future<void> reconectar() async {}
  @override
  Future<void> limpiar(String sesionId) async {}
  @override
  Future<bool> publicar({
    required String sesionId,
    required String canchaId,
    required String dia,
    required int minuto,
    required String nombre,
    required String estado,
  }) async => true;
}

void main() {
  late Repo repo;
  late AgendaProvider provider;
  setUp(() {
    repo = Repo();
    when(() => repo.observarDia(any(), bloqueos: false)).thenAnswer(
      (_) => Stream.value(
        const LecturaReservas(
          reservas: [],
          desdeCache: false,
          pendientes: false,
        ),
      ),
    );
    when(() => repo.observarDia(any(), bloqueos: true)).thenAnswer(
      (_) => Stream.value(
        const LecturaReservas(
          reservas: [],
          desdeCache: false,
          pendientes: false,
        ),
      ),
    );
    when(() => repo.observarOcupacion(any(), any())).thenAnswer(
      (_) => Stream.value(
        const LecturaOcupacion(
          minutos: {},
          desdeCache: false,
          pendientes: false,
        ),
      ),
    );
    provider = AgendaProvider(repo);
  });
  tearDown(() => provider.dispose());
  test('doble clic no duplica llamadas; fallo mantiene feedback', () async {
    final fin = Completer<Resultado<void>>();
    when(() => repo.registrar(any())).thenAnswer((_) => fin.future);
    final datos = {'bloqueo': true};
    final primero = provider.registrar(datos);
    expect(await provider.registrar(datos), false);
    fin.completeError(const FormatException('Horario ocupado'));
    expect(await primero, false);
    expect(provider.error, 'Horario ocupado');
    verify(() => repo.registrar(any())).called(1);
  });
  test('cambiar fecha ignora respuesta tardía de la anterior', () async {
    final viejo = StreamController<LecturaReservas>();
    when(
      () => repo.observarDia('2026-09-26', bloqueos: false),
    ).thenAnswer((_) => viejo.stream);
    provider.cambiarDia('2026-09-26');
    provider.cambiarDia('2026-09-27');
    viejo.add(
      const LecturaReservas(
        reservas: [
          Reserva('vieja', {'minuto': 600}),
        ],
        desdeCache: false,
        pendientes: false,
      ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(provider.filas, isEmpty);
    await viejo.close();
  });
  for (final ancho in [390.0, 1440.0]) {
    testWidgets('agenda vacía y formulario caben a $ancho px', (tester) async {
      tester.view.physicalSize = Size(ancho, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final sr = SedesRepo(), cr = ClientesRepo();
      stubSedes(sr, canchas: const [canchaReservable, canchaIncompleta]);
      final sp = SedesProvider(sr), cp = ClientesProvider(cr);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AgendaScreen(
              provider: provider,
              sedesProvider: sp,
              clientes: cp,
              puedeEscribir: true,
              puedeClientes: true,
              presencia: PresenciaFake(),
              nombrePersonal: 'Ana',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Sin reservas ni bloqueos para este día.'),
        findsOneWidget,
      );
      expect(find.text('Tabla La 19'), findsOneWidget);
      expect(find.text('Tabla La 23'), findsOneWidget);
      expect(find.text('Tabla La 24'), findsOneWidget);
      expect(find.text('Libre'), findsNWidgets(54));
      expect(find.text('00:00 (+1 dia)\n01:00 (+1 dia)'), findsNWidgets(3));
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Reserva'));
      await tester.pumpAndSettle();
      expect(find.text('Registrar reserva'), findsOneWidget);
      expect(find.text('1 hora'), findsOneWidget);
      expect(find.text('30 minutos'), findsNothing);
      await tester.ensureVisible(find.byType(SwitchListTile));
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(find.text('30 minutos'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      sp.dispose();
      cp.dispose();
    });
  }
  testWidgets(
    'agenda representa reservas reales y no omite errores del stream',
    (tester) async {
      final datos = StreamController<LecturaReservas>();
      final dia = provider.dia;
      when(
        () => repo.observarDia(dia, bloqueos: false),
      ).thenAnswer((_) => datos.stream);
      provider.cargar();
      final sr = SedesRepo(), cr = ClientesRepo();
      stubSedes(sr, canchas: const [canchaReservable]);
      final sp = SedesProvider(sr), cp = ClientesProvider(cr);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AgendaScreen(
              provider: provider,
              sedesProvider: sp,
              clientes: cp,
              puedeEscribir: false,
              puedeClientes: false,
              presencia: PresenciaFake(),
              nombrePersonal: 'Ana',
            ),
          ),
        ),
      );
      datos.add(
        const LecturaReservas(
          reservas: [
            Reserva('r1', {
              'dia': '2026-09-26',
              'minutos': ['630'],
              'minuto': 630,
              'duracion': 30,
              'sedeId': 'la-19',
              'canchaId': 'la-19',
              'clienteNombre': 'Cliente de prueba',
              'telefono': '+51999888777',
              'estado': 'confirmada',
              'montoCentimos': 5000,
              'adelantoCentimos': 1000,
            }),
          ],
          desdeCache: false,
          pendientes: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Cliente de prueba'), findsWidgets);
      expect(find.text('10:30 – 11:00'), findsOneWidget);
      expect(find.text('10:00\n11:00'), findsNWidgets(3));
      expect(find.text('Reserva'), findsNothing);
      expect(tester.takeException(), isNull);
      datos.addError(
        const FormatException('Servicio temporalmente no disponible'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Servicio temporalmente no disponible'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await datos.close();
      sp.dispose();
      cp.dispose();
    },
  );
  testWidgets('muestra conexion y aviso ambar de preparacion', (tester) async {
    final sr = SedesRepo(), cr = ClientesRepo();
    stubSedes(sr, canchas: const [canchaReservable, canchaIncompleta]);
    final sp = SedesProvider(sr), cp = ClientesProvider(cr);
    final presencia = PresenciaFake();
    presencia.actividades = [
      Actividad(
        uid: 'ana-1',
        sesionId: 'pestana-1',
        canchaId: 'la-19',
        dia: provider.dia,
        minuto: 1140,
        nombre: 'Ana',
        estado: 'preparando',
        expiraEn: DateTime.now().millisecondsSinceEpoch + 60000,
      ),
    ];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AgendaScreen(
            provider: provider,
            sedesProvider: sp,
            clientes: cp,
            puedeEscribir: true,
            puedeClientes: true,
            presencia: presencia,
            nombrePersonal: 'Beto',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Conectado en vivo'), findsOneWidget);
    expect(
      find.text('Ana está preparando este horario · 19:00'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    sp.dispose();
    cp.dispose();
    presencia.dispose();
  });
}
