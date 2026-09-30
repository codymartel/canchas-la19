import 'dart:async';

import 'package:flutter/material.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/componentes.dart';
import '../../../core/presentation/pantallas.dart';
import '../../sedes/presentation/sedes_provider.dart';
import '../../clientes/presentation/clientes_provider.dart';
import 'agenda_provider.dart';
import 'agenda_screen.dart' show seleccionarCliente;
import '../../presencia/domain/presencia_control.dart';

class ReservaDialog extends StatefulWidget {
  final AgendaProvider provider;
  final SedesProvider sedesProvider;
  final ClientesProvider clientes;
  final bool bloqueo, puedeClientes;
  final PresenciaControl presencia;
  final String nombrePersonal;
  const ReservaDialog({
    super.key,
    required this.provider,
    required this.sedesProvider,
    required this.clientes,
    required this.bloqueo,
    required this.presencia,
    required this.nombrePersonal,
    required this.puedeClientes,
  });
  @override
  State<ReservaDialog> createState() => _ReservaDialogState();
}

class _ReservaDialogState extends State<ReservaDialog> {
  final nombre = TextEditingController(), telefono = TextEditingController();
  final requestId = nuevaOperacion();
  String? canchaId;
  int minuto = 1080, duracion = 60;
  int canchasNoReservables = 0;
  HorarioNegocio? horario;
  bool enviado = false;
  Map<String, dynamic>? solicitud;
  StreamSubscription<HorarioNegocio?>? _subHorario;

  @override
  void initState() {
    super.initState();
    _subHorario = widget.sedesProvider.horario.listen((valor) {
      if (!mounted || valor == null) return;
      setState(() {
        horario = valor;
        if (duracion % valor.duracionTurno != 0 ||
            !duracionesReserva.contains(duracion)) {
          duracion = valor.duracionTurno;
        }
        // El horario puede cambiar en caliente (por ejemplo, el administrador
        // acorta el dia o cambia el turno) y dejar el inicio ya elegido fuera de
        // la lista. Sin reclamp, el DropdownButton receive un value que no
        // existe entre sus items y revienta la pantalla.
        final disponibles = iniciosDeTurno(horario: valor, duracion: duracion);
        if (disponibles.isNotEmpty && !disponibles.contains(minuto)) {
          minuto = disponibles.first;
        }
      });
    });
  }

  int get duracionTurno => horario?.duracionTurno ?? 60;

  /// Solo multiplos del turno base que ademas admite el servidor.
  List<int> get duraciones => duracionesReserva
      .where((d) => d % duracionTurno == 0 && (!widget.bloqueo || d <= 180))
      .toList();

  /// Inicios que el servidor aceptaria: alineados al turno base y dentro del
  /// horario comun de las tres canchas.
  List<int> get inicios {
    final actual = horario;
    if (actual == null) return const [];
    final ocupados =
        widget.provider.ocupacionPorCancha[canchaId] ?? const <int>{};
    return iniciosDeTurno(horario: actual, duracion: duracion)
        .where(
          (inicio) => minutosDe(
            minuto: inicio,
            duracion: duracion,
          ).every((valor) => !ocupados.contains(int.parse(valor))),
        )
        .toList();
  }

  int get minutoPresencia => minuto % 1440;
  String get diaPresencia => minuto < 1440
      ? widget.provider.dia
      : DateTime.parse(
          widget.provider.dia,
        ).add(const Duration(days: 1)).toIso8601String().substring(0, 10);

  Future<void> publicar(String estado) async {
    final cancha = canchaId;
    if (cancha == null) return;
    await widget.presencia.publicar(
      sesionId: requestId,
      canchaId: cancha,
      dia: diaPresencia,
      minuto: minutoPresencia,
      nombre: widget.nombrePersonal,
      estado: estado,
    );
  }

