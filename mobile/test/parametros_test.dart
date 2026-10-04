import 'package:flutter/material.dart';
import 'package:mobile/features/sedes/presentation/parametros_screen.dart';
import 'package:mobile/features/sedes/presentation/sedes_provider.dart';
import 'package:mobile/core/domain/resultado.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/data/servicios.dart';
import 'package:mobile/features/sedes/data/sedes_repository.dart';

class Auth extends Mock implements FirebaseAuth {}

class Usuario extends Mock implements User {}

class Realtime extends Mock implements FirebaseDatabase {}

class RepoParametros extends Mock implements SedesRepository {}

void main() {
  testWidgets('parámetros: plazo inicial y validación sin inventar importes', (
    tester,
  ) async {
    final repo = RepoParametros(), provider = SedesProvider(repo);
    when(
      () => repo.guardarBloque(
        cancha: any(named: 'cancha'),
        dia: any(named: 'dia'),
        desde: any(named: 'desde'),
        hasta: any(named: 'hasta'),
        precio: any(named: 'precio'),
        adelanto: any(named: 'adelanto'),
        plazo: any(named: 'plazo'),
        version: any(named: 'version'),
      ),
    ).thenAnswer((_) async => const Ok<void>(null));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BloqueParametrosDialog(
            provider: provider,
            cancha: 'la-23',
            dia: '2026-10-10',
          ),
        ),
      ),
    );
    expect(find.text('10'), findsOneWidget);
    await tester.tap(find.text('Guardar parámetros'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Revisa el bloque'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'Precio por hora (S/)'),
      '50',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Adelanto mínimo por hora (S/)'),
      '60',
    );
    await tester.tap(find.text('Guardar parámetros'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Revisa el bloque'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'Adelanto mínimo por hora (S/)'),
      '15',
    );
    await tester.tap(find.text('Guardar parámetros'));
    await tester.pumpAndSettle();
    verify(
      () => repo.guardarBloque(
        cancha: 'la-23',
        dia: '2026-10-10',
        desde: 420,
        hasta: 480,
        precio: 5000,
        adelanto: 1500,
        plazo: 10,
        version: 0,
      ),
    ).called(1);
    expect(tester.takeException(), isNull);
    provider.dispose();
  });
  test(
    'parámetros: bloque, medianoche, conservación y versión obsoleta',
    () async {
      final db = FakeFirebaseFirestore(), auth = Auth(), user = Usuario();
      when(() => auth.currentUser).thenReturn(user);
      when(() => user.uid).thenReturn('principal-local');
      final repo = SedesRepository(
        Servicios(db: db, auth: auth, authAltas: auth, realtime: Realtime()),
        'grass-sintetico',
      );
      Future<bool> guardar(
        int desde,
        int hasta,
        int p,
        int a,
        int t,
        int v,
      ) async => !(await repo.guardarBloque(
        cancha: 'la-23',
        dia: '2026-10-10',
        desde: desde,
        hasta: hasta,
        precio: p,
        adelanto: a,
        plazo: t,
        version: v,
      )).esError;
      expect(await guardar(420, 540, 5000, 1000, 10, 0), true);
      final ref = repo.parametrosRef('la-23', '2026-10-10');
      expect(
        (await repo.observarParametros('la-23', '2026-10-10').first)!
            .datos['horas'],
        {
          '420': {'precioCentimos': 5000, 'adelantoCentimos': 1000},
          '480': {'precioCentimos': 5000, 'adelantoCentimos': 1000},
        },
      );
      expect(await guardar(1440, 1500, 6000, 1500, 15, 1), true);
      final data =
          (await repo.observarParametros('la-23', '2026-10-10').first)!.datos;
      expect((data['horas'] as Map)['420'], {
        'precioCentimos': 5000,
        'adelantoCentimos': 1000,
      });
      expect((data['horas'] as Map)['1440'], {
        'precioCentimos': 6000,
        'adelantoCentimos': 1500,
      });
      expect(data['plazoMinutos'], 15);
      expect(await guardar(420, 540, 4000, 1000, 10, 1), false);
      expect(await guardar(420, 480, 1000, 1500, 10, 2), false);
      expect(await guardar(420, 480, 1000, 100, 0, 2), false);
      expect((await ref.collection('historial').get()).docs.length, 2);
      expect((await ref.get()).data()!['version'], 2);
    },
  );
  for (final cambios in [1, 20, 100]) {
    test(
      'precios bajos/medios/altos: $cambios cambios aislados por cancha y día',
      () async {
        final db = FakeFirebaseFirestore(), auth = Auth(), user = Usuario();
        when(() => auth.currentUser).thenReturn(user);
        when(() => user.uid).thenReturn('principal-local');
        final repo = SedesRepository(
          Servicios(db: db, auth: auth, authAltas: auth, realtime: Realtime()),
          'grass-sintetico',
        );
        final esperado = <String, dynamic>{};
        for (var v = 0; v < cambios; v++) {
          final desde = v == 0 ? 420 : 420 + (v % 18) * 60;
          final hasta = v == 0 ? 1500 : desde + 60;
          final precio = [100, 5000, 100000][v % 3];
          final adelanto = precio ~/ 5;
          final resultado = await repo.guardarBloque(
            cancha: 'la-23',
            dia: '2026-10-10',
            desde: desde,
            hasta: hasta,
            precio: precio,
            adelanto: adelanto,
            plazo: 10,
            version: v,
          );
          expect(resultado.esError, false);
          for (var hora = desde; hora < hasta; hora += 60) {
            esperado['$hora'] = {
              'precioCentimos': precio,
              'adelantoCentimos': adelanto,
            };
          }
        }
        final actual = (await repo
            .observarParametros('la-23', '2026-10-10')
            .first)!;
        expect(actual.datos['horas'], esperado);
        expect((actual.datos['horas'] as Map).length, 18);
        expect(actual.datos['version'], cambios);
        expect(
          await repo.observarParametros('la-19', '2026-10-10').first,
          isNull,
        );
        expect(
          await repo.observarParametros('la-24', '2026-10-10').first,
          isNull,
        );
        expect(
          await repo.observarParametros('la-23', '2026-10-11').first,
          isNull,
        );
        final ref = repo.parametrosRef('la-23', '2026-10-10');
        expect((await ref.collection('historial').get()).docs.length, cambios);
        for (final limites in [
          [480, 420],
          [420, 420],
          [360, 480],
          [1440, 1560],
          [450, 510],
        ]) {
          expect(
            (await repo.guardarBloque(
              cancha: 'la-23',
              dia: '2026-10-10',
              desde: limites[0],
              hasta: limites[1],
              precio: 5000,
              adelanto: 1000,
              plazo: 10,
              version: cambios,
            )).esError,
            true,
          );
        }
        expect((await ref.collection('historial').get()).docs.length, cambios);
      },
    );
  }
  for (final ancho in [360.0, 768.0, 1280.0]) {
    testWidgets(
      'formulario adaptable: una hora inicial y día completo explícito a $ancho',
      (tester) async {
        tester.view.physicalSize = Size(ancho, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final provider = SedesProvider(RepoParametros());
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: BloqueParametrosDialog(
                provider: provider,
                cancha: 'la-19',
                dia: '2026-10-10',
              ),
            ),
          ),
        );
        expect(find.text('Desde 07:00'), findsOneWidget);
        expect(find.text('Hasta 08:00'), findsOneWidget);
        await tester.tap(find.text('Aplicar a todo el día (18 horas)'));
        await tester.pumpAndSettle();
        expect(find.text('Hasta 01:00 (+1 dia)'), findsOneWidget);
        expect(tester.takeException(), isNull);
        provider.dispose();
      },
    );
  }
}
