import 'package:flutter/material.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/presentation/componentes.dart';
import 'promociones_provider.dart';

class PromocionesScreen extends StatelessWidget {
  final PromocionesProvider provider;
  final bool puedeEditar;
  const PromocionesScreen({
    super.key,
    required this.provider,
    required this.puedeEditar,
  });
  void editar(BuildContext context, [Registro? r]) => showDialog<void>(
    context: context,
    builder: (_) => PromocionDialog(provider: provider, promocion: r),
  );
  @override
  Widget build(BuildContext context) => ListaDatos(
    stream: provider.promociones,
    builder: (context, lista) => ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Promociones', style: Theme.of(context).textTheme.headlineSmall),
        if (puedeEditar)
          FilledButton(
            onPressed: () => editar(context),
            child: const Text('Crear promoción'),
          ),
        if (lista.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text('Sin promociones.'),
          ),
        for (final p in lista)
          Card(
            child: ListTile(
              onTap: puedeEditar ? () => editar(context, p) : null,
              title: Text(
                '${p.texto('titulo')} · ${p.activo('activa') ? 'Activa' : 'Inactiva'}',
              ),
              subtitle: Text(
                '${p.texto('descripcion')}\n${p.texto('desde')} — ${p.texto('hasta')} · ${p.datos['sedes']}\nDescuento fijo ${soles(p.entero('descuentoCentimos'))} · Autor ${p.texto('creadoPor')}',
              ),
            ),
          ),
        if (lista.length == 100)
          const Text(
            'Se muestran las 100 promociones con vigencia más reciente.',
          ),
      ],
    ),
  );
}

class PromocionDialog extends StatefulWidget {
  final PromocionesProvider provider;
  final Registro? promocion;
  const PromocionDialog({super.key, required this.provider, this.promocion});
  @override
  State<PromocionDialog> createState() => _PromocionDialogState();
}

class _PromocionDialogState extends State<PromocionDialog> {
  late final id = widget.promocion?.id ?? nuevaOperacion();
  late final titulo = TextEditingController(
        text: widget.promocion?.texto('titulo'),
      ),
      descripcion = TextEditingController(
        text: widget.promocion?.texto('descripcion'),
      );
  late final desde = TextEditingController(
        text: widget.promocion?.texto('desde') ?? fechaLima(),
      ),
      hasta = TextEditingController(
        text: widget.promocion?.texto('hasta') ?? fechaLima(),
      );
  late final descuento = TextEditingController(
    text: ((widget.promocion?.entero('descuentoCentimos') ?? 0) / 100)
        .toStringAsFixed(2),
  );
  late bool activa = widget.promocion?.activo('activa') ?? true;
  late final seleccionadas = Set<String>.from(
    widget.promocion?.datos['sedes'] as List? ?? sedes.keys,
  );
  @override
  void dispose() {
    for (final c in [titulo, descripcion, desde, hasta, descuento]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FormDialog(
    titulo: 'Promoción',
    children: [
      Campo('Título', titulo),
      Campo('Descripción', descripcion),
      Campo('Desde YYYY-MM-DD (Lima)', desde),
      Campo('Hasta YYYY-MM-DD (inclusive)', hasta),
      Campo('Descuento fijo S/ (0: solo informativa)', descuento),
      SwitchListTile(
        title: const Text('Publicada'),
        value: activa,
        onChanged: (v) => setState(() => activa = v),
      ),
      for (final s in sedes.entries)
        CheckboxListTile(
          title: Text(s.value),
          value: seleccionadas.contains(s.key),
          onChanged: (v) => setState(() {
            if (v!) {
              seleccionadas.add(s.key);
            } else {
              seleccionadas.remove(s.key);
            }
          }),
        ),
      BotonGuardar(
        operacion: widget.provider,
        onPressed: () async {
          try {
            if (await widget.provider.guardar({
                  'id': id,
                  'titulo': titulo.text,
                  'descripcion': descripcion.text,
                  'desde': desde.text,
                  'hasta': hasta.text,
                  'activa': activa,
                  'sedes': seleccionadas.toList(),
                  'descuentoCentimos': centimos(descuento.text),
                }) &&
                context.mounted) {
              Navigator.pop(context);
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
