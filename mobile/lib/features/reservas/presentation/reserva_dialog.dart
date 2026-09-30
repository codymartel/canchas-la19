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
  bool enviado = false, especial = false;
  final seleccion = <int>{};
  Map<String, dynamic>? solicitud;
  StreamSubscription<HorarioNegocio?>? _subHorario;

  @override
  void initState() {
    super.initState();
    widget.provider.addListener(actualizarDisponibilidad);
    _subHorario = widget.sedesProvider.horario.listen((valor) {
      if (!mounted || valor == null) return;
      setState(() {
        horario = valor;
        seleccion.clear();
      });
    });
  }

  int get duracionTurno => especial ? 30 : 60;

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
          (inicio) =>
              (inicio - actual.apertura) % duracionTurno == 0 &&
              minutosDe(
                minuto: inicio,
                duracion: duracion,
              ).every((valor) => !ocupados.contains(int.parse(valor))),
        )
        .toList();
  }

  int get minutoPresencia => minuto;
  String get diaPresencia => widget.provider.dia;

  bool libre(int inicio) =>
      minutosDe(minuto: inicio, duracion: duracionTurno).every(
        (m) => !(widget.provider.ocupacionPorCancha[canchaId] ?? const <int>{})
            .contains(int.parse(m)),
      );

  void actualizarDisponibilidad() {
    if (!mounted || enviado) return;
    setState(() {
      if (seleccion.any((m) => !libre(m))) {
        seleccion.clear();
        widget.presencia.limpiar(requestId);
      }
    });
  }

  void marcar(int inicio, bool marcado) {
    setState(() {
      if (!marcado) {
        if (inicio == seleccion.reduce((a, b) => a < b ? a : b) ||
            inicio == seleccion.reduce((a, b) => a > b ? a : b)) {
          seleccion.remove(inicio);
        } else {
          seleccion.clear();
        }
      } else {
        if (seleccion.isNotEmpty &&
            !seleccion.contains(inicio - duracionTurno) &&
            !seleccion.contains(inicio + duracionTurno)) {
          seleccion.clear();
        }
        if ((seleccion.length + 1) * duracionTurno >
            (widget.bloqueo ? 180 : 600)) {
          return;
        }
        seleccion.add(inicio);
      }
      if (seleccion.isNotEmpty) {
        minuto = seleccion.reduce((a, b) => a < b ? a : b);
        duracion = seleccion.length * duracionTurno;
      }
    });
    if (seleccion.isEmpty) {
      widget.presencia.limpiar(requestId);
    } else {
      publicar('preparando');
    }
  }

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
    widget.provider.removeListener(actualizarDisponibilidad);
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
                    seleccion.clear();
                    widget.presencia.limpiar(requestId);
                  }),
          );
        },
      ),
      if (horario != null)
        Text(
          'Marca horarios consecutivos · ${especial ? '30 minutos (caso especial)' : 'una hora'}'
          '${horario!.cruzaMedianoche ? ' · continua despues de medianoche' : ''}',
        ),
      SwitchListTile(
        title: const Text('Caso especial: permitir 30 minutos'),
        subtitle: const Text(
          'Solo para atención del personal, por ejemplo policías.',
        ),
        value: especial,
        onChanged: enviado
            ? null
            : (valor) => setState(() {
                especial = valor;
                seleccion.clear();
                widget.presencia.limpiar(requestId);
              }),
      ),
      if (canchasNoReservables > 0)
        Text(
          '$canchasNoReservables cancha(s) sin habilitacion: '
          'no se pueden reservar.',
        ),
      if (horario != null && canchaId != null) ...[
        const Text(
          'Marca las franjas libres. Las ocupadas no se pueden seleccionar.',
        ),
        SizedBox(
          height: 230,
          child: ListView(
            children: [
              for (final inicio in iniciosDeTurno(
                horario: horario!,
                duracion: duracionTurno,
              ).where((m) => (m - horario!.apertura) % duracionTurno == 0))
                CheckboxListTile(
                  key: ValueKey('franja-$inicio'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(
                    '${hora(inicio)} – ${hora(inicio + duracionTurno)}',
                  ),
                  subtitle: Text(libre(inicio) ? 'Libre' : '✕ Ocupado'),
                  value: seleccion.contains(inicio),
                  onChanged: enviado || !libre(inicio)
                      ? null
                      : (v) => marcar(inicio, v!),
                ),
            ],
          ),
        ),
      ],
      Text(
        seleccion.isEmpty
            ? 'Selecciona un horario libre.'
            : '${sedes[canchaId] ?? canchaId} · ${hora(minuto)} a ${hora(minuto + duracion)} · $duracion minutos',
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
        seleccion.isNotEmpty && duracion > 180
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
            if (seleccion.isEmpty || !inicios.contains(minuto)) {
              throw const FormatException(
                'Marca horarios libres consecutivos dentro del horario operativo.',
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