  @override
  void dispose() {
    _subHorario?.cancel();
    nombre.dispose();
    telefono.dispose();
    widget.presencia.limpiar(requestId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormDialog(
    titulo: widget.bloqueo ? 'Bloqueo por mantenimiento' : 'Registrar reserva',
    children: [
      Text('Fecha ${widget.provider.dia} · America/Lima'),
      if (horario == null)
        const Aviso(
          'El horario de atencion no esta configurado. No se pueden crear '
          'reservas hasta definirlo en Configuracion.',
          grave: true,
        ),
      ListaDatos(
        stream: widget.sedesProvider.canchas,
        builder: (context, canchas) {
          final reservables = canchas.where(esReservable).toList();
          canchasNoReservables = canchas.length - reservables.length;
          if (canchaId != null && !reservables.any((c) => c.id == canchaId)) {
            canchaId = null;
          }
          return DropdownButton<String>(
            value: canchaId,
            hint: const Text('Elegir sede / cancha'),
            isExpanded: true,
            items: reservables
                .map(
                  (c) => DropdownMenuItem(
                    value: c.id,
                    child: Text(
                      '${sedes[c.texto('sedeId')]} / ${c.texto('nombre')}',
                    ),
                  ),
                )
                .toList(),
            onChanged: enviado
                ? null
                : (id) => setState(() {
                    canchaId = id;
                    duracion = duracionTurno;
                    if (!inicios.contains(minuto) && inicios.isNotEmpty) {
                      minuto = inicios.first;
                    }
                    publicar('preparando');
                  }),
          );
        },
      ),
      if (horario != null)
        Text(
          'Turno de $duracionTurno min · ${horario!.resumen}'
          '${horario!.cruzaMedianoche ? ' · continua despues de medianoche' : ''}',
        ),
      if (canchasNoReservables > 0)
        Text(
          '$canchasNoReservables cancha(s) sin habilitacion: '
          'no se pueden reservar.',
        ),
      if (inicios.isEmpty)
        const Text(
          'Sin horarios libres en esta fecha con el turno configurado.',
        )
      else
        DropdownButton<int>(
          value: inicios.contains(minuto) ? minuto : null,
          isExpanded: true,
          items: inicios
              .map(
                (valor) => DropdownMenuItem(
                  value: valor,
                  child: Text('Inicio ${hora(valor)}'),
                ),
              )
              .toList(),
          onChanged: enviado
              ? null
              : (v) {
                  setState(() => minuto = v!);
                  publicar('preparando');
                },
        ),
      DropdownButton<int>(
        value: duraciones.contains(duracion) ? duracion : null,
        isExpanded: true,
        items: duraciones
            .map(
              (valor) => DropdownMenuItem(
                value: valor,
                child: Text(
                  valor == duracionTurno
                      ? '$valor minutos (1 turno)'
                      : '$valor minutos (${valor ~/ duracionTurno} turnos)',
                ),
              ),
            )
            .toList(),
        onChanged: enviado
            ? null
            : (v) => setState(() {
                duracion = v!;
                if (!inicios.contains(minuto) && inicios.isNotEmpty) {
                  minuto = inicios.first;
                }
                publicar('preparando');
              }),
      ),
      if (!widget.bloqueo && widget.puedeClientes)
        OutlinedButton(
          onPressed: enviado
              ? null
              : () async {
                  final c = await seleccionarCliente(context, widget.clientes);
                  if (c != null && mounted) {
                    setState(() {
                      nombre.text = c.texto('nombre');
                      telefono.text = c.texto('telefono');
                    });
                  }
                },
          child: const Text('Buscar cliente existente'),
        ),
      IgnorePointer(
        ignoring: enviado,
        child: Column(
          children: [
            Campo(
              widget.bloqueo
                  ? 'Motivo del mantenimiento'
                  : 'Nombre del cliente',
              nombre,
            ),
            if (!widget.bloqueo) ...[
              Campo('Teléfono', telefono, tipo: TextInputType.phone),
            ],
          ],
        ),
      ),
      Text(
        duracion > 180
            ? 'La solicitud quedara pendiente y no ocupara el horario hasta que el personal asignado la apruebe.'
            : 'El horario se asegura de forma atomica al guardar.',
      ),
      if (enviado)
        const Text(
          'Se conserva la solicitud para reintentar sin duplicar. Para otro horario, cierra y abre una nueva reserva.',
        ),
      BotonGuardar(
        operacion: widget.provider,
        texto: enviado ? 'Reintentar misma solicitud' : 'Guardar',
        onPressed: () async {
          try {
            if (horario == null) {
              throw const FormatException(
                'El horario de atencion no esta configurado.',
              );
            }
            if (canchaId == null) {
              throw const FormatException('Elige una cancha habilitada.');
            }
            if (!inicios.contains(minuto)) {
              throw const FormatException(
                'Elige un inicio disponible dentro del turno configurado.',
              );
            }
            if (!widget.presencia.conectado) {
              throw const FormatException(
                'Sin conexion confirmada. Recupera la conexion antes de guardar.',
              );
            }
            solicitud ??= {
              'requestId': requestId,
              'dia': widget.provider.dia,
              'canchaId': canchaId,
              'minuto': minuto,
              'duracion': duracion,
              'nombre': nombre.text,
              'motivo': nombre.text,
              'telefono': telefono.text,
              'bloqueo': widget.bloqueo,
            };
            setState(() => enviado = true);
            if (!await widget.presencia.publicar(
              sesionId: requestId,
              canchaId: canchaId!,
              dia: diaPresencia,
              minuto: minutoPresencia,
              nombre: widget.nombrePersonal,
              estado: 'guardando',
            )) {
              throw FormatException(
                widget.presencia.error ?? 'No se confirmo la conexion.',
              );
            }
            if (await widget.provider.registrar(solicitud!) &&
                context.mounted) {
              await widget.presencia.limpiar(requestId);
              if (context.mounted) Navigator.pop(context);
            } else {
              await publicar('preparando');
            }
          } on FormatException catch (e) {
            widget.provider.error = e.message;
            widget.provider.notificar();
          }
        },
      ),
    ],
  );
}
