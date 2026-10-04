import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/componentes.dart';
import '../../../core/presentation/pantallas.dart';
import '../../sedes/presentation/sedes_provider.dart';
import '../../clientes/presentation/clientes_provider.dart';
import '../../clientes/presentation/clientes_screen.dart';
import '../domain/reserva.dart';
import 'agenda_provider.dart';
import 'reserva_dialog.dart';
import '../../presencia/domain/presencia_control.dart';

String _fechaRegistro(Object? valor) {
  final instante = valor is Timestamp
      ? valor.toDate()
      : valor is DateTime
      ? valor
      : null;
  return instante == null ? 'Pendiente' : '${fechaHoraLima(instante)} (Lima)';
}

class AgendaScreen extends StatelessWidget {
  final AgendaProvider provider;
  final SedesProvider sedesProvider;
  final ClientesProvider clientes;
  final bool puedeEscribir, puedeClientes;
  final PresenciaControl presencia;
  final String nombrePersonal;
  const AgendaScreen({
    super.key,
    required this.provider,
    required this.sedesProvider,
    required this.clientes,
    required this.puedeEscribir,
    required this.puedeClientes,
    required this.presencia,
    required this.nombrePersonal,
  });
  Future<void> nueva(BuildContext context, {bool bloqueo = false}) =>
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => ReservaDialog(
          provider: provider,
          sedesProvider: sedesProvider,
          clientes: clientes,
          puedeClientes: puedeClientes,
          bloqueo: bloqueo,
          presencia: presencia,
          nombrePersonal: nombrePersonal,
        ),
      );
  Future<void> detalle(BuildContext context, Reserva r) => showDialog<void>(
    context: context,
    builder: (_) => DetalleReserva(
      provider: provider,
      reserva: r,
      puedeEscribir: puedeEscribir,
    ),
  );
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: provider,
    builder: (context, _) {
      presencia.observar(provider.dia);
      final todas = provider.todasFilas;
      return Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(
              spacing: 12,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.calendar_month),
                  label: Text(provider.dia),
                  onPressed: () async {
                    final d = await showDatePicker(
                      context: context,
                      initialDate: DateTime.parse(provider.dia),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (d != null) {
                      provider.cambiarDia(d.toIso8601String().substring(0, 10));
                    }
                  },
                ),
                DropdownButton<String>(
                  value: provider.sede,
                  items: [
                    const DropdownMenuItem(
                      value: '',
                      child: Text('Todas las canchas'),
                    ),
                    ...sedes.entries.map(
                      (s) =>
                          DropdownMenuItem(value: s.key, child: Text(s.value)),
                    ),
                  ],
                  onChanged: (s) => provider.seleccionarSede(s!),
                ),
                if (puedeEscribir)
                  FilledButton.icon(
                    onPressed: () => nueva(context),
                    icon: const Icon(Icons.add),
                    label: const Text('Reserva'),
                  ),
                if (puedeEscribir)
                  OutlinedButton(
                    onPressed: () => nueva(context, bloqueo: true),
                    child: const Text('Mantenimiento'),
                  ),
                IconButton(
                  tooltip: 'Actualizar agenda',
                  onPressed: provider.cargar,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
          ),
          ListenableBuilder(
            listenable: presencia,
            builder: (context, _) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!presencia.conectado)
                    Aviso(
                      presencia.estadoConexion ==
                              EstadoConexionPresencia.reconectando
                          ? 'Reconectando la coordinacion en vivo. La agenda puede verse, pero no se permite guardar todavia.'
                          : 'Sin conexion. La agenda puede verse, pero no se permite guardar hasta recuperar el servidor.',
                      grave: true,
                    ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _EstadoConexion(estado: presencia.estadoConexion),
                  ),
                  if (presencia.error != null)
                    Text(
                      presencia.error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  if (!presencia.conectado)
                    TextButton.icon(
                      onPressed: presencia.reconectar,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Reconectar coordinación'),
                    ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      for (final entrada in sedes.entries)
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.all(3),
                            child: OutlinedButton.icon(
                              key: ValueKey('cancha-${entrada.key}'),
                              style: OutlinedButton.styleFrom(
                                backgroundColor:
                                    (provider.sede.isEmpty
                                            ? sedesIds.first
                                            : provider.sede) ==
                                        entrada.key
                                    ? Theme.of(
                                        context,
                                      ).colorScheme.primaryContainer
                                    : null,
                              ),
                              onPressed: () =>
                                  provider.seleccionarSede(entrada.key),
                              icon: const Icon(Icons.sports_soccer, size: 18),
                              label: Column(
                                children: [
                                  Text(entrada.value),
                                  if (presencia.actividades.any(
                                    (a) =>
                                        a.vigente && a.canchaId == entrada.key,
                                  ))
                                    const Text(
                                      'En preparación',
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: Colors.orange,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const Text(
                    'Estados: libre · personal preparando (temporal) · guardando · pendiente · confirmada.',
                  ),
                ],
              ),
            ),
          ),
          if (provider.errorCarga != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(provider.errorCarga!),
            ),
          if (provider.desdeCache)
            const Aviso(
              'Datos de cache: la disponibilidad no esta confirmada por el servidor.',
              grave: true,
            ),
          if (provider.escriturasPendientes)
            const Aviso(
              'Hay cambios locales guardando. Todavia no se presentan como confirmados.',
            ),
          if (provider.cargando) const LinearProgressIndicator(),
          Expanded(
            child: _TablasAgenda(
              provider: provider,
              horario: sedesProvider.horario,
              presencia: presencia,
              dia: provider.dia,
              reservas: todas,
              ocupacion: provider.ocupacionPorCancha,
              onDetalle: (r) => detalle(context, r),
            ),
          ),
        ],
      );
    },
  );
}

