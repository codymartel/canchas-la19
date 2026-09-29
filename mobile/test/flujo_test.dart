import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/domain/negocio.dart';
import 'package:mobile/core/domain/resultado.dart';
import 'package:mobile/features/acceso/domain/sesion.dart';
import 'package:mobile/features/negocio/data/negocio_repository.dart';
import 'package:mobile/features/negocio/presentation/coordinar_screen.dart';
import 'package:mobile/features/negocio/presentation/estado_screens.dart';
import 'package:mobile/features/negocio/presentation/negocio_provider.dart';

class NegocioFalso extends Mock implements NegocioRepository {}

Widget envoltura(Widget hijo) => MaterialApp(home: Scaffold(body: hijo));

/// Las pantallas del flujo son columnas con scroll; el viewport por defecto
/// (800x600) deja los botones fuera de pantalla.
void viewportAlto(WidgetTester t) {
  t.view.physicalSize = const Size(900, 1600);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
}

void main() {
  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
  });

  group('pantallas del flujo obligatorio', () {
    testWidgets('sin el ancla, explica el paso y NO ofrece crear el negocio', (
      t,
    ) async {
      viewportAlto(t);
      var reintentos = 0, cierres = 0;
      await t.pumpWidget(
        envoltura(
          SinConfiguracionScreen(
            reintentar: () => reintentos++,
            cerrarSesion: () => cierres++,
          ),
        ),
      );
      expect(find.text('Falta identificar al administrador'), findsOneWidget);
      expect(find.textContaining('configurar-admin'), findsOneWidget);
      expect(find.text('Vamos a coordinar'), findsNothing);
      expect(find.textContaining('Crear cuenta'), findsNothing);
      expect(find.textContaining('Solicitar acceso'), findsNothing);
      await t.tap(find.text('Comprobar de nuevo'));
      await t.tap(find.text('Cerrar sesion'));
      expect(reintentos, 1);
      expect(cierres, 1);
    });

    testWidgets('admin verificado sin negocio ve el boton Vamos a coordinar', (
      t,
    ) async {
      viewportAlto(t);
      final repo = NegocioFalso();
      when(
        () => repo.preparar(
          uid: any(named: 'uid'),
          email: any(named: 'email'),
        ),
      ).thenAnswer((_) async => const Ok(null));
      final provider = NegocioProvider(repo);
      addTearDown(provider.dispose);
      var terminado = 0;
      await t.pumpWidget(
        envoltura(
          CoordinarScreen(
            provider: provider,
            uid: 'admin-1',
            email: 'admin@local.test',
            alTerminar: () => terminado++,
          ),
        ),
      );
      expect(find.text('Vamos a coordinar'), findsOneWidget);
      for (final sede in sedesIds) {
        expect(find.textContaining('Cancha $sede'), findsOneWidget);
      }
      expect(find.textContaining('nacen cerradas'), findsOneWidget);
      await t.tap(find.text('Vamos a coordinar'));
      await t.pumpAndSettle();
      expect(terminado, 1);
      verify(
        () => repo.preparar(uid: 'admin-1', email: 'admin@local.test'),
      ).called(1);
    });

    testWidgets('un fallo al preparar se muestra y no avanza de pantalla', (
      t,
    ) async {
      viewportAlto(t);
      final repo = NegocioFalso();
      when(
        () => repo.preparar(
          uid: any(named: 'uid'),
          email: any(named: 'email'),
        ),
      ).thenAnswer((_) async => const Fallo('Sin conexion. Reintenta.'));
      final provider = NegocioProvider(repo);
      addTearDown(provider.dispose);
      var terminado = 0;
      await t.pumpWidget(
        envoltura(
          CoordinarScreen(
            provider: provider,
            uid: 'a',
            email: 'a@local.test',
            alTerminar: () => terminado++,
          ),
        ),
      );
      await t.tap(find.text('Vamos a coordinar'));
      await t.pumpAndSettle();
      expect(find.text('Sin conexion. Reintenta.'), findsOneWidget);
      expect(terminado, 0);
    });

    testWidgets('doble toque no duplica la preparacion', (t) async {
      viewportAlto(t);
      final repo = NegocioFalso();
      final pendiente = Completer<Resultado<void>>();
      when(
        () => repo.preparar(
          uid: any(named: 'uid'),
          email: any(named: 'email'),
        ),
      ).thenAnswer((_) => pendiente.future);
      final provider = NegocioProvider(repo);
      addTearDown(provider.dispose);
      await t.pumpWidget(
        envoltura(
          CoordinarScreen(
            provider: provider,
            uid: 'a',
            email: 'a@local.test',
            alTerminar: () {},
          ),
        ),
      );
      // La primera peticion sigue en vuelo: el boton pasa a spinner y ya no
      // admite un segundo toque.
      await t.tap(find.text('Vamos a coordinar'));
      await t.pump();
      expect(provider.ocupado, isTrue, reason: 'el boton debe quedar ocupado');
      expect(find.text('Vamos a coordinar'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      verify(() => repo.preparar(uid: 'a', email: 'a@local.test')).called(1);
      pendiente.complete(const Ok(null));
      await t.pumpAndSettle();
      expect(
        find.text('Vamos a coordinar'),
        findsOneWidget,
        reason: 'el boton se restaura',
      );
    });

    testWidgets(
      'cuenta no vinculada: sin registro, sin solicitudes, sin crear negocio',
      (t) async {
        await t.pumpWidget(
          envoltura(
            NoVinculadoScreen(
              email: 'ajeno@local.test',
              reintentar: () {},
              cerrarSesion: () {},
            ),
          ),
        );
        expect(
          find.text('Esta cuenta no esta vinculada al negocio'),
          findsOneWidget,
        );
        expect(find.text('ajeno@local.test'), findsOneWidget);
        for (final prohibido in [
          'Registrarse',
          'Crear cuenta',
          'Solicitar acceso',
          'Aceptar invitacion',
          'Vamos a coordinar',
        ]) {
          expect(find.textContaining(prohibido), findsNothing);
        }
        expect(find.text('Comprobar de nuevo'), findsOneWidget);
      },
    );

    testWidgets(
      'empleado desactivado ve un mensaje propio, no el de no vinculado',
      (t) async {
        await t.pumpWidget(
          envoltura(
            NoVinculadoScreen(
              email: 'baja@local.test',
              desactivado: true,
              reintentar: () {},
              cerrarSesion: () {},
            ),
          ),
        );
        expect(find.text('Tu acceso esta desactivado'), findsOneWidget);
        expect(find.textContaining('desactivo tu cuenta'), findsOneWidget);
      },
    );
  });

  group('estados de sesion', () {
    test(
      'un empleado autorizado no es administrador y no prepara el negocio',
      () {
        const empleado = Sesion(
          EstadoSesion.vinculado,
          uid: 'e1',
          negocioId: negocioId,
          activo: true,
          permisos: {'agenda': true, 'reservas': true},
        );
        expect(empleado.enPanel, isTrue);
        expect(empleado.esAdministrador, isFalse);
        expect(empleado.permite('reservas'), isTrue);
        expect(empleado.permite('promociones'), isFalse);
        expect(empleado.estado, isNot(EstadoSesion.preparar));
      },
    );

    test('sin sesion, sin verificar o no vinculado nunca llega al panel', () {
      expect(const Sesion.sinSesion().enPanel, isFalse);
      expect(
        const Sesion.noVerificado(uid: 'a', email: 'a@b.c').enPanel,
        isFalse,
      );
      expect(
        const Sesion.noVinculado(uid: 'a', email: 'a@b.c').enPanel,
        isFalse,
      );
      expect(
        const Sesion.desactivado(uid: 'a', email: 'a@b.c').enPanel,
        isFalse,
      );
      expect(const Sesion.sinConfiguracion().enPanel, isFalse);
      expect(
        const Sesion.preparar(
          uid: 'a',
          email: 'a@b.c',
          negocioId: negocioId,
        ).enPanel,
        isFalse,
      );
    });

    test(
      'el administrador tiene todos los permisos, pero no si esta inactivo',
      () {
        const admin = Sesion(
          EstadoSesion.vinculado,
          uid: 'a',
          negocioId: negocioId,
          administrador: true,
          activo: true,
        );
        for (final p in permisosClave) {
          expect(admin.permite(p), isTrue, reason: 'debe poder $p');
        }
        expect(
          const Sesion(
            EstadoSesion.vinculado,
            uid: 'x',
            negocioId: negocioId,
            activo: false,
          ).permite('reservas'),
          isFalse,
        );
      },
    );
  });

  group('reglas de negocio compartidas', () {
    test('franjas canonicas cubren el intervalo y cruzan medianoche', () {
      final slots = slotsDe(dia: '2026-10-05', minuto: 1410, duracion: 90);
      expect(slots.map((s) => s.minute), [1410, 0, 30]);
      expect(slots.map((s) => s.dia), [
        '2026-10-05',
        '2026-10-06',
        '2026-10-06',
      ]);
      expect(esDuracionValida(60), isTrue);
      expect(esDuracionValida(150), isTrue);
      expect(esDuracionValida(45), isFalse);
      expect(esFranjaValida(615), isFalse);
      expect(esSede('la-19'), isTrue);
      expect(esSede('la-99'), isFalse);
      expect(esEstadoReserva('cancelada'), isTrue);
      expect(esEstadoReserva('inventada'), isFalse);
    });

    test('la ruta de ocupacion es compartida y canonica', () {
      final slot = slotsDe(dia: '2026-10-05', minuto: 600, duracion: 30).single;
      final a = rutaFranja(negocioId, 'la-19', slot);
      expect(
        a,
        'negocios/$negocioId/agenda/la-19/anios/2026/meses/10/dias/5/franjas/600',
      );
      expect(
        a.split('/').length.isEven,
        isTrue,
        reason: 'las rutas de documento necesitan segmentos pares',
      );
      expect(
        a.contains('reserva'),
        isFalse,
        reason: 'la clave no puede incluir la reserva',
      );
    });

    test('el identificador de reserva es estable y depende de la peticion', () {
      expect(idReserva('peticion-1'), idReserva('peticion-1'));
      expect(idReserva('peticion-1'), isNot(idReserva('peticion-2')));
      expect(idReserva('peticion-1'), startsWith('r_'));
    });

    test('normalizarBusqueda ordena sin tildes', () {
      expect(normalizarBusqueda('Ana Ruiz Ñoño'), 'ana ruiz nono');
    });
  });

  group('Resultado', () {
    test('transporta valor o mensaje sin excepciones', () {
      const ok = Ok<int>(7);
      const ko = Fallo<int>('fallo');
      expect(ok.esError, isFalse);
      expect(ok.valor, 7);
      expect(ok.mensaje, isNull);
      expect(ko.esError, isTrue);
      expect(ko.valor, isNull);
      expect(ko.mensaje, 'fallo');
    });
  });
}
