import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/domain/formatos.dart';
import 'package:mobile/core/domain/negocio.dart';

const horarioDia = HorarioNegocio(
  apertura: 420,
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

    test('turno de 60 minutos cubre de 07:00 a 24:00', () {
      final inicios = iniciosDeTurno(horario: horarioDia, duracion: 60);
      expect(inicios.first, 420);
      expect(inicios.last, 1380);
      expect(inicios.length, 17);
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
      expect(inicios, contains(1440));
      expect(inicios, isNot(contains(0)));
      expect(inicios, isNot(contains(390)), reason: 'no abre de dia');
      expect(inicios.last + 60, lessThanOrEqualTo(1440 + 120));
      for (final inicio in inicios) {
        expect(
          (inicio - horarioNocturno.apertura + 1440) %
              horarioNocturno.duracionTurno,
          0,
        );
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

  test('dia operativo tiene 36 franjas y madrugada del dia siguiente', () {
    const h = HorarioNegocio(apertura: 420, cierre: 60, duracionTurno: 30);
    final minutos = iniciosDeTurno(horario: h, duracion: 30);
    expect(minutos.length, 36);
    expect(minutos.first, 420);
    expect(minutos.last, 1470);
    expect(iniciosDeTurno(horario: h, duracion: 60), contains(1440));
    expect(
      inicioDe('2026-09-29', 1440),
      DateTime.parse('2026-09-30T00:00:00-05:00'),
    );
    expect(
      diaOperativoLima(DateTime.parse('2026-09-30T00:30:00-05:00')),
      '2026-09-29',
    );
  });
  group('reservabilidad por cancha', () {
    test('la habilitacion permite reservar', () {
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

    test('direccion pendiente permite reservar', () {
      const cancha = Registro('la-19', {
        'activa': true,
        'direccion': '   ',
        'tarifaTurnoCentimos': 5000,
      });
      expect(esReservable(cancha), isTrue);
      expect(pendientesDeReserva(cancha), isEmpty);
    });

    test('tarifa pendiente permite reservar', () {
      const cancha = Registro('la-19', {
        'activa': true,
        'direccion': 'Av. Siempre Viva 742',
        'tarifaTurnoCentimos': null,
      });
      expect(esReservable(cancha), isTrue);
      expect(pendientesDeReserva(cancha), isEmpty);
    });

    test('sin habilitacion quedan pendientes los tres datos', () {
      const cancha = Registro('la-19', {
        'activa': false,
        'direccion': '',
        'tarifaTurnoCentimos': null,
      });
      expect(esReservable(cancha), isFalse);
      expect(pendientesDeReserva(cancha), ['habilitacion']);
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
