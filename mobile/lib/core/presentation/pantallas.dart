import 'package:flutter/material.dart';

class PantallaCentrada extends StatelessWidget {
  final String titulo;
  final String? subtitulo;
  final List<Widget> children;
  const PantallaCentrada({
    super.key,
    required this.titulo,
    this.subtitulo,
    required this.children,
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.sports_soccer, size: 56),
              const SizedBox(height: 12),
              Text(
                titulo,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 26),
              ),
              if (subtitulo != null) ...[
                const SizedBox(height: 8),
                Text(subtitulo!, textAlign: TextAlign.center),
              ],
              const SizedBox(height: 24),
              ...children,
            ],
          ),
        ),
      ),
    ),
  );
}

class Aviso extends StatelessWidget {
  final String texto;
  final bool grave;
  const Aviso(this.texto, {super.key, this.grave = false});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(
      texto,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: grave ? Theme.of(context).colorScheme.error : null,
      ),
    ),
  );
}

class BotonAccion extends StatelessWidget {
  final String texto;
  final VoidCallback? onPressed;
  final bool cargando;
  const BotonAccion(
    this.texto, {
    super.key,
    required this.onPressed,
    this.cargando = false,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: FilledButton(
      onPressed: cargando ? null : onPressed,
      child: cargando
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Text(texto),
    ),
  );
}

class BotonSecundario extends StatelessWidget {
  final String texto;
  final VoidCallback? onPressed;
  const BotonSecundario(this.texto, {super.key, required this.onPressed});
  @override
  Widget build(BuildContext context) =>
      TextButton(onPressed: onPressed, child: Text(texto));
}

class ListaEtiquetas extends StatelessWidget {
  final Map<String, bool> permisos;
  const ListaEtiquetas(this.permisos, {super.key});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (final p in permisos.entries)
        Row(
          children: [
            Icon(
              p.value ? Icons.check_circle : Icons.remove_circle_outline,
              size: 18,
            ),
            const SizedBox(width: 8),
            Text(p.key),
          ],
        ),
    ],
  );
}