class _TablasAgenda extends StatelessWidget {
  final AgendaProvider provider;
  final PresenciaControl presencia;
  final Stream<HorarioNegocio?> horario;
  final String dia;
  final List<Reserva> reservas;
  final Map<String, Set<int>> ocupacion;
  final void Function(Reserva) onDetalle;
  const _TablasAgenda({
    required this.provider,
    required this.presencia,
    required this.horario,
    required this.dia,
    required this.reservas,
    required this.ocupacion,
    required this.onDetalle,
  });
  @override
  Widget build(BuildContext context) => StreamBuilder<HorarioNegocio?>(
    stream: horario,
    builder: (context, snapshot) {
      final h = snapshot.data;
      if (h == null) {
        return const Center(
          child: Text('El horario de atencion no esta configurado.'),
        );
      }
      return _HojaCancha(
        provider: provider,
        presencia: presencia,
        cancha: provider.sede.isEmpty ? sedesIds.first : provider.sede,
        horario: h,
        onDetalle: onDetalle,
      );
    },
  );
}

class _HojaCancha extends StatelessWidget {
  final AgendaProvider provider;
  final PresenciaControl presencia;
  final String cancha;
  final HorarioNegocio horario;
  final void Function(Reserva) onDetalle;
  const _HojaCancha({
    required this.provider,
    required this.presencia,
    required this.cancha,
    required this.horario,
    required this.onDetalle,
  });

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: Listenable.merge([provider, presencia]),
    builder: (context, _) {
      final todas = provider.todasFilas
          .where((r) => r.texto('canchaId') == cancha)
          .toList();
      final reservas = todas.where((r) => r.ocupa).toList();
      final limite = horario.cruzaMedianoche
          ? horario.cierre + 1440
          : horario.cierre;
      final conMonto = reservas
          .where((r) => !r.bloqueo && r.monto > 0)
          .toList();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Tabla ${sedes[cancha]} · ${provider.dia} · America/Lima',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              '07:00 a 01:00 del día siguiente · Registro interno; pagos no verificados. Toca una reserva para ver su detalle.',
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columnSpacing: 20,
                  horizontalMargin: 12,
                  dataRowMinHeight: 40,
                  dataRowMaxHeight: 40,
                  columns: [
                    for (final titulo in [
                      'Hora',
                      'Nombre / estado',
                      'Monto a pagar',
                      'Teléfono',
                      'Adelanto',
                      'Resta',
                      'Total registrado',
                      'Quién atiende',
                    ])
                      DataColumn(label: Text(titulo)),
                  ],
                  rows: [
                    for (
                      var minuto = horario.apertura;
                      minuto < limite;
                      minuto += 60
                    )
                      _fila(context, minuto, reservas),
                  ],
                ),
              ),
            ),
          ),
          if (todas.any((r) => !r.ocupa))
            TextButton(
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Solicitudes y reservas sin ocupación'),
                  content: SizedBox(
                    width: 600,
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (final r in todas.where((r) => !r.ocupa))
                            ListTile(
                              title: Text(
                                '${r.texto('clienteNombre')} · ${r.estado}',
                              ),
                              subtitle: Text(
                                'Efectivo registrado: ${soles(r.adelanto)}',
                              ),
                              onTap: () => onDetalle(r),
                            ),
                        ],
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cerrar'),
                    ),
                  ],
                ),
              ),
              child: const Text('Ver canceladas y solicitudes'),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              'Totales del día (cada reserva se cuenta una vez): monto ${soles(conMonto.fold<int>(0, (n, r) => n + r.monto))} · efectivo registrado ${soles(todas.fold<int>(0, (n, r) => n + r.adelanto))} · resta ${soles(conMonto.fold<int>(0, (n, r) => n + r.saldo))}'
              '${reservas.any((r) => !r.bloqueo && r.monto == 0) ? ' · Hay tarifas pendientes.' : ''}',
            ),
          ),
        ],
      );
    },
  );

  DataRow _fila(BuildContext context, int minuto, List<Reserva> reservas) {
    final lista = reservas
        .where(
          (r) =>
              minuto + 60 > r.entero('minuto') &&
              minuto < r.entero('minuto') + r.entero('duracion'),
        )
        .toList();
    final ocupada = [
      minuto,
      minuto + 30,
    ].any((m) => provider.ocupacionPorCancha[cancha]?.contains(m) == true);
    final iniciales = lista
        .where(
          (r) =>
              r.entero('minuto') >= minuto && r.entero('minuto') < minuto + 60,
        )
        .toList();
    String importes(String campo) => iniciales
        .map((r) {
          if (r.bloqueo) return '—';
          if (campo == 'monto' || campo == 'saldo') {
            return r.monto > 0
                ? soles(campo == 'monto' ? r.monto : r.saldo)
                : 'Pendiente';
          }
          final importe = campo == 'adelanto' ? r.adelantoInicial : r.adelanto;
          return importe > 0 ? soles(importe) : 'Sin registro';
        })
        .join('\n');
    DataCell celda(String texto) => DataCell(
      Text(texto, maxLines: 2, overflow: TextOverflow.ellipsis),
      onTap: lista.isEmpty
          ? null
          : () {
              if (lista.length == 1) {
                onDetalle(lista.first);
                return;
              }
              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Elegir reserva de esta hora'),
                  content: SizedBox(
                    width: 600,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final r in lista)
                          ListTile(
                            title: Text(r.texto('clienteNombre')),
                            subtitle: Text(
                              '${hora(r.entero('minuto'))} – ${hora(r.entero('minuto') + r.entero('duracion'))}',
                            ),
                            onTap: () {
                              Navigator.pop(dialogContext);
                              onDetalle(r);
                            },
                          ),
                      ],
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('Cerrar'),
                    ),
                  ],
                ),
              );
            },
    );
    final preparando = presencia.actividades
        .where(
          (a) =>
              a.vigente &&
              a.canchaId == cancha &&
              a.minuto >= minuto &&
              a.minuto < minuto + 60,
        )
        .map((a) => '${a.nombre} · ${a.estado}')
        .join('\n');
    return DataRow(
      cells: [
        celda('${hora(minuto)} – ${hora(minuto + 60)}'),
        celda(
          lista.isEmpty
              ? (ocupada
                    ? 'Ocupado'
                    : preparando.isNotEmpty
                    ? preparando
                    : 'Libre')
              : lista
                    .map(
                      (r) =>
                          '${r.texto('clienteNombre')} · ${r.estado}\n${hora(r.entero('minuto'))} – ${hora(r.entero('minuto') + r.entero('duracion'))}',
                    )
                    .join('\n'),
        ),
        celda(importes('monto')),
        celda(lista.map((r) => r.texto('telefono')).join('\n')),
        celda(importes('adelanto')),
        celda(importes('saldo')),
        celda(importes('total')),
        celda(
          lista
              .map(
                (r) => r.texto('atendidoPor').isEmpty
                    ? 'Por atender'
                    : r.texto('atendidoPor'),
              )
              .join('\n'),
        ),
      ],
    );
  }
}

