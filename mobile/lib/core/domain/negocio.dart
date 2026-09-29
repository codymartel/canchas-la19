import 'formatos.dart';

const negocioId = 'grass-sintetico';
const documentoConfiguracion = 'sistema/grass';
const List<String> sedesIds = ['la-19', 'la-23', 'la-24'];
const List<String> estadosReserva = [
  'pendiente',
  'confirmada',
  'rechazada',
  'cancelada',
  'no_asistio',
];
const List<int> duracionesPermitidas = [30, 60, 90, 120, 150, 180, 210, 240];
const List<int> duracionesReserva = [
  30,
  60,
  90,
  120,
  150,
  180,
  210,
  240,
  270,
  300,
  330,
  360,
  390,
  420,
  450,
  480,
  510,
  540,
  570,
  600,
];
const List<String> permisosClave = [
  'agenda',
  'reservas',
  'clientes',
  'promociones',
];

bool esSede(String? valor) => valor != null && sedesIds.contains(valor);
bool esEstadoReserva(String? valor) =>
    valor != null && estadosReserva.contains(valor);
bool esDuracionValida(int minutos) => duracionesPermitidas.contains(minutos);
bool esDuracionReservaValida(int minutos) =>
    duracionesReserva.contains(minutos);
bool esFranjaValida(int minuto) =>
    minuto >= 0 && minuto < 1440 && minuto % 30 == 0;
bool esMinutoOperacionValido(int minuto) =>
    minuto >= 420 && minuto < 1500 && minuto % 30 == 0;
bool esCierreValido(int minuto) =>
    minuto > 0 && minuto <= 1440 && minuto % 30 == 0;
bool esTarifaValida(Object? valor) =>
    valor is int && valor >= 0 && valor <= 100000000;

/// Horario de atencion y duracion base del turno.
///
/// Son una sola configuracion del negocio, no de cada cancha: se editan en
/// Configuracion y se aplican por igual a La 19, La 23 y La 24. Sin este
/// horario ninguna cancha es reservable, porque las reglas lo leen del
/// documento privado del negocio antes de aceptar cualquier reserva.
class HorarioNegocio {
  final int apertura, cierre, duracionTurno;
  const HorarioNegocio({
    required this.apertura,
    required this.cierre,
    required this.duracionTurno,
  });

  bool get cruzaMedianoche => cierre < apertura;
  String get resumen =>
      '${hora(apertura)} a ${hora(cierre)} · turnos de $duracionTurno min';
}

/// Lee el horario global de un documento. Devuelve null si falta o es invalido,
/// que es el estado de "todavia no reservable" que muestra el panel.
HorarioNegocio? leerHorario(Registro documento) {
  final apertura = documento.entero('aperturaMinuto');
  final cierre = documento.entero('cierreMinuto');
  final turno = documento.entero('duracionTurnoMinutos');
  if (!esHorarioValido(
    apertura: apertura,
    cierre: cierre,
    duracionTurno: turno,
  )) {
    return null;
  }
  return HorarioNegocio(
    apertura: apertura,
    cierre: cierre,
    duracionTurno: turno,
  );
}

bool esHorarioValido({
  required int apertura,
  required int cierre,
  required int duracionTurno,
}) =>
    esFranjaValida(apertura) &&
    esCierreValido(cierre) &&
    apertura != cierre &&
    esDuracionValida(duracionTurno);

/// Una cancha es reservable cuando esta habilitada y tiene direccion y tarifa.
/// La web publica y las reglas usan exactamente esta misma definicion: sin
/// esos dos datos la cancha no aparece ni acepta reservas, aunque el switch
/// este encendido.
bool esReservable(Registro cancha) =>
    cancha.activo('activa') &&
    cancha.texto('direccion').trim().isNotEmpty &&
    esTarifaValida(cancha.datos['tarifaTurnoCentimos']);

