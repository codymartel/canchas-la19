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
            child: _TablasAgenda(
              horario: sedesProvider.horario,
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
  final Stream<HorarioNegocio?> horario;
  final String dia;
  final List<Reserva> reservas;
  final Map<String, Set<int>> ocupacion;
  final void Function(Reserva) onDetalle;
  const _TablasAgenda({
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
      final limite = h.cruzaMedianoche ? h.cierre + 1440 : h.cierre;
      return LayoutBuilder(
        builder: (context, constraints) {
          final ancho = constraints.maxWidth >= 1000
              ? (constraints.maxWidth - 48) / 3
              : constraints.maxWidth - 24;
          return SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Dia operativo $dia · America/Lima · ${h.resumen}'),
                  if (reservas.isEmpty)
                    const Text('Sin reservas ni bloqueos para este día.'),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final cancha in sedesIds)
                        SizedBox(
                          width: ancho,
                          child: Card(
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Tabla ${sedes[cancha]}',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleLarge,
                                  ),
                                  for (
                                    var minuto = h.apertura;
                                    minuto < limite;
                                    minuto += 60
                                  )
                                    _fila(cancha, minuto),
                                  for (final r in reservas.where(
                                    (r) =>
                                        r.texto('canchaId') == cancha &&
                                        r.estado == 'pendiente',
                                  ))
                                    TextButton(
                                      onPressed: () => onDetalle(r),
                                      child: Text(
                                        'Solicitud pendiente · ${r.texto('clienteNombre')} · ${hora(r.entero('minuto'))} · ${r.entero('duracion')} min',
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );

  Widget _fila(String cancha, int minuto) {
    final candidatas = reservas.where(
      (r) =>
          r.texto('canchaId') == cancha &&
          r.ocupa &&
          minuto + 60 > r.entero('minuto') &&
          minuto < r.entero('minuto') + r.entero('duracion'),
    );
    final lista = candidatas.toList();
    final ocupado = [
      minuto,
      minuto + 30,
    ].any((m) => ocupacion[cancha]?.contains(m) == true);
    return InkWell(
      onTap: null,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Colors.black12)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 105,
              child: Text('${hora(minuto)}\n${hora(minuto + 60)}'),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (lista.isEmpty)
                    _EstadoReserva(estado: ocupado ? 'Ocupado' : 'Libre'),
                  for (final r in lista)
                    InkWell(
                      onTap: () => onDetalle(r),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.texto('clienteNombre')),
                          Text(r.texto('telefono')),
                          Text(
                            '${hora(r.entero('minuto'))} – ${hora(r.entero('minuto') + r.entero('duracion'))}',
                          ),
                          _EstadoReserva(estado: r.estado),
                          if (r.texto('atendidoPor').isNotEmpty)
                            Text('Atiende: ${r.texto('atendidoPor')}'),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
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
          '${r.texto('dia')} ${hora(r.entero('minuto'))} · ${r.entero('duracion')} minutos\n${r.texto('telefono')}\nOrigen: ${r.texto('origen')}\nEstado actual: ${r.estado}\nResponsable: ${r.texto('atendidoPor')}\nCreada: ${r.datos['createdAt']}\nActualizada: ${r.datos['updatedAt']}',
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
