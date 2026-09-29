import 'package:flutter/material.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/componentes.dart';
import '../../../core/presentation/pantallas.dart';
import 'sedes_provider.dart';

class SedesScreen extends StatelessWidget {
  final SedesProvider provider;
  const SedesScreen({super.key, required this.provider});
  void editar(BuildContext context, Registro r) => showDialog<void>(
    context: context,
    builder: (_) => CanchaDialog(provider: provider, cancha: r),
  );
  @override
  Widget build(BuildContext context) => StreamBuilder<HorarioNegocio?>(
    stream: provider.horario,
    builder: (context, snapshot) {
      final horario = snapshot.data;
      return ListaDatos(
        stream: provider.canchas,
        builder: (context, lista) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Sedes y canchas',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const Text(
              'Grass Sintetico opera exactamente tres canchas: La 19, La 23 y '
              'La 24. El horario de atencion y la duracion del turno se '
              'configuran una sola vez para todo el negocio, en Configuracion. '
              'Aqui solo se define lo propio de cada cancha.',
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.schedule),
                title: const Text('Horario comun de las tres canchas'),
                subtitle: Text(
                  horario == null
                      ? 'Sin configurar. Ninguna cancha acepta reservas hasta '
                            'definirlo en Configuracion.'
                      : '${horario.resumen}'
                            '${horario.cruzaMedianoche ? ' · continua despues de medianoche' : ''}',
                ),
                isThreeLine: true,
              ),
            ),
            if (horario == null)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Aviso(
                  'Define el horario y la duracion del turno en Configuracion. '
                  'Hasta entonces las canchas no son reservables.',
                  grave: true,
                ),
              ),
            for (final id in sedesIds)
              Builder(
                builder: (context) {
                  final c = lista.where((x) => x.id == id).toList();
                  if (c.isEmpty) {
                    return Card(
                      child: ListTile(
                        title: Text('La ${id.substring(3)}'),
                        subtitle: const Text('Todavia no creada.'),
                      ),
                    );
                  }
                  final r = c.first;
                  return Card(
                    child: ListTile(
                      title: Text(
                        'La ${id.substring(3)} / ${r.texto('nombre')}',
                      ),
                      subtitle: Text(
                        '${esReservable(r) ? 'Reservable' : 'No reservable'} · '
                        '${_resumenConfiguracion(r)}',
                      ),
                      isThreeLine: true,
                      onTap: () => editar(context, r),
                    ),
                  );
                },
              ),
          ],
        ),
      );
    },
  );
}

String _resumenConfiguracion(Registro cancha) {
  final partes = <String>[];
  if (cancha.texto('direccion').trim().isNotEmpty) {
    partes.add(cancha.texto('direccion'));
  }
  if (esTarifaValida(cancha.datos['tarifaTurnoCentimos'])) {
    partes.add('${soles(cancha.entero('tarifaTurnoCentimos'))} por turno');
  }
  if (partes.isEmpty) {
    return 'Sin direccion ni tarifa: no reservable.';
  }
  if (pendientesDeReserva(cancha).isNotEmpty) {
    partes.add('no reservable todavia');
  }
  return partes.join(' · ');
}

class CanchaDialog extends StatefulWidget {
  final SedesProvider provider;
  final Registro cancha;
  const CanchaDialog({super.key, required this.provider, required this.cancha});
  @override
  State<CanchaDialog> createState() => _CanchaDialogState();
}

class _CanchaDialogState extends State<CanchaDialog> {
  late final nombre = TextEditingController(
    text: widget.cancha.texto('nombre'),
  );
  late final direccion = TextEditingController(
    text: widget.cancha.texto('direccion'),
  );
  late final tarifa = TextEditingController(
    text: esTarifaValida(widget.cancha.datos['tarifaTurnoCentimos'])
        ? (widget.cancha.entero('tarifaTurnoCentimos') / 100).toStringAsFixed(2)
        : '',
  );
  late bool activa = widget.cancha.activo('activa');

  @override
  void dispose() {
    nombre.dispose();
    direccion.dispose();
    tarifa.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.provider;
    return StreamBuilder<HorarioNegocio?>(
      stream: p.horario,
      builder: (context, snapshot) {
        final horario = snapshot.data;
        return FormDialog(
          titulo: 'Configurar ${widget.cancha.texto('sedeId')}',
          children: [
            Campo('Nombre', nombre),
            Campo('Direccion publica', direccion),
            Campo('Tarifa del turno (S/)', tarifa),
            SwitchListTile(
              title: const Text('Habilitada para reservas'),
              value: activa,
              onChanged: (v) => setState(() => activa = v),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  horario == null
                      ? 'El horario comun sigue sin configurar. Se define en '
                            'Configuracion y aplica a las tres canchas.'
                      : 'Turnos de ${horario.duracionTurno} min dentro de '
                            '${horario.resumen}.',
                ),
              ),
            ),
            Text(_aviso(), style: Theme.of(context).textTheme.bodyMedium),
            if (p.error != null) Aviso(p.error!, grave: true),
            BotonGuardar(
              operacion: p,
              onPressed: () async {
                if (await p.guardar({
                      'id': widget.cancha.id,
                      'sedeId': widget.cancha.texto('sedeId'),
                      'nombre': nombre.text,
                      'direccion': direccion.text,
                      'tarifaTurnoCentimos': tarifa.text.trim().isEmpty
                          ? ''
                          : centimos(tarifa.text),
                      'activa': activa,
                    }) &&
                    context.mounted) {
                  Navigator.pop(context);
                }
              },
            ),
          ],
        );
      },
    );
  }

  String _aviso() {
    final sinDireccion = direccion.text.trim().isEmpty;
    final sinTarifa = tarifa.text.trim().isEmpty;
    if (activa && (sinDireccion || sinTarifa)) {
      return 'Falta ${sinDireccion ? 'direccion' : 'tarifa'}: la cancha se '
          'guardara como no reservable y la web no la ofrecera.';
    }
    return 'La direccion y la tarifa son publicas. La direccion y la tarifa de '
        'otra cancha no se muestran aqui. Habilitada sin tarifa o sin '
        'direccion, el servidor rechaza la reserva.';
  }
}
