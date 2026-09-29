import 'package:flutter/material.dart';

import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/componentes.dart';
import '../../../core/presentation/pantallas.dart';
import 'configuracion_provider.dart';

class ConfiguracionScreen extends StatelessWidget {
  final ConfiguracionProvider provider;
  const ConfiguracionScreen({super.key, required this.provider});
  @override
  Widget build(BuildContext context) => StreamBuilder<Registro?>(
    stream: provider.configuracion,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Center(
          child: Text('No se pudo cargar la configuracion publica.'),
        );
      }
      if (!snapshot.hasData &&
          snapshot.connectionState == ConnectionState.waiting) {
        return const Center(child: CircularProgressIndicator());
      }
      final config = snapshot.data;
      final galeria = config?.datos['galeria'] as List? ?? const [];
      return StreamBuilder<HorarioNegocio?>(
        stream: provider.horario,
        builder: (context, horario) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Configuracion publica',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const Text(
              'Estos datos son la unica proyeccion editorial que puede leer la web publica. '
              'No contiene personal, cobros, telefonos de clientes ni historial.',
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.public),
                title: Text(
                  config?.texto('nombre').isNotEmpty == true
                      ? config!.texto('nombre')
                      : 'Grass Sintetico',
                ),
                subtitle: Text(
                  'Slug: ${config?.texto('slug').isNotEmpty == true ? config!.texto('slug') : 'sin-configurar'}\n'
                  '${config?.texto('descripcion') ?? ''}',
                ),
                isThreeLine: true,
                trailing: const Icon(Icons.edit),
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (_) => _ConfiguracionDialog(
                    provider: provider,
                    actual: config,
                    horario: horario.data,
                  ),
                ),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.schedule),
                title: const Text('Horario de atencion y duracion del turno'),
                subtitle: Text(
                  horario.data == null
                      ? 'Sin configurar. Ninguna cancha es reservable hasta '
                            'guardar un horario valido.'
                      : '${horario.data!.resumen}'
                            '${horario.data!.cruzaMedianoche ? ' · continua despues de medianoche' : ''}\n'
                            'Aplica por igual a La 19, La 23 y La 24.',
                ),
                isThreeLine: true,
                trailing: const Icon(Icons.edit),
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (_) => _ConfiguracionDialog(
                    provider: provider,
                    actual: config,
                    horario: horario.data,
                  ),
                ),
              ),
            ),
            const Text(
              'El horario se guarda en el documento privado del negocio y se '
              'proyecta a la pagina publica en la misma operacion. Cambiarlo '
              'no modifica las reservas ya creadas, pero solo se admiten '
              'nuevas reservas dentro del horario vigente.',
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Galeria publica (${galeria.length}/12)',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Pendiente de credenciales Cloudinary y de un mecanismo de subida firmado. '
                      'No se usa Firebase Storage, no hay preset publico y no se guardan secretos en la app.',
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: null,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: const Text('Subida pendiente de Cloudinary'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _ConfiguracionDialog extends StatefulWidget {
  final ConfiguracionProvider provider;
  final Registro? actual;
  final HorarioNegocio? horario;
  const _ConfiguracionDialog({
    required this.provider,
    required this.actual,
    required this.horario,
  });
  @override
  State<_ConfiguracionDialog> createState() => _ConfiguracionDialogState();
}

class _ConfiguracionDialogState extends State<_ConfiguracionDialog> {
  late final nombre = TextEditingController(
    text: widget.actual?.texto('nombre').isNotEmpty == true
        ? widget.actual!.texto('nombre')
        : 'Grass Sintetico',
  );
  late final slug = TextEditingController(
    text: widget.actual?.texto('slug').isNotEmpty == true
        ? widget.actual!.texto('slug')
        : 'grass-sintetico',
  );
  late final descripcion = TextEditingController(
    text: widget.actual?.texto('descripcion'),
  );
  late final telefono = TextEditingController(
    text: widget.actual?.texto('telefonoPublico'),
  );
  late final whatsapp = TextEditingController(
    text: widget.actual?.texto('whatsapp'),
  );
  late int duracionTurno = widget.horario?.duracionTurno ?? 60;
  late int apertura = esFranjaValida(widget.horario?.apertura ?? 360)
      ? widget.horario!.apertura
      : 360;
  late int cierre = esCierreValido(widget.horario?.cierre ?? 1440)
      ? widget.horario!.cierre
      : 1440;

  @override
  void dispose() {
    nombre.dispose();
    slug.dispose();
    descripcion.dispose();
    telefono.dispose();
    whatsapp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormDialog(
    titulo: 'Editar pagina publica y horario',
    children: [
      Campo('Nombre publico', nombre),
      Campo('Slug', slug),
      Campo('Descripcion', descripcion),
      Campo('Telefono publico', telefono, tipo: TextInputType.phone),
      Campo('WhatsApp publico', whatsapp, tipo: TextInputType.phone),
      const Divider(),
      Text(
        'Horario de las tres canchas',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      DropdownButton<int>(
        value: duracionTurno,
        isExpanded: true,
        items: duracionesPermitidas
            .map(
              (valor) => DropdownMenuItem(
                value: valor,
                child: Text('Turno base: $valor minutos'),
              ),
            )
            .toList(),
        onChanged: (v) => setState(() => duracionTurno = v!),
      ),
      DropdownButton<int>(
        value: apertura,
        isExpanded: true,
        items: List.generate(48, (i) {
          final v = i * 30;
          return DropdownMenuItem(value: v, child: Text('Abre ${hora(v)}'));
        }),
        onChanged: (v) => setState(() => apertura = v!),
      ),
      DropdownButton<int>(
        value: cierre,
        isExpanded: true,
        items: List.generate(48, (i) {
          final v = (i + 1) * 30;
          return DropdownMenuItem(value: v, child: Text('Cierra ${hora(v)}'));
        }),
        onChanged: (v) => setState(() => cierre = v!),
      ),
      const Text(
        'Un cierre anterior a la apertura significa que la atencion sigue '
        'despues de medianoche. Las reservas multiples duran lo que digan '
        'los turnos completos.',
      ),
      if (widget.provider.error != null)
        Aviso(widget.provider.error!, grave: true),
      BotonGuardar(
        operacion: widget.provider,
        onPressed: () async {
          final ok = await widget.provider.guardar({
            'nombre': nombre.text,
            'slug': slug.text,
            'descripcion': descripcion.text,
            'telefonoPublico': telefono.text,
            'whatsapp': whatsapp.text,
            'aperturaMinuto': apertura,
            'cierreMinuto': cierre,
            'duracionTurnoMinutos': duracionTurno,
          });
          if (ok && context.mounted) Navigator.pop(context);
        },
      ),
    ],
  );
}