class _EstadoConexion extends StatelessWidget {
  final EstadoConexionPresencia estado;
  const _EstadoConexion({required this.estado});

  @override
  Widget build(BuildContext context) {
    final (texto, color, icono) = switch (estado) {
      EstadoConexionPresencia.conectado => (
        'Conectado en vivo',
        Colors.green,
        Icons.cloud_done,
      ),
      EstadoConexionPresencia.reconectando => (
        'Reconectando',
        Colors.orange,
        Icons.cloud_sync,
      ),
      EstadoConexionPresencia.sinConexion => (
        'Sin conexión',
        Colors.red,
        Icons.cloud_off,
      ),
    };
    return Chip(
      avatar: Icon(icono, size: 18, color: color),
      label: Text(texto),
      side: BorderSide(color: color.withValues(alpha: .45)),
      backgroundColor: color.withValues(alpha: .10),
    );
  }
}

class DetalleReserva extends StatefulWidget {
  final AgendaProvider provider;
  final Reserva reserva;
  final bool puedeEscribir;
  const DetalleReserva({
    super.key,
    required this.provider,
    required this.reserva,
    required this.puedeEscribir,
  });
  @override
  State<DetalleReserva> createState() => _DetalleReservaState();
}

class _DetalleReservaState extends State<DetalleReserva> {
  bool asignado = false;
  @override
  void initState() {
    super.initState();
    widget.provider.repository
        .puedeAprobar(widget.reserva.texto('canchaId'))
        .then((valor) {
          if (mounted) setState(() => asignado = valor);
        })
        .catchError((Object _) {});
  }

