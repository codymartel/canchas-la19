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
        hasta: 1500,
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
}
