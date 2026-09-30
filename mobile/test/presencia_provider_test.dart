import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:mobile/features/presencia/data/presencia_repository.dart';
import 'package:mobile/features/presencia/domain/actividad.dart';
import 'package:mobile/features/presencia/presentation/presencia_provider.dart';

class RepoPresencia extends Mock implements PresenciaRepository {}

void main() {
  test(
    'conexión de transporte no basta; exige lectura y reintenta tras error',
    () async {
      final repo = RepoPresencia();
      final conexion = StreamController<bool>.broadcast();
      final lecturas = StreamController<List<Actividad>>.broadcast();
      when(() => repo.conexion).thenAnswer((_) => conexion.stream);
      when(() => repo.observarDia(any())).thenAnswer((_) => lecturas.stream);
      when(() => repo.reconectar()).thenAnswer((_) async {});
      final p = PresenciaProvider(repo);
      p.observar('2026-09-29');
      conexion.add(true);
      await Future<void>.delayed(Duration.zero);
      expect(p.conectado, isFalse);
      lecturas.add([]);
      await Future<void>.delayed(Duration.zero);
      expect(p.conectado, isTrue);
      lecturas.addError(const FormatException('Lectura rechazada'));
      await Future<void>.delayed(Duration.zero);
      expect(p.conectado, isFalse);
      expect(p.error, contains('Lectura rechazada'));
      await p.reconectar();
      lecturas.add([]);
      await Future<void>.delayed(Duration.zero);
      expect(p.conectado, isTrue);
      expect(p.error, isNull);
      verify(() => repo.observarDia('2026-09-29')).called(2);
      p.dispose();
      await conexion.close();
      await lecturas.close();
    },
  );
}
