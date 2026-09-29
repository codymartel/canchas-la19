import 'package:flutter/material.dart';
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
      final filas = provider.filas, todas = provider.todasFilas;
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
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final entrada in sedes.entries)
                        SizedBox(
                          width: 245,
                          child: Card(
                            color: provider.sede == entrada.key
                                ? Theme.of(context).colorScheme.primaryContainer
                                : null,
                            child: InkWell(
                              onTap: () =>
                                  provider.seleccionarSede(entrada.key),
                              borderRadius: BorderRadius.circular(12),
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      entrada.value,
                                      style: Theme.of(
                                        context,
                                      ).textTheme.titleMedium,
                                    ),
                                    Text(
                                      '${todas.where((r) => r.texto('canchaId') == entrada.key && r.ocupa).length} reservas o bloqueos',
                                    ),
                                    for (final actividad
                                        in presencia.actividades
                                            .where(
                                              (a) =>
                                                  a.vigente &&
                                                  a.canchaId == entrada.key,
                                            )
                                            .take(2))
                                      _AvisoPreparacion(
                                        nombre: actividad.nombre,
                                        minuto: actividad.minuto,
                                        guardando:
                                            actividad.estado == 'guardando',
                                      ),
                                  ],
                                ),
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
            child: LayoutBuilder(
              builder: (context, constraints) {
                final disponibilidad = ListaDatos(
                  stream: sedesProvider.canchas,
                  builder: (context, canchas) => _HorariosLibres(
                    canchas: canchas,
                    horario: sedesProvider.horario,
                    ocupacion: provider.ocupacionPorCancha,
                    sede: provider.sede,
                  ),
                );
                if (constraints.maxWidth < 950) {
                  final mostrarVacio = filas.isEmpty && !provider.cargando;
                  return ListView.builder(
                    itemCount: 1 + filas.length,
                    itemBuilder: (context, i) {
                      if (i == 0) {
                        return Column(
                          children: [
                            if (mostrarVacio)
                              const Padding(
                                padding: EdgeInsets.all(12),
                                child: Text(
                                  'Sin reservas ni bloqueos para este día.',
                                ),
                              ),
                            disponibilidad,
                          ],
                        );
                      }
                      if (filas.isEmpty) {
                        return const SizedBox.shrink();
                      }
                      final r = filas[i - 1];
                      return Card(
                        child: ListTile(
                          onTap: () => detalle(context, r),
                          title: Text(
                            '${hora(r.minutoEnDia(provider.dia))} · ${sedes[r.texto('sedeId')]} · ${r.texto('clienteNombre')}',
                          ),
                          subtitle: Text(
                            '${r.bloqueo ? 'Mantenimiento' : (r.activo('_pendiente') ? 'guardando' : r.estado)} · ${r.entero('duracion')} min\n${r.texto('telefono')}',
                          ),
                          trailing: _EstadoReserva(estado: r.estado),
                        ),
                      );
                    },
                  );
                }
                return Column(
                  children: [
                    disponibilidad,
                    Expanded(
                      child: filas.isEmpty && !provider.cargando
                          ? const Center(
                              child: Text(
                                'Sin reservas ni bloqueos para este día.',
                              ),
                            )
                          : SingleChildScrollView(
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: DataTable(
                                  columns:
                                      [
                                            'Hora',
                                            'Sede / cancha',
                                            'Nombre',
                                            'Teléfono',
                                            'Estado',
                                          ]
                                          .map(
                                            (t) => DataColumn(label: Text(t)),
                                          )
                                          .toList(),
                                  rows: filas
                                      .map(
                                        (r) => DataRow(
                                          onSelectChanged: (_) =>
                                              detalle(context, r),
                                          cells: [
                                            DataCell(
                                              Text(
                                                hora(
                                                  r.minutoEnDia(provider.dia),
                                                ),
                                              ),
                                            ),
                                            DataCell(
                                              Text(
                                                '${sedes[r.texto('sedeId')]} / ${r.texto('canchaId')}',
                                              ),
                                            ),
                                            DataCell(
                                              Text(r.texto('clienteNombre')),
                                            ),
                                            DataCell(Text(r.texto('telefono'))),
                                            DataCell(
                                              _EstadoReserva(
                                                estado: r.activo('_pendiente')
                                                    ? 'guardando'
                                                    : r.bloqueo
                                                    ? 'Mantenimiento · ${r.estado}'
                                                    : r.estado,
                                              ),
                                            ),
                                          ],
                                        ),
                                      )
                                      .toList(),
                                ),
                              ),
                            ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      );
    },
  );
}

class _HorariosLibres extends StatelessWidget {
  final List<Registro> canchas;
  final Stream<HorarioNegocio?> horario;
  final Map<String, Set<int>> ocupacion;
  final String sede;
  const _HorariosLibres({
    required this.canchas,
    required this.horario,
    required this.ocupacion,
    required this.sede,
  });

  /// Turnos base libres de una cancha, usando el horario comun del negocio.
  List<int> libres(Registro cancha, HorarioNegocio vigente) {
    if (!esReservable(cancha)) return const [];
    final ocupados = ocupacion[cancha.id] ?? const <int>{};
    return [
      for (final inicio in iniciosDeTurno(
        horario: vigente,
        duracion: vigente.duracionTurno,
      ))
        if (minutosDe(
          minuto: inicio,
          duracion: vigente.duracionTurno,
        ).every((minuto) => !ocupados.contains(int.parse(minuto))))
          inicio,
    ];
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<HorarioNegocio?>(
    stream: horario,
    builder: (context, snapshot) {
      final vigente = snapshot.data;
      final visibles = canchas
          .where((c) => esReservable(c) && (sede.isEmpty || c.id == sede))
          .toList();
      if (vigente == null) {
        return const Padding(
          padding: EdgeInsets.all(12),
          child: Text(
            'El horario de atencion no esta configurado. Configuralo para ver '
            'los turnos libres.',
          ),
        );
      }
      if (visibles.isEmpty) {
        return const Padding(
          padding: EdgeInsets.all(12),
          child: Text(
            'Ninguna cancha es reservable: falta habilitacion, direccion o tarifa.',
          ),
        );
      }
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Horarios libres · ${vigente.resumen}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final cancha in visibles)
              SizedBox(
                height: 50,
                child: Row(
                  children: [
                    SizedBox(
                      width: 90,
                      child: Text(
                        sedes[cancha.texto('sedeId')] ?? cancha.texto('nombre'),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Expanded(
                      child: Builder(
                        builder: (context) {
                          final horas = libres(cancha, vigente);
                          if (horas.isEmpty) {
                            return const Text('Sin turnos libres');
                          }
                          return ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: horas.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 6),
                            itemBuilder: (_, i) =>
                                Chip(label: Text(hora(horas[i]))),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
    },
  );
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

class _AvisoPreparacion extends StatelessWidget {
  final String nombre;
  final int minuto;
  final bool guardando;
  const _AvisoPreparacion({
    required this.nombre,
    required this.minuto,
    required this.guardando,
  });

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(top: 8),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.amber.shade100,
      border: Border.all(color: Colors.amber.shade700),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      guardando
          ? '$nombre está guardando este horario · ${hora(minuto)}'
          : '$nombre está preparando este horario · ${hora(minuto)}',
      style: TextStyle(
        color: Colors.brown.shade900,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

class _EstadoReserva extends StatelessWidget {
  final String estado;
  const _EstadoReserva({required this.estado});

  @override
  Widget build(BuildContext context) {
    final confirmada = estado == 'confirmada';
    final color = confirmada
        ? Colors.green
        : Theme.of(context).colorScheme.secondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        estado,
        style: TextStyle(color: color, fontWeight: FontWeight.w700),
      ),
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
            ['pendiente', 'confirmada'].contains(r.estado);
    final opciones = r.estado == 'pendiente'
        ? ['confirmada', 'rechazada']
        : ['cancelada', 'no_asistio'];
    return FormDialog(
      titulo: r.texto('clienteNombre'),
      children: [
        Text(
          '${r.texto('dia')} ${hora(r.entero('minuto'))} · ${r.entero('duracion')} minutos\n${r.texto('telefono')}\nOrigen: ${r.texto('origen')}\nEstado actual: ${r.estado}\nResponsable: ${r.texto('atendidoPor')}\nCreada: ${r.datos['createdAt']}\nActualizada: ${r.datos['updatedAt']}',
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
