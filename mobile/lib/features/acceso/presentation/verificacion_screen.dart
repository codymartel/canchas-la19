import 'package:flutter/material.dart';
import '../../../core/presentation/pantallas.dart';
import 'acceso_provider.dart';

class VerificacionScreen extends StatefulWidget {
  final AccesoProvider provider;
  const VerificacionScreen({super.key, required this.provider});
  @override
  State<VerificacionScreen> createState() => _VerificacionScreenState();
}

class _VerificacionScreenState extends State<VerificacionScreen> {
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.provider,
    builder: (context, _) {
      final p = widget.provider;
      return PantallaCentrada(
        titulo: 'Verifica tu correo',
        subtitulo:
            'La cuenta administradora ${p.sesion.email ?? ''} debe confirmar el correo '
            'desde el mensaje que Firebase Auth te envio.',
        children: [
          const Aviso(
            'El estado se consulta a Firebase Auth cada vez que pulsas el boton. '
            'No se acepta marcar la verificacion desde la interfaz.',
          ),
          if (p.mensaje != null) Aviso(p.mensaje!),
          if (p.error != null) Aviso(p.error!, grave: true),
          BotonAccion(
            'Ya verifique mi correo',
            cargando: p.ocupado,
            onPressed: p.comprobarVerificacion,
          ),
          BotonSecundario(
            'Reenviar correo',
            onPressed: p.ocupado ? null : p.reenviarVerificacion,
          ),
          BotonSecundario(
            'Cerrar sesion',
            onPressed: p.ocupado ? null : p.salir,
          ),
        ],
      );
    },
  );
}
