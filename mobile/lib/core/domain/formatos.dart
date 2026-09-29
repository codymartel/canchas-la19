import 'dart:convert';
import 'dart:math';

const sedes = {'la-19': 'La 19', 'la-23': 'La 23', 'la-24': 'La 24'};
String nuevaOperacion() =>
    base64UrlEncode(List.generate(24, (_) => Random.secure().nextInt(256)));
String nombrePresencia(String valor) {
  final nombre = valor.trim().isEmpty ? 'Personal' : valor.trim();
  return nombre.length <= 80 ? nombre : nombre.substring(0, 80);
}

DateTime ahoraLima([DateTime? instante]) =>
    (instante ?? DateTime.now()).toUtc().subtract(const Duration(hours: 5));
String fechaLima([DateTime? instante]) =>
    ahoraLima(instante).toIso8601String().substring(0, 10);
String hora(int minuto) {
  final reloj = minuto % 1440;
  final valor =
      '${(reloj ~/ 60).toString().padLeft(2, '0')}:${(reloj % 60).toString().padLeft(2, '0')}';
  return minuto >= 1440 ? '$valor (+1 dia)' : valor;
}

String soles(int centimos) =>
    'S/ ${centimos ~/ 100}.${(centimos % 100).toString().padLeft(2, '0')}';
int centimos(String valor) {
  final v = valor.trim().replaceAll(',', '.');
  if (!RegExp(r'^\d{1,6}(\.\d{1,2})?$').hasMatch(v)) {
    throw const FormatException('Importe inválido. Usa hasta dos decimales.');
  }
  final partes = v.split('.');
  return int.parse(partes[0]) * 100 +
      (partes.length == 2 ? int.parse(partes[1].padRight(2, '0')) : 0);
}

String normalizarTelefono(String valor) {
  var v = valor.replaceAll(RegExp(r'[\s()+.\-]'), '');
  if (RegExp(r'^9\d{8}$').hasMatch(v)) v = '51$v';
  if (!RegExp(r'^\d{10,15}$').hasMatch(v)) {
    throw const FormatException('Incluye el código de país en el teléfono.');
  }
  return '+$v';
}

class Registro {
  final String id;
  final Map<String, dynamic> datos;
  const Registro(this.id, this.datos);
  String texto(String campo) => datos[campo]?.toString() ?? '';
  int entero(String campo) => (datos[campo] as num?)?.toInt() ?? 0;
  bool activo(String campo) => datos[campo] == true;
}
