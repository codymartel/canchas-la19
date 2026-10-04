import 'package:flutter/material.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/presentation/componentes.dart';
import 'clientes_provider.dart';

class ClientesScreen extends StatefulWidget {
  final ClientesProvider provider;
  final ValueChanged<Registro>? onSeleccionar;
  const ClientesScreen({super.key, required this.provider, this.onSeleccionar});
  @override
  State<ClientesScreen> createState() => _ClientesScreenState();
}

class _ClientesScreenState extends State<ClientesScreen> {
  final buscar = TextEditingController();
  late final registrados = widget.provider.repository.registrados();
  @override
  void initState() {
    super.initState();
    widget.provider.buscar('');
  }

  @override
  void dispose() {
    buscar.dispose();
    super.dispose();
  }

  Future<void> editar([Registro? cliente]) async {
    await showDialog<void>(
      context: context,
      builder: (_) =>
          ClienteDialog(provider: widget.provider, cliente: cliente),
    );
    if (mounted) widget.provider.buscar(buscar.text);
  }

  Future<void> historia(Registro cliente) async {
    if (!await widget.provider.cargarHistorial(cliente.id) || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => ListenableBuilder(
        listenable: widget.provider,
        builder: (context, _) {
          final p = widget.provider;
          final pasadas = p.historial
              .where(
                (r) =>
                    r.texto('dia').compareTo(fechaLima()) < 0 &&
                    r.texto('estado') == 'confirmada',
              )
              .length;
          final canceladas = p.historial
              .where((r) => r.texto('estado') == 'cancelada')
              .length;
          return FormDialog(
            titulo: cliente.texto('nombre'),
            children: [
              Text(cliente.texto('telefono')),
              Text(
                '${p.historial.length} reservas cargadas · $pasadas visitas pasadas confirmadas · $canceladas cancelaciones. Frecuencia calculada sobre este historial cargado.',
              ),
              if (p.historial.isEmpty) const Text('Sin reservas registradas.'),
              for (final r in p.historial)
                ListTile(
                  title: Text(
                    '${r.texto('dia')} · ${hora(r.entero('minuto'))} · ${sedes[r.texto('sedeId')] ?? r.texto('sedeId')}',
                  ),
                  subtitle: Text(
                    '${r.texto('estado')} · ${soles(r.entero('montoCentimos'))}',
                  ),
                ),
              if (p.masHistoria)
                BotonGuardar(
                  operacion: p,
                  texto: 'Cargar 25 anteriores',
                  onPressed: () => p.cargarHistorial(cliente.id, mas: true),
                ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.provider,
    builder: (context, _) {
      final p = widget.provider;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            widget.onSeleccionar == null
                ? 'Clientes e historial'
                : 'Seleccionar cliente',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          if (widget.onSeleccionar == null) ...[
            const SizedBox(height: 16),
            Text(
              'Clientes registrados con Google',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const Text(
              'Hasta 50 fichas privadas. El teléfono lo proporciona el cliente.',
            ),
            ListaDatos(
              stream: registrados,
              builder: (context, registros) => Column(
                children: [
                  for (final c in registros)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.person_outline),
                        title: Text(c.texto('nombre')),
                        subtitle: Text(
                          [
                            c.texto('telefono'),
                            c.texto('email'),
                          ].where((v) => v.isNotEmpty).join(' · '),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 32),
            Text(
              'Clientes registrados por el personal',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
          Campo('Nombre (prefijo) o teléfono completo', buscar),
          Wrap(
            spacing: 12,
            children: [
              BotonGuardar(
                operacion: p,
                texto: 'Buscar',
                onPressed: () => p.buscar(buscar.text),
              ),
              OutlinedButton(
                onPressed: p.ocupado ? null : editar,
                child: const Text('Nuevo cliente'),
              ),
            ],
          ),
          if (p.clientes.isEmpty && !p.ocupado)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text('No hay clientes para esta búsqueda.'),
            ),
          for (final c in p.clientes)
            Card(
              child: ListTile(
                title: Text(c.texto('nombre')),
                subtitle: Text(c.texto('telefono')),
                onTap: () => widget.onSeleccionar != null
                    ? widget.onSeleccionar!(c)
                    : historia(c),
                trailing: widget.onSeleccionar == null
                    ? IconButton(
                        tooltip: 'Editar cliente',
                        icon: const Icon(Icons.edit),
                        onPressed: () => editar(c),
                      )
                    : const Icon(Icons.chevron_right),
              ),
            ),
          if (p.hayMas)
            TextButton(
              onPressed: p.ocupado
                  ? null
                  : () => p.buscar(p.busqueda, mas: true),
              child: const Text('Cargar 25 más'),
            ),
        ],
      );
    },
  );
}

class ClienteDialog extends StatefulWidget {
  final ClientesProvider provider;
  final Registro? cliente;
  const ClienteDialog({super.key, required this.provider, this.cliente});
  @override
  State<ClienteDialog> createState() => _ClienteDialogState();
}

class _ClienteDialogState extends State<ClienteDialog> {
  late final nombre = TextEditingController(
    text: widget.cliente?.texto('nombre'),
  );
  late final telefono = TextEditingController(
    text: widget.cliente?.texto('telefono'),
  );
  final requestId = nuevaOperacion();
  @override
  void dispose() {
    nombre.dispose();
    telefono.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormDialog(
    titulo: 'Ficha de cliente',
    children: [
      Campo('Nombre', nombre),
      Campo('Teléfono con código de país', telefono, tipo: TextInputType.phone),
      const Text(
        'Busca primero el teléfono. Personas distintas pueden compartir número; no se fusionan fichas automáticamente.',
      ),
      BotonGuardar(
        operacion: widget.provider,
        onPressed: () async {
          final ok = await widget.provider.guardar({
            'id': widget.cliente?.id,
            'requestId': requestId,
            'nombre': nombre.text,
            'telefono': telefono.text,
          });
          if (ok && context.mounted) Navigator.pop(context);
        },
      ),
    ],
  );
}
