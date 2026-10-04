import 'package:flutter/material.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/presentation/pantallas.dart';
import 'sedes_provider.dart';

class ParametrosScreen extends StatefulWidget {
  final SedesProvider provider;
  final String uid;
  final bool administrador;
  const ParametrosScreen({
    super.key,
    required this.provider,
    required this.uid,
    required this.administrador,
  });
  @override
  State<ParametrosScreen> createState() => _ParametrosScreenState();
}

class _ParametrosScreenState extends State<ParametrosScreen> {
  String cancha = 'la-19', dia = diaOperativoLima();
  @override
  Widget build(BuildContext context) => StreamBuilder<List<Registro>>(
    stream: widget.provider.repository.observarPrincipales(),
    builder: (context, principales) {
      final principal = principales.data
          ?.where((r) => r.id == cancha)
          .firstOrNull;
      final puede =
          widget.administrador || principal?.texto('empleadoUid') == widget.uid;
      return StreamBuilder<Registro?>(
        stream: widget.provider.repository.observarParametros(cancha, dia),
        builder: (context, snapshot) {
          final datos = snapshot.data;
          final horas = datos?.datos['horas'] as Map? ?? {};
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Precios, adelantos y plazo',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const Text(
                'Configura por cancha y día operativo. El precio y adelanto se aplican a cada hora del bloque. Esta etapa guarda parámetros internos; todavía no cambia el cobro ni el formulario público.',
              ),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  DropdownButton<String>(
                    value: cancha,
                    items: sedes.entries
                        .map(
                          (e) => DropdownMenuItem(
                            value: e.key,
                            child: Text(e.value),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() => cancha = v!),
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.calendar_month),
                    label: Text(dia),
                    onPressed: () async {
                      final fecha = await showDatePicker(
                        context: context,
                        initialDate: DateTime.parse(dia),
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                      );
                      if (fecha != null) {
                        setState(
                          () => dia = fecha.toIso8601String().substring(0, 10),
                        );
                      }
                    },
                  ),
                ],
              ),
              if (principales.hasError || snapshot.hasError)
                const Aviso(
                  'No se pudieron cargar los parámetros. Reintenta antes de editar.',
                  grave: true,
                ),
              if (snapshot.connectionState == ConnectionState.waiting)
                const LinearProgressIndicator(),
              Text(
                'Plazo para pagar: ${datos?.entero('plazoMinutos') ?? 10} minutos${datos == null ? ' (inicial, sin guardar)' : ''}',
              ),
              const Text('07:00 a 01:00 del día siguiente · America/Lima'),
              if (!puede)
                const Aviso(
                  'Solo el administrador y el principal de esta cancha pueden configurar sus parámetros.',
                ),
              FilledButton.icon(
                icon: const Icon(Icons.edit_calendar),
                label: const Text('Configurar hora o bloque'),
                onPressed:
                    puede &&
                        !snapshot.hasError &&
                        snapshot.connectionState != ConnectionState.waiting
                    ? () => showDialog<void>(
                        context: context,
                        barrierDismissible: false,
                        builder: (_) => BloqueParametrosDialog(
                          provider: widget.provider,
                          cancha: cancha,
                          dia: dia,
                          actual: datos,
                        ),
                      )
                    : null,
              ),
              Card(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    border: TableBorder.all(
                      color: Theme.of(context).dividerColor,
                    ),
                    columns: const [
                      DataColumn(label: Text('Horario')),
                      DataColumn(label: Text('Precio por hora')),
                      DataColumn(label: Text('Adelanto mínimo por hora')),
                    ],
                    rows: [
                      for (var m = 420; m < 1500; m += 60)
                        DataRow(
                          cells: [
                            DataCell(Text('${hora(m)} – ${hora(m + 60)}')),
                            DataCell(
                              Text(
                                horas['$m'] == null
                                    ? 'Sin configurar'
                                    : soles(
                                        (horas['$m'] as Map)['precioCentimos']
                                            as int,
                                      ),
                              ),
                            ),
                            DataCell(
                              Text(
                                horas['$m'] == null
                                    ? 'Sin configurar'
                                    : soles(
                                        (horas['$m'] as Map)['adelantoCentimos']
                                            as int,
                                      ),
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      );
    },
  );
}

class BloqueParametrosDialog extends StatefulWidget {
  final SedesProvider provider;
  final String cancha, dia;
  final Registro? actual;
  const BloqueParametrosDialog({
    super.key,
    required this.provider,
    required this.cancha,
    required this.dia,
    this.actual,
  });
  @override
  State<BloqueParametrosDialog> createState() => _BloqueParametrosDialogState();
}

class _BloqueParametrosDialogState extends State<BloqueParametrosDialog> {
  int desde = 420, hasta = 1500;
  final precio = TextEditingController(), adelanto = TextEditingController();
  late final plazo = TextEditingController(
    text: '${widget.actual?.entero('plazoMinutos') ?? 10}',
  );
  String? error;
  @override
  void dispose() {
    precio.dispose();
    adelanto.dispose();
    plazo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.provider,
    builder: (context, _) => AlertDialog(
      title: Text('${sedes[widget.cancha]} · ${widget.dia}'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Escribe los importes reales por hora. El plazo aplica a todo este día. Los horarios fuera del bloque conservan sus precios.',
              ),
              DropdownButton<int>(
                isExpanded: true,
                value: desde,
                items: [
                  for (var m = 420; m < 1500; m += 60)
                    DropdownMenuItem(value: m, child: Text('Desde ${hora(m)}')),
                ],
                onChanged: widget.provider.ocupado
                    ? null
                    : (v) => setState(() => desde = v!),
              ),
              DropdownButton<int>(
                isExpanded: true,
                value: hasta,
                items: [
                  for (var m = 480; m <= 1500; m += 60)
                    DropdownMenuItem(value: m, child: Text('Hasta ${hora(m)}')),
                ],
                onChanged: widget.provider.ocupado
                    ? null
                    : (v) => setState(() => hasta = v!),
              ),
              TextField(
                controller: precio,
                enabled: !widget.provider.ocupado,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Precio por hora (S/)',
                ),
              ),
              TextField(
                controller: adelanto,
                enabled: !widget.provider.ocupado,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Adelanto mínimo por hora (S/)',
                ),
              ),
              TextField(
                controller: plazo,
                enabled: !widget.provider.ocupado,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Plazo para pagar (minutos)',
                ),
              ),
              if (error != null) Aviso(error!, grave: true),
              if (widget.provider.error != null)
                Aviso(widget.provider.error!, grave: true),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: widget.provider.ocupado
              ? null
              : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: widget.provider.ocupado
              ? null
              : () async {
                  try {
                    if (precio.text.trim().isEmpty ||
                        adelanto.text.trim().isEmpty) {
                      throw const FormatException(
                        'Revisa el bloque, precio, adelanto y plazo (1–120 minutos).',
                      );
                    }
                    final p = centimos(precio.text),
                        a = centimos(adelanto.text),
                        t = int.tryParse(plazo.text);
                    if (desde >= hasta ||
                        p <= 0 ||
                        a < 0 ||
                        a > p ||
                        precio.text.trim().isEmpty ||
                        adelanto.text.trim().isEmpty ||
                        t == null ||
                        t < 1 ||
                        t > 120) {
                      throw const FormatException(
                        'Revisa el bloque, precio, adelanto y plazo (1–120 minutos).',
                      );
                    }
                    setState(() => error = null);
                    final ok = await widget.provider.guardarBloque(
                      cancha: widget.cancha,
                      dia: widget.dia,
                      desde: desde,
                      hasta: hasta,
                      precio: p,
                      adelanto: a,
                      plazo: t,
                      version: widget.actual?.entero('version') ?? 0,
                    );
                    if (ok && context.mounted) {
                      Navigator.pop(context);
                    }
                  } catch (e) {
                    setState(
                      () => error = e is FormatException
                          ? e.message
                          : 'Importes inválidos.',
                    );
                  }
                },
          child: const Text('Guardar parámetros'),
        ),
      ],
    ),
  );
}
