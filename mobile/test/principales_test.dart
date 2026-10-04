import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/core/data/servicios.dart';
import 'package:mobile/features/empleados/data/empleados_repository.dart';

class Auth extends Mock implements FirebaseAuth {}

class Usuario extends Mock implements User {}

class Realtime extends Mock implements FirebaseDatabase {}

void main() {
  test('principal: cambio auditado, reintento y empleado inválido', () async {
    final db = FakeFirebaseFirestore(), auth = Auth(), user = Usuario();
    when(() => auth.currentUser).thenReturn(user);
    when(() => user.uid).thenReturn('admin-local');
    final repo = EmpleadosRepository(
      Servicios(db: db, auth: auth, authAltas: auth, realtime: Realtime()),
      'grass-sintetico',
      'admin-local',
    );
    for (final uid in ['empleado-a', 'empleado-b']) {
      await db.doc('negocios/grass-sintetico/empleados/$uid').set({
        'activo': true,
        'permisos': {'reservas': true},
        'sedes': ['la-23'],
      });
    }
    final ref = db.doc('negocios/grass-sintetico/responsablesCanchas/la-23');
    expect((await repo.asignarPrincipal('la-23', 'empleado-a')).esError, false);
    expect((await repo.asignarPrincipal('la-23', 'empleado-a')).esError, false);
    expect((await ref.collection('historial').get()).docs.length, 1);
    expect((await repo.asignarPrincipal('la-23', 'empleado-b')).esError, false);
    expect((await ref.get()).data()!['empleadoUid'], 'empleado-b');
    final historial = (await ref.collection('historial').get()).docs;
    expect(historial.length, 2);
    expect(historial.any((d) => d.data()['anteriorUid'] == 'empleado-a'), true);
    expect(
      historial.every((d) => d.data()['actualizadoPor'] == 'admin-local'),
      true,
    );
    expect((await repo.asignarPrincipal('la-19', 'empleado-a')).esError, true);
    await db.doc('negocios/grass-sintetico/empleados/empleado-a').update({
      'activo': false,
    });
    expect((await repo.asignarPrincipal('la-23', 'empleado-a')).esError, true);
    expect((await ref.get()).data()!['empleadoUid'], 'empleado-b');
  });
}
