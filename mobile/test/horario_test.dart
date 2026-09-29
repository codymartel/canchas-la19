import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/domain/formatos.dart';
import 'package:mobile/core/domain/negocio.dart';

const horarioDia = HorarioNegocio(
  apertura: 360,
  cierre: 1440,
  duracionTurno: 60,
);
const horarioNocturno = HorarioNegocio(
  apertura: 1020,
  cierre: 120,
  duracionTurno: 60,
);

void main() {
  group('horario global del negocio', () {
    test('se lee del documento del negocio y no de la cancha', () {
      final documento = Registro('grass-sintetico', {
        'aperturaMinuto': 360,
        'cierreMinuto': 1440,
        'duracionTurnoMinutos': 60,
      });
      expect(leerHorario(documento)?.apertura, 360);
      expect(leerHorario(documento)?.cierre, 1440);
      expect(leerHorario(documento)?.duracionTurno, 60);
    });

    test('sin horario valido devuelve null y no hay reservas', () {
      expect(leerHorario(Registro('grass-sintetico', {})), isNull);
      expect(
        leerHorario(
          Registro('grass-sintetico', {
            'aperturaMinuto': 360,
            'cierreMinuto': 360,
            'duracionTurnoMinutos': 60,
          }),
        ),
        isNull,
        reason: 'apertura y cierre iguales no abren nada',
      );
      expect(
        leerHorario(
          Registro('grass-sintetico', {
            'aperturaMinuto': 360,
            'cierreMinuto': 1440,
            'duracionTurnoMinutos': 45,
          }),
        ),
        isNull,
        reason: '45 minutos no es una duracion permitida',
      );
      expect(
        leerHorario(
          Registro('grass-sintetico', {
            'aperturaMinuto': 375,
            'cierreMinuto': 1440,
            'duracionTurnoMinutos': 60,
          }),
        ),
        isNull,
        reason: 'la apertura debe caer en una media hora',
      );
    });

    test(
      'el mismo horario genera los mismos inicios para las tres canchas',
      () {
        String? paraLa19;
        for (final id in sedesIds) {
          final lista = iniciosDeTurno(horario: horarioDia, duracion: 60);
          expect(lista, isNotEmpty, reason: 'la cancha $id debe tener turnos');
          if (id == sedesIds.first) paraLa19 = lista.join(',');
          expect(lista.join(','), paraLa19);
        }
      },
    );

    test('turno de 60 minutos cubre de 06:00 a 24:00', () {
      final inicios = iniciosDeTurno(horario: horarioDia, duracion: 60);
      expect(inicios.first, 360);
      expect(inicios.last, 1380);
      expect(inicios.length, 18);
    });

    test('la duracion debe ser multiplo del turno base', () {
      const horario = HorarioNegocio(
        apertura: 360,
        cierre: 1440,
        duracionTurno: 90,
      );
      expect(iniciosDeTurno(horario: horario, duracion: 90), isNotEmpty);
      expect(iniciosDeTurno(horario: horario, duracion: 60), isEmpty);
      expect(iniciosDeTurno(horario: horario, duracion: 180), isNotEmpty);
      expect(iniciosDeTurno(horario: horario, duracion: 200), isEmpty);
    });

    test('horario nocturno cruza medianoche sin repetir el dia', () {
      expect(horarioNocturno.cruzaMedianoche, isTrue);
      final inicios = iniciosDeTurno(horario: horarioNocturno, duracion: 60);
      expect(inicios, contains(1020));
      expect(inicios, contains(1140));
      expect(inicios, contains(60));
      expect(inicios, contains(0));
      expect(inicios, isNot(contains(390)), reason: 'no abre de dia');
      expect(inicios.last + 60, lessThanOrEqualTo(1440 + 120));
      for (final inicio in inicios) {
        if (inicio < 120) {
          expect(inicio % horarioNocturno.duracionTurno, 0);
        }
      }
    });

    test('cabeEnHorario respeta el cierre exacto', () {
      expect(
        cabeEnHorario(apertura: 360, cierre: 1440, minuto: 1380, duracion: 60),
        isTrue,
      );
      expect(
        cabeEnHorario(apertura: 360, cierre: 1440, minuto: 1410, duracion: 60),
        isFalse,
      );
    });
  });

  group('reservabilidad por cancha', () {
    test('exige habilitacion, direccion y tarifa', () {
      expect(
        esReservable(
          Registro('la-19', {
            'activa': true,
            'direccion': 'Av. Siempre Viva 742',
            'tarifaTurnoCentimos': 5000,
          }),
        ),
        isTrue,
      );
    });

    test('sin direccion la cancha no es reservable aunque este habilitada', () {
      const cancha = Registro('la-19', {
        'activa': true,
        'direccion': '   ',
        'tarifaTurnoCentimos': 5000,
      });
      expect(esReservable(cancha), isFalse);
      expect(pendientesDeReserva(cancha), ['direccion']);
    });

    test('sin tarifa la cancha no es reservable', () {
      const cancha = Registro('la-19', {
        'activa': true,
        'direccion': 'Av. Siempre Viva 742',
        'tarifaTurnoCentimos': null,
      });
      expect(esReservable(cancha), isFalse);
      expect(pendientesDeReserva(cancha), ['tarifa']);
    });

    test('sin habilitacion quedan pendientes los tres datos', () {
      const cancha = Registro('la-19', {
        'activa': false,
        'direccion': '',
        'tarifaTurnoCentimos': null,
      });
      expect(esReservable(cancha), isFalse);
      expect(pendientesDeReserva(cancha), [
        'habilitacion',
        'direccion',
        'tarifa',
      ]);
    });

    test('la tarifa cero es valida porque no se debe a un campo vacio', () {
      expect(
        esTarifaValida(0),
        isTrue,
        reason: 'una cancha gratuita sigue siendo reservable',
      );
      expect(esTarifaValida(-1), isFalse);
      expect(esTarifaValida('5000'), isFalse);
    });
  });
}