/// Que falta para que una canchaEnabled llegue a ser reservable.
List<String> pendientesDeReserva(Registro cancha) => [
  if (!cancha.activo('activa')) 'habilitacion',
  if (cancha.texto('direccion').trim().isEmpty) 'direccion',
  if (!esTarifaValida(cancha.datos['tarifaTurnoCentimos'])) 'tarifa',
];

bool cabeEnHorario({
  required int apertura,
  required int cierre,
  required int minuto,
  required int duracion,
}) {
  if (cierre > apertura) {
    return minuto >= apertura && minuto + duracion <= cierre;
  }
  return minuto >= apertura && minuto + duracion <= cierre + 1440;
}

/// Inicios validos, alineados al turno base y que caben en el horario global.
List<int> iniciosDeTurno({
  required HorarioNegocio horario,
  required int duracion,
}) {
  if (!esDuracionReservaValida(duracion) ||
      duracion % horario.duracionTurno != 0) {
    return const [];
  }
  final limite = horario.cruzaMedianoche
      ? horario.cierre + 1440
      : horario.cierre;
  return [
    for (var minuto = horario.apertura; minuto < limite; minuto += 30)
      if ((minuto - horario.apertura + 1440) % horario.duracionTurno == 0 &&
          esMinutoOperacionValido(minuto) &&
          minuto + duracion <= 1500 &&
          cabeEnHorario(
            apertura: horario.apertura,
            cierre: horario.cierre,
            minuto: minuto,
            duracion: duracion,
          ))
        minuto,
  ];
}

bool esDiaValido(String? dia) {
  if (dia == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(dia)) {
    return false;
  }
  final valor = DateTime.tryParse('${dia}T00:00:00');
  return valor != null && valor.toIso8601String().startsWith(dia);
}

DateTime inicioDe(String dia, int minuto) =>
    DateTime.parse('${dia}T00:00:00-05:00').add(Duration(minutes: minuto));

Map<String, String> jornadaDe(String dia) {
  final partes = dia.split('-');
  return {'year': partes[0], 'month': partes[1], 'day': partes[2]};
}

List<String> minutosDe({required int minuto, required int duracion}) => [
  for (var actual = minuto; actual < minuto + duracion; actual += 30) '$actual',
];

String rutaAgendaDia(String negocio, String canchaId, String dia) =>
    'negocios/$negocio/agenda/$canchaId/dias/$dia';

String rutaAgendaPublica(String negocio, String canchaId, String dia) =>
    'agenda_publica/$negocio/canchas/$canchaId/dias/$dia';

/// Identificador de la reserva.
///
/// Se deriva del `requestId` que el cliente genera una vez por formulario: es
/// un token de 24 bytes aleatorios en base64url, ya valido como identificador
/// de documento. Reutilizarlo hace la operacion idempotente sin aritmetica de
/// 64 bits, que no se puede representar en JavaScript y rompia la compilacion
/// web del panel.
String idReserva(String requestId) => 'r_$requestId';

List<int> utf8Bytes(String valor) => valor.codeUnits;

String normalizarBusqueda(String valor) => valor
    .toLowerCase()
    .replaceAll(RegExp(r'[áàä]'), 'a')
    .replaceAll(RegExp(r'[éèë]'), 'e')
    .replaceAll(RegExp(r'[íìï]'), 'i')
    .replaceAll(RegExp(r'[óòö]'), 'o')
    .replaceAll(RegExp(r'[úùü]'), 'u')
    .replaceAll(RegExp(r'[ñ]'), 'n');

String nombreMes(String iso) {
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'setiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  final d = DateTime.parse(iso);
  return '${d.day} de ${meses[d.month - 1]}';
}

class ConfiguracionNegocio {
  final String? administradorUid;
  final String? negocio;
  const ConfiguracionNegocio({this.administradorUid, this.negocio});
  bool get faltaConfigurar =>
      administradorUid == null || administradorUid!.isEmpty;
}
