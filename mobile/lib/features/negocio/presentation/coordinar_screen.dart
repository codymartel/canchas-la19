import 'package:flutter/material.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/pantallas.dart';
import '../presentation/negocio_provider.dart';

class CoordinarScreen extends StatefulWidget {
  final NegocioProvider provider;
  final String uid;
  final String email;
  final void Function() alTerminar;
  const CoordinarScreen({
    super.key,
    required this.provider,
    required this.uid,
    required this.email,
    required this.alTerminar,
  });
  @override
  State<CoordinarScreen> createState() => _CoordinarScreenState();
}

class _CoordinarScreenState extends State<CoordinarScreen> {
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.provider,
    builder: (context, _) {
      final p = widget.provider;
      return PantallaCentrada(
        titulo: 'Preparar el negocio',
        subtitulo: 'Esta es una unica vez. Al terminar entrara al panel.',
        children: [
          const Aviso(
            'Se creara el negocio, quedaras vinculado como administrador y se '
            'habilitaran las tres canchas para que indiques direccion, horario y '
            'tarifa. Las canchas nacen cerradas: nadie podra reservar hasta que '
            'las actives.',
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Administrador: ${widget.email}'),
                  const SizedBox(height: 8),
                  for (final s in sedesIds)
                    Text('Cancha $s · La ${s.substring(3)}'),
                ],
              ),
            ),
          ),
          if (p.error != null) Aviso(p.error!, grave: true),
          BotonAccion(
            'Vamos a coordinar',
            cargando: p.ocupado,
            onPressed: () async {
              if (await p.preparar(uid: widget.uid, email: widget.email) &&
                  mounted) {
                widget.alTerminar();
              }
            },
          ),
        ],
      );
    },
  );
}
