import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/data/servicios.dart';
import 'package:mobile/features/reservas/data/reservas_repository.dart';
import 'package:mobile/features/reservas/domain/reserva.dart';

class Auth extends Mock implements FirebaseAuth {}

class Usuario extends Mock implements User {}

class Realtime extends Mock implements FirebaseDatabase {}

void main() {
  test(
    'efectivo Dart: fijar monto, adelanto, reintento, saldo y exceso',
    () async {
      final db = FakeFirebaseFirestore(), auth = Auth(), user = Usuario();
      when(() => auth.currentUser).thenReturn(user);
      when(() => user.uid).thenReturn('personal-1');
      final repo = ReservasRepository(
        Servicios(db: db, auth: auth, authAltas: auth, realtime: Realtime()),
        'grass-sintetico',
      );
      final ref = db.doc('negocios/grass-sintetico/reservas/reserva-1');
      await ref.set({
        'estado': 'confirmada',
        'bloqueo': false,
        'version': 1,
        'montoCentimos': 0,
        'adelantoCentimos': 0,
        'historialPagos': [],
        'canchaId': 'la-19',
        'minuto': 1440,
        'dia': '2026-10-05',
      });
      Future<bool> guardar(
        int version,
        int monto,
        int cobro,
        String id,
      ) async => !(await repo.registrarEfectivo(
        id: 'reserva-1',
        version: version,
        monto: monto,
        cobro: cobro,
        operacionId: id,
      )).esError;
      expect(await guardar(1, 10000, 0, 'operacion-monto-0001'), true);
      expect(await guardar(2, 10000, 3000, 'operacion-cobro-0001'), true);
      expect(await guardar(2, 10000, 3000, 'operacion-cobro-0001'), true);
      var r = (await ref.get()).data()!;
      expect(r['adelantoCentimos'], 3000);
      expect((r['historialPagos'] as List).length, 2);
      expect(await guardar(3, 10000, 7001, 'operacion-exceso-01'), false);
      expect(await guardar(2, 10000, 1000, 'operacion-obsoleta-1'), false);
      expect(await guardar(3, 20000, 1000, 'operacion-monto-0002'), false);
      expect(await guardar(3, 10000, 7000, 'operacion-cobro-0002'), true);
      r = (await ref.get()).data()!;
      expect(r['saldoCentimos'], 0);
      expect(Reserva('reserva-1', r).adelantoInicial, 3000);
      expect(Reserva('reserva-1', r).adelanto, 10000);
      expect(r['minuto'], 1440);
      expect(r['estado'], 'confirmada');
      expect((r['historialPagos'] as List).last['registradoPor'], 'personal-1');
    },
  );
}