  late String estado = widget.reserva.estado == 'pendiente'
      ? 'confirmada'
      : widget.reserva.estado == 'confirmada'
      ? 'cancelada'
      : widget.reserva.estado;

  @override
  Widget build(BuildContext context) {
    final r = widget.reserva,
        editable =
            widget.puedeEscribir &&
            ['pendiente', 'confirmada'].contains(r.estado) &&
            (r.estado != 'pendiente' || asignado);
    final opciones = r.estado == 'pendiente'
        ? ['confirmada', 'rechazada']
        : ['cancelada', 'no_asistio'];
    return FormDialog(
      titulo: r.texto('clienteNombre'),
      children: [
        Text(
          '${r.texto('dia')} ${hora(r.entero('minuto'))} · ${r.entero('duracion')} minutos\n${r.texto('telefono')}\nOrigen: ${r.texto('origen')}\nEstado actual: ${r.estado}\nResponsable: ${r.texto('atendidoPor').isEmpty ? 'Por atender' : r.texto('atendidoPor')}\nCreada: ${_fechaRegistro(r.datos['createdAt'])}\nActualizada: ${_fechaRegistro(r.datos['updatedAt'])}',
        ),
        Text(
          'Monto: ${r.monto > 0 ? soles(r.monto) : 'Pendiente'} · Efectivo registrado: ${soles(r.adelanto)} · Resta: ${r.monto > 0 ? soles(r.saldo) : 'Pendiente'}',
        ),
        const Text(
          'Registro manual del personal. Sin verificación de Culqi ni otro proveedor.',
        ),
        for (final e in (r.datos['historialPagos'] as List? ?? const []))
          Text(
            '${_fechaRegistro(e['fecha'])} · ${soles(e['importeCentimos'] as int)} · empleado ${e['registradoPor']}',
          ),
        if (widget.puedeEscribir && r.estado == 'confirmada' && !r.bloqueo)
          OutlinedButton(
            onPressed: () async {
              final guardado = await showDialog<bool>(
                context: context,
                builder: (_) =>
                    _EfectivoDialog(provider: widget.provider, reserva: r),
              );
              if (guardado == true && context.mounted) Navigator.pop(context);
            },
            child: const Text('Registrar monto / efectivo'),
          ),
        if (r.adelanto > 0)
          const Text(
            'Cancelar libera el horario y conserva los cobros registrados. No registra una devolución de efectivo.',
          ),
        if (r.estado == 'pendiente' && !asignado)
          const Text(
            'La solicitud debe resolverla el empleado asignado a esta cancha.',
          ),
        if (editable) ...[
          DropdownButton<String>(
            value: opciones.contains(estado) ? estado : opciones.first,
            isExpanded: true,
            items: opciones
                .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                .toList(),
            onChanged: (v) => setState(() => estado = v!),
          ),
          const Text(
            'Aprobar ocupa el horario. Rechazar no lo ocupa. Cancelar una reserva confirmada libera todos sus minutos.',
          ),
          BotonGuardar(
            operacion: widget.provider,
            texto: 'Confirmar cambio',
            onPressed: () async {
              if (await widget.provider.actualizar(r, estado) &&
                  context.mounted) {
                Navigator.pop(context);
              }
            },
          ),
        ],
      ],
    );
  }
}

