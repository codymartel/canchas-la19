import 'package:flutter/material.dart';
import '../domain/formatos.dart';
import '../data/servicios.dart';
import 'operacion.dart';

class ListaDatos extends StatelessWidget {
  final Stream<List<Registro>> stream;
  final Widget Function(BuildContext, List<Registro>) builder;
  const ListaDatos({super.key, required this.stream, required this.builder});
  @override
  Widget build(BuildContext context) => StreamBuilder<List<Registro>>(
    stream: stream,
    builder: (context, s) {
      if (s.hasError) return Center(child: Text(mensajeError(s.error!)));
      if (!s.hasData) return const Center(child: CircularProgressIndicator());
      return builder(context, s.data!);
    },
  );
}

class Campo extends StatelessWidget {
  final String etiqueta;
  final TextEditingController controller;
  final bool secreto;
  final TextInputType? tipo;
  const Campo(
    this.etiqueta,
    this.controller, {
    super.key,
    this.secreto = false,
    this.tipo,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: TextFormField(
      controller: controller,
      obscureText: secreto,
      keyboardType: tipo,
      decoration: InputDecoration(
        labelText: etiqueta,
        border: const OutlineInputBorder(),
      ),
      validator: (v) =>
          v == null || v.trim().isEmpty ? 'Completa este campo' : null,
    ),
  );
}

class BotonGuardar extends StatelessWidget {
  final Operacion operacion;
  final VoidCallback onPressed;
  final String texto;
  const BotonGuardar({
    super.key,
    required this.operacion,
    required this.onPressed,
    this.texto = 'Guardar',
  });
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: operacion,
    builder: (context, _) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (operacion.error != null)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text(
              operacion.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        FilledButton(
          onPressed: operacion.ocupado ? null : onPressed,
          child: operacion.ocupado
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(),
                )
              : Text(texto),
        ),
      ],
    ),
  );
}

class FormDialog extends StatelessWidget {
  final String titulo;
  final List<Widget> children;
  const FormDialog({super.key, required this.titulo, required this.children});
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(titulo),
    content: SizedBox(
      width: 520,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cerrar'),
      ),
    ],
  );
}