Future<Registro?> seleccionarCliente(
  BuildContext context,
  ClientesProvider provider,
) => showDialog<Registro>(
  context: context,
  builder: (context) => Dialog(
    child: SizedBox(
      width: 650,
      height: 600,
      child: ClientesScreen(
        provider: provider,
        onSeleccionar: (c) => Navigator.pop(context, c),
      ),
    ),
  ),
);

class _EfectivoDialog extends StatefulWidget {
  final AgendaProvider provider;
  final Reserva reserva;
  const _EfectivoDialog({required this.provider, required this.reserva});
  @override
  State<_EfectivoDialog> createState() => _EfectivoDialogState();
}

class _EfectivoDialogState extends State<_EfectivoDialog> {
  late final monto = TextEditingController(
    text: widget.reserva.monto > 0
        ? (widget.reserva.monto / 100).toStringAsFixed(2)
        : '',
  );
  final cobro = TextEditingController(text: '0.00');
  final id = nuevaOperacion();
  bool enviado = false;
  @override
  void dispose() {
    monto.dispose();
    cobro.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormDialog(
    titulo: 'Registro manual de efectivo',
    children: [
      Text(
        'Ya registrado: ${soles(widget.reserva.adelanto)}. No se modifica la disponibilidad.',
      ),
      IgnorePointer(
        ignoring: enviado,
        child: Column(
          children: [
            Campo(
              'Monto acordado de la reserva (S/)',
              monto,
              tipo: const TextInputType.numberWithOptions(decimal: true),
            ),
            Campo(
              'Efectivo recibido ahora (S/)',
              cobro,
              tipo: const TextInputType.numberWithOptions(decimal: true),
            ),
          ],
        ),
      ),
      const Text(
        'Registra solo dinero recibido físicamente. 0.00 permite fijar el monto sin registrar un pago.',
      ),
      BotonGuardar(
        operacion: widget.provider,
        texto: enviado
            ? 'Reintentar mismo registro'
            : 'Guardar registro de efectivo',
        onPressed: () async {
          try {
            final importe = centimos(monto.text),
                recibido = centimos(cobro.text);
            if (importe <= 0 || importe > 100000000) {
              throw const FormatException(
                'Indica un monto acordado mayor que cero.',
              );
            }
            if (recibido > importe - widget.reserva.adelanto) {
              throw const FormatException(
                'El cobro supera el saldo pendiente. Corrige el importe.',
              );
            }
            if (widget.reserva.adelanto > 0 &&
                importe != widget.reserva.monto) {
              throw const FormatException(
                'Con cobros registrados no se cambia el monto acordado.',
              );
            }
            if (recibido == 0 && importe == widget.reserva.monto) {
              throw const FormatException('No hay cambios que registrar.');
            }
            setState(() => enviado = true);
            if (await widget.provider.registrarEfectivo(
                  widget.reserva,
                  importe,
                  recibido,
                  id,
                ) &&
                context.mounted) {
              Navigator.pop(context, true);
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
